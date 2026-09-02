import { createUlid, utcNowMs } from '@runew/shared-utils';
import type { PendingOperation, RecordPayload, SyncEntityType } from '@runew/contracts';
import { getFamilyRuntimeStore } from '@/stores/runtime';
import { getEntity, putEntity } from './entityStore';
import {
  enqueuePendingOperation,
  loadPendingOperations,
  replacePendingOperation,
} from './pendingStore';
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

async function basePayloadFor(
  entityType: SyncEntityType,
  entityId: string,
): Promise<RecordPayload> {
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
  await putEntity({
    entityType,
    entityId,
    version: 1,
    deleted: false,
    payload: fullPayload as Record<string, unknown>,
    pendingOpId: operationId,
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

  const changedEntries = Object.entries(patch).filter(
    ([key, value]) =>
      value !== undefined &&
      JSON.stringify(baseSnapshot[key]) !== JSON.stringify(value),
  );
  const effectivePatch = Object.fromEntries(changedEntries) as RecordPayload;
  const changedFields = changedEntries.map(([key]) => key);

  await enqueuePendingOperation({
    operationId,
    deviceId,
    familyId,
    entityType,
    entityId,
    op: 'UPDATE',
    baseVersion,
    baseSnapshot,
    patch: effectivePatch,
    changedFields,
    clientCreatedAt: now,
    retryCount: 0,
  });
  await putEntity({
    entityType,
    entityId,
    version: baseVersion + 1,
    deleted: existing?.deleted ?? false,
    payload: {
      ...(existing?.payload ?? {}),
      ...effectivePatch,
    } as Record<string, unknown>,
    pendingOpId: operationId,
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

  await enqueuePendingOperation({
    operationId,
    deviceId,
    familyId,
    entityType,
    entityId,
    op: 'DELETE',
    baseVersion: existing?.version ?? 1,
    baseSnapshot: (existing?.payload ?? {}) as RecordPayload,
    clientCreatedAt: now,
    retryCount: 0,
  });
  await putEntity({
    entityType,
    entityId,
    version: (existing?.version ?? 1) + 1,
    deleted: true,
    payload: existing?.payload ?? {},
    pendingOpId: operationId,
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

  await enqueuePendingOperation({
    operationId,
    deviceId,
    familyId,
    entityType,
    entityId,
    op: 'RESTORE',
    baseVersion: existing?.version ?? 1,
    baseSnapshot: (existing?.payload ?? {}) as RecordPayload,
    clientCreatedAt: now,
    retryCount: 0,
  });
  await putEntity({
    entityType,
    entityId,
    version: (existing?.version ?? 1) + 1,
    deleted: false,
    payload: existing?.payload ?? {},
    pendingOpId: operationId,
  });
  return { entityId, operationId };
}

function changedFieldNames(patch: RecordPayload) {
  return Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

export async function recoverPendingEntities(
  entityTypes?: readonly SyncEntityType[],
): Promise<void> {
  const allowed = entityTypes ? new Set<SyncEntityType>(entityTypes) : null;
  for (const operation of await loadPendingOperations()) {
    if (allowed && !allowed.has(operation.entityType)) continue;
    const current = await getEntity(operation.entityType, operation.entityId);
    const basePayload = operation.baseSnapshot ?? current?.payload ?? {};
    const payload =
      operation.op === 'CREATE'
        ? (operation.fullPayload ?? basePayload)
        : operation.op === 'UPDATE'
          ? { ...basePayload, ...(operation.patch ?? {}) }
          : basePayload;
    const baseVersion = operation.baseVersion ?? current?.version ?? 0;
    const version =
      operation.op === 'CREATE'
        ? Math.max(1, current?.version ?? 0)
        : Math.max(current?.version ?? 0, baseVersion + 1);

    await putEntity({
      entityType: operation.entityType,
      entityId: operation.entityId,
      version,
      deleted:
        operation.op === 'DELETE'
          ? true
          : operation.op === 'RESTORE'
            ? false
            : (current?.deleted ?? false),
      payload: payload as Record<string, unknown>,
      pendingOpId: operation.operationId,
    });
  }
}

export async function rebaseConflictedUpdateLocally(input: {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  serverVersion: number;
  serverSnapshot: RecordPayload;
  clientPatch: RecordPayload;
}): Promise<void> {
  const pending = await loadPendingOperations();
  const operation = pending.find(
    (candidate) => candidate.operationId === input.operationId,
  );
  if (
    !operation ||
    operation.op !== 'UPDATE' ||
    operation.entityType !== input.entityType ||
    operation.entityId !== input.entityId
  ) {
    throw new Error('待处理的修改已经变化，请刷新后重试');
  }

  const rebased: PendingOperation = {
    ...operation,
    baseVersion: input.serverVersion,
    baseSnapshot: input.serverSnapshot,
    patch: input.clientPatch,
    changedFields: changedFieldNames(input.clientPatch),
    retryCount: 0,
    nextRetryAt: undefined,
    lastErrorCode: undefined,
  };
  await replacePendingOperation(input.operationId, [rebased]);
  await putEntity({
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.serverVersion + 1,
    deleted: false,
    payload: { ...input.serverSnapshot, ...input.clientPatch } as Record<
      string,
      unknown
    >,
    pendingOpId: input.operationId,
  });
}

export async function restoreDeletedUpdateLocally(input: {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  serverVersion: number;
  serverSnapshot: RecordPayload;
  clientPatch: RecordPayload;
}): Promise<void> {
  const pending = await loadPendingOperations();
  const operation = pending.find(
    (candidate) => candidate.operationId === input.operationId,
  );
  if (
    !operation ||
    operation.op !== 'UPDATE' ||
    operation.entityType !== input.entityType ||
    operation.entityId !== input.entityId
  ) {
    throw new Error('待恢复的修改已经变化，请刷新后重试');
  }

  const now = utcNowMs();
  const restoreOperation: PendingOperation = {
    ...operation,
    op: 'RESTORE',
    baseVersion: input.serverVersion,
    baseSnapshot: input.serverSnapshot,
    patch: undefined,
    fullPayload: undefined,
    changedFields: undefined,
    clientCreatedAt: now,
    retryCount: 0,
    nextRetryAt: undefined,
    lastErrorCode: undefined,
  };
  const hasPatch = changedFieldNames(input.clientPatch).length > 0;
  const updateOperation: PendingOperation | null = hasPatch
    ? {
        ...operation,
        operationId: createUlid(),
        op: 'UPDATE',
        baseVersion: input.serverVersion + 1,
        baseSnapshot: input.serverSnapshot,
        patch: input.clientPatch,
        fullPayload: undefined,
        changedFields: changedFieldNames(input.clientPatch),
        clientCreatedAt: now + 1,
        retryCount: 0,
        nextRetryAt: undefined,
        lastErrorCode: undefined,
      }
    : null;
  const replacements = updateOperation
    ? [restoreOperation, updateOperation]
    : [restoreOperation];

  await replacePendingOperation(input.operationId, replacements);
  await putEntity({
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.serverVersion + replacements.length,
    deleted: false,
    payload: { ...input.serverSnapshot, ...input.clientPatch } as Record<
      string,
      unknown
    >,
    pendingOpId: replacements[replacements.length - 1]!.operationId,
  });
}

export type { LocalOp };
