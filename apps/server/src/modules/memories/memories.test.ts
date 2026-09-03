import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mediaFiles, runMigrations } from '@runew/db';
import { createUlid } from '@runew/shared-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

const WEAPP_HEADERS = { 'x-client-platform': 'WEAPP' };

describe('Memories & Time Capsule API', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let authHeaders: Record<string, string>;
  let otherAuthHeaders: Record<string, string>;
  let familyId: string;
  let babyId: string;
  let otherBabyId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-memories-test-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);

    app = await buildApp();

    const username = `memoryuser_${Date.now()}`;
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username,
        password: 'Password123!',
        displayName: 'Memory Mom',
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
        baby: { name: 'Memory Baby', birthday: '2026-01-16' },
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
        username: `memoryother_${Date.now()}`,
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
        baby: { name: 'Other Memory Baby', birthday: '2026-02-01' },
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

  it('supports Photo Memories CRUD and Soft Delete', async () => {
    // 1. Create Photo Memory
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/memories/photos`,
      headers: authHeaders,
      payload: {
        title: '宝宝第一次笑',
        story: '今天太阳很好，宝宝对我甜甜地笑了！',
        happenedAt: Date.now(),
        mediaIds: [],
        favorite: true,
      },
    });
    expect(createRes.statusCode).toBe(200);
    const photo = createRes.json().data;
    expect(photo.id).toBeDefined();
    expect(photo.title).toBe('宝宝第一次笑');

    // 2. List Photos
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/memories/photos`,
      headers: authHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBeGreaterThanOrEqual(1);

    // 3. Edit Photo
    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/memories/photos/${photo.id}`,
      headers: authHeaders,
      payload: {
        title: '宝宝第一次大笑',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.title).toBe('宝宝第一次大笑');

    // 4. Soft Delete
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/memories/photos/${photo.id}`,
      headers: authHeaders,
    });
    expect(delRes.statusCode).toBe(200);

    // 5. Query Deleted returns 404
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/memories/photos/${photo.id}`,
      headers: authHeaders,
    });
    expect(getRes.statusCode).toBe(404);

    // 6. Restore through a permission-checked mutation
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/photos/${photo.id}/restore`,
      headers: authHeaders,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.id).toBe(photo.id);

    const restoredGetRes = await app.inject({
      method: 'GET',
      url: `/api/v1/memories/photos/${photo.id}`,
      headers: authHeaders,
    });
    expect(restoredGetRes.statusCode).toBe(200);
  });

  it('rejects cross-family baby lists, creates and direct resource access', async () => {
    const otherCreateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${otherBabyId}/memories/photos`,
      headers: otherAuthHeaders,
      payload: {
        title: '另一个家庭的照片',
        happenedAt: Date.now(),
        mediaIds: [],
      },
    });
    expect(otherCreateRes.statusCode).toBe(200);
    const otherPhotoId = otherCreateRes.json().data.id as string;

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${otherBabyId}/memories/photos`,
      headers: authHeaders,
    });
    expect(listRes.statusCode).toBe(403);

    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${otherBabyId}/memories/photos`,
      headers: authHeaders,
      payload: {
        title: '越权创建',
        happenedAt: Date.now(),
        mediaIds: [],
      },
    });
    expect(createRes.statusCode).toBe(403);

    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/memories/photos/${otherPhotoId}`,
      headers: authHeaders,
    });
    expect(detailRes.statusCode).toBe(403);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/memories/photos/${otherPhotoId}`,
      headers: authHeaders,
    });
    expect(deleteRes.statusCode).toBe(403);
  });

  it('returns real on-this-day counts and an annual review', async () => {
    const lastYear = new Date();
    lastYear.setUTCFullYear(lastYear.getUTCFullYear() - 1);
    await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/memories/quotes`,
      headers: authHeaders,
      payload: {
        quoteText: '去年的今天',
        happenedAt: lastYear.getTime(),
      },
    });

    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/memories/summary`,
      headers: authHeaders,
    });
    expect(summaryRes.json().data.onThisDayCount).toBeGreaterThanOrEqual(1);

    const reviewRes = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/memories/annual-review?year=${lastYear.getUTCFullYear()}`,
      headers: authHeaders,
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().data.year).toBe(lastYear.getUTCFullYear());
    expect(reviewRes.json().data.quotesCount).toBeGreaterThanOrEqual(1);
  });

  it('strictly enforces Time Capsule state machine transitions (DRAFT -> SEALED -> OPENED)', async () => {
    const futureOpenAt = Date.now() + 365 * 24 * 3600 * 1000;

    // 1. Create DRAFT Time Capsule
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/memories/capsules`,
      headers: authHeaders,
      payload: {
        title: '给十八岁的润润',
        body: '亲爱的润润，当你看到这封信时，你已经长大啦！',
        openAt: futureOpenAt,
        recipientText: '润润',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const capsule = createRes.json().data;
    expect(capsule.state).toBe('DRAFT');

    // 2. DRAFT is editable
    const patchDraftRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/memories/capsules/${capsule.id}`,
      headers: authHeaders,
      payload: {
        title: '给成年时的润润（修改版）',
      },
    });
    expect(patchDraftRes.statusCode).toBe(200);

    // 3. Seal Capsule
    const sealRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/capsules/${capsule.id}/seal`,
      headers: authHeaders,
    });
    expect(sealRes.statusCode).toBe(200);
    const sealedCapsule = sealRes.json().data;
    expect(sealedCapsule.state).toBe('SEALED');
    expect(sealedCapsule.body).toBe('');

    // 4. Edit SEALED Capsule is DENIED (409 CAPSULE_SEALED)
    const patchSealedRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/memories/capsules/${capsule.id}`,
      headers: authHeaders,
      payload: {
        title: '尝试非法篡改已封存内容',
      },
    });
    expect(patchSealedRes.statusCode).toBe(409);
    expect(patchSealedRes.json().error.code).toBe('CAPSULE_SEALED');

    // Favoriting is metadata-only and remains available without reopening the payload.
    const favoriteSealedRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/memories/capsules/${capsule.id}/favorite`,
      headers: { ...authHeaders, 'idempotency-key': createUlid() },
      payload: { favorite: true },
    });
    expect(favoriteSealedRes.statusCode).toBe(200);
    expect(favoriteSealedRes.json().data.favorite).toBe(true);

    // 5. Open before openAt is DENIED
    const openEarlyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/capsules/${capsule.id}/open`,
      headers: authHeaders,
    });
    expect(openEarlyRes.statusCode).toBe(400);

    // 6. Create past openAt capsule and explicitly open
    const pastOpenRes = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/memories/capsules`,
      headers: authHeaders,
      payload: {
        title: '即可开启的时光胶囊',
        body: '时间到了，现在开启！',
        openAt: Date.now() - 1000,
        sealNow: true,
      },
    });
    const pastCapsule = pastOpenRes.json().data;
    expect(pastCapsule.state).toBe('SEALED');

    const openSuccessRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/capsules/${pastCapsule.id}/open`,
      headers: authHeaders,
    });
    expect(openSuccessRes.statusCode).toBe(200);
    expect(openSuccessRes.json().data.state).toBe('OPENED');
    expect(openSuccessRes.json().data.body).toBe('时间到了，现在开启！');

    const sealAgainRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/capsules/${pastCapsule.id}/seal`,
      headers: authHeaders,
    });
    expect(sealAgainRes.statusCode).toBe(400);
    const openAgainRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/capsules/${pastCapsule.id}/open`,
      headers: authHeaders,
    });
    expect(openAgainRes.statusCode).toBe(400);
  });

  it('supports audio memory delete and restore without deleting its media metadata', async () => {
    const member = await app.db.query.familyMembers.findFirst({
      where: (row, { eq }) => eq(row.familyId, familyId),
    });
    expect(member?.userId).toBeTruthy();
    const mediaId = createUlid();
    const now = Date.now();
    await app.db.insert(mediaFiles).values({
      id: mediaId,
      familyId,
      babyId,
      ownerUserId: member!.userId,
      mediaType: 'AUDIO',
      status: 'READY',
      mimeType: 'audio/aac',
      originalFilename: 'memory.aac',
      sizeBytes: 321,
      sha256: '0'.repeat(64),
      keepOriginal: true,
      durationMs: 1000,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });

    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/memories/audios`,
      headers: authHeaders,
      payload: { mediaId, title: '第一声笑', category: 'LAUGH', happenedAt: now },
    });
    expect(createRes.statusCode).toBe(200);
    const audioId = createRes.json().data.id as string;
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/memories/audios/${audioId}`,
      headers: authHeaders,
    });
    expect(deleteRes.statusCode).toBe(200);
    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/audios/${audioId}/restore`,
      headers: authHeaders,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.media.id).toBe(mediaId);
    const mediaAfter = await app.db.query.mediaFiles.findFirst({
      where: (row, { eq }) => eq(row.id, mediaId),
    });
    expect(mediaAfter?.status).toBe('READY');
  });

  it('returns Memories Home Summary', async () => {
    const summaryRes = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/memories/summary`,
      headers: authHeaders,
    });
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json().data;
    expect(summary.photosCount).toBeDefined();
    expect(summary.capsulesCount).toBeDefined();
  });
});
