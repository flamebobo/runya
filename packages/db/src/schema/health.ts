import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { babies, families, users } from './identity.js';
import { mediaFiles } from './media.js';

// Technical Design §13：健康事件只做记录与提醒，不做诊断。
export const healthEvents = sqliteTable(
  'health_events',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    scheduledAt: integer('scheduled_at').notNull(),
    completedAt: integer('completed_at'),
    status: text('status').notNull().default('UPCOMING'),
    locationName: text('location_name'),
    locationAddress: text('location_address'),
    doctorName: text('doctor_name'),
    note: text('note'),
    timezoneName: text('timezone_name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedBy: text('updated_by')
      .notNull()
      .references(() => users.id),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
    deletedAt: integer('deleted_at'),
    deletedBy: text('deleted_by').references(() => users.id),
  },
  (table) => ({
    validEventType: check(
      'health_events_valid_event_type',
      sql`${table.eventType} IN ('CHECKUP','VACCINE','VISIT','DENTAL','MEDICATION','OTHER')`,
    ),
    validStatus: check(
      'health_events_valid_status',
      sql`${table.status} IN ('UPCOMING','COMPLETED','EXPIRED','CANCELED')`,
    ),
    babyScheduledIdx: index('idx_health_events_baby_scheduled').on(
      table.babyId,
      table.scheduledAt,
    ),
    familyUpdatedIdx: index('idx_health_events_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
    eventTypeIdx: index('idx_health_events_baby_type').on(
      table.babyId,
      table.eventType,
    ),
  }),
);

// 提醒属于创建它的家庭成员：每个家人可以有各自的提醒偏好。
// 一个事件 × 一个用户最多 5 条 offset（contracts 限制），用普通索引支撑 PUT 重排。
export const healthReminders = sqliteTable(
  'health_reminders',
  {
    id: text('id').primaryKey(),
    healthEventId: text('health_event_id')
      .notNull()
      .references(() => healthEvents.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    offsetKind: text('offset_kind').notNull().default('SAME_DAY'),
    customOffsetMinutes: integer('custom_offset_minutes'),
    fireAt: integer('fire_at').notNull(),
    allowDndOverride: integer('allow_dnd_override', { mode: 'boolean' })
      .notNull()
      .default(false),
    status: text('status').notNull().default('SCHEDULED'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    eventUserIdx: index('idx_health_reminders_event_user').on(
      table.healthEventId,
      table.userId,
    ),
    eventFireIdx: index('idx_health_reminders_event_fire').on(
      table.healthEventId,
      table.fireAt,
    ),
  }),
);

// M7 才有完整 Media 链路；M6 只存关联元数据，附件经由 Media Adapter Contract 打开。
export const healthEventMedia = sqliteTable(
  'health_event_media',
  {
    healthEventId: text('health_event_id')
      .notNull()
      .references(() => healthEvents.id),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFiles.id),
    role: text('role').notNull().default('ATTACHMENT'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.healthEventId, table.mediaId],
    }),
    eventIdx: index('idx_health_event_media_event').on(table.healthEventId),
  }),
);
