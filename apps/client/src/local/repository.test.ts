import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SyncEntityType } from '@runew/contracts';
import { useFamilyRuntimeStore } from '@/stores/runtime';
import {
  createRecordLocally,
  deleteRecordLocally,
  rebaseConflictedUpdateLocally,
  recoverPendingEntities,
  restoreDeletedUpdateLocally,
  updateRecordLocally,
} from '@/local/repository';
import { getEntity, listEntities, putEntity } from '@/local/entityStore';
import { loadPendingOperations, savePendingOperations } from '@/local/pendingStore';

const FAMILY_ID = '01JDEM3TESTFAMILY0000000000';
const BABY_ID = '01JDEM3TESTBABY000000000000';

// Local-first 核心承诺：写入只走本地（实体 + Pending），App 重启后两者都在。
// 测试环境没有 localStorage，用 Map 模拟持久层；「重启」= 重新读取同一份数据。
const backing = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() {
    return {
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: (key: string, value: string) => void backing.set(key, value),
      removeItem: (key: string) => void backing.delete(key),
      clear: () => void backing.clear(),
    };
  },
});

function resetStorage() {
  backing.clear();
}

// 只清 pending 队列，模拟「之前的操作已同步走」，保留本地实体。
function clearPendingQueue() {
  backing.delete('runew_pending_operations');
}

