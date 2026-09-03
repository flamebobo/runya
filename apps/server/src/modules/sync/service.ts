import {
  diaperRecords,
  duplicateCandidates,
  foodRecords,
  syncOperations,
} from '@runew/db';
import type { schema } from '@runew/db';
import type {
  DuplicateCandidate,
  PendingOperation,
  RecordPayload,
  SyncEntityType,
  SyncOperationResult,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, desc, eq, gte, isNull, lte, ne, or } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import { appendSyncLog } from './log.js';
import { applyGrowthPendingOperation } from '../growth/sync.js';
import { applyHealthPendingOperation } from '../health/sync.js';
import { requireFamilyMembership } from '../identity/service.js';

type DailySyncEntityType = Extract<SyncEntityType, 'DIAPER_RECORD' | 'FOOD_RECORD'>;

type Database = LibSQLDatabase<typeof schema>;

// 时间窗口是可调工程默认值（Tech Design §29.2），不是产品硬规则。
const DUPLICATE_WINDOW_MS: Record<string, number> = {
  DIAPER_RECORD: 10 * 60 * 1000,
  FOOD_RECORD: 15 * 60 * 1000,
};

const PAYLOAD_FIELDS = [
  'diaperType',
  'foodName',
  'amountText',
  'recordedAt',
  'timezoneName',
  'note',
] as const;

type RecordRow = typeof diaperRecords.$inferSelect | typeof foodRecords.$inferSelect;

function stripRecordFields(row: RecordRow): RecordPayload {
  if ('diaperType' in row) {
    return {
      babyId: row.babyId,
      diaperType: row.diaperType as RecordPayload['diaperType'],
      recordedAt: row.recordedAt,
      timezoneName: row.timezoneName,
      note: row.note,
    };
  }
  return {
    babyId: row.babyId,
    foodName: row.foodName,
    amountText: row.amountText,
    recordedAt: row.recordedAt,
    timezoneName: row.timezoneName,
    note: row.note,
  };
}

function tableFor(entityType: DailySyncEntityType) {
  return entityType === 'DIAPER_RECORD' ? diaperRecords : foodRecords;
}

function stripUndefined(payload: RecordPayload): RecordPayload {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) result[key] = value;
  }
  return result as RecordPayload;
}

function payloadSummary(
  entityType: DailySyncEntityType,
  payload: RecordPayload,
): string {
  if (entityType === 'DIAPER_RECORD') {
    const type =
      payload.diaperType === 'WET'
        ? '湿'
        : payload.diaperType === 'DIRTY'
          ? '便'
          : payload.diaperType === 'BOTH'
            ? '湿+便'
            : '干';
    return `尿布 · ${type}`;
  }
  return `辅食 · ${payload.foodName ?? ''}`;
}

async function findEntityRow(
  db: Database,
  entityType: DailySyncEntityType,
  entityId: string,
): Promise<RecordRow | null> {
  const table = tableFor(entityType);
  const rows = await db.select().from(table).where(eq(table.id, entityId)).limit(1);
  return (rows[0] as RecordRow | undefined) ?? null;
}

async function replayOperation(
  db: Database,
  operation: PendingOperation,
): Promise<SyncOperationResult | null> {
  const rows = await db
    .select()
    .from(syncOperations)
    .where(eq(syncOperations.operationId, operation.operationId))
    .limit(1);
  const existing = rows[0];
  if (!existing) return null;
  if (
    existing.familyId !== operation.familyId ||
    existing.entityType !== operation.entityType ||
    existing.entityId !== operation.entityId ||
    existing.op !== operation.op
  ) {
    throw new AppError(
      'ENTITY_ID_REUSED',
      '这次同步的操作编号已被占用，请重新提交',
      409,
    );
  }
  const stored = existing.resultJson
    ? (JSON.parse(existing.resultJson) as {
        payload?: RecordPayload;
        status?: SyncOperationResult['status'];
        duplicateCandidates?: SyncOperationResult['duplicateCandidates'];
      })
    : {};
  return {
    operationId: operation.operationId,
    status: stored.status ?? 'APPLIED',
    entityId: operation.entityId,
    version: existing.entityVersion,
    serverSnapshot: stored.payload,
    duplicateCandidates: stored.duplicateCandidates,
  };
}

async function storeOperationResult(
  db: Database,
  operationId: string,
  result: {
    payload: RecordPayload;
    deleted: boolean;
    status?: SyncOperationResult['status'];
    duplicateCandidates?: SyncOperationResult['duplicateCandidates'];
  },
) {
  await db
    .update(syncOperations)
    .set({ resultJson: JSON.stringify(result) })
    .where(eq(syncOperations.operationId, operationId));
}

