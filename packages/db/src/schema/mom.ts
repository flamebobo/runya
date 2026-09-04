import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { families, users } from './identity.js';
import { mediaFiles } from './media.js';

// TECHNICAL_DESIGN §14：moods / diaries。
// visibility 默认 PRIVATE，且必须在服务端强制（M8 安全边界，不只靠 UI 隐藏）。
export const moods = sqliteTable(
  'moods',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    mood: text('mood').notNull(), // GREAT | GOOD | OK | TIRED | NEED_HUG
    note: text('note'),
    visibility: text('visibility').notNull().default('PRIVATE'), // PRIVATE | FAMILY
    recordedAt: integer('recorded_at').notNull(),
    timezoneName: text('timezone_name').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    userRecordedIdx: index('idx_moods_user_recorded').on(table.userId, table.recordedAt),
    familyUpdatedIdx: index('idx_moods_family_updated').on(table.familyId, table.updatedAt),
  }),
);

export const diaries = sqliteTable(
  'diaries',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id),
    title: text('title'),
    body: text('body').notNull(),
    visibility: text('visibility').notNull().default('PRIVATE'), // PRIVATE | FAMILY
    recordedAt: integer('recorded_at').notNull(),
    timezoneName: text('timezone_name').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
    deletedAt: integer('deleted_at'),
    deletedBy: text('deleted_by'),
  },
  (table) => ({
    ownerRecordedIdx: index('idx_diaries_owner_recorded').on(
      table.ownerUserId,
      table.recordedAt,
    ),
    familyUpdatedIdx: index('idx_diaries_family_updated').on(table.familyId, table.updatedAt),
  }),
);

export const diaryMedia = sqliteTable(
  'diary_media',
  {
    diaryId: text('diary_id')
      .notNull()
      .references(() => diaries.id),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFiles.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.diaryId, table.mediaId] }),
  }),
);
