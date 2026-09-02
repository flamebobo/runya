import { createUlid, utcNowMs } from '@runew/shared-utils';
import type { PendingOperation, RecordPayload, SyncEntityType } from '@runew/contracts';
import { getFamilyRuntimeStore } from '@/stores/runtime';
import { getEntity, putEntity, removeEntity } from './entityStore';
import { enqueuePendingOperation, loadPendingOperations } from './pendingStore';
import { getOrCreateDeviceId } from './deviceStore';

export { listEntities, getEntity, putEntity, removeEntity } from './entityStore';
export type { StoredEntity } from './entityStore';

type LocalOp = PendingOperation['op'];

function requireFamilyId(familyId?: string | null): string {
  const id = familyId ?? getFamilyRuntimeStore().familyId;
  if (!id) {
    throw new Error('家庭信息还没准备好');
  }
  return id;
}

function emptySnapshot(): RecordPayload {
  return {};
}

async function basePayloadFor(entityType: SyncEntityType, entityId: string): Promise<RecordPayload> {
  const existing = await getEntity(entityType, entityId);
  return existing ? (existing.payload as RecordPayload) : emptySnapshot();
}

export interface LocalWriteResult {
  entityId: string;
  operationId: string;
}

// 写路径统一入口：先落本地实体 + Pending，再由 SyncEngine 决定何时推送。
// 网络状态与本函数无关——没有「在线路径 / 离线路径」两条代码。
export async function createRecordLocally(
  entityType: SyncEntityType,
  fullPayload: RecordPayload,
  options?: { entityId?: string; familyId?: string | null; dependsOn?: string[] },
): Promise<LocalWriteResult> {
  const familyId = requireFamilyId(options?.familyId);
  const deviceId = await getOrCreateDeviceId();
  const entityId = options?.entityId ?? createUlid();
  const now = utcNowMs();
  const operationId = createUlid();

  await putEntity({
    entityType,
    entityId,
    version: 1,
    deleted: false,
    payload: fullPayload as Record<string, unknown>,
    pendingOpId: operationId,
  });
  await enqueuePendingOperation({
    operationId,
    deviceId,
    familyId,
    entityType,
    entityId,
    op: 'CREATE',
    fullPayload,
    clientCreatedAt: now,
    retryCount: 0,
    dependsOn: options?.dependsOn,
  });
  return { entityId, operationId };
}

export async function updateRecordLocally(
  entityType: SyncEntityType,
  entityId: string,
  patch: RecordPayload,
  options?: { familyId?: string | null; baseVersion?: number },
): Promise<LocalWriteResult> {
  const familyId = requireFamilyId(options?.familyId);
  const deviceId = await getOrCreateDeviceId();
  const existing = await getEntity(entityType, entityId);
  const now = utcNowMs();
  const operationId = createUlid();
  const baseVersion = options?.baseVersion ?? existing?.version ?? 1;
  const baseSnapshot = await basePayloadFor(entityType, entityId);

  const changedFields = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);

  await putEntity({
    entityType,
    entityId,
    version: baseVersion + 1,
    deleted: existing?.deleted ?? false,
    payload: { ...(existing?.payload ?? {}), ...patch } as Record<string, unknown>,
    pendingOpId: operationId,
  });
  await enqueuePendingOperation({
    operationId,
    deviceId,
    familyId,
    entityType,
    entityId,
    op: 'UPDATE',
    baseVersion,
    baseSnapshot,
    patch,
    changedFields,
    clientCreatedAt: now,
    retryCount: 0,
  });
  return { entityId, operationId };
}

export async function deleteRecordLocally(
  entityType: SyncEntityType,
  entityId: string,
  options?: { familyId?: string | null },
): Promise<LocalWriteResult> {
  const familyId = requireFamilyId(options?.familyId);
  const deviceId = await getOrCreateDeviceId();
  const existing = await getEntity(entityType, entityId);
  const now = utcNowMs();
  const operationId = createUlid();

  if (existing && existing.pendingOpId) {
    // 实体还没同步过就删除：折叠成对 CREATE 的撤回——直接移除本地实体与草稿级数据，
    // 不发送 CREATE+DELETE 两次往返，减少服务端垃圾日志。
    const operations = await loadPendingOperations();
    const createOp = operations.find(
      (operation) => operation.operationId === existing.pendingOpId && operation.op === 'CREATE',
    );
    if (createOp) {
      await savePendingOperationsFiltered(
        operations.filter((operation) => operation.operationId !== createOp.operationId),
      );
      await removeEntity(entityType, entityId);
      return { entityId, operationId: createOp.operationId };
    }
  }

  await putEntity({
    entityType,
    entityId,
    version: (existing?.version ?? 1) + 1,
    deleted: true,
    payload: existing?.payload ?? {},
    pendingOpId: operationId,
  });
  await enqueuePendingOperation({
    operationId,
    deviceId,
    familyId,
    entityType,
    entityId,
    op: 'DELETE',
    baseVersion: existing?.version ?? 1,
    clientCreatedAt: now,
    retryCount: 0,
  });
  return { entityId, operationId };
}

export async function restoreRecordLocally(
  entityType: SyncEntityType,
  entityId: string,
  options?: { familyId?: string | null },
): Promise<LocalWriteResult> {
  const familyId = requireFamilyId(options?.familyId);
  const deviceId = await getOrCreateDeviceId();
  const existing = await getEntity(entityType, entityId);
  const now = utcNowMs();
  const operationId = createUlid();

  await putEntity({
    entityType,
    entityId,
    version: (existing?.version ?? 1) + 1,
    deleted: false,
    payload: existing?.payload ?? {},
    pendingOpId: operationId,
  });
  await enqueuePendingOperation({
    operationId,
    deviceId,
    familyId,
    entityType,
    entityId,
    op: 'RESTORE',
    baseVersion: existing?.version ?? 1,
    clientCreatedAt: now,
    retryCount: 0,
  });
  return { entityId, operationId };
}

async function savePendingOperationsFiltered(operations: PendingOperation[]) {
  const { savePendingOperations } = await import('./pendingStore');
  await savePendingOperations(operations);
}

export type { LocalOp };
