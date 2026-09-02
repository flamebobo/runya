import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pullChanges, pushOperations } from '@/api/sync';
import { getEntity, putEntity } from './entityStore';
import { loadPendingOperations, savePendingOperations } from './pendingStore';
import { runSyncCycle } from './syncEngine';
import { useSyncRuntimeStore } from '@/stores/runtime';

vi.mock('@/api/sync', () => ({
  fetchSnapshot: vi.fn(),
  pullChanges: vi.fn(),
  pushOperations: vi.fn(),
}));

const FAMILY_ID = '01JDEM3SYNCFAMILY000000000';
const BABY_ID = '01JDEM3SYNCBABY00000000000';
const ENTITY_ID = '01JDEM3SYNCENTITY000000000';
const OPERATION_ID = '01JDEM3SYNCOPERATION000000';
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

const pendingUpdate = {
  operationId: OPERATION_ID,
  deviceId: 'sync-test-device',
  familyId: FAMILY_ID,
  entityType: 'GROWTH_RECORD' as const,
  entityId: ENTITY_ID,
  op: 'UPDATE' as const,
  baseVersion: 1,
  baseSnapshot: { babyId: BABY_ID, heightCm: 70 },
  patch: { heightCm: 72 },
  changedFields: ['heightCm'],
  clientCreatedAt: Date.UTC(2026, 8, 1),
  retryCount: 0,
};

function emptyPull() {
  vi.mocked(pullChanges).mockResolvedValue({
    changes: [],
    nextCursor: 0,
    hasMore: false,
    serverEpoch: 1,
  });
}

describe('sync engine durable decisions', () => {
  beforeEach(() => {
    backing.clear();
    vi.clearAllMocks();
    emptyPull();
    useSyncRuntimeStore.setState({
      phase: 'idle',
      pendingCount: 0,
      lastSyncedAt: null,
      conflicts: [],
      duplicateCount: 0,
      deletionNotice: null,
    });
  });

  it('heals an interrupted local write from the pending queue and final server snapshot', async () => {
    await savePendingOperations([
      {
        ...pendingUpdate,
        op: 'CREATE',
        baseVersion: undefined,
        baseSnapshot: undefined,
        patch: undefined,
        changedFields: undefined,
        fullPayload: {
          babyId: BABY_ID,
          heightCm: 72,
          recordedAt: Date.UTC(2026, 8, 1),
        },
      },
    ]);
    vi.mocked(pushOperations).mockResolvedValue({
      results: [
        {
          operationId: OPERATION_ID,
          status: 'APPLIED',
          entityId: ENTITY_ID,
          version: 1,
          serverSnapshot: {
            babyId: BABY_ID,
            heightCm: 72,
            weightKg: null,
            headCircumferenceCm: null,
            recordedAt: Date.UTC(2026, 8, 1),
          },
        },
      ],
      serverCursor: 0,
      serverEpoch: 1,
    });

    await runSyncCycle(FAMILY_ID);

    expect(await loadPendingOperations()).toEqual([]);
    expect(await getEntity('GROWTH_RECORD', ENTITY_ID)).toMatchObject({
      version: 1,
      deleted: false,
      pendingOpId: null,
      payload: { heightCm: 72, weightKg: null },
    });
  });

  it('keeps a conflict in durable storage and rebuilds the prompt after runtime reset', async () => {
    await savePendingOperations([pendingUpdate]);
    await putEntity({
      entityType: 'GROWTH_RECORD',
      entityId: ENTITY_ID,
      version: 2,
      deleted: false,
      payload: { babyId: BABY_ID, heightCm: 72 },
      pendingOpId: OPERATION_ID,
    });
    vi.mocked(pushOperations).mockResolvedValue({
      results: [
        {
          operationId: OPERATION_ID,
          status: 'CONFLICT',
          entityId: ENTITY_ID,
          version: 2,
          conflictFields: ['heightCm'],
          serverSnapshot: { babyId: BABY_ID, heightCm: 71 },
        },
      ],
      serverCursor: 0,
      serverEpoch: 1,
    });

    await runSyncCycle(FAMILY_ID);
    expect(await loadPendingOperations()).toHaveLength(1);
    expect(useSyncRuntimeStore.getState().conflicts).toHaveLength(1);

    useSyncRuntimeStore.setState({ conflicts: [] });
    await runSyncCycle(FAMILY_ID);
    expect(await loadPendingOperations()).toHaveLength(1);
    expect(useSyncRuntimeStore.getState().conflicts[0]).toMatchObject({
      operationId: OPERATION_ID,
      serverVersion: 2,
      clientPatch: { heightCm: 72 },
    });
  });

  it('keeps an entity-deleted decision in durable storage until the user resolves it', async () => {
    await savePendingOperations([pendingUpdate]);
    vi.mocked(pushOperations).mockResolvedValue({
      results: [
        {
          operationId: OPERATION_ID,
          status: 'ENTITY_DELETED',
          entityId: ENTITY_ID,
          version: 2,
          serverSnapshot: { babyId: BABY_ID, heightCm: 70 },
        },
      ],
      serverCursor: 0,
      serverEpoch: 1,
    });

    await runSyncCycle(FAMILY_ID);

    expect(await loadPendingOperations()).toHaveLength(1);
    expect(useSyncRuntimeStore.getState().deletionNotice).toMatchObject({
      operationId: OPERATION_ID,
      serverVersion: 2,
      clientPatch: { heightCm: 72 },
      serverSnapshot: { heightCm: 70 },
    });
  });
});