function rowDeleted(row: RecordRow): boolean {
  return row.deletedAt != null;
}

// 三方比较：server 与 base 不同的字段 = 服务器已被别人改过；
// 如果客户端 patch 也碰了这些字段 → 重叠冲突；否则客户端字段可以安全应用。
function resolveThreeWay(
  base: RecordPayload,
  serverCurrent: RecordPayload,
  clientPatch: RecordPayload,
): { merged: RecordPayload; conflictFields: string[] } {
  const server = stripUndefined(serverCurrent);
  const patch = stripUndefined(clientPatch);
  const merged: Record<string, unknown> = { ...server };
  const conflictFields: string[] = [];

  for (const field of PAYLOAD_FIELDS) {
    if (!(field in patch)) continue;
    const baseValue = base[field];
    const serverValue = server[field];
    const clientValue = patch[field];
    const serverMatchesBase = JSON.stringify(serverValue) === JSON.stringify(baseValue);
    const clientMatchesBase = JSON.stringify(clientValue) === JSON.stringify(baseValue);
    const serverMatchesClient =
      JSON.stringify(serverValue) === JSON.stringify(clientValue);
    if (clientMatchesBase) continue;
    if (serverMatchesBase || serverMatchesClient) {
      merged[field] = clientValue;
    } else {
      conflictFields.push(field);
    }
  }
  return { merged: merged as RecordPayload, conflictFields };
}

async function detectDuplicates(
  db: Database,
  familyId: string,
  entityType: DailySyncEntityType,
  entity: RecordRow,
  actorUserId: string,
  now: number,
) {
  const windowMs = DUPLICATE_WINDOW_MS[entityType] ?? 10 * 60 * 1000;
  const table = tableFor(entityType);
  const conditions = [
    eq(table.familyId, familyId),
    eq(table.babyId, entity.babyId),
    isNull(table.deletedAt),
    ne(table.id, entity.id),
    gte(table.recordedAt, entity.recordedAt - windowMs),
    lte(table.recordedAt, entity.recordedAt + windowMs),
  ];
  if (entityType === 'DIAPER_RECORD' && 'diaperType' in entity) {
    conditions.push(eq(diaperRecords.diaperType, entity.diaperType));
  }
  const others = await db
    .select()
    .from(table)
    .where(and(...conditions));

  const candidates: Array<{
    candidateId: string;
    otherEntityId: string;
    otherSummary: string;
  }> = [];
  for (const other of others) {
    const pairA = entity.id < other.id ? entity.id : other.id;
    const pairB = entity.id < other.id ? other.id : entity.id;
    const candidateId = createUlid();
    await db
      .insert(duplicateCandidates)
      .values({
        id: candidateId,
        familyId,
        babyId: entity.babyId,
        entityType,
        entityAId: pairA,
        entityBId: pairB,
        similarityScore: 1,
        status: 'PENDING',
        detectedAt: now,
      })
      .onConflictDoNothing();
    candidates.push({
      candidateId,
      otherEntityId: other.id,
      otherSummary: payloadSummary(entityType, stripRecordFields(other as RecordRow)),
    });
  }
  return candidates;
}

export async function listPendingDuplicates(
  db: Database,
  userId: string,
  familyId: string,
): Promise<DuplicateCandidate[]> {
  await requireFamilyMembership(db, userId, familyId);
  const rows = await db
    .select()
    .from(duplicateCandidates)
    .where(
      and(
        eq(duplicateCandidates.familyId, familyId),
        eq(duplicateCandidates.status, 'PENDING'),
      ),
    )
    .orderBy(desc(duplicateCandidates.detectedAt))
    .limit(50);

  const results: DuplicateCandidate[] = [];
  for (const row of rows) {
    const entityType = row.entityType as DailySyncEntityType;
    const rowA = await findEntityRow(db, entityType, row.entityAId);
    const rowB = await findEntityRow(db, entityType, row.entityBId);
    if (!rowA || !rowB) continue;
    results.push({
      candidateId: row.id,
      entityType,
      entityAId: row.entityAId,
      entityBId: row.entityBId,
      summaryA: payloadSummary(entityType, stripRecordFields(rowA)),
      summaryB: payloadSummary(entityType, stripRecordFields(rowB)),
      detectedAt: row.detectedAt,
    });
  }
  return results;
}

