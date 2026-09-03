import { healthEvents, healthReminders, scheduledNotifications, syncOperations } from '@runew/db';
import type { schema } from '@runew/db';
import type {
  HealthEventType,
  HealthReminderOffset,
  PendingOperation,
  RecordPayload,
  SyncOperationResult,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import { requireBabyInFamily, requireFamilyMembership } from '../identity/service.js';
import { appendSyncLog } from '../sync/log.js';
import { planReminders } from './schedule.js';

type Database = LibSQLDatabase<typeof schema>;
type HealthEventRow = typeof healthEvents.$inferSelect;

// Health sync payload 只取这些字段；reminderOffsets 单独走物化。
const HEALTH_FIELDS = [
  'eventType',
  'title',
  'scheduledAt',
  'locationName',
  'locationAddress',
  'doctorName',
  'note',
  'status',
  'timezoneName',
] as const;

type HealthField = (typeof HEALTH_FIELDS)[number];

const EVENT_TYPES: HealthEventType[] = ['CHECKUP', 'VACCINE', 'VISIT', 'DENTAL', 'MEDICATION', 'OTHER'];

function stripUndefined(payload: RecordPayload): RecordPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as RecordPayload;
}

// 只挑 HEALTH_FIELDS 内的键；客户端多带的字段忽略。
function pickHealthFields(payload: RecordPayload): Partial<Record<HealthField, unknown>> {
  const source = stripUndefined(payload);
  const result: Partial<Record<HealthField, unknown>> = {};
  for (const field of HEALTH_FIELDS) {
    if (field in source) result[field] = source[field];
  }
  return result;
}

function payloadOf(row: HealthEventRow): RecordPayload {
  return {
    babyId: row.babyId,
    eventType: row.eventType as HealthEventType,
    title: row.title,
    scheduledAt: row.scheduledAt,
    status: row.status as 'UPCOMING' | 'COMPLETED' | 'EXPIRED' | 'CANCELED',
    completedAt: row.completedAt,
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    doctorName: row.doctorName,
    note: row.note,
    timezoneName: row.timezoneName,
  };
}

function normalizeStatus(incoming: unknown, current: string, scheduledAt: number, now: number): string {
  if (incoming === 'COMPLETED' || incoming === 'CANCELED') return incoming;
  if (current === 'EXPIRED') return 'EXPIRED';
  return scheduledAt <= now ? 'EXPIRED' : 'UPCOMING';
}

async function findRow(db: Database, entityId: string): Promise<HealthEventRow | null> {
  const rows = await db.select().from(healthEvents).where(eq(healthEvents.id, entityId)).limit(1);
  return rows[0] ?? null;
}

