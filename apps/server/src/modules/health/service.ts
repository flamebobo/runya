import { healthEvents, healthReminders, scheduledNotifications } from '@runew/db';
import type { schema } from '@runew/db';
import type {
  CreateHealthEventBody,
  HealthEventPublic,
  HealthReminderBody,
  HealthReminderOffset,
  UpdateHealthEventBody,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import { requireBabyInFamily } from '../identity/service.js';
import { appendSyncLog } from '../sync/log.js';
import { planReminders, reminderView } from './schedule.js';

export type Database = LibSQLDatabase<typeof schema>;

type HealthEventRow = typeof healthEvents.$inferSelect;
type HealthReminderRow = typeof healthReminders.$inferSelect;

const DEFAULT_TZ = 'Asia/Shanghai';

export function mapEvent(
  row: HealthEventRow,
  reminders: HealthReminderRow[] = [],
): HealthEventPublic {
  const scheduledReminders = reminders.filter((item) => item.status === 'SCHEDULED');
  return {
    id: row.id,
    familyId: row.familyId,
    babyId: row.babyId,
    eventType: row.eventType as HealthEventPublic['eventType'],
    title: row.title,
    scheduledAt: row.scheduledAt,
    completedAt: row.completedAt,
    status: row.status as HealthEventPublic['status'],
    locationName: row.locationName,
    locationAddress: row.locationAddress,
    doctorName: row.doctorName,
    note: row.note,
    timezoneName: row.timezoneName,
    reminder: reminderView(
      scheduledReminders.map((item) => ({
        id: item.id,
        offsetKind: item.offsetKind as HealthReminderOffset,
        customOffsetMinutes: item.customOffsetMinutes,
        fireAt: item.fireAt,
        allowDndOverride: item.allowDndOverride,
      })),
    ),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

async function getEventRow(db: Database, id: string, includeDeleted = false) {
  const where = includeDeleted
    ? eq(healthEvents.id, id)
    : and(eq(healthEvents.id, id), isNull(healthEvents.deletedAt));
  const rows = await db.select().from(healthEvents).where(where).limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '这个健康事项找不到了', 404);
  return row;
}

async function reminderRowsFor(db: Database, eventId: string, userId: string) {
  return db
    .select()
    .from(healthReminders)
    .where(
      and(
        eq(healthReminders.healthEventId, eventId),
        eq(healthReminders.userId, userId),
        eq(healthReminders.status, 'SCHEDULED'),
      ),
    )
    .orderBy(asc(healthReminders.fireAt));
}

async function reminderIdsOf(db: Database, eventId: string) {
  const rows = await db
    .select({ id: healthReminders.id })
    .from(healthReminders)
    .where(eq(healthReminders.healthEventId, eventId));
  return rows.map((row) => row.id);
}

async function cancelRemindersForEvent(db: Database, eventId: string, now: number) {
  const reminderIds = await reminderIdsOf(db, eventId);
  if (reminderIds.length > 0) {
    await db
      .update(scheduledNotifications)
      .set({ status: 'CANCELED', updatedAt: now })
      .where(
        and(
          eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'),
          inArray(scheduledNotifications.sourceId, reminderIds),
          eq(scheduledNotifications.status, 'SCHEDULED'),
        ),
      );
  }
  await db
    .update(healthReminders)
    .set({ status: 'CANCELED', updatedAt: now })
    .where(
      and(
        eq(healthReminders.healthEventId, eventId),
        eq(healthReminders.status, 'SCHEDULED'),
      ),
    );
}

export async function listEvents(
  db: Database,
  userId: string,
  babyId: string,
): Promise<{ items: HealthEventPublic[] }> {
  await requireBabyInFamily(db, userId, babyId);
  const rows = await db
    .select()
    .from(healthEvents)
    .where(and(eq(healthEvents.babyId, babyId), isNull(healthEvents.deletedAt)))
    .orderBy(asc(healthEvents.scheduledAt));
  const items: HealthEventPublic[] = [];
  for (const row of rows) {
    const reminders = await reminderRowsFor(db, row.id, userId);
    items.push(mapEvent(row, reminders));
  }
  return { items };
}

export async function getEvent(db: Database, userId: string, id: string) {
  const row = await getEventRow(db, id);
  await requireBabyInFamily(db, userId, row.babyId);
  const reminders = await reminderRowsFor(db, row.id, userId);
  return mapEvent(row, reminders);
}

interface ScheduleNotificationsInput {
  userId: string;
  familyId: string;
  eventId: string;
  eventTitle: string;
  planned: ReturnType<typeof planReminders>;
  now: number;
}

// 通知物化：PUT 语义整体替换——旧的 SCHEDULED 全部 CANCELED，新的逐条 INSERT。
// 唯一键 (user, source_type, source_id, fire_at, category) 兜底：重放不会产生第二条。
// sourceType 统一为 HEALTH_REMINDER、sourceId 用提醒行 ID，单条提醒取消可精确命中。
async function materializeScheduledNotifications(
  db: Database,
  input: ScheduleNotificationsInput,
) {
  const oldIds = await db
    .select({ id: healthReminders.id })
    .from(healthReminders)
    .where(
      and(
        eq(healthReminders.healthEventId, input.eventId),
        eq(healthReminders.userId, input.userId),
      ),
    );
  for (const row of oldIds) {
    await db
      .update(scheduledNotifications)
      .set({ status: 'CANCELED', updatedAt: input.now })
      .where(
        and(
          eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'),
          eq(scheduledNotifications.sourceId, row.id),
          eq(scheduledNotifications.status, 'SCHEDULED'),
        ),
      );
  }
  for (const reminder of input.planned) {
    await db
      .insert(scheduledNotifications)
      .values({
        id: createUlid(),
        userId: input.userId,
        familyId: input.familyId,
        category: 'HEALTH',
        sourceType: 'HEALTH_REMINDER',
        sourceId: reminder.id,
        fireAt: reminder.fireAt,
        dndOverride: reminder.allowDndOverride,
        status: 'SCHEDULED',
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing();
  }
}

function reminderBodyOf(
  body: HealthReminderBody | null | undefined,
): HealthReminderBody | null {
  if (!body) return null;
  return { offsets: body.offsets };
}

export async function createEvent(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateHealthEventBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  const id = createUlid();
  const planned = planReminders(body.scheduledAt, body.reminder ?? null, now);

  await db.insert(healthEvents).values({
    id,
    familyId: baby.familyId,
    babyId,
    eventType: body.eventType,
    title: body.title,
    scheduledAt: body.scheduledAt,
    completedAt: null,
    status: 'UPCOMING',
    locationName: body.locationName ?? null,
    locationAddress: body.locationAddress ?? null,
    doctorName: body.doctorName ?? null,
    note: body.note ?? null,
    timezoneName: body.timezoneName ?? DEFAULT_TZ,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });

  await replaceReminders(db, {
    eventId: id,
    userId,
    now,
    planned,
  });
  await materializeScheduledNotifications(db, {
    userId,
    familyId: baby.familyId,
    eventId: id,
    eventTitle: body.title,
    planned,
    now,
  });

  const created = await getEvent(db, userId, id);
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: baby.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'HEALTH_EVENT',
      entityId: id,
      op: 'CREATE',
      entityVersion: created.version,
    },
    now,
  );
  return created;
}

async function replaceReminders(
  db: Database,
  input: {
    eventId: string;
    userId: string;
    now: number;
    planned: ReturnType<typeof planReminders>;
  },
) {
  // 提醒按用户独立：PUT 语义 = 该用户在这个事件上的旧提醒全部 CANCELED，再插入新计划。
  await db
    .update(healthReminders)
    .set({ status: 'CANCELED', updatedAt: input.now })
    .where(
      and(
        eq(healthReminders.healthEventId, input.eventId),
        eq(healthReminders.userId, input.userId),
        eq(healthReminders.status, 'SCHEDULED'),
      ),
    );
  for (const planned of input.planned) {
    await db.insert(healthReminders).values({
      id: planned.id,
      healthEventId: input.eventId,
      userId: input.userId,
      offsetKind: planned.offsetKind,
      customOffsetMinutes: planned.customOffsetMinutes,
      fireAt: planned.fireAt,
      allowDndOverride: planned.allowDndOverride,
      status: 'SCHEDULED',
      createdAt: input.now,
      updatedAt: input.now,
    });
  }
}

export async function restoreDeletedReminders(
  db: Database,
  input: {
    eventId: string;
    familyId: string;
    eventTitle: string;
    scheduledAt: number;
    deletedAt: number;
    status: HealthEventPublic['status'];
    now: number;
  },
) {
  if (input.status !== 'UPCOMING') return;

  // 删除会把当时仍在生效的提醒统一写成同一个 updatedAt；只恢复这批，
  // 避免把更早被用户主动取消或替换的提醒重新带回来。
  const rows = await db
    .select()
    .from(healthReminders)
    .where(
      and(
        eq(healthReminders.healthEventId, input.eventId),
        eq(healthReminders.status, 'CANCELED'),
        eq(healthReminders.updatedAt, input.deletedAt),
      ),
    )
    .orderBy(asc(healthReminders.fireAt));
  if (rows.length === 0) return;

  const rowsByUser = new Map<string, HealthReminderRow[]>();
  for (const row of rows) {
    const userRows = rowsByUser.get(row.userId) ?? [];
    userRows.push(row);
    rowsByUser.set(row.userId, userRows);
  }
  for (const [userId, userRows] of rowsByUser) {
    const planned = planReminders(
      input.scheduledAt,
      {
        offsets: userRows.map((row) => ({
          kind: row.offsetKind as HealthReminderOffset,
          customOffsetMinutes: row.customOffsetMinutes ?? undefined,
          allowDndOverride: row.allowDndOverride,
        })),
      },
      input.now,
    );
    await replaceReminders(db, {
      eventId: input.eventId,
      userId,
      now: input.now,
      planned,
    });
    await materializeScheduledNotifications(db, {
      userId,
      familyId: input.familyId,
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      planned,
      now: input.now,
    });
  }
}

export async function updateEvent(
  db: Database,
  userId: string,
  id: string,
  body: UpdateHealthEventBody,
  expectedVersion: number | null,
) {
  const current = await getEvent(db, userId, id);
  if (expectedVersion !== null && current.version !== expectedVersion) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这个事项已在别处更新', 409);
  }
  if (current.status === 'CANCELED') {
    throw new AppError('VALIDATION_ERROR', '已取消的事项不能编辑', 400);
  }

  const now = utcNowMs();
  const scheduledAt = body.scheduledAt ?? current.scheduledAt;
  // 未携带 status 的编辑不能把已完成/已过期事项意外重开；只有明确的状态变更才推进状态机。
  const status =
    body.status ??
    (current.status === 'COMPLETED'
      ? 'COMPLETED'
      : current.status === 'EXPIRED'
        ? 'EXPIRED'
        : 'UPCOMING');
  const planned =
    body.reminder === null
      ? []
      : planReminders(
          scheduledAt,
          reminderBodyOf(body.reminder ?? null) ??
            (current.reminder
              ? {
                  offsets: current.reminder.offsets.map((offset) => ({
                    kind: offset.kind,
                    customOffsetMinutes: offset.customOffsetMinutes ?? undefined,
                    allowDndOverride: offset.allowDndOverride,
                  })),
                }
              : null),
          now,
        );

  const result = await db
    .update(healthEvents)
    .set({
      eventType: body.eventType ?? current.eventType,
      title: body.title ?? current.title,
      scheduledAt,
      status,
      completedAt: status === 'COMPLETED' ? (current.completedAt ?? now) : null,
      locationName:
        body.locationName === undefined ? current.locationName : body.locationName,
      locationAddress:
        body.locationAddress === undefined
          ? current.locationAddress
          : body.locationAddress,
      doctorName: body.doctorName === undefined ? current.doctorName : body.doctorName,
      note: body.note === undefined ? current.note : body.note,
      timezoneName: body.timezoneName ?? current.timezoneName,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(
      and(
        eq(healthEvents.id, id),
        eq(healthEvents.version, current.version),
        isNull(healthEvents.deletedAt),
      ),
    );
  if (result.rowsAffected !== 1) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这个事项已在别处更新', 409);
  }

  // 完成/取消是终态：保留历史提醒，但停止所有未发送通知。
  if (status === 'COMPLETED' || status === 'CANCELED') {
    await cancelRemindersForEvent(db, id, now);
  } else if (body.reminder !== undefined || body.scheduledAt !== undefined) {
    // 时间或提醒任一变化都重排提醒 + 通知物化（PUT 语义：旧 SCHEDULED 全部 CANCELED 再插入）。
    await replaceReminders(db, { eventId: id, userId, now, planned });
    await materializeScheduledNotifications(db, {
      userId,
      familyId: current.familyId,
      eventId: id,
      eventTitle: body.title ?? current.title,
      planned,
      now,
    });
  }

  const updated = await getEvent(db, userId, id);
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: current.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'HEALTH_EVENT',
      entityId: id,
      op: 'UPDATE',
      entityVersion: updated.version,
      changedFields: Object.keys(body).filter(
        (key) => body[key as keyof UpdateHealthEventBody] !== undefined,
      ),
    },
    now,
  );
  return updated;
}