async function softDeleteEntity(
  db: Database,
  entityType: DailySyncEntityType,
  entityId: string,
  userId: string,
  now: number,
  current?: RecordRow,
) {
  const table = tableFor(entityType);
  const row = current ?? (await findEntityRow(db, entityType, entityId));
  if (!row) return;
  await db
    .update(table)
    .set({
      deletedAt: now,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: now,
      version: row.version + 1,
    })
    .where(eq(table.id, entityId));
}

export async function resolveDuplicate(
  db: Database,
  userId: string,
  familyId: string,
  candidateId: string,
  body: {
    resolution: 'MERGE' | 'KEEP_BOTH';
    canonical?: 'A' | 'B';
    mergedFields?: RecordPayload;
  },
) {
  await requireFamilyMembership(db, userId, familyId);
  const rows = await db
    .select()
    .from(duplicateCandidates)
    .where(
      and(
        eq(duplicateCandidates.id, candidateId),
        eq(duplicateCandidates.familyId, familyId),
      ),
    )
    .limit(1);
  const candidate = rows[0];
  if (!candidate) throw new AppError('NOT_FOUND', '这条重复提示不存在', 404);
  if (candidate.status !== 'PENDING') {
    return {
      candidateId,
      resolution: candidate.status,
      canonicalId: null,
      mergedId: null,
    };
  }

  const now = utcNowMs();
  await db
    .update(duplicateCandidates)
    .set({
      status: body.resolution === 'MERGE' ? 'MERGED' : 'KEEP_BOTH',
      resolvedBy: userId,
      resolvedAt: now,
    })
    .where(eq(duplicateCandidates.id, candidateId));

  if (body.resolution === 'KEEP_BOTH') {
    return { candidateId, resolution: 'KEEP_BOTH', canonicalId: null, mergedId: null };
  }

  // Merge：canonical 保留并应用选定字段，另一方 soft delete（可从最近删除恢复）。
  const entityType = candidate.entityType as DailySyncEntityType;
  const canonicalId =
    body.canonical === 'B' ? candidate.entityBId : candidate.entityAId;
  const mergedId = body.canonical === 'B' ? candidate.entityAId : candidate.entityBId;

  if (body.mergedFields && Object.keys(stripUndefined(body.mergedFields)).length > 0) {
    const table = tableFor(entityType);
    const row = await findEntityRow(db, entityType, canonicalId);
    if (row) {
      const patch = body.mergedFields;
      await db
        .update(table)
        .set({
          ...(patch.diaperType !== undefined && 'diaperType' in table
            ? { diaperType: patch.diaperType }
            : {}),
          ...(patch.foodName !== undefined && 'foodName' in table
            ? { foodName: patch.foodName }
            : {}),
          ...(patch.amountText !== undefined && 'amountText' in table
            ? { amountText: patch.amountText }
            : {}),
          ...(patch.recordedAt !== undefined ? { recordedAt: patch.recordedAt } : {}),
          ...(patch.note !== undefined ? { note: patch.note } : {}),
          updatedBy: userId,
          updatedAt: now,
          version: row.version + 1,
        })
        .where(eq(table.id, canonicalId));
    }
    await appendSyncLog(
      db,
      {
        operationId: createUlid(),
        familyId,
        actorUserId: userId,
        deviceId: null,
        entityType,
        entityId: canonicalId,
        op: 'UPDATE',
        entityVersion: (row?.version ?? 1) + 1,
        changedFields: Object.keys(stripUndefined(body.mergedFields ?? {})),
      },
      now,
    );
  }

  await softDeleteEntity(db, entityType, mergedId, userId, now);
  const mergedRow = await findEntityRow(db, entityType, mergedId);
  if (mergedRow) {
    await appendSyncLog(
      db,
      {
        operationId: createUlid(),
        familyId,
        actorUserId: userId,
        deviceId: null,
        entityType,
        entityId: mergedId,
        op: 'DELETE',
        entityVersion: mergedRow.version,
      },
      now,
    );
  }

  return { candidateId, resolution: 'MERGED', canonicalId, mergedId };
}

