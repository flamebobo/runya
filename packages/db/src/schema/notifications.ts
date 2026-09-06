import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { users } from './identity.js';

// Technical Design §19。DND 分钟数是当日内的本地分钟（0–1439），默认 21:00 → 08:00（跨午夜）。
export const DEFAULT_DND_START_MINUTE = 21 * 60; // 21:00
export const DEFAULT_DND_END_MINUTE = 8 * 60; // 08:00

export const notificationPreferences = sqliteTable(
  'notification_preferences',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    healthEnabled: integer('health_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    familyTasksEnabled: integer('family_tasks_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    rewardsEnabled: integer('rewards_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    backupEnabled: integer('backup_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    capsulesEnabled: integer('capsules_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    anniversariesEnabled: integer('anniversaries_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    dndEnabled: integer('dnd_enabled', { mode: 'boolean' }).notNull().default(true),
    dndStartMinute: integer('dnd_start_minute')
      .notNull()
      .default(DEFAULT_DND_START_MINUTE),
    dndEndMinute: integer('dnd_end_minute').notNull().default(DEFAULT_DND_END_MINUTE),
    timezoneName: text('timezone_name').notNull().default('Asia/Shanghai'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    userIdUnique: uniqueIndex('uq_notification_preferences_user').on(table.userId),
  }),
);

export const notifications = sqliteTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    familyId: text('family_id'),
    category: text('category').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    payloadJson: text('payload_json'),
    createdAt: integer('created_at').notNull(),
    readAt: integer('read_at'),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    userCreatedIdx: index('idx_notifications_user_created').on(
      table.userId,
      table.createdAt,
    ),
    userUnreadIdx: index('idx_notifications_user_unread').on(
      table.userId,
      table.readAt,
    ),
  }),
);

// 幂等唯一键：Scheduler 重启 / 重跑同一 Job 不产生第二条通知（Technical Design §36.4）。
export const scheduledNotifications = sqliteTable(
  'scheduled_notifications',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    familyId: text('family_id'),
    category: text('category').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    occurrenceKey: text('occurrence_key'),
    fireAt: integer('fire_at').notNull(),
    dndOverride: integer('dnd_override', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().default('SCHEDULED'),
    attempts: integer('attempts').notNull().default(0),
    lastErrorCode: text('last_error_code'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    // 健康提醒按 fire_at 去重；家庭纪念日按 occurrence_key 去重，避免 DND 改写 fire_at 后重复派发。
    deliveryUnique: uniqueIndex('uq_scheduled_notifications_user_source_fire').on(
      table.userId,
      table.sourceType,
      table.sourceId,
      table.fireAt,
      table.category,
    ),
    occurrenceUnique: uniqueIndex('uq_scheduled_notifications_occurrence').on(
      table.userId,
      table.sourceType,
      table.sourceId,
      table.occurrenceKey,
    ),
    dueIdx: index('idx_scheduled_notifications_status_fire').on(
      table.status,
      table.fireAt,
    ),
    sourceIdx: index('idx_scheduled_notifications_source').on(
      table.sourceType,
      table.sourceId,
    ),
  }),
);

// Technical Design §37：job_locks(job_name, locked_until, owner_id) 防止热重启重入。
export const jobLocks = sqliteTable('job_locks', {
  jobName: text('job_name').primaryKey(),
  lockedUntil: integer('locked_until').notNull(),
  ownerId: text('owner_id').notNull(),
  lastRunAt: integer('last_run_at'),
  lastError: text('last_error'),
});
