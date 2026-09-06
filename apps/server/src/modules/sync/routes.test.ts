import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, systemMetadata, SYSTEM_METADATA_KEYS, syncOperations } from '@runew/db';
import { eq } from 'drizzle-orm';
import { createUlid } from '@runew/shared-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

const WEAPP_HEADERS = {
  'x-client-platform': 'WEAPP',
};

const DIAPER = 'DIAPER_RECORD' as const;

function diaperCreateOp(overrides: Record<string, unknown> = {}) {
  const entityId = (overrides.entityId as string) ?? createUlid();
  return {
    operationId: (overrides.operationId as string) ?? createUlid(),
    deviceId: (overrides.deviceId as string) ?? 'test-device',
    familyId: overrides.familyId as string,
    entityType: DIAPER,
    entityId,
    op: 'CREATE' as const,
    fullPayload: {
      babyId: overrides.babyId as string,
      diaperType: 'WET',
      recordedAt: (overrides.recordedAt as number) ?? Date.UTC(2026, 8, 1, 10, 0, 0),
      timezoneName: 'Asia/Shanghai',
      note: null,
    },
    clientCreatedAt: Date.UTC(2026, 8, 1, 10, 0, 5),
  };
}

function diaperUpdateOp(overrides: Record<string, unknown> = {}) {
  return {
    operationId: (overrides.operationId as string) ?? createUlid(),
    deviceId: overrides.deviceId ?? 'test-device',
    familyId: overrides.familyId as string,
    entityType: DIAPER,
    entityId: overrides.entityId as string,
    op: 'UPDATE' as const,
    baseVersion: overrides.baseVersion as number,
    baseSnapshot: overrides.baseSnapshot,
    patch: overrides.patch,
    changedFields: Object.keys((overrides.patch as Record<string, unknown>) ?? {}),
    clientCreatedAt: Date.UTC(2026, 8, 1, 10, 5, 0),
  };
}

