import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SyncEntityType } from '@runew/contracts';
import { useFamilyRuntimeStore } from '@/stores/runtime';
import {
  createRecordLocally,
  deleteRecordLocally,
  updateRecordLocally,
} from '@/local/repository';
import { getEntity, listEntities, putEntity } from '@/local/entityStore';
import { loadPendingOperations } from '@/local/pendingStore';

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

  it('offline create → delete before sync folds into nothing (no CREATE+DELETE roundtrip)', async () => {
    const { entityId, operationId } = await createRecordLocally('DIAPER_RECORD', {
      babyId: BABY_ID,
      diaperType: 'DIRTY',
      recordedAt: Date.UTC(2026, 8, 1, 11, 0, 0),
    });

    const deleteResult = await deleteRecordLocally('DIAPER_RECORD', entityId);
    expect(deleteResult.operationId).toBe(operationId);

    expect(await getEntity('DIAPER_RECORD', entityId)).toBeNull();
    const pending = await loadPendingOperations();
    expect(pending.find((operation) => operation.operationId === operationId)).toBeUndefined();
    expect(pending.find((operation) => operation.entityId === entityId)).toBeUndefined();
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

    const update = await updateRecordLocally('FOOD_RECORD', entityId, { amountText: '50g' });
    const pending = await loadPendingOperations();
    const queued = pending.find((operation) => operation.operationId === update.operationId);
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
    expect(pending.find((operation) => operation.entityId === entityId)?.op).toBe('DELETE');
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

  afterEach(() => {
    resetStorage();
  });
});
