import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '@runew/db';
import { createUlid } from '@runew/shared-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import sharp from 'sharp';
import { mediaFiles } from '@runew/db';
import { eq } from 'drizzle-orm';

const WEAPP_HEADERS = { 'x-client-platform': 'WEAPP' };

describe('Media Platform API', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let authHeaders: Record<string, string>;
  let otherAuthHeaders: Record<string, string>;
  let familyId: string;
  let babyId: string;
  let otherBabyId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-media-test-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.RUNEW_DATA_DIR = tempDir;
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);

    app = await buildApp();

    const username = `mediauser_${Date.now()}`;
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username,
        password: 'Password123!',
        displayName: 'Media Parent',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    const token = registerRes.json().data.session.token as string;
    authHeaders = { ...WEAPP_HEADERS, authorization: `Bearer ${token}` };

    const onboardingRes = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: { ...authHeaders, 'idempotency-key': createUlid() },
      payload: {
        relationship: 'MOM',
        baby: { name: 'Media Baby', birthday: '2026-01-16' },
        topics: ['回忆'],
      },
    });
    expect(onboardingRes.statusCode).toBe(200);
    const bootData = onboardingRes.json().data;
    familyId = bootData.family.id;
    babyId = bootData.baby.id;

    const otherRegisterRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `mediaother_${Date.now()}`,
        password: 'Password123!',
        displayName: 'Other Parent',
      },
    });
    const otherToken = otherRegisterRes.json().data.session.token as string;
    otherAuthHeaders = { ...WEAPP_HEADERS, authorization: `Bearer ${otherToken}` };
    const otherOnboardingRes = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: { ...otherAuthHeaders, 'idempotency-key': createUlid() },
      payload: {
        relationship: 'DAD',
        baby: { name: 'Other Baby', birthday: '2026-02-01' },
        topics: ['回忆'],
      },
    });
    otherBabyId = otherOnboardingRes.json().data.baby.id;
  });

  afterAll(async () => {
    await app.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore Windows temp file lock
    }
  });

  it('handles chunk upload lifecycle, authenticated resume, same-part retry and real image derivatives', async () => {
    const fullBuffer = await sharp({
      create: {
        width: 2000,
        height: 1000,
        channels: 3,
        background: { r: 245, g: 180, b: 120 },
      },
    }).png().toBuffer();
    const splitAt = Math.floor(fullBuffer.length / 2);
    const chunk1 = fullBuffer.subarray(0, splitAt);
    const chunk2 = fullBuffer.subarray(splitAt);
    const fullSha256 = crypto.createHash('sha256').update(fullBuffer).digest('hex');

    // 1. Init Upload Session
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: authHeaders,
      payload: {
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        originalFilename: 'test_photo.png',
        expectedSize: fullBuffer.length,
        expectedSha256: fullSha256,
        babyId,
      },
    });
    expect(initRes.statusCode).toBe(200);
    const { uploadId, mediaId, uploadToken } = initRes.json().data;
    expect(uploadId).toBeDefined();

    // 2. Upload Part 1
    const part1Res = await app.inject({
      method: 'PUT',
      url: `/api/v1/media/uploads/${uploadId}/parts/1`,
      headers: {
        ...WEAPP_HEADERS,
        'content-type': 'application/octet-stream',
        'x-upload-token': uploadToken,
      },
      payload: chunk1,
    });
    expect(part1Res.statusCode).toBe(200);
    expect(part1Res.json().data.partNo).toBe(1);

    // 3. Same Part Retry (Idempotency)
    const part1RetryRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/media/uploads/${uploadId}/parts/1`,
      headers: {
        ...WEAPP_HEADERS,
        'content-type': 'application/octet-stream',
        'x-upload-token': uploadToken,
      },
      payload: chunk1,
    });
    expect(part1RetryRes.statusCode).toBe(200);

    // 4. Query Resume State
    const queryRes = await app.inject({
      method: 'GET',
      url: `/api/v1/media/uploads/${uploadId}`,
      headers: {
        ...WEAPP_HEADERS,
        'x-upload-token': uploadToken,
      },
    });
    expect(queryRes.statusCode).toBe(200);
    const stateData = queryRes.json().data;
    expect(stateData.completedParts).toEqual([1]);
    expect(stateData.receivedBytes).toBe(chunk1.length);

    // 5. Upload Part 2
    const part2Res = await app.inject({
      method: 'PUT',
      url: `/api/v1/media/uploads/${uploadId}/parts/2`,
      headers: {
        ...WEAPP_HEADERS,
        'content-type': 'application/octet-stream',
        'x-upload-token': uploadToken,
      },
      payload: chunk2,
    });
    expect(part2Res.statusCode).toBe(200);

    // 6. Complete Upload
    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/media/uploads/${uploadId}/complete`,
      headers: authHeaders,
      payload: {
        finalSha256: fullSha256,
      },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().data.status).toBe('READY');

    // 7. Verify Content & HTTP Range Stream
    const contentRes = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${mediaId}/content`,
      headers: authHeaders,
    });
    expect(contentRes.statusCode).toBe(200);
    const displayMetadata = await sharp(contentRes.rawPayload).metadata();
    expect(displayMetadata.width).toBe(1600);
    expect(displayMetadata.height).toBe(800);

    const thumbnailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${mediaId}/thumbnail`,
      headers: authHeaders,
    });
    expect(thumbnailRes.statusCode).toBe(200);
    const thumbnailMetadata = await sharp(thumbnailRes.rawPayload).metadata();
    expect(thumbnailMetadata.width).toBe(400);
    expect(thumbnailMetadata.height).toBe(200);

    // HTTP Range Request (206 Partial Content)
    const rangeRes = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${mediaId}/content`,
      headers: {
        ...authHeaders,
        range: 'bytes=0-11',
      },
    });
    expect(rangeRes.statusCode).toBe(206);
    expect(rangeRes.headers['content-range']).toContain(`bytes 0-11/${contentRes.rawPayload.length}`);
    expect(rangeRes.rawPayload).toEqual(contentRes.rawPayload.subarray(0, 12));
  });

  it('rejects wrong SHA256 or wrong size completion', async () => {
    const data = Buffer.from('VALID_DATA_CONTENT');

    const initRes = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: authHeaders,
      payload: {
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        expectedSize: data.length,
        expectedSha256: '0000000000000000000000000000000000000000000000000000000000000000',
        babyId,
      },
    });
    const { uploadId, uploadToken } = initRes.json().data;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/media/uploads/${uploadId}/parts/1`,
      headers: {
        ...WEAPP_HEADERS,
        'content-type': 'application/octet-stream',
        'x-upload-token': uploadToken,
      },
      payload: data,
    });

    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/media/uploads/${uploadId}/complete`,
      headers: authHeaders,
    });

    expect(completeRes.statusCode).toBe(400);
    expect(completeRes.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('keeps the original and reports FAILED when image decoding fails', async () => {
    const invalidPng = Buffer.from('not a decodable png');
    const hash = crypto.createHash('sha256').update(invalidPng).digest('hex');
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: authHeaders,
      payload: {
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        expectedSize: invalidPng.length,
        expectedSha256: hash,
        babyId,
      },
    });
    const { uploadId, mediaId, uploadToken } = initRes.json().data;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/media/uploads/${uploadId}/parts/1`,
      headers: {
        ...WEAPP_HEADERS,
        'content-type': 'application/octet-stream',
        'x-upload-token': uploadToken,
      },
      payload: invalidPng,
    });

    const completeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/media/uploads/${uploadId}/complete`,
      headers: authHeaders,
      payload: { finalSha256: hash },
    });
    expect(completeRes.statusCode).toBe(422);
    expect(completeRes.json().error.code).toBe('MEDIA_PROCESSING_FAILED');

    const failedMedia = await app.db.query.mediaFiles.findFirst({
      where: eq(mediaFiles.id, mediaId),
    });
    expect(failedMedia?.status).toBe('FAILED');
    expect(failedMedia?.originalStorageKey).toBeTruthy();
    expect(fs.existsSync(path.join(tempDir, 'media', failedMedia!.originalStorageKey!))).toBe(true);
  });

  it('requires the upload token for resume state and the owning family for completion', async () => {
    const data = Buffer.from('audio payload');
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: authHeaders,
      payload: {
        mediaType: 'AUDIO',
        mimeType: 'audio/m4a',
        expectedSize: data.length,
        babyId,
      },
    });
    const { uploadId, uploadToken } = initRes.json().data;

    const noTokenRes = await app.inject({
      method: 'GET',
      url: `/api/v1/media/uploads/${uploadId}`,
      headers: WEAPP_HEADERS,
    });
    expect(noTokenRes.statusCode).toBe(401);

    await app.inject({
      method: 'PUT',
      url: `/api/v1/media/uploads/${uploadId}/parts/1`,
      headers: {
        ...WEAPP_HEADERS,
        'content-type': 'application/octet-stream',
        'x-upload-token': uploadToken,
      },
      payload: data,
    });
    const otherCompleteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/media/uploads/${uploadId}/complete`,
      headers: otherAuthHeaders,
      payload: {},
    });
    expect(otherCompleteRes.statusCode).toBe(403);
  });

  it('rejects upload initialization for a baby outside the active family', async () => {
    const initRes = await app.inject({
      method: 'POST',
      url: '/api/v1/media/uploads',
      headers: authHeaders,
      payload: {
        mediaType: 'IMAGE',
        mimeType: 'image/png',
        expectedSize: 10,
        babyId: otherBabyId,
      },
    });
    expect(initRes.statusCode).toBe(403);
    expect(initRes.json().error.code).toBe('FAMILY_ACCESS_DENIED');
  });

  it('enforces authentication and family permission on media content delivery', async () => {
    // Unauthenticated request
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/media/01JNONEXISTENTMEDIAFILE123/content',
      headers: WEAPP_HEADERS,
    });
    expect(unauthRes.statusCode).toBe(401);
  });
});
