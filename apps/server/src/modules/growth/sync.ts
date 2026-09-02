import { growthRecords, milestones, syncOperations } from '@runew/db';
import {
  createGrowthBodySchema,
  createMilestoneBodySchema,
  type PendingOperation,
  type RecordPayload,
  type SyncOperationResult,
} from '@runew/contracts';
import { utcNowMs } from '@runew/shared-utils';
import { eq } from 'drizzle-orm';
import { AppError } from '../../lib/errors.js';
import { requireBabyInFamily, requireFamilyMembership } from '../identity/service.js';
import { appendSyncLog } from '../sync/log.js';
import type { Database } from './service.js';

type GrowthEntityType = 'GROWTH_RECORD' | 'MILESTONE';
type GrowthRow = typeof growthRecords.$inferSelect;
type MilestoneRow = typeof milestones.$inferSelect;
type EntityRow = GrowthRow | MilestoneRow;

const GROWTH_FIELDS = [
  'heightCm',
  'weightKg',
  'headCircumferenceCm',
  'recordedAt',
  'timezoneName',
  'note',
] as const;
const MILESTONE_FIELDS = [
  'title',
  'description',
  'happenedAt',
  'timezoneName',
  'coverMediaId',
] as const;

function fieldsFor(entityType: GrowthEntityType): readonly string[] {
  return entityType === 'GROWTH_RECORD' ? GROWTH_FIELDS : MILESTONE_FIELDS;
}

function payloadOf(entityType: GrowthEntityType, row: EntityRow): RecordPayload {
  if (entityType === 'GROWTH_RECORD') {
    const growth = row as GrowthRow;
    return {
      babyId: growth.babyId,
      heightCm: growth.heightCm,
      weightKg: growth.weightKg,
      headCircumferenceCm: growth.headCircumferenceCm,
      recordedAt: growth.recordedAt,
      timezoneName: growth.timezoneName,
      note: growth.note,
    };
  }
  const milestone = row as MilestoneRow;
  return {
    babyId: milestone.babyId,
    title: milestone.title,
    description: milestone.description,
    happenedAt: milestone.happenedAt,
    timezoneName: milestone.timezoneName,
    coverMediaId: milestone.coverMediaId,
  };
}

async function findRow(
  db: Database,
  entityType: GrowthEntityType,
  entityId: string,
): Promise<EntityRow | null> {
  if (entityType === 'GROWTH_RECORD') {
    const rows = await db
      .select()
      .from(growthRecords)
      .where(eq(growthRecords.id, entityId))
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select()
    .from(milestones)
    .where(eq(milestones.id, entityId))
    .limit(1);
  return rows[0] ?? null;
}

function stripUndefined(payload: RecordPayload): RecordPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as RecordPayload;
}

function samePayload(existing: RecordPayload, incoming: RecordPayload) {
  return Object.entries(stripUndefined(incoming)).every(
    ([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value),
  );
}

function normalizePayload(
  entityType: GrowthEntityType,
  payload: RecordPayload,
): RecordPayload {
  const schema =
    entityType === 'GROWTH_RECORD' ? createGrowthBodySchema : createMilestoneBodySchema;
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      result.error.issues[0]?.message ?? '成长内容格式不正确',
      400,
    );
  }
  return { babyId: payload.babyId, ...result.data };
}

function resolveThreeWay(
  fields: readonly string[],
  base: RecordPayload,
  server: RecordPayload,
  patch: RecordPayload,
) {
  const merged: Record<string, unknown> = { ...stripUndefined(server) };
  const conflictFields: string[] = [];
  for (const field of fields) {
    if (!(field in patch)) continue;
    const serverValue = server[field];
    const baseValue = base[field];
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

async function writeLog(
  db: Database,
  operation: PendingOperation,
  userId: string,
  version: number,
  payload: RecordPayload,
  deleted: boolean,
  now: number,
) {
  await appendSyncLog(
    db,
    {
      operationId: operation.operationId,
      familyId: operation.familyId,
      actorUserId: userId,
      deviceId: operation.deviceId,
      entityType: operation.entityType,
      entityId: operation.entityId,
      op: operation.op,
      entityVersion: version,
      changedFields: operation.changedFields,
    },
    now,
  );
  await db
    .update(syncOperations)
    .set({ resultJson: JSON.stringify({ payload, deleted }) })
    .where(eq(syncOperations.operationId, operation.operationId));
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
        deleted?: boolean;
      })
    : {};
  return {
    operationId: operation.operationId,
    status: 'APPLIED',
    entityId: operation.entityId,
    version: existing.entityVersion,
    serverSnapshot: stored.payload,
  };
}