export async function applyPendingOperation(
  db: Database,
  userId: string,
  operation: PendingOperation,
): Promise<SyncOperationResult> {
  if (
    operation.entityType === 'GROWTH_RECORD' ||
    operation.entityType === 'MILESTONE'
  ) {
    return applyGrowthPendingOperation(db, userId, operation);
  }
  if (operation.entityType === 'HEALTH_EVENT') {
    return applyHealthPendingOperation(db, userId, operation);
  }
  await requireFamilyMembership(db, userId, operation.familyId);
  const replayed = await replayOperation(db, operation);
  if (replayed) return replayed;
  const entityType = operation.entityType as DailySyncEntityType;
  const table = tableFor(entityType);
  const now = utcNowMs();
  const base: SyncOperationResult = {
    operationId: operation.operationId,
    status: 'APPLIED',
  };

  if (operation.op === 'CREATE') {
    const existing = await findEntityRow(db, entityType, operation.entityId);
    if (existing) {
      // 同 entity ID 重试：payload 一致返回已应用结果，不一致视为复用错误。
      const existingPayload = stripRecordFields(existing);
      const incoming = operation.fullPayload ?? {};
      const same = Object.keys(stripUndefined(incoming)).every(
        (key) =>
          JSON.stringify((incoming as Record<string, unknown>)[key]) ===
          JSON.stringify((existingPayload as Record<string, unknown>)[key]),
      );
      if (!same) {
        throw new AppError('ENTITY_ID_REUSED', '这条记录编号已被占用，请重新添加', 409);
      }
      return {
        ...base,
        entityId: existing.id,
        version: existing.version,
        serverSnapshot: existingPayload,
      };
    }

    const fullPayload = stripUndefined(operation.fullPayload ?? {});
    const babyId = fullPayload.babyId;
    const recordedAt = fullPayload.recordedAt ?? now;
    if (!babyId) {
      throw new AppError('VALIDATION_ERROR', '缺少宝宝信息', 400);
    }
    const version = 1;
    if (entityType === 'DIAPER_RECORD') {
      await db.insert(diaperRecords).values({
        id: operation.entityId,
        familyId: operation.familyId,
        babyId,
        diaperType: fullPayload.diaperType ?? 'WET',
        recordedAt,
        timezoneName: fullPayload.timezoneName ?? 'Asia/Shanghai',
        note: fullPayload.note ?? null,
        createdBy: userId,
        createdAt: now,
        updatedBy: userId,
        updatedAt: now,
        version,
      });
    } else {
      await db.insert(foodRecords).values({
        id: operation.entityId,
        familyId: operation.familyId,
        babyId,
        foodName: fullPayload.foodName ?? '',
        amountText: fullPayload.amountText ?? null,
        recordedAt,
        timezoneName: fullPayload.timezoneName ?? 'Asia/Shanghai',
        note: fullPayload.note ?? null,
        createdBy: userId,
        createdAt: now,
        updatedBy: userId,
        updatedAt: now,
        version,
      });
    }

    const row = await findEntityRow(db, entityType, operation.entityId);
    await appendSyncLog(
      db,
      {
        operationId: operation.operationId,
        familyId: operation.familyId,
        actorUserId: userId,
        deviceId: operation.deviceId,
        entityType,
        entityId: operation.entityId,
        op: 'CREATE',
        entityVersion: version,
        changedFields: operation.changedFields,
      },
      now,
    );
    if (!row) {
      throw new AppError('INTERNAL_ERROR', '记录还没安全保存，请再试一次', 500);
    }
    const payload = stripRecordFields(row);
    const duplicateCandidatesFound = await detectDuplicates(
      db,
      operation.familyId,
      entityType,
      row,
      userId,
      now,
    );
    const status = duplicateCandidatesFound.length > 0 ? 'DUPLICATE_QUEUED' : 'APPLIED';
    await storeOperationResult(db, operation.operationId, {
      payload,
      deleted: false,
      status,
      duplicateCandidates: duplicateCandidatesFound,
    });
    return {
      ...base,
      status,
      entityId: operation.entityId,
      version,
      serverSnapshot: payload,
      duplicateCandidates: duplicateCandidatesFound,
    };
  }

  const row = await findEntityRow(db, entityType, operation.entityId);

  if (operation.op === 'DELETE') {
    if (!row) {
      return { ...base, status: 'APPLIED' };
    }
    if (rowDeleted(row)) {
      return {
        ...base,
        entityId: row.id,
        version: row.version,
        serverSnapshot: stripRecordFields(row),
      };
    }
    await softDeleteEntity(db, entityType, operation.entityId, userId, now, row);
    await appendSyncLog(
      db,
      {
        operationId: operation.operationId,
        familyId: operation.familyId,
        actorUserId: userId,
        deviceId: operation.deviceId,
        entityType,
        entityId: operation.entityId,
        op: 'DELETE',
        entityVersion: row.version + 1,
      },
      now,
    );
    const deletedPayload = stripRecordFields(row);
    await storeOperationResult(db, operation.operationId, {
      payload: deletedPayload,
      deleted: true,
    });
    return {
      ...base,
      entityId: row.id,
      version: row.version + 1,
      serverSnapshot: deletedPayload,
    };
  }

  if (operation.op === 'RESTORE') {
    if (!row) {
      throw new AppError('NOT_FOUND', '这条记录不存在，可能已被彻底删除', 404);
    }
    const restoredPayload = stripRecordFields(row);
    if (!rowDeleted(row)) {
      return {
        ...base,
        entityId: row.id,
        version: row.version,
        serverSnapshot: restoredPayload,
      };
    }
    const nextVersion = row.version + 1;
    await db
      .update(table)
      .set({
        deletedAt: null,
        deletedBy: null,
        updatedBy: userId,
        updatedAt: now,
        version: nextVersion,
      })
      .where(eq(table.id, operation.entityId));
    await appendSyncLog(
      db,
      {
        operationId: operation.operationId,
        familyId: operation.familyId,
        actorUserId: userId,
        deviceId: operation.deviceId,
        entityType,
        entityId: operation.entityId,
        op: 'RESTORE',
        entityVersion: nextVersion,
      },
      now,
    );
    await storeOperationResult(db, operation.operationId, {
      payload: restoredPayload,
      deleted: false,
    });
    return {
      ...base,
      entityId: row.id,
      version: nextVersion,
      serverSnapshot: restoredPayload,
    };
  }

  // UPDATE：三方合并。已删除实体不自动复活也不丢修改 → ENTITY_DELETED 交给 UI 决策。
  if (!row) {
    throw new AppError('NOT_FOUND', '这条记录不存在，可能已被彻底删除', 404);
  }
  if (rowDeleted(row)) {
    return {
      ...base,
      status: 'ENTITY_DELETED',
      entityId: row.id,
      version: row.version,
      serverSnapshot: stripRecordFields(row),
      errorCode: 'ENTITY_DELETED',
      message: '这条记录刚被其他家庭成员删掉了',
    };
  }

  const serverCurrent = stripRecordFields(row);
  const baseSnapshot = stripUndefined(operation.baseSnapshot ?? {});
  const patch = stripUndefined(operation.patch ?? {});
  const { merged, conflictFields } = resolveThreeWay(
    baseSnapshot,
    serverCurrent,
    patch,
  );

  if (conflictFields.length > 0) {
    return {
      ...base,
      status: 'CONFLICT',
      entityId: row.id,
      version: row.version,
      conflictFields,
      serverSnapshot: serverCurrent,
      errorCode: 'ENTITY_VERSION_CONFLICT',
      message: '同一处被两边同时修改了，选一个保留下来',
    };
  }

  const nextVersion = row.version + 1;
  const updateValues: Record<string, unknown> = {
    updatedBy: userId,
    updatedAt: now,
    version: nextVersion,
  };
  for (const field of PAYLOAD_FIELDS) {
    if (merged[field] !== undefined) updateValues[field] = merged[field];
  }
  if (entityType === 'DIAPER_RECORD' && merged.diaperType !== undefined) {
    updateValues.diaperType = merged.diaperType;
  }
  if (entityType === 'FOOD_RECORD' && merged.foodName !== undefined) {
    updateValues.foodName = merged.foodName;
  }
  await db.update(table).set(updateValues).where(eq(table.id, operation.entityId));

  await appendSyncLog(
    db,
    {
      operationId: operation.operationId,
      familyId: operation.familyId,
      actorUserId: userId,
      deviceId: operation.deviceId,
      entityType,
      entityId: operation.entityId,
      op: 'UPDATE',
      entityVersion: nextVersion,
      changedFields: Object.keys(patch),
    },
    now,
  );
  await storeOperationResult(db, operation.operationId, {
    payload: merged,
    deleted: false,
  });

  return {
    ...base,
    entityId: operation.entityId,
    version: nextVersion,
    serverSnapshot: merged,
  };
}

export async function findPotentialDuplicateIds(
  db: Database,
  familyId: string,
  entityType: DailySyncEntityType,
  entityId: string,
) {
  const rows = await db
    .select()
    .from(duplicateCandidates)
    .where(
      or(
        and(
          eq(duplicateCandidates.entityType, entityType),
          eq(duplicateCandidates.entityAId, entityId),
        ),
        and(
          eq(duplicateCandidates.entityType, entityType),
          eq(duplicateCandidates.entityBId, entityId),
        ),
      ),
    );
  return rows.filter((row) => row.familyId === familyId && row.status === 'PENDING');
}