function samePayload(existing: RecordPayload, incoming: Record<string, unknown>) {
  return Object.entries(stripUndefined(incoming)).every(
    ([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value),
  );
}

function resolveThreeWay(
  base: RecordPayload,
  server: RecordPayload,
  patch: Record<string, unknown>,
) {
  const merged: Record<string, unknown> = { ...stripUndefined(server) };
  const conflictFields: string[] = [];
  for (const field of HEALTH_FIELDS) {
    if (!(field in patch)) continue;
    const serverValue = server[field];
    const baseValue = base[field];
    const clientValue = patch[field];
    const serverMatchesBase = JSON.stringify(serverValue) === JSON.stringify(baseValue);
    const clientMatchesBase = JSON.stringify(clientValue) === JSON.stringify(baseValue);
    const serverMatchesClient = JSON.stringify(serverValue) === JSON.stringify(clientValue);
    if (clientMatchesBase) continue;
    if (serverMatchesBase || serverMatchesClient) {
      merged[field] = clientValue;
    } else {
      conflictFields.push(field);
    }
  }
  return { merged: merged as RecordPayload, conflictFields };
}

// 离线回放的提醒物化：与在线 createEvent/updateEvent 完全同构（PUT 语义 + 幂等唯一键）。
type ReminderOffsetInput = {
  kind: string;
  customOffsetMinutes: number | null;
  allowDndOverride: boolean;
};

function reminderOffsetsOf(payload: unknown): ReminderOffsetInput[] {
  const offsets = (payload as { reminderOffsets?: ReminderOffsetInput[] } | undefined)
    ?.reminderOffsets;
  return Array.isArray(offsets) ? offsets : [];
}

async function materializeReminders(
  db: Database,
  eventId: string,
  userId: string,
  familyId: string,
  scheduledAt: number,
  offsets: Array<{ kind: string; customOffsetMinutes: number | null; allowDndOverride: boolean }>,
  now: number,
) {
  const oldIds = await db
    .select({ id: healthReminders.id })
    .from(healthReminders)
    .where(eq(healthReminders.healthEventId, eventId));
  for (const row of oldIds) {
    await db
      .update(scheduledNotifications)
      .set({ status: 'CANCELED', updatedAt: now })
      .where(
        and(
          eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'),
          eq(scheduledNotifications.sourceId, row.id),
          eq(scheduledNotifications.status, 'SCHEDULED'),
        ),
      );
  }
  await db
    .update(healthReminders)
    .set({ status: 'CANCELED', updatedAt: now })
    .where(eq(healthReminders.healthEventId, eventId));

  const planned = planReminders(
    scheduledAt,
    {
      offsets: offsets.map((offset) => ({
        kind: offset.kind as HealthReminderOffset,
        customOffsetMinutes: offset.customOffsetMinutes ?? undefined,
        allowDndOverride: offset.allowDndOverride,
      })),
    },
    now,
  );
  for (const plannedItem of planned) {
    await db.insert(healthReminders).values({
      id: plannedItem.id,
      healthEventId: eventId,
      userId,
      offsetKind: plannedItem.offsetKind,
      customOffsetMinutes: plannedItem.customOffsetMinutes,
      fireAt: plannedItem.fireAt,
      allowDndOverride: plannedItem.allowDndOverride,
      status: 'SCHEDULED',
      createdAt: now,
      updatedAt: now,
    });
    await db
      .insert(scheduledNotifications)
      .values({
        id: createUlid(),
        userId,
        familyId,
        category: 'HEALTH',
        sourceType: 'HEALTH_REMINDER',
        sourceId: plannedItem.id,
        fireAt: plannedItem.fireAt,
        dndOverride: plannedItem.allowDndOverride,
        status: 'SCHEDULED',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }
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
    throw new AppError('ENTITY_ID_REUSED', '这次同步的操作编号已被占用，请重新提交', 409);
  }
  const stored = existing.resultJson
    ? (JSON.parse(existing.resultJson) as { payload?: RecordPayload; deleted?: boolean })
    : {};
  return {
    operationId: operation.operationId,
    status: 'APPLIED',
    entityId: existing.entityId,
    version: stored.payload?.version as number | undefined ?? 1,
    serverSnapshot: stored.payload,
  };
}

export async function applyHealthPendingOperation(
  db: Database,
  userId: string,
  operation: PendingOperation,
): Promise<SyncOperationResult> {
  await requireFamilyMembership(db, userId, operation.familyId);
  const replayed = await replayOperation(db, operation);
  if (replayed) return replayed;

  const now = utcNowMs();
  const base: SyncOperationResult = {
    operationId: operation.operationId,
    status: 'APPLIED',
  };
  const existing = await findRow(db, operation.entityId);
  if (existing) {
    if (existing.familyId !== operation.familyId) {
      throw new AppError('FAMILY_ACCESS_DENIED', '这笔内容不属于当前家庭', 403);
    }
    await requireBabyInFamily(db, userId, existing.babyId);
  }

  if (operation.op === 'CREATE') {
    const incoming = pickHealthFields(stripUndefined(operation.fullPayload ?? {}));
    const babyId = (operation.fullPayload as { babyId?: string } | undefined)?.babyId;
    if (!babyId || typeof babyId !== 'string') {
      throw new AppError('VALIDATION_ERROR', '缺少宝宝信息', 400);
    }
    const scheduledAt = (incoming.scheduledAt as number | undefined) ?? now;
    const title = (incoming.title as string | undefined) ?? '健康事项';
    const eventType = (incoming.eventType as HealthEventType | undefined) ?? 'CHECKUP';
    if (!EVENT_TYPES.includes(eventType)) {
      throw new AppError('VALIDATION_ERROR', '健康事项类型不正确', 400);
    }

    if (existing) {
      // 同 entity ID 重试：内容一致返回原结果，不一致拒绝复用。
      if (!samePayload(payloadOf(existing), { ...incoming, babyId })) {
        throw new AppError('ENTITY_ID_REUSED', '这个事项编号已被占用，请重新新增', 409);
      }
      return {
        ...base,
        entityId: existing.id,
        version: existing.version,
        serverSnapshot: payloadOf(existing),
      };
    }
    await requireBabyInFamily(db, userId, babyId);
    await db.insert(healthEvents).values({
      id: operation.entityId,
      familyId: operation.familyId,
      babyId,
      eventType,
      title,
      scheduledAt,
      completedAt: null,
      status: scheduledAt <= now ? 'EXPIRED' : 'UPCOMING',
      locationName: (incoming.locationName as string | null) ?? null,
      locationAddress: (incoming.locationAddress as string | null) ?? null,
      doctorName: (incoming.doctorName as string | null) ?? null,
      note: (incoming.note as string | null) ?? null,
      timezoneName: (incoming.timezoneName as string | undefined) ?? 'Asia/Shanghai',
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
      version: 1,
    });
    const reminderOffsets = reminderOffsetsOf(operation.fullPayload);
    if (reminderOffsets.length > 0) {
      await materializeReminders(
        db,
        operation.entityId,
        userId,
        operation.familyId,
        scheduledAt,
        reminderOffsets,
        now,
      );
    }
    const created = await findRow(db, operation.entityId);
    if (!created) throw new AppError('INTERNAL_ERROR', '内容还没安全保存，请再试一次', 500);
    const payload = payloadOf(created);
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
    throw new AppError('NOT_FOUND', '这个事项不存在，可能已被彻底删除', 404);
  }

  if (operation.op === 'DELETE') {
    if (existing.deletedAt != null) {
      return {
        ...base,
        entityId: existing.id,
        version: existing.version,
        serverSnapshot: payloadOf(existing),
      };
    }
    const nextVersion = existing.version + 1;
    await db
      .update(healthEvents)
      .set({
        deletedAt: now,
        deletedBy: userId,
        updatedBy: userId,
        updatedAt: now,
        version: nextVersion,
      })
      .where(eq(healthEvents.id, existing.id));
    // 取消该事件全部未发送提醒通知。
    await cancelScheduledForEvent(db, existing.id, now);
    await db
      .update(healthReminders)
      .set({ status: 'CANCELED', updatedAt: now })
      .where(eq(healthReminders.healthEventId, existing.id));
    await writeLog(db, operation, userId, nextVersion, payloadOf(existing), true, now);
    return {
      ...base,
      entityId: existing.id,
      version: nextVersion,
      serverSnapshot: payloadOf(existing),
    };
  }

  if (operation.op === 'RESTORE') {
    if (existing.deletedAt == null) {
      return {
        ...base,
        entityId: existing.id,
        version: existing.version,
        serverSnapshot: payloadOf(existing),
      };
    }
    const nextVersion = existing.version + 1;
    const nextStatus =
      existing.status === 'CANCELED'
        ? 'CANCELED'
        : existing.scheduledAt <= now
          ? 'EXPIRED'
          : 'UPCOMING';
    await db
      .update(healthEvents)
      .set({
        deletedAt: null,
        deletedBy: null,
        status: nextStatus,
        updatedBy: userId,
        updatedAt: now,
        version: nextVersion,
      })
      .where(eq(healthEvents.id, existing.id));
    await writeLog(db, operation, userId, nextVersion, payloadOf(existing), false, now);
    return {
      ...base,
      entityId: existing.id,
      version: nextVersion,
      serverSnapshot: payloadOf(existing),
    };
  }

  // UPDATE：三方合并；已删除实体不自动复活也不丢修改。
  if (existing.deletedAt != null) {
    return {
      ...base,
      status: 'ENTITY_DELETED',
      entityId: existing.id,
      version: existing.version,
      serverSnapshot: payloadOf(existing),
      errorCode: 'ENTITY_DELETED',
      message: '这个事项刚被其他家庭成员删掉了',
    };
  }

  const serverSnapshot = payloadOf(existing);
  const { merged, conflictFields } = resolveThreeWay(
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

  const mergedHealth = pickHealthFields(merged);
  const scheduledAt = (mergedHealth.scheduledAt as number | undefined) ?? existing.scheduledAt;
  const nextStatus = normalizeStatus(
    mergedHealth.status,
    existing.status,
    scheduledAt,
    now,
  );
  const nextVersion = existing.version + 1;
  await db
    .update(healthEvents)
    .set({
      eventType: (mergedHealth.eventType as HealthEventType | undefined) ?? existing.eventType,
      title: (mergedHealth.title as string | undefined) ?? existing.title,
      scheduledAt,
      status: nextStatus,
      completedAt:
        nextStatus === 'COMPLETED' ? (existing.completedAt ?? now) : null,
      locationName:
        mergedHealth.locationName === undefined
          ? existing.locationName
          : (mergedHealth.locationName as string | null),
      locationAddress:
        mergedHealth.locationAddress === undefined
          ? existing.locationAddress
          : (mergedHealth.locationAddress as string | null),
      doctorName:
        mergedHealth.doctorName === undefined
          ? existing.doctorName
          : (mergedHealth.doctorName as string | null),
      note:
        mergedHealth.note === undefined ? existing.note : (mergedHealth.note as string | null),
      timezoneName: (mergedHealth.timezoneName as string | undefined) ?? existing.timezoneName,
      updatedBy: userId,
      updatedAt: now,
      version: nextVersion,
    })
    .where(eq(healthEvents.id, existing.id));

  const finalPayload: RecordPayload = {
    ...serverSnapshot,
    ...pickHealthFields(merged),
    babyId: existing.babyId,
  } as RecordPayload;

  // scheduledAt 变化时重排提醒（使用 patch 中带出的 reminderOffsets）。
  const patchOffsets = reminderOffsetsOf(operation.patch);
  const scheduledAtChanged = scheduledAt !== existing.scheduledAt;
  if (scheduledAtChanged && patchOffsets.length > 0) {
    await materializeReminders(
      db,
      existing.id,
      userId,
      existing.familyId,
      scheduledAt,
      patchOffsets,
      now,
    );
  }

  await writeLog(db, operation, userId, nextVersion, finalPayload, false, now);
  return {
    ...base,
    entityId: existing.id,
    version: nextVersion,
    serverSnapshot: finalPayload,
  };
}

async function cancelScheduledForEvent(db: Database, eventId: string, now: number) {
  const reminderIds = await db
    .select({ id: healthReminders.id })
    .from(healthReminders)
    .where(eq(healthReminders.healthEventId, eventId));
  if (reminderIds.length === 0) return;
  for (const row of reminderIds) {
    await db
      .update(scheduledNotifications)
      .set({ status: 'CANCELED', updatedAt: now })
      .where(
        and(
          eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'),
          eq(scheduledNotifications.sourceId, row.id),
          eq(scheduledNotifications.status, 'SCHEDULED'),
        ),
      );
  }
}