async function createEntity(
  db: Database,
  entityType: GrowthEntityType,
  operation: PendingOperation,
  userId: string,
  payload: RecordPayload,
  now: number,
) {
  const babyId = payload.babyId;
  if (!babyId) throw new AppError('VALIDATION_ERROR', '缺少宝宝信息', 400);
  const baby = await requireBabyInFamily(db, userId, babyId);
  if (baby.familyId !== operation.familyId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '这笔内容不属于当前家庭', 403);
  }

  if (entityType === 'GROWTH_RECORD') {
    await db.insert(growthRecords).values({
      id: operation.entityId,
      familyId: operation.familyId,
      babyId,
      heightCm: payload.heightCm ?? null,
      weightKg: payload.weightKg ?? null,
      headCircumferenceCm: payload.headCircumferenceCm ?? null,
      recordedAt: payload.recordedAt ?? now,
      timezoneName: payload.timezoneName ?? 'Asia/Shanghai',
      note: payload.note ?? null,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
    });
    return;
  }

  await db.insert(milestones).values({
    id: operation.entityId,
    familyId: operation.familyId,
    babyId,
    title: payload.title!,
    description: payload.description ?? null,
    happenedAt: payload.happenedAt ?? now,
    timezoneName: payload.timezoneName ?? 'Asia/Shanghai',
    coverMediaId: payload.coverMediaId ?? null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });
}

async function updateEntity(
  db: Database,
  entityType: GrowthEntityType,
  entityId: string,
  merged: RecordPayload,
  userId: string,
  nextVersion: number,
  now: number,
) {
  if (entityType === 'GROWTH_RECORD') {
    await db
      .update(growthRecords)
      .set({
        heightCm: merged.heightCm ?? null,
        weightKg: merged.weightKg ?? null,
        headCircumferenceCm: merged.headCircumferenceCm ?? null,
        recordedAt: merged.recordedAt,
        timezoneName: merged.timezoneName,
        note: merged.note ?? null,
        updatedBy: userId,
        updatedAt: now,
        version: nextVersion,
      })
      .where(eq(growthRecords.id, entityId));
    return;
  }
  await db
    .update(milestones)
    .set({
      title: merged.title!,
      description: merged.description ?? null,
      happenedAt: merged.happenedAt,
      timezoneName: merged.timezoneName,
      coverMediaId: merged.coverMediaId ?? null,
      updatedBy: userId,
      updatedAt: now,
      version: nextVersion,
    })
    .where(eq(milestones.id, entityId));
}

async function setDeleted(
  db: Database,
  entityType: GrowthEntityType,
  entityId: string,
  userId: string,
  deleted: boolean,
  nextVersion: number,
  now: number,
) {
  const values = {
    deletedAt: deleted ? now : null,
    deletedBy: deleted ? userId : null,
    updatedBy: userId,
    updatedAt: now,
    version: nextVersion,
  };
  if (entityType === 'GROWTH_RECORD') {
    await db.update(growthRecords).set(values).where(eq(growthRecords.id, entityId));
  } else {
    await db.update(milestones).set(values).where(eq(milestones.id, entityId));
  }
}