describe('local repository (offline persistence)', () => {
  beforeEach(() => {
    resetStorage();
    useFamilyRuntimeStore.getState().setFamilyId(FAMILY_ID);
    useFamilyRuntimeStore.getState().setBabyId(BABY_ID);
  });

  it('A (client half): offline create survives restart with entity + pending intact', async () => {
    const recordedAt = Date.UTC(2026, 8, 1, 10, 0, 0);
    const { entityId, operationId } = await createRecordLocally('DIAPER_RECORD', {
      babyId: BABY_ID,
      diaperType: 'WET',
      recordedAt,
      timezoneName: 'Asia/Shanghai',
      note: null,
    });

    // 模拟杀 App 后重启：持久层同一份，重新读。
    const entity = await getEntity('DIAPER_RECORD', entityId);
    expect(entity).not.toBeNull();
    expect(entity!.version).toBe(1);
    expect(entity!.pendingOpId).toBe(operationId);
    expect(entity!.payload.diaperType).toBe('WET');

    const pending = await loadPendingOperations();
    const queued = pending.find((operation) => operation.operationId === operationId);
    expect(queued).toBeDefined();
    expect(queued!.op).toBe('CREATE');
    expect(queued!.familyId).toBe(FAMILY_ID);
    expect(queued!.fullPayload?.recordedAt).toBe(recordedAt);
  });

  it('keeps CREATE then DELETE so an in-flight create cannot survive on the server', async () => {
    const { entityId, operationId } = await createRecordLocally('DIAPER_RECORD', {
      babyId: BABY_ID,
      diaperType: 'DIRTY',
      recordedAt: Date.UTC(2026, 8, 1, 11, 0, 0),
    });

    const deleteResult = await deleteRecordLocally('DIAPER_RECORD', entityId);
    expect(deleteResult.operationId).not.toBe(operationId);

    expect((await getEntity('DIAPER_RECORD', entityId))?.deleted).toBe(true);
    const pending = (await loadPendingOperations()).filter(
      (operation) => operation.entityId === entityId,
    );
    expect(pending.map((operation) => operation.op)).toEqual(['CREATE', 'DELETE']);
    expect(pending.map((operation) => operation.operationId)).toEqual([
      operationId,
      deleteResult.operationId,
    ]);
  });

  it('offline update enqueues UPDATE with base snapshot and changed fields', async () => {
    const { entityId } = await createRecordLocally('FOOD_RECORD', {
      babyId: BABY_ID,
      foodName: '米粉',
      amountText: '30g',
      recordedAt: Date.UTC(2026, 8, 1, 12, 0, 0),
    });
    // 先手动清掉 pending 模拟「上一条已同步」。
    clearPendingQueue();
    const synced = await getEntity('FOOD_RECORD', entityId);
    if (synced) await putEntity({ ...synced, pendingOpId: null });

    const update = await updateRecordLocally('FOOD_RECORD', entityId, {
      amountText: '50g',
    });
    const pending = await loadPendingOperations();
    const queued = pending.find(
      (operation) => operation.operationId === update.operationId,
    );
    expect(queued).toBeDefined();
    expect(queued!.op).toBe('UPDATE');
    expect(queued!.changedFields).toEqual(['amountText']);
    expect(queued!.baseSnapshot?.amountText).toBe('30g');
    expect(queued!.patch?.amountText).toBe('50g');
    expect(queued!.baseVersion).toBe(1);
  });

  it('delete of already-synced entity enqueues DELETE and marks entity deleted', async () => {
    const { entityId } = await createRecordLocally('DIAPER_RECORD', {
      babyId: BABY_ID,
      diaperType: 'DRY',
      recordedAt: Date.UTC(2026, 8, 1, 13, 0, 0),
    });
    clearPendingQueue();
    const synced = await getEntity('DIAPER_RECORD', entityId);
    if (synced) await putEntity({ ...synced, pendingOpId: null });

    await deleteRecordLocally('DIAPER_RECORD', entityId);
    const after = await getEntity('DIAPER_RECORD', entityId);
    expect(after!.deleted).toBe(true);
    const pending = await loadPendingOperations();
    expect(pending.find((operation) => operation.entityId === entityId)?.op).toBe(
      'DELETE',
    );
  });

  it('pending operations keep stable unique ids across entries', async () => {
    await createRecordLocally('DIAPER_RECORD', {
      babyId: BABY_ID,
      diaperType: 'WET',
      recordedAt: Date.UTC(2026, 8, 1, 14, 0, 0),
    });
    await createRecordLocally('DIAPER_RECORD', {
      babyId: BABY_ID,
      diaperType: 'DRY',
      recordedAt: Date.UTC(2026, 8, 1, 15, 0, 0),
    });
    const entities = await listEntities('DIAPER_RECORD' as SyncEntityType);
    expect(entities.filter((entity) => !entity.deleted)).toHaveLength(2);
    expect(await loadPendingOperations()).toHaveLength(2);
  });

  it('recovers an entity from the durable pending queue after an interrupted local write', async () => {
    const entityId = '01JDEM3RECOVERY000000000000';
    const operationId = '01JDEM3RECOVERYOP0000000000';
    await savePendingOperations([
      {
        operationId,
        deviceId: 'recovery-device',
        familyId: FAMILY_ID,
        entityType: 'GROWTH_RECORD',
        entityId,
        op: 'CREATE',
        fullPayload: {
          babyId: BABY_ID,
          heightCm: 72.5,
          recordedAt: Date.UTC(2026, 8, 1, 16),
        },
        clientCreatedAt: Date.now(),
        retryCount: 0,
      },
    ]);

    expect(await getEntity('GROWTH_RECORD', entityId)).toBeNull();
    await recoverPendingEntities(['GROWTH_RECORD']);
    expect(await getEntity('GROWTH_RECORD', entityId)).toMatchObject({
      entityId,
      pendingOpId: operationId,
      deleted: false,
      payload: { heightCm: 72.5 },
    });
  });

  it('rebases keep-client on the latest server snapshot without dropping the pending intent', async () => {
    const entityId = '01JDEM3CONFLICT000000000000';
    await putEntity({
      entityType: 'GROWTH_RECORD',
      entityId,
      version: 1,
      deleted: false,
      payload: { babyId: BABY_ID, heightCm: 70, note: null },
      pendingOpId: null,
    });
    const update = await updateRecordLocally('GROWTH_RECORD', entityId, {
      heightCm: 72,
    });

    await rebaseConflictedUpdateLocally({
      operationId: update.operationId,
      entityType: 'GROWTH_RECORD',
      entityId,
      serverVersion: 2,
      serverSnapshot: { babyId: BABY_ID, heightCm: 71, note: '服务端备注' },
      clientPatch: { heightCm: 72 },
    });

    const pending = await loadPendingOperations();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      operationId: update.operationId,
      op: 'UPDATE',
      baseVersion: 2,
      baseSnapshot: { heightCm: 71, note: '服务端备注' },
      patch: { heightCm: 72 },
    });
    expect(await getEntity('GROWTH_RECORD', entityId)).toMatchObject({
      version: 3,
      pendingOpId: update.operationId,
      payload: { heightCm: 72, note: '服务端备注' },
    });
  });

  it('replaces a deleted UPDATE with RESTORE then UPDATE in one queue write', async () => {
    const entityId = '01JDEM3RESTORE0000000000000';
    await putEntity({
      entityType: 'MILESTONE',
      entityId,
      version: 1,
      deleted: false,
      payload: { babyId: BABY_ID, title: '第一次站立' },
      pendingOpId: null,
    });
    const update = await updateRecordLocally('MILESTONE', entityId, {
      title: '第一次独立站立',
    });

    await restoreDeletedUpdateLocally({
      operationId: update.operationId,
      entityType: 'MILESTONE',
      entityId,
      serverVersion: 2,
      serverSnapshot: { babyId: BABY_ID, title: '第一次站立' },
      clientPatch: { title: '第一次独立站立' },
    });

    const pending = await loadPendingOperations();
    expect(pending.map((operation) => operation.op)).toEqual(['RESTORE', 'UPDATE']);
    expect(pending[0]?.operationId).toBe(update.operationId);
    expect(pending[1]?.operationId).not.toBe(update.operationId);
    expect(await getEntity('MILESTONE', entityId)).toMatchObject({
      version: 4,
      deleted: false,
      pendingOpId: pending[1]?.operationId,
      payload: { title: '第一次独立站立' },
    });
  });

  afterEach(() => {
    resetStorage();
  });
});