describe('sync api', () => {
  let tempDir: string;
  let databasePath: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userSeq = 0;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m3-test-'));
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
      // Windows sidecar lock
    }
  });

  async function registerUser() {
    userSeq += 1;
    const username = `m3_user_${userSeq}_${Date.now().toString(36)}`;
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: { username, password: 'password123', nickname: '测试妈妈' },
    });
    expect(register.statusCode).toBe(201);
    return register.json().data.session.token as string;
  }

  async function readyFamily() {
    const token = await registerUser();
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
    const data = onboarding.json().data;
    return {
      token,
      familyId: data.family.id as string,
      babyId: data.baby.id as string,
      headers: { ...WEAPP_HEADERS, authorization: `Bearer ${token}` },
    };
  }

  it('A + B: offline create, replay same operation twice → one server row (idempotent)', async () => {
    const family = await readyFamily();
    const op = diaperCreateOp({ familyId: family.familyId, babyId: family.babyId });

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: { deviceId: 'test-device', familyId: family.familyId, operations: [op] },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.results[0]!.status).toBe('APPLIED');
    expect(first.json().data.results[0]!.version).toBe(1);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: { deviceId: 'test-device', familyId: family.familyId, operations: [op] },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.results[0]!.status).toBe('APPLIED');

    const timeline = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/records?kind=diaper`,
      headers: family.headers,
    });
    const diaperItems = timeline
      .json()
      .data.items.filter((item: { kind: string }) => item.kind === 'DIAPER');
    expect(diaperItems).toHaveLength(1);
    const gems = await app.inject({
      method: 'GET', url: '/api/v1/gems/transactions', headers: family.headers,
    });
    expect(gems.statusCode).toBe(200);
    expect(gems.json().data).toHaveLength(1);
    expect(gems.json().data[0]).toMatchObject({ sourceId: op.entityId, amount: 1, reasonText: DIAPER });
  });

  it('rejects same operationId with different payload (ENTITY_ID_REUSED)', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    const op = diaperCreateOp({
      familyId: family.familyId,
      babyId: family.babyId,
      entityId,
    });
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: { deviceId: 'test-device', familyId: family.familyId, operations: [op] },
    });
    expect(first.json().data.results[0]!.status).toBe('APPLIED');

    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'test-device',
        familyId: family.familyId,
        operations: [
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId,
            operationId: createUlid(),
            recordedAt: Date.UTC(2026, 8, 2, 10, 0, 0),
          }),
        ],
      },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('ENTITY_ID_REUSED');
  });

  it('awards an offline food create only once across repeated pushes', async () => {
    const family = await readyFamily();
    const op = {
      ...diaperCreateOp({ familyId: family.familyId, babyId: family.babyId }),
      entityType: 'FOOD_RECORD',
      fullPayload: { babyId: family.babyId, foodName: '南瓜泥', recordedAt: Date.now() },
    };
    const request = {
      method: 'POST' as const, url: '/api/v1/sync/push', headers: family.headers,
      payload: { deviceId: 'test-device', familyId: family.familyId, operations: [op] },
    };
    expect((await app.inject(request)).statusCode).toBe(200);
    expect((await app.inject(request)).statusCode).toBe(200);
    const gems = await app.inject({ method: 'GET', url: '/api/v1/gems/transactions', headers: family.headers });
    expect(gems.statusCode).toBe(200);
    expect(gems.json().data).toHaveLength(1);
    expect(gems.json().data[0]).toMatchObject({ sourceId: op.entityId, amount: 1, reasonText: 'FOOD_RECORD' });
  });

  it('rolls back an offline record and its ACK when the gem write fails', async () => {
    const family = await readyFamily();
    const op = diaperCreateOp({ familyId: family.familyId, babyId: family.babyId });
    await app.sqlClient.execute("CREATE TRIGGER test_reject_gem BEFORE INSERT ON gem_transactions BEGIN SELECT RAISE(ABORT, 'test gem failure'); END");
    try {
      const failed = await app.inject({
        method: 'POST', url: '/api/v1/sync/push', headers: family.headers,
        payload: { deviceId: 'test-device', familyId: family.familyId, operations: [op] },
      });
      expect(failed.statusCode).toBe(500);
      const detail = await app.inject({ method: 'GET', url: `/api/v1/diapers/${op.entityId}`, headers: family.headers });
      expect(detail.statusCode).toBe(404);
      expect(await app.db.select().from(syncOperations).where(eq(syncOperations.operationId, op.operationId))).toHaveLength(0);
    } finally {
      await app.sqlClient.execute('DROP TRIGGER test_reject_gem');
    }
    const retried = await app.inject({
      method: 'POST', url: '/api/v1/sync/push', headers: family.headers,
      payload: { deviceId: 'test-device', familyId: family.familyId, operations: [op] },
    });
    expect(retried.statusCode).toBe(200);
    const gems = await app.inject({ method: 'GET', url: '/api/v1/gems/transactions', headers: family.headers });
    expect(gems.json().data).toHaveLength(1);
  });

  it('C: A edits note, B edits recordedAt (non-overlap) → auto merge, both fields land', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    const create = diaperCreateOp({
      familyId: family.familyId,
      babyId: family.babyId,
      entityId,
      note: null,
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [create],
      },
    });

    const baseSnapshot = {
      babyId: family.babyId,
      diaperType: 'WET',
      recordedAt: Date.UTC(2026, 8, 1, 10, 0, 0),
      timezoneName: 'Asia/Shanghai',
      note: null,
    };

    // 设备 A → note
    const patchA = diaperUpdateOp({
      familyId: family.familyId,
      entityId,
      deviceId: 'device-a',
      baseVersion: 1,
      baseSnapshot,
      patch: { note: '睡得很沉' },
    });
    const resultA = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [patchA],
      },
    });
    expect(resultA.json().data.results[0]!.status).toBe('APPLIED');

    // 设备 B 修改 diaperType（非重叠字段）
    const patchB = diaperUpdateOp({
      familyId: family.familyId,
      entityId,
      deviceId: 'device-b',
      baseVersion: 1,
      baseSnapshot,
      patch: { diaperType: 'BOTH' },
    });
    const resultB = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-b',
        familyId: family.familyId,
        operations: [patchB],
      },
    });
    expect(resultB.json().data.results[0]!.status).toBe('APPLIED');
    expect(resultB.json().data.results[0]).toMatchObject({
      version: 3,
      serverSnapshot: { note: '睡得很沉', diaperType: 'BOTH' },
    });

    const retryB = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-b',
        familyId: family.familyId,
        operations: [patchB],
      },
    });
    expect(retryB.json().data.results[0]).toMatchObject({
      status: 'APPLIED',
      version: 3,
      serverSnapshot: { note: '睡得很沉', diaperType: 'BOTH' },
    });

    const pulled = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?familyId=${family.familyId}&cursor=0&limit=500`,
      headers: family.headers,
    });
    const changes = pulled.json().data.changes as Array<{
      entityId: string;
      payload: { note?: string | null; diaperType?: string } | null;
    }>;
    const lastForEntity = [...changes]
      .reverse()
      .find((change) => change.entityId === entityId);
    // 最新日志带合并后的完整 payload：note 与 diaperType 同时存在
    expect(lastForEntity?.payload?.note).toBe('睡得很沉');
    expect(lastForEntity?.payload?.diaperType).toBe('BOTH');
  });

  it('D: A/B both change diaperType → CONFLICT with conflictFields, no silent overwrite', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    const create = diaperCreateOp({
      familyId: family.familyId,
      babyId: family.babyId,
      entityId,
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [create],
      },
    });

    const baseSnapshot = {
      babyId: family.babyId,
      diaperType: 'WET',
      recordedAt: Date.UTC(2026, 8, 1, 10, 0, 0),
      timezoneName: 'Asia/Shanghai',
      note: null,
    };

    const patchA = diaperUpdateOp({
      familyId: family.familyId,
      entityId,
      deviceId: 'device-a',
      baseVersion: 1,
      baseSnapshot,
      patch: { diaperType: 'DIRTY' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [patchA],
      },
    });

    const patchB = diaperUpdateOp({
      familyId: family.familyId,
      entityId,
      deviceId: 'device-b',
      baseVersion: 1,
      baseSnapshot,
      patch: { diaperType: 'DRY' },
    });
    const resultB = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-b',
        familyId: family.familyId,
        operations: [patchB],
      },
    });
    const result = resultB.json().data.results[0];
    expect(result.status).toBe('CONFLICT');
    expect(result.conflictFields).toEqual(['diaperType']);
    expect(result.serverSnapshot.diaperType).toBe('DIRTY');
    expect(result.errorCode).toBe('ENTITY_VERSION_CONFLICT');
  });

  it('E: delete vs offline update → ENTITY_DELETED, entity stays deleted', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    const create = diaperCreateOp({
      familyId: family.familyId,
      babyId: family.babyId,
      entityId,
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [create],
      },
    });

    const deleteOp = {
      operationId: createUlid(),
      deviceId: 'device-b',
      familyId: family.familyId,
      entityType: DIAPER,
      entityId,
      op: 'DELETE' as const,
      clientCreatedAt: Date.UTC(2026, 8, 1, 10, 2, 0),
    };
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-b',
        familyId: family.familyId,
        operations: [deleteOp],
      },
    });

    const offlineUpdate = diaperUpdateOp({
      familyId: family.familyId,
      entityId,
      deviceId: 'device-a',
      baseVersion: 1,
      baseSnapshot: {
        babyId: family.babyId,
        diaperType: 'WET',
        recordedAt: Date.UTC(2026, 8, 1, 10, 0, 0),
        timezoneName: 'Asia/Shanghai',
        note: null,
      },
      patch: { note: '还在改这一点' },
    });
    const result = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [offlineUpdate],
      },
    });
    const outcome = result.json().data.results[0];
    expect(outcome.status).toBe('ENTITY_DELETED');
    expect(outcome.errorCode).toBe('ENTITY_DELETED');
    expect(outcome.version).toBe(2);
    expect(outcome.serverSnapshot).toMatchObject({
      babyId: family.babyId,
      diaperType: 'WET',
    });

    // 不自动复活：记录仍是删除状态
    const timeline = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/records?kind=diaper`,
      headers: family.headers,
    });
    const diaperItems = timeline
      .json()
      .data.items.filter((item: { kind: string }) => item.kind === 'DIAPER');
    expect(diaperItems).toHaveLength(0);
  });

  it('F: full resync via snapshot preserves semantics; push is NOT cleared by client (client test)', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId,
          }),
        ],
      },
    });

    const snapshot = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/snapshot?familyId=${family.familyId}`,
      headers: family.headers,
    });
    expect(snapshot.statusCode).toBe(200);
    const data = snapshot.json().data;
    expect(data.serverEpoch).toBe(1);
    expect(data.entities).toHaveLength(1);
    expect(data.entities[0]!.entityId).toBe(entityId);
    expect(data.serverCursor).toBeGreaterThan(0);
  });

  it('H + I: duplicate detection → merge keeps one, keep both keeps two', async () => {
    const family = await readyFamily();
    const baseTime = Date.UTC(2026, 8, 1, 10, 0, 0);
    const idA = createUlid();
    const idB = createUlid();
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId: idA,
          }),
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId: idB,
            recordedAt: baseTime + 3 * 60 * 1000,
          }),
        ],
      },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/duplicates?familyId=${family.familyId}`,
      headers: family.headers,
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().data.items as Array<{
      candidateId: string;
      entityAId: string;
      entityBId: string;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0]!.candidateId).toBeTruthy();

    // 准备第二对重复（用于 MERGE 分支），保证两个场景各用独立 candidate
    const idC = createUlid();
    const idD = createUlid();
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId: idC,
            recordedAt: baseTime + 6 * 60 * 60 * 1000,
          }),
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId: idD,
            recordedAt: baseTime + 6 * 60 * 60 * 1000 + 2 * 60 * 1000,
          }),
        ],
      },
    });
    const list2 = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/duplicates?familyId=${family.familyId}`,
      headers: family.headers,
    });
    const items2 = list2.json().data.items as Array<{ candidateId: string }>;
    expect(items2).toHaveLength(2);

    // KEEP BOTH：两条都保留
    const keepBoth = await app.inject({
      method: 'POST',
      url: `/api/v1/sync/duplicates/${items[0]!.candidateId}/resolve?familyId=${family.familyId}`,
      headers: family.headers,
      payload: { resolution: 'KEEP_BOTH' },
    });
    expect(keepBoth.json().data.resolution).toBe('KEEP_BOTH');
    let timeline = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/records?kind=diaper`,
      headers: family.headers,
    });
    expect(
      timeline.json().data.items.filter((i: { kind: string }) => i.kind === 'DIAPER'),
    ).toHaveLength(4);

    // MERGE：canonical 保留，另一方进入最近删除
    const mergeTarget = items2.find(
      (item) => item.candidateId !== items[0]!.candidateId,
    )!;
    const merge = await app.inject({
      method: 'POST',
      url: `/api/v1/sync/duplicates/${mergeTarget.candidateId}/resolve?familyId=${family.familyId}`,
      headers: family.headers,
      payload: { resolution: 'MERGE', canonical: 'A' },
    });
    expect(merge.json().data.resolution).toBe('MERGED');
    timeline = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/records?kind=diaper`,
      headers: family.headers,
    });
    expect(
      timeline.json().data.items.filter((i: { kind: string }) => i.kind === 'DIAPER'),
    ).toHaveLength(3);
  });

  it('J: unauthorized family push is rejected', async () => {
    const stranger = await readyFamily();
    const victim = await readyFamily();
    const op = diaperCreateOp({
      familyId: victim.familyId,
      babyId: victim.babyId,
    });
    const push = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: stranger.headers,
      payload: { deviceId: 'evil-device', familyId: victim.familyId, operations: [op] },
    });
    expect(push.statusCode).toBe(403);
    expect(push.json().error.code).toBe('FAMILY_ACCESS_DENIED');
  });

  it('G: sync_epoch bump after restore — snapshot/pull report new epoch, entity data stays', async () => {
    const family = await readyFamily();
    const entityId = createUlid();
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId,
          }),
        ],
      },
    });

    const before = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/snapshot?familyId=${family.familyId}`,
      headers: family.headers,
    });
    expect(before.json().data.serverEpoch).toBe(1);

    // 模拟 Restore：epoch +1（客户端 pull 时发现 epoch 变化 → full resync）。
    // sync_epoch 行在迁移时不 seed，readSyncEpoch 缺行时兜底为 1，因此这里用 upsert。
    await app.db
      .insert(systemMetadata)
      .values({
        key: SYSTEM_METADATA_KEYS.SYNC_EPOCH,
        value: '2',
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: systemMetadata.key,
        set: { value: '2', updatedAt: Date.now() },
      });

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/snapshot?familyId=${family.familyId}`,
      headers: family.headers,
    });
    expect(after.json().data.serverEpoch).toBe(2);
    expect(
      after.json().data.entities.map((e: { entityId: string }) => e.entityId),
    ).toContain(entityId);

    const pull = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?familyId=${family.familyId}&cursor=0`,
      headers: family.headers,
    });
    expect(pull.json().data.serverEpoch).toBe(2);
    expect(
      pull.json().data.changes.map((c: { entityId: string }) => c.entityId),
    ).toContain(entityId);
  });

  it('unauthenticated sync endpoints are rejected', async () => {
    const push = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: WEAPP_HEADERS,
      payload: { deviceId: 'x', familyId: createUlid(), operations: [] },
    });
    expect(push.statusCode).toBe(401);
  });

  it('pull rejects unknown cursor and returns change feed in order', async () => {
    const family = await readyFamily();
    const bad = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?familyId=${family.familyId}&cursor=-1`,
      headers: family.headers,
    });
    expect(bad.statusCode).toBe(409);

    const entityId = createUlid();
    await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [
          diaperCreateOp({
            familyId: family.familyId,
            babyId: family.babyId,
            entityId,
          }),
        ],
      },
    });
    const good = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?familyId=${family.familyId}&cursor=0`,
      headers: family.headers,
    });
    const changes = good.json().data.changes as Array<{
      seq: number;
      entityId: string;
    }>;
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.map((change) => change.seq)).toEqual(
      [...changes.map((change) => change.seq)].sort((a, b) => a - b),
    );
    expect(changes[0]!.entityId).toBe(entityId);

    const healthCreate = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${family.babyId}/health/events`,
      headers: { ...family.headers, 'idempotency-key': createUlid() },
      payload: {
        eventType: 'CHECKUP',
        title: '同步协议回归检查',
        scheduledAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
      },
    });
    expect(healthCreate.statusCode).toBe(201);
    const healthId = healthCreate.json().data.id as string;
    const healthPull = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?familyId=${family.familyId}&cursor=0&limit=500`,
      headers: family.headers,
    });
    const healthChange = [
      ...(healthPull.json().data.changes as Array<{
        entityId: string;
        payload: unknown;
      }>),
    ]
      .reverse()
      .find((change) => change.entityId === healthId);
    expect(healthChange).toMatchObject({ entityId: healthId, payload: null });

    const deleted = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/push',
      headers: family.headers,
      payload: {
        deviceId: 'device-a',
        familyId: family.familyId,
        operations: [
          {
            operationId: createUlid(),
            deviceId: 'device-a',
            familyId: family.familyId,
            entityType: DIAPER,
            entityId,
            op: 'DELETE',
            clientCreatedAt: Date.UTC(2026, 8, 1, 10, 10, 0),
          },
        ],
      },
    });
    expect(deleted.statusCode).toBe(200);

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?familyId=${family.familyId}&cursor=0`,
      headers: family.headers,
    });
    expect(afterDelete.statusCode).toBe(200);
    const deleteChange = [
      ...(afterDelete.json().data.changes as Array<{
        entityId: string;
        payload: unknown;
        deleted?: boolean;
      }>),
    ]
      .reverse()
      .find((change) => change.entityId === entityId && change.deleted);
    expect(deleteChange).toMatchObject({ entityId, deleted: true });
    expect(deleteChange?.payload).toMatchObject({ babyId: family.babyId });
  });
});
