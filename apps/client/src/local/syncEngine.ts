import type { RecordPayload, SyncEntityType } from '@runew/contracts';
import { platformAdapters } from '@/adapters/platform';
import { ApiError } from '@/api/client';
import { fetchSnapshot, pullChanges, pushOperations } from '@/api/sync';
import { getEntity, listEntities, putEntity, removeEntity } from './entityStore';
import { recoverPendingEntities } from './repository';
import { loadPendingOperations, savePendingOperations } from './pendingStore';
import {
  getSyncCursor,
  getSyncEpoch,
  setSyncCursor,
  setSyncEpoch,
} from './syncCursorStore';
import { getSyncRuntimeStore } from './syncRuntime';

// sync_epoch 变化（Restore 等）→ cursor 失效 → full resync。
// full resync 禁止清空 pending queue：先快照 pending，重建本地后原样回放。
export async function fullResync(familyId: string) {
  const snapshot = await fetchSnapshot(familyId);
  const pending = await loadPendingOperations();
  const pendingEntityIds = new Set(pending.map((operation) => operation.entityId));

  for (const entityType of [
    'DIAPER_RECORD',
    'FOOD_RECORD',
    'GROWTH_RECORD',
    'MILESTONE',
  ]) {
    for (const entity of await listEntities(entityType)) {
      if (entity.pendingOpId == null && !pendingEntityIds.has(entity.entityId)) {
        await removeEntity(entityType, entity.entityId);
      }
    }
  }

  for (const entity of snapshot.entities) {
    const local = await getEntity(entity.entityType, entity.entityId);
    if (local?.pendingOpId) continue; // 本地有未同步意图，等 push 收敛，不被快照覆盖
    await putEntity({
      entityType: entity.entityType,
      entityId: entity.entityId,
      version: entity.version,
      deleted: entity.deleted,
      payload: entity.payload as Record<string, unknown>,
      pendingOpId: null,
    });
  }

  await setSyncCursor(snapshot.serverCursor);
  await setSyncEpoch(snapshot.serverEpoch);
  await savePendingOperations(pending); // pending 原样保留（M3 验收 F）
  return snapshot;
}

async function applyServerChange(change: {
  entityType: string;
  entityId: string;
  version: number;
  deleted?: boolean;
  payload?: RecordPayload | null;
}) {
  const local = await getEntity(change.entityType, change.entityId);
  if (local?.pendingOpId) return; // 本地有 pending 意图，等 push 后再收敛
  await putEntity({
    entityType: change.entityType,
    entityId: change.entityId,
    version: change.version,
    deleted: change.deleted ?? false,
    payload: (change.payload ?? local?.payload ?? {}) as Record<string, unknown>,
    pendingOpId: null,
  });
}

