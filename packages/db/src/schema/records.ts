import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { babies, families, users } from './identity.js';

export const feedingRecords = sqliteTable(
  'feeding_records',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    feedingType: text('feeding_type').notNull(),
    milkType: text('milk_type'),
    amountMl: real('amount_ml'),
    status: text('status').notNull(),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
    durationSeconds: integer('duration_seconds'),
    recordedAt: integer('recorded_at').notNull(),
    timezoneName: text('timezone_name').notNull(),
    note: text('note'),
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
    babyRecordedIdx: index('idx_feeding_records_baby_recorded').on(
      table.babyId,
      table.recordedAt,
    ),
    babyTypeRecordedIdx: index('idx_feeding_records_baby_type_recorded').on(
      table.babyId,
      table.feedingType,
      table.recordedAt,
    ),
    familyUpdatedIdx: index('idx_feeding_records_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
  }),
);

export const feedingSegments = sqliteTable(
  'feeding_segments',
  {
    id: text('id').primaryKey(),
    feedingRecordId: text('feeding_record_id')
      .notNull()
      .references(() => feedingRecords.id),
    side: text('side').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    durationSeconds: integer('duration_seconds'),
    sequenceNo: integer('sequence_no').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    recordIdx: index('idx_feeding_segments_record').on(table.feedingRecordId),
  }),
);

export const sleepRecords = sqliteTable(
  'sleep_records',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    durationSeconds: integer('duration_seconds'),
    startTimezone: text('start_timezone').notNull(),
    endTimezone: text('end_timezone'),
    note: text('note'),
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
    babyStartedIdx: index('idx_sleep_records_baby_started').on(table.babyId, table.startedAt),
    familyUpdatedIdx: index('idx_sleep_records_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
  }),
);

export const diaperRecords = sqliteTable(
  'diaper_records',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    diaperType: text('diaper_type').notNull(),
    stoolColor: text('stool_color'),
    stoolTexture: text('stool_texture'),
    recordedAt: integer('recorded_at').notNull(),
    timezoneName: text('timezone_name').notNull(),
    note: text('note'),
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
    babyRecordedIdx: index('idx_diaper_records_baby_recorded').on(
      table.babyId,
      table.recordedAt,
    ),
    familyUpdatedIdx: index('idx_diaper_records_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
  }),
);

export const foodRecords = sqliteTable(
  'food_records',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    foodName: text('food_name').notNull(),
    amountText: text('amount_text'),
    reaction: text('reaction'),
    preference: text('preference'),
    recordedAt: integer('recorded_at').notNull(),
    timezoneName: text('timezone_name').notNull(),
    note: text('note'),
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
    babyRecordedIdx: index('idx_food_records_baby_recorded').on(table.babyId, table.recordedAt),
    familyUpdatedIdx: index('idx_food_records_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
  }),
);
