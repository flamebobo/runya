import { useEffect, useState } from 'react';
import type {
  DuplicateCandidate,
  RecordPayload,
  SyncEntityType,
} from '@runew/contracts';
import { useFamilyRuntimeStore, useSyncRuntimeStore } from '@/stores/runtime';
import { runSyncCycle } from '@/local/syncEngine';
import { listDuplicateCandidates } from '@/api/sync';
import { putEntity } from '@/local/entityStore';
import { removePendingOperation } from '@/local/pendingStore';
import {
  rebaseConflictedUpdateLocally,
  restoreDeletedUpdateLocally,
} from '@/local/repository';
import { SyncBar } from './SyncBar';
import { ConflictDialog, DeletionDialog, DuplicateDialog } from './SyncDialogs';

async function alignLocalEntity(
  entityType: SyncEntityType,
  entityId: string,
  version: number,
  payload: RecordPayload,
  deleted: boolean,
) {
  await putEntity({
    entityType,
    entityId,
    version,
    deleted,
    payload: payload as Record<string, unknown>,
    pendingOpId: null,
  });
}

function ConflictHost() {
  const familyId = useFamilyRuntimeStore((state) => state.familyId);
  const conflicts = useSyncRuntimeStore((state) => state.conflicts);
  const resolveConflict = useSyncRuntimeStore((state) => state.resolveConflict);
  const active = conflicts[0] ?? null;

  async function handleResolve(
    conflict: typeof active,
    choice: 'KEEP_SERVER' | 'KEEP_CLIENT',
  ) {
    if (!conflict || !familyId) return;
    if (choice === 'KEEP_CLIENT') {
      await rebaseConflictedUpdateLocally({
        operationId: conflict.operationId,
        entityType: conflict.entityType,
        entityId: conflict.entityId,
        serverVersion: conflict.serverVersion,
        serverSnapshot: conflict.serverSnapshot,
        clientPatch: conflict.clientPatch,
      });
    } else {
      await alignLocalEntity(
        conflict.entityType,
        conflict.entityId,
        conflict.serverVersion,
        conflict.serverSnapshot,
        false,
      );
      await removePendingOperation(conflict.operationId);
    }
    resolveConflict(conflict.operationId);
    void runSyncCycle(familyId);
  }

  return (
    <ConflictDialog
      conflict={active}
      onResolve={(conflict, choice) => void handleResolve(conflict, choice)}
    />
  );
}

function DuplicateHost() {
  const familyId = useFamilyRuntimeStore((state) => state.familyId);
  const duplicateCount = useSyncRuntimeStore((state) => state.duplicateCount);
  const setDuplicateCount = useSyncRuntimeStore((state) => state.setDuplicateCount);
  const [pair, setPair] = useState<DuplicateCandidate | null>(null);

  useEffect(() => {
    if (!familyId || duplicateCount === 0) {
      setPair(null);
      return;
    }
    let cancelled = false;
    void listDuplicateCandidates(familyId).then((result) => {
      if (cancelled) return;
      const first = result.items[0] ?? null;
      setPair(first);
      if (!first) setDuplicateCount(0);
    });
    return () => {
      cancelled = true;
    };
  }, [familyId, duplicateCount, setDuplicateCount]);

  async function handleResolve(
    candidateId: string,
    resolution: 'MERGE' | 'KEEP_BOTH',
    canonical: 'A' | 'B',
  ) {
    if (!familyId) return;
    const { resolveDuplicateCandidate } = await import('@/api/sync');
    await resolveDuplicateCandidate(
      candidateId,
      familyId,
      resolution === 'MERGE' ? { resolution, canonical } : { resolution },
    );
    setDuplicateCount(Math.max(0, duplicateCount - 1));
    setPair(null);
    void runSyncCycle(familyId);
  }

  return (
    <DuplicateDialog
      open={Boolean(pair)}
      pair={
        pair
          ? {
              candidateId: pair.candidateId,
              summaryA: pair.summaryA,
              summaryB: pair.summaryB,
            }
          : null
      }
      onResolve={(candidateId, resolution, canonical) =>
        void handleResolve(candidateId, resolution, canonical)
      }
      onClose={() => setPair(null)}
    />
  );
}

function DeletionHost() {
  const familyId = useFamilyRuntimeStore((state) => state.familyId);
  const deletionNotice = useSyncRuntimeStore((state) => state.deletionNotice);
  const setDeletionNotice = useSyncRuntimeStore((state) => state.setDeletionNotice);

  async function handleRestore(notice: NonNullable<typeof deletionNotice>) {
    if (!familyId) return;
    await restoreDeletedUpdateLocally({
      operationId: notice.operationId,
      entityType: notice.entityType,
      entityId: notice.entityId,
      serverVersion: notice.serverVersion,
      serverSnapshot: notice.serverSnapshot,
      clientPatch: notice.clientPatch,
    });
    setDeletionNotice(null);
    void runSyncCycle(familyId);
  }

  async function handleDiscard(notice: NonNullable<typeof deletionNotice>) {
    if (!familyId) return;
    await alignLocalEntity(
      notice.entityType,
      notice.entityId,
      notice.serverVersion,
      notice.serverSnapshot,
      true,
    );
    await removePendingOperation(notice.operationId);
    setDeletionNotice(null);
    void runSyncCycle(familyId);
  }

  return (
    <DeletionDialog
      notice={deletionNotice}
      onRestore={(notice) => void handleRestore(notice)}
      onDiscard={(notice) => void handleDiscard(notice)}
    />
  );
}

// 全局同步 UI 挂载点：状态条 + 三类决策对话框。
export function SyncHost() {
  return (
    <>
      <SyncBar />
      <ConflictHost />
      <DuplicateHost />
      <DeletionHost />
    </>
  );
}