async function pushPending(familyId: string): Promise<number> {
  const runtime = getSyncRuntimeStore();
  const pending = await loadPendingOperations();
  runtime.setPendingCount(pending.length);
  if (pending.length === 0) return await getSyncCursor();

  const batch = pending.slice(0, 50);
  const deviceId = batch[0]?.deviceId;
  if (!deviceId) return await getSyncCursor();
  const response = await pushOperations({ deviceId, familyId, operations: batch });
  const latestPendingByEntity = new Map<string, string>();
  for (const operation of pending) {
    latestPendingByEntity.set(
      `${operation.entityType}:${operation.entityId}`,
      operation.operationId,
    );
  }

  const keepIds = new Set<string>();
  for (const result of response.results) {
    const operation = pending.find(
      (candidate) => candidate.operationId === result.operationId,
    );
    if (!operation) continue;
    if (result.status === 'APPLIED' || result.status === 'DUPLICATE_QUEUED') {
      const local = await getEntity(operation.entityType, operation.entityId);
      const isLatestIntent =
        latestPendingByEntity.get(`${operation.entityType}:${operation.entityId}`) ===
        operation.operationId;
      if (isLatestIntent && result.serverSnapshot) {
        await putEntity({
          entityType: operation.entityType,
          entityId: operation.entityId,
          version: result.version ?? local?.version ?? 1,
          deleted: operation.op === 'DELETE',
          payload: result.serverSnapshot as Record<string, unknown>,
          pendingOpId: null,
        });
      } else if (isLatestIntent && local) {
        await putEntity({
          ...local,
          version: result.version ?? local.version,
          pendingOpId: null,
        });
      }
      if (result.duplicateCandidates?.length) {
        runtime.setDuplicateCount(
          runtime.duplicateCount + result.duplicateCandidates.length,
        );
      }
    } else if (result.status === 'CONFLICT') {
      runtime.pushConflict({
        operationId: operation.operationId,
        entityType: operation.entityType as SyncEntityType,
        entityId: operation.entityId,
        serverVersion: result.version ?? operation.baseVersion ?? 1,
        conflictFields: result.conflictFields ?? [],
        serverSnapshot: result.serverSnapshot ?? {},
        clientPatch: operation.patch ?? {},
        baseSnapshot: operation.baseSnapshot,
      });
      keepIds.add(operation.operationId);
    } else if (result.status === 'ENTITY_DELETED') {
      runtime.setDeletionNotice({
        operationId: operation.operationId,
        entityType: operation.entityType,
        entityId: operation.entityId,
        serverVersion: result.version ?? operation.baseVersion ?? 1,
        clientPatch: operation.patch ?? {},
        serverSnapshot: result.serverSnapshot ?? operation.baseSnapshot ?? {},
      });
      keepIds.add(operation.operationId);
    } else {
      keepIds.add(operation.operationId);
    }
  }

  // 只有已应用的操作才移出队列；冲突与删除决策保留到用户明确处理，重启后可再次恢复提示。
  // 本批未发送、响应缺失、可重试错误同样原样保留。
  const resolvedIds = new Set(response.results.map((result) => result.operationId));
  const remaining = pending.filter(
    (operation) =>
      !resolvedIds.has(operation.operationId) || keepIds.has(operation.operationId),
  );
  await savePendingOperations(remaining);
  runtime.setPendingCount(remaining.length);
  return response.serverCursor;
}

async function runPull(familyId: string, startCursor: number) {
  const runtime = getSyncRuntimeStore();
  let cursor = startCursor;
  let total = 0;
  for (let round = 0; round < 10; round += 1) {
    const page = await pullChanges(familyId, cursor);
    await setSyncEpoch(page.serverEpoch);
    for (const change of page.changes) {
      if (change.op === 'DELETE' || change.deleted) {
        const local = await getEntity(change.entityType, change.entityId);
        if (local?.pendingOpId) continue;
        await putEntity({
          entityType: change.entityType,
          entityId: change.entityId,
          version: change.version,
          deleted: true,
          payload: (change.payload ?? local?.payload ?? {}) as Record<string, unknown>,
          pendingOpId: null,
        });
      } else {
        await applyServerChange(change);
      }
    }
    total += page.changes.length;
    cursor = page.nextCursor;
    await setSyncCursor(cursor);
    if (!page.hasMore) break;
  }
  runtime.setPendingCount((await loadPendingOperations()).length);
  return { cursor, total };
}

let syncing = false;

// 同步主循环：epoch 检查 → push → pull。禁止并发。
export async function runSyncCycle(
  familyId: string,
): Promise<{ pulled: number; fullResynced: boolean } | null> {
  const runtime = getSyncRuntimeStore();
  if (syncing) return null;
  syncing = true;
  runtime.setPhase('syncing');
  try {
    const online = await platformAdapters.network.isOnline();
    if (!online) {
      await recoverPendingEntities();
      runtime.setPhase('offline');
      return null;
    }

    await recoverPendingEntities();
    let didResync = false;
    const localEpoch = await getSyncEpoch();
    if (localEpoch > 0) {
      const probe = await pullChanges(familyId, 0, 1).catch(() => null);
      if (probe && probe.serverEpoch !== localEpoch) {
        await fullResync(familyId);
        didResync = true;
      }
    }

    const pushedCursor = await pushPending(familyId);
    const { total } = await runPull(familyId, pushedCursor);
    runtime.setPhase('idle');
    runtime.setLastSyncedAt(Date.now());
    return { pulled: total, fullResynced: didResync };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'SYNC_CURSOR_EXPIRED') {
      await fullResync(familyId);
      runtime.setPhase('idle');
      return { pulled: 0, fullResynced: true };
    }
    runtime.setPhase('error');
    return null;
  } finally {
    syncing = false;
  }
}

export async function getPendingCount() {
  return (await loadPendingOperations()).length;
}
