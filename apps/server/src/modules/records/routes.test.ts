import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '@runew/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { buildEtag, createUlid } from '@runew/shared-utils';

const WEAPP_HEADERS = {
  'x-client-platform': 'WEAPP',
};

describe('records api', () => {
  let tempDir: string;
  let databasePath: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userSeq = 0;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m2-test-'));
    databasePath = path.join(tempDir, 'runew.db');
    process.env.DATABASE_PATH = databasePath;
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(databasePath);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore Windows lock
    }
  });

  async function readyUser() {
    userSeq += 1;
    const username = `m2_user_${userSeq}_${Date.now().toString(36)}`;
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        ...WEAPP_HEADERS,
        'idempotency-key': createUlid(),
      },
      payload: { username, password: 'password123', nickname: '测试妈妈' },
    });
    expect(register.statusCode).toBe(201);
    const token = register.json().data.session.token as string;

    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
        'idempotency-key': createUlid(),
      },
      payload: {
        relationship: 'MOM',
        baby: { name: `润润${userSeq}`, birthday: '2026-01-16' },
        topics: ['睡眠'],
      },
    });
    expect(onboarding.statusCode).toBe(200);
    return {
      token,
      babyId: onboarding.json().data.baby.id as string,
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    };
  }

  it('supports bottle CRUD, etag conflict, idempotent create and soft delete', async () => {
    const { babyId, headers } = await readyUser();
    const recordedAt = Date.UTC(2026, 2, 22, 1, 30, 0);
    const idempotencyKey = createUlid();
    const payload = { amountMl: 150, milkType: 'FORMULA', recordedAt };

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/feeding`,
      headers: { ...headers, 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(first.statusCode).toBe(201);
    const feedingId = first.json().data.id as string;

    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/feeding`,
      headers: { ...headers, 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.id).toBe(feedingId);

    const missingKey = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/feeding`,
      headers,
      payload: { amountMl: 120, recordedAt: recordedAt + 1 },
    });
    expect(missingKey.statusCode).toBe(400);

    const got = await app.inject({
      method: 'GET',
      url: `/api/v1/feeding/${feedingId}`,
      headers,
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().data.amountMl).toBe(150);
    expect(got.headers.etag).toBe(buildEtag(1));

    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/v1/feeding/${feedingId}`,
      headers: { ...headers, 'if-match': buildEtag(9) },
      payload: { amountMl: 180 },
    });
    expect(conflict.statusCode).toBe(409);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/feeding/${feedingId}`,
      headers: { ...headers, 'if-match': buildEtag(1) },
      payload: { amountMl: 180, note: '喝完了' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.amountMl).toBe(180);
    expect(patched.json().data.version).toBe(2);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/feeding/${feedingId}`,
      headers,
    });
    expect(deleted.statusCode).toBe(200);

    const gone = await app.inject({
      method: 'GET',
      url: `/api/v1/feeding/${feedingId}`,
      headers,
    });
    expect(gone.statusCode).toBe(404);

    const timeline = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/records`,
      headers,
    });
    expect(timeline.json().data.items).toHaveLength(0);
  });

  it('starts and finishes sleep, and blocks a second running sleep', async () => {
    const { babyId, headers } = await readyUser();
    const startedAt = Date.UTC(2026, 2, 22, 4, 0, 0);

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/sleep/start`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { startedAt },
    });
    expect(started.statusCode).toBe(201);
    const sleepId = started.json().data.id as string;
    expect(started.json().data.status).toBe('RUNNING');

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/sleep/start`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: {},
    });
    expect(second.statusCode).toBe(409);

    const endedAt = startedAt + 45 * 60 * 1000;
    const finished = await app.inject({
      method: 'POST',
      url: `/api/v1/sleep/${sleepId}/finish`,
      headers,
      payload: { endedAt },
    });
    expect(finished.statusCode).toBe(200);
    expect(finished.json().data.status).toBe('COMPLETED');
    expect(finished.json().data.durationSeconds).toBe(45 * 60);
  });

  it('keeps a 23:00-07:00 sleep as one raw record', async () => {
    const { babyId, headers } = await readyUser();
    const startedAt = Date.parse('2026-03-22T15:00:00.000Z');
    const endedAt = Date.parse('2026-03-22T23:00:00.000Z');

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/sleep`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { startedAt, endedAt },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.durationSeconds).toBe(8 * 3600);

    const timeline = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/records?kind=sleep`,
      headers,
    });
    expect(timeline.json().data.items).toHaveLength(1);
    expect(timeline.json().data.items[0].id).toBe(created.json().data.id);
  });

  it('records breast left-to-right, pause/resume, and duration as segment sum', async () => {
    const { babyId, headers } = await readyUser();
    const startedAt = Date.now() - 40_000;

    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/feeding/breast/start`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { side: 'LEFT', startedAt },
    });
    expect(started.statusCode).toBe(201);
    const feedingId = started.json().data.id as string;
    expect(started.json().data.segments[0].side).toBe('LEFT');

    const switched = await app.inject({
      method: 'POST',
      url: `/api/v1/feeding/${feedingId}/breast/switch`,
      headers,
      payload: { side: 'RIGHT' },
    });
    expect(switched.statusCode).toBe(200);
    expect(switched.json().data.segments).toHaveLength(2);
    expect(switched.json().data.segments[0].endedAt).toBeTruthy();
    expect(switched.json().data.segments[1].side).toBe('RIGHT');
    expect(switched.json().data.segments[1].endedAt).toBeNull();

    const paused = await app.inject({
      method: 'POST',
      url: `/api/v1/feeding/${feedingId}/breast/pause`,
      headers,
    });
    expect(paused.json().data.status).toBe('PAUSED');
    expect(paused.json().data.segments.every((segment: { endedAt: number | null }) => segment.endedAt != null)).toBe(
      true,
    );

    const resumed = await app.inject({
      method: 'POST',
      url: `/api/v1/feeding/${feedingId}/breast/resume`,
      headers,
    });
    expect(resumed.json().data.status).toBe('RUNNING');
    expect(resumed.json().data.segments).toHaveLength(3);

    const finished = await app.inject({
      method: 'POST',
      url: `/api/v1/feeding/${feedingId}/breast/finish`,
      headers,
    });
    expect(finished.statusCode).toBe(200);
    expect(finished.json().data.status).toBe('COMPLETED');
    const segments = finished.json().data.segments as Array<{
      startedAt: number;
      endedAt: number;
      durationSeconds: number;
    }>;
    const segmentSum = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
    expect(finished.json().data.durationSeconds).toBe(segmentSum);
    expect(segmentSum).toBeGreaterThanOrEqual(40);
  });

  it('supports diaper and food CRUD', async () => {
    const { babyId, headers } = await readyUser();

    const diaper = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/diapers`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { diaperType: 'WET', recordedAt: Date.UTC(2026, 2, 22, 3, 0, 0) },
    });
    expect(diaper.statusCode).toBe(201);
    const diaperId = diaper.json().data.id as string;

    const diaperPatched = await app.inject({
      method: 'PATCH',
      url: `/api/v1/diapers/${diaperId}`,
      headers: { ...headers, 'if-match': buildEtag(1) },
      payload: { diaperType: 'BOTH' },
    });
    expect(diaperPatched.json().data.diaperType).toBe('BOTH');

    const food = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/foods`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { foodName: '香蕉泥', amountText: '30g' },
    });
    expect(food.statusCode).toBe(201);
    const foodId = food.json().data.id as string;
    const foodGot = await app.inject({
      method: 'GET',
      url: `/api/v1/foods/${foodId}`,
      headers,
    });
    expect(foodGot.json().data.foodName).toBe('香蕉泥');

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/diapers/${diaperId}`,
      headers,
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/diapers/${diaperId}`,
          headers,
        })
      ).statusCode,
    ).toBe(404);
  });

  it('returns timeline in recorded_at desc order and supports date filter', async () => {
    const { babyId, headers } = await readyUser();
    const t1 = Date.UTC(2026, 2, 21, 8, 0, 0);
    const t2 = Date.UTC(2026, 2, 22, 2, 0, 0);
    const t3 = Date.UTC(2026, 2, 22, 6, 0, 0);

    await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/diapers`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { diaperType: 'WET', recordedAt: t2 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/foods`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { foodName: '米粥', recordedAt: t3 },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/feeding`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { amountMl: 90, recordedAt: t1 },
    });

    const all = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/records`,
      headers,
    });
    const times = all.json().data.items.map((item: { recordedAt: number }) => item.recordedAt);
    expect(times).toEqual([t3, t2, t1]);

    const day = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyId}/records?from=${t2}&to=${t3}`,
      headers,
    });
    expect(day.json().data.items).toHaveLength(2);
    expect(day.json().data.items.every((item: { recordedAt: number }) => item.recordedAt >= t2)).toBe(
      true,
    );
  });

  it('denies cross-family record access', async () => {
    const userA = await readyUser();
    const userB = await readyUser();

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${userA.babyId}/feeding`,
      headers: { ...userA.headers, 'idempotency-key': createUlid() },
      payload: { amountMl: 100 },
    });
    const feedingId = created.json().data.id as string;

    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/feeding/${feedingId}`,
      headers: userB.headers,
    });
    expect(denied.statusCode).toBe(403);

    const deniedCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${userA.babyId}/diapers`,
      headers: { ...userB.headers, 'idempotency-key': createUlid() },
      payload: { diaperType: 'DRY' },
    });
    expect(deniedCreate.statusCode).toBe(403);
  });

  it('rejects empty food name with a warm validation message', async () => {
    const { babyId, headers } = await readyUser();
    const food = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/foods`,
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { foodName: '   ' },
    });
    expect(food.statusCode).toBe(400);
    expect(food.json().error.message).toBe('先写一写今天吃了什么');
  });
});
