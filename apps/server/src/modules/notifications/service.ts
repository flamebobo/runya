import { notificationPreferences, notifications } from '@runew/db';
import type { schema } from '@runew/db';
import type {
  NotificationListResponse,
  NotificationPreferences,
  UpdateNotificationPreferencesBody,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import { DEFAULT_DND_END_MINUTE, DEFAULT_DND_START_MINUTE } from '@runew/db';

type Database = LibSQLDatabase<typeof schema>;

// DND 判定需要用户时区偏移；P0 只支持固定偏移（Asia/Shanghai = +8）。
// 未来多时区用户在 preferences 加偏移列即可，不需要改调用方。
export async function getPreferences(
  db: Database,
  userId: string,
): Promise<NotificationPreferences> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  const row = rows[0];
  if (row) return mapPreferences(row);
  return {
    healthEnabled: true,
    familyTasksEnabled: true,
    rewardsEnabled: true,
    backupEnabled: true,
    capsulesEnabled: true,
    anniversariesEnabled: true,
    dndEnabled: true,
    dndStartMinute: DEFAULT_DND_START_MINUTE,
    dndEndMinute: DEFAULT_DND_END_MINUTE,
    timezoneName: 'Asia/Shanghai',
    // 这是尚未落库的默认视图，也必须满足共享契约的正时间戳约束。
    updatedAt: utcNowMs(),
  };
}

type PreferenceRow = typeof notificationPreferences.$inferSelect;

function mapPreferences(row: PreferenceRow): NotificationPreferences {
  return {
    healthEnabled: row.healthEnabled,
    familyTasksEnabled: row.familyTasksEnabled,
    rewardsEnabled: row.rewardsEnabled,
    backupEnabled: row.backupEnabled,
    capsulesEnabled: row.capsulesEnabled,
    anniversariesEnabled: row.anniversariesEnabled,
    dndEnabled: row.dndEnabled,
    dndStartMinute: row.dndStartMinute,
    dndEndMinute: row.dndEndMinute,
    timezoneName: row.timezoneName,
    updatedAt: row.updatedAt,
  };
}

export async function updatePreferences(
  db: Database,
  userId: string,
  body: UpdateNotificationPreferencesBody,
): Promise<NotificationPreferences> {
  const now = utcNowMs();
  const current = await getPreferences(db, userId);
  const merged = { ...current, ...body, updatedAt: now };
  await db
    .insert(notificationPreferences)
    .values({
      id: createUlid(),
      userId,
      healthEnabled: merged.healthEnabled,
      familyTasksEnabled: merged.familyTasksEnabled,
      rewardsEnabled: merged.rewardsEnabled,
      backupEnabled: merged.backupEnabled,
      capsulesEnabled: merged.capsulesEnabled,
      anniversariesEnabled: merged.anniversariesEnabled,
      dndEnabled: merged.dndEnabled,
      dndStartMinute: merged.dndStartMinute,
      dndEndMinute: merged.dndEndMinute,
      timezoneName: merged.timezoneName,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: {
        healthEnabled: merged.healthEnabled,
        familyTasksEnabled: merged.familyTasksEnabled,
        rewardsEnabled: merged.rewardsEnabled,
        backupEnabled: merged.backupEnabled,
        capsulesEnabled: merged.capsulesEnabled,
        anniversariesEnabled: merged.anniversariesEnabled,
        dndEnabled: merged.dndEnabled,
        dndStartMinute: merged.dndStartMinute,
        dndEndMinute: merged.dndEndMinute,
        timezoneName: merged.timezoneName,
        updatedAt: now,
      },
    });
  return getPreferences(db, userId);
}

export async function listNotifications(
  db: Database,
  userId: string,
): Promise<NotificationListResponse> {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.deletedAt),
        or(
          isNull(notifications.familyId),
          sql`EXISTS (
            SELECT 1 FROM family_members fm
            WHERE fm.family_id = ${notifications.familyId}
              AND fm.user_id = ${userId}
              AND fm.status = 'ACTIVE'
              AND NOT EXISTS (
                SELECT 1 FROM family_member_permissions fmp
                WHERE fmp.family_member_id = fm.id
                  AND fmp.resource = 'family'
                  AND fmp.action = 'VIEW'
                  AND fmp.effect = 'DENY'
              )
          )`,
        ),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(100);
  const unread = rows.filter((row) => row.readAt == null).length;
  return {
    items: rows.map((row) => ({
      id: row.id,
      category: row.category as NotificationListResponse['items'][number]['category'],
      title: row.title,
      body: row.body,
      targetType: row.targetType,
      targetId: row.targetId,
      createdAt: row.createdAt,
      readAt: row.readAt,
    })),
    unreadCount: unread,
  };
}

export async function markRead(db: Database, userId: string, id: string) {
  const now = utcNowMs();
  const result = await db
    .update(notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    );
  if (result.rowsAffected === 0) {
    // 已读或不存在都不报错：读操作幂等，前端只关心「这一条不再显示未读」。
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .limit(1);
    if (!rows[0]) throw new AppError('NOT_FOUND', '这条通知找不到了', 404);
  }
  return { ok: true as const };
}

export async function markAllRead(db: Database, userId: string) {
  await db
    .update(notifications)
    .set({ readAt: utcNowMs() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { ok: true as const };
}