export async function deleteEvent(db: Database, userId: string, id: string) {
  const current = await getEvent(db, userId, id);
  const now = utcNowMs();
  await db
    .update(healthEvents)
    .set({
      deletedAt: now,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(eq(healthEvents.id, id));

  // Technical Design §75：取消源实体必须同时取消未发送的 scheduled notifications。
  await cancelRemindersForEvent(db, id, now);

  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: current.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'HEALTH_EVENT',
      entityId: id,
      op: 'DELETE',
      entityVersion: current.version + 1,
    },
    now,
  );
  return { ok: true as const };
}

export async function restoreEvent(db: Database, userId: string, id: string) {
  const row = await getEventRow(db, id, true);
  await requireBabyInFamily(db, userId, row.babyId);
  if (row.deletedAt == null) {
    const reminders = await reminderRowsFor(db, row.id, userId);
    return mapEvent(row, reminders);
  }
  const now = utcNowMs();
  const nextStatus =
    row.status === 'COMPLETED'
      ? 'COMPLETED'
      : row.status === 'CANCELED'
        ? 'CANCELED'
        : row.scheduledAt <= now
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
      version: row.version + 1,
    })
    .where(eq(healthEvents.id, id));
  await restoreDeletedReminders(db, {
    eventId: id,
    familyId: row.familyId,
    eventTitle: row.title,
    scheduledAt: row.scheduledAt,
    deletedAt: row.updatedAt,
    status: nextStatus,
    now,
  });
  const restored = await getEvent(db, userId, id);
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: row.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'HEALTH_EVENT',
      entityId: id,
      op: 'RESTORE',
      entityVersion: restored.version,
    },
    now,
  );
  return restored;
}

// 删除单条提醒：同时取消对应的 scheduled notification，避免已删除提醒照常响。
export async function deleteReminder(db: Database, userId: string, id: string) {
  const rows = await db
    .select()
    .from(healthReminders)
    .where(eq(healthReminders.id, id))
    .limit(1);
  const reminder = rows[0];
  if (!reminder) throw new AppError('NOT_FOUND', '这条提醒找不到了', 404);
  if (reminder.userId !== userId) {
    // 提醒是私人的：只能取消自己设置的提醒，家人的不动。
    throw new AppError('FAMILY_ACCESS_DENIED', '只能修改自己的提醒', 403);
  }
  const now = utcNowMs();
  await db
    .update(healthReminders)
    .set({ status: 'CANCELED', updatedAt: now })
    .where(eq(healthReminders.id, id));
  await db
    .update(scheduledNotifications)
    .set({ status: 'CANCELED', updatedAt: now })
    .where(
      and(
        eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'),
        eq(scheduledNotifications.sourceId, id),
        eq(scheduledNotifications.status, 'SCHEDULED'),
      ),
    );
  return { ok: true as const };
}