export async function applyGrowthPendingOperation(
  db: Database,
  userId: string,
  operation: PendingOperation,
): Promise<SyncOperationResult> {
  await requireFamilyMembership(db, userId, operation.familyId);
  const replayed = await replayOperation(db, operation);
  if (replayed) return replayed;
  const entityType = operation.entityType as GrowthEntityType;
  const now = utcNowMs();
  const base: SyncOperationResult = {
    operationId: operation.operationId,
    status: 'APPLIED',
  };
  const existing = await findRow(db, entityType, operation.entityId);
  if (existing) {
    if (existing.familyId !== operation.familyId) {
      throw new AppError('FAMILY_ACCESS_DENIED', '这笔内容不属于当前家庭', 403);
    }
    await requireBabyInFamily(db, userId, existing.babyId);
  }

  if (operation.op === 'CREATE') {
    const incoming = normalizePayload(
      entityType,
      stripUndefined(operation.fullPayload ?? {}),
    );
    if (existing) {
      if (!samePayload(payloadOf(entityType, existing), incoming)) {
        throw new AppError(
          'ENTITY_ID_REUSED',
          '这笔内容的编号已被占用，请重新新增',
          409,
        );
      }
      return {
        ...base,
        entityId: existing.id,
        version: existing.version,
        serverSnapshot: payloadOf(entityType, existing),
      };
    }
    await createEntity(db, entityType, operation, userId, incoming, now);
    const created = await findRow(db, entityType, operation.entityId);
    if (!created)
      throw new AppError('INTERNAL_ERROR', '内容还没安全保存，请再试一次', 500);
    const payload = payloadOf(entityType, created);
    await writeLog(db, operation, userId, created.version, payload, false, now);
    return {
      ...base,
      entityId: created.id,
      version: created.version,
      serverSnapshot: payload,
    };
  }

  if (!existing) {
    if (operation.op === 'DELETE') return base;
    throw new AppError('NOT_FOUND', '这笔内容不存在，可能已被彻底删除', 404);
  }

  if (operation.op === 'DELETE') {
    if (existing.deletedAt != null) {
      return {
        ...base,
        entityId: existing.id,
        version: existing.version,
        serverSnapshot: payloadOf(entityType, existing),
      };
    }
    const nextVersion = existing.version + 1;
    await setDeleted(db, entityType, existing.id, userId, true, nextVersion, now);
    await writeLog(
      db,
      operation,
      userId,
      nextVersion,
      payloadOf(entityType, existing),
      true,
      now,
    );
    return {
      ...base,
      entityId: existing.id,
      version: nextVersion,
      serverSnapshot: payloadOf(entityType, existing),
    };
  }

  if (operation.op === 'RESTORE') {
    if (existing.deletedAt == null) {
      return {
        ...base,
        entityId: existing.id,
        version: existing.version,
        serverSnapshot: payloadOf(entityType, existing),
      };
    }
    const nextVersion = existing.version + 1;
    await setDeleted(db, entityType, existing.id, userId, false, nextVersion, now);
    await writeLog(
      db,
      operation,
      userId,
      nextVersion,
      payloadOf(entityType, existing),
      false,
      now,
    );
    return {
      ...base,
      entityId: existing.id,
      version: nextVersion,
      serverSnapshot: payloadOf(entityType, existing),
    };
  }

  if (existing.deletedAt != null) {
    return {
      ...base,
      status: 'ENTITY_DELETED',
      version: existing.version,
      serverSnapshot: payloadOf(entityType, existing),
      errorCode: 'ENTITY_DELETED',
      message: '这笔内容刚被其他家庭成员删掉了',
    };
  }

  const serverSnapshot = payloadOf(entityType, existing);
  const { merged, conflictFields } = resolveThreeWay(
    fieldsFor(entityType),
    stripUndefined(operation.baseSnapshot ?? {}),
    serverSnapshot,
    stripUndefined(operation.patch ?? {}),
  );
  if (conflictFields.length > 0) {
    return {
      ...base,
      status: 'CONFLICT',
      entityId: existing.id,
      version: existing.version,
      conflictFields,
      serverSnapshot,
      errorCode: 'ENTITY_VERSION_CONFLICT',
      message: '同一处被两边同时修改了，选一个留下来',
    };
  }

  const normalized = normalizePayload(entityType, merged);
  const nextVersion = existing.version + 1;
  await updateEntity(db, entityType, existing.id, normalized, userId, nextVersion, now);
  await writeLog(db, operation, userId, nextVersion, normalized, false, now);
  return {
    ...base,
    entityId: existing.id,
    version: nextVersion,
    serverSnapshot: normalized,
  };
}
