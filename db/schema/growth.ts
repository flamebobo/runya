import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { babies, families, users } from './identity';

export const growthRecords = sqliteTable(
  'growth_records',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    heightCm: real('height_cm'),
    weightKg: real('weight_kg'),
    headCircumferenceCm: real('head_circumference_cm'),
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
    hasMetric: check(
      'growth_records_has_metric',
      sql`${table.heightCm} is not null or ${table.weightKg} is not null or ${table.headCircumferenceCm} is not null`,
    ),
    babyRecordedIdx: index('idx_growth_records_baby_recorded').on(
      table.babyId,
      table.recordedAt,
    ),
    familyUpdatedIdx: index('idx_growth_records_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
  }),
);

export const milestones = sqliteTable(
  'milestones',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    title: text('title').notNull(),
    description: text('description'),
    happenedAt: integer('happened_at').notNull(),
    timezoneName: text('timezone_name').notNull(),
    coverMediaId: text('cover_media_id'),
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
    babyHappenedIdx: index('idx_milestones_baby_happened').on(
      table.babyId,
      table.happenedAt,
    ),
    familyUpdatedIdx: index('idx_milestones_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
  }),
);
