import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEtag, createUlid } from '@runew/shared-utils';
import { runMigrations } from '@runew/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

const WEAPP_HEADERS = { 'x-client-platform': 'WEAPP' };

describe('growth api', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userSeq = 0;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m4-test-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows file lock during cleanup — 临时目录，留给系统清理即可。
    }
  });

  async function readyFamily() {
    userSeq += 1;
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `m4_${userSeq}_${Date.now().toString(36)}`,
        password: 'password123',
        nickname: '测试妈妈',
      },
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
        topics: ['成长'],
      },
    });
    expect(onboarding.statusCode).toBe(200);
    return {
      familyId: onboarding.json().data.family.id as string,
      babyId: onboarding.json().data.baby.id as string,
      headers: { ...WEAPP_HEADERS, authorization: `Bearer ${token}` },
    };
  }

  async function postGrowth(
    family: Awaited<ReturnType<typeof readyFamily>>,
    payload: Record<string, unknown>,
  ) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/growth`,
      headers: { ...family.headers, 'idempotency-key': createUlid() },
      payload,
    });
  }

  it('accepts height-only, weight-only, head-only and multi-metric records', async () => {
    const family = await readyFamily();
    const at = Date.UTC(2026, 7, 1, 2);
    const payloads = [
      { heightCm: 71.2, recordedAt: at },
      { weightKg: 8.35, recordedAt: at + 1 },
      { headCircumferenceCm: 44.1, recordedAt: at + 2 },
      { heightCm: 72, weightKg: 8.5, headCircumferenceCm: 44.4, recordedAt: at + 3 },
    ];
    for (const payload of payloads) {
      const response = await postGrowth(family, payload);
      expect(response.statusCode).toBe(201);
    }
    const empty = await postGrowth(family, { note: '没有量到数字' });
    expect(empty.statusCode).toBe(400);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/growth`,
      headers: family.headers,
    });
    expect(list.statusCode).toBe(200);
    const data = list.json().data;
    expect(data.items.map((item: { recordedAt: number }) => item.recordedAt)).toEqual([
      at + 3,
      at + 2,
      at + 1,
      at,
    ]);
    expect(data.latest.height.value).toBe(72);
    expect(data.latest.weight.value).toBe(8.5);
    expect(data.latest.head.value).toBe(44.4);
    expect(data.trends.height.map((point: { value: number }) => point.value)).toEqual([
      71.2, 72,
    ]);
    expect(data.trends.weight.map((point: { value: number }) => point.value)).toEqual([
      8.35, 8.5,
    ]);
    expect(data.trends.head.map((point: { value: number }) => point.value)).toEqual([
      44.1, 44.4,
    ]);
  });

  it('edits with version, soft deletes and restores without losing values', async () => {
    const family = await readyFamily();
    const created = await postGrowth(family, { heightCm: 70, weightKg: 8 });
    const item = created.json().data;

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/growth/${item.id}`,
      headers: { ...family.headers, 'if-match': buildEtag(9) },
      payload: { heightCm: 71 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('ENTITY_VERSION_CONFLICT');

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/growth/${item.id}`,
      headers: { ...family.headers, 'if-match': buildEtag(1) },
      payload: { heightCm: 71, weightKg: null, note: '站着量的' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({
      heightCm: 71,
      weightKg: null,
      version: 2,
    });

    const removeLastMetric = await app.inject({
      method: 'PATCH',
      url: `/api/v1/growth/${item.id}`,
      headers: { ...family.headers, 'if-match': buildEtag(2) },
      payload: { heightCm: null },
    });
    expect(removeLastMetric.statusCode).toBe(400);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/growth/${item.id}`,
      headers: family.headers,
    });
    expect(deleted.statusCode).toBe(200);
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/growth/${item.id}`,
      headers: family.headers,
    });
    expect(hidden.statusCode).toBe(404);

    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/growth/${item.id}/restore`,
      headers: family.headers,
      payload: {},
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().data).toMatchObject({
      heightCm: 71,
      note: '站着量的',
      version: 4,
    });
  });

  it('supports milestone CRUD and monthly story from real facts only', async () => {
    const family = await readyFamily();
    const august = Date.UTC(2026, 7, 3, 4);
    await postGrowth(family, { heightCm: 70, weightKg: 8, recordedAt: august });
    await postGrowth(family, {
      heightCm: 71.5,
      weightKg: 8.4,
      recordedAt: august + 20 * 86400000,
    });

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/milestones`,
      headers: { ...family.headers, 'idempotency-key': createUlid() },
      payload: {
        title: '第一次扶站',
        description: '扶着沙发站了好一会儿',
        happenedAt: august + 86400000,
      },
    });
    expect(created.statusCode).toBe(201);
    const milestone = created.json().data;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/milestones/${milestone.id}`,
      headers: { ...family.headers, 'if-match': buildEtag(1) },
      payload: { description: '扶着沙发，笑得很开心' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.version).toBe(2);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/milestones`,
      headers: family.headers,
    });
    expect(list.json().data.items).toHaveLength(1);

    const story = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/growth/monthly-story?month=2026-08&utcOffsetMinutes=480`,
      headers: family.headers,
    });
    expect(story.statusCode).toBe(200);
    expect(story.json().data).toMatchObject({
      growthRecordCount: 2,
      milestoneCount: 1,
    });
    expect(story.json().data.summary).toContain('身高从 70cm 来到 71.5cm');
    expect(story.json().data.summary).toContain('第一次');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/milestones/${milestone.id}`,
      headers: family.headers,
    });
    expect(deleted.statusCode).toBe(200);
    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/milestones/${milestone.id}/restore`,
      headers: family.headers,
      payload: {},
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().data.version).toBe(4);
  });

  it('runs growth create and overlapping edit through shared M3 sync conflict pipeline', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    const createOperation = {
      operationId: createUlid(),
      deviceId: 'growth-device-a',
      familyId: family.familyId,
      entityType: 'GROWTH_RECORD',
      entityId,
      op: 'CREATE',
      fullPayload: {
        babyId: family.babyId,
        heightCm: 70,
        recordedAt: Date.UTC(2026, 7, 2),
        timezoneName: 'Asia/Shanghai',
      },
      clientCreatedAt: Date.now(),
    };
    const pushed = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'growth-device-a',
        familyId: family.familyId,
        operations: [createOperation],
      },
    });
    expect(pushed.statusCode).toBe(200);
    expect(pushed.json().data.results[0].status).toBe('APPLIED');

    const serverEdit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/growth/${entityId}`,
      headers: { ...family.headers, 'if-match': buildEtag(1) },
      payload: { heightCm: 71 },
    });
    expect(serverEdit.statusCode).toBe(200);

    const conflictOperation = {
      operationId: createUlid(),
      deviceId: 'growth-device-b',
      familyId: family.familyId,
      entityType: 'GROWTH_RECORD',
      entityId,
      op: 'UPDATE',
      baseVersion: 1,
      baseSnapshot: createOperation.fullPayload,
      patch: { heightCm: 72 },
      changedFields: ['heightCm'],
      clientCreatedAt: Date.now(),
    };
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'growth-device-b',
        familyId: family.familyId,
        operations: [conflictOperation],
      },
    });
    expect(conflict.statusCode).toBe(200);
    expect(conflict.json().data.results[0]).toMatchObject({
      status: 'CONFLICT',
      conflictFields: ['heightCm'],
    });

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/snapshot?familyId=${family.familyId}`,
      headers: family.headers,
    });
    const entity = snapshot
      .json()
      .data.entities.find(
        (candidate: { entityId: string }) => candidate.entityId === entityId,
      );
    expect(entity).toMatchObject({ entityType: 'GROWTH_RECORD', deleted: false });
  });

  it('replays growth updates idempotently and returns the final merged snapshot', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    const createOperation = {
      operationId: createUlid(),
      deviceId: 'growth-idempotency-device',
      familyId: family.familyId,
      entityType: 'GROWTH_RECORD',
      entityId,
      op: 'CREATE',
      fullPayload: {
        babyId: family.babyId,
        heightCm: 70,
        note: null,
        recordedAt: Date.UTC(2026, 8, 2),
        timezoneName: 'Asia/Shanghai',
      },
      clientCreatedAt: Date.now(),
    };
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: createOperation.deviceId,
        familyId: family.familyId,
        operations: [createOperation],
      },
    });
    const serverEdit = await app.inject({
      method: 'PATCH',
      url: `/api/v1/growth/${entityId}`,
      headers: { ...family.headers, 'if-match': buildEtag(1) },
      payload: { heightCm: 71 },
    });
    expect(serverEdit.statusCode).toBe(200);

    const updateOperation = {
      operationId: createUlid(),
      deviceId: 'growth-idempotency-device',
      familyId: family.familyId,
      entityType: 'GROWTH_RECORD',
      entityId,
      op: 'UPDATE',
      baseVersion: 1,
      baseSnapshot: createOperation.fullPayload,
      patch: { heightCm: 70, note: '晚饭前量的' },
      changedFields: ['heightCm', 'note'],
      clientCreatedAt: Date.now(),
    };
    const push = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/sync/push',
        headers: family.headers,
        payload: {
          deviceId: updateOperation.deviceId,
          familyId: family.familyId,
          operations: [updateOperation],
        },
      });

    const first = await push();
    const retry = await push();
    expect(first.statusCode).toBe(200);
    expect(first.json().data.results[0]).toMatchObject({
      status: 'APPLIED',
      version: 3,
      serverSnapshot: { heightCm: 71, note: '晚饭前量的' },
    });
    expect(retry.json().data.results[0]).toMatchObject({
      status: 'APPLIED',
      version: 3,
      serverSnapshot: { heightCm: 71, note: '晚饭前量的' },
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/growth/${entityId}`,
      headers: family.headers,
    });
    expect(detail.json().data).toMatchObject({
      heightCm: 71,
      note: '晚饭前量的',
      version: 3,
    });
  });

  it('applies the same validation rules to growth sync payloads', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'invalid-growth-device',
        familyId: family.familyId,
        operations: [
          {
            operationId: createUlid(),
            deviceId: 'invalid-growth-device',
            familyId: family.familyId,
            entityType: 'GROWTH_RECORD',
            entityId,
            op: 'CREATE',
            fullPayload: {
              babyId: family.babyId,
              heightCm: -1,
              recordedAt: Date.now(),
              timezoneName: 'Asia/Shanghai',
            },
            clientCreatedAt: Date.now(),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects cross-family growth updates through sync', async () => {
    const owner = await readyFamily();
    const stranger = await readyFamily();
    const created = await postGrowth(owner, { heightCm: 70 });
    const item = created.json().data;

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: stranger.headers,
      payload: {
        deviceId: 'cross-family-device',
        familyId: stranger.familyId,
        operations: [
          {
            operationId: createUlid(),
            deviceId: 'cross-family-device',
            familyId: stranger.familyId,
            entityType: 'GROWTH_RECORD',
            entityId: item.id,
            op: 'UPDATE',
            baseVersion: item.version,
            baseSnapshot: { babyId: owner.babyId, heightCm: 70 },
            patch: { heightCm: 99 },
            changedFields: ['heightCm'],
            clientCreatedAt: Date.now(),
          },
        ],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FAMILY_ACCESS_DENIED');

    const unchanged = await app.inject({
      method: 'GET',
      url: `/api/v1/growth/${item.id}`,
      headers: owner.headers,
    });
    expect(unchanged.json().data.heightCm).toBe(70);
  });

  it('rejects cross-family direct access', async () => {
    const owner = await readyFamily();
    const stranger = await readyFamily();
    const created = await postGrowth(owner, { headCircumferenceCm: 44 });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/growth/${created.json().data.id}`,
      headers: stranger.headers,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FAMILY_ACCESS_DENIED');
  });
});
