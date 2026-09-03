import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { families, babies, users } from './identity.js';
import { mediaFiles } from './media.js';

export const photoMemories = sqliteTable('photo_memories', {
  id: text('id').primaryKey(),
  familyId: text('family_id')
    .notNull()
    .references(() => families.id),
  babyId: text('baby_id')
    .notNull()
    .references(() => babies.id),
  title: text('title').notNull(),
  story: text('story'),
  happenedAt: integer('happened_at').notNull(),
  timezoneName: text('timezone_name').notNull().default('Asia/Shanghai'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedBy: text('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  version: integer('version').notNull().default(1),
});

export const photoMemoryMedia = sqliteTable(
  'photo_memory_media',
  {
    photoMemoryId: text('photo_memory_id')
      .notNull()
      .references(() => photoMemories.id),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFiles.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.photoMemoryId, table.mediaId] }),
  }),
);

export const babyQuotes = sqliteTable('baby_quotes', {
  id: text('id').primaryKey(),
  familyId: text('family_id')
    .notNull()
    .references(() => families.id),
  babyId: text('baby_id')
    .notNull()
    .references(() => babies.id),
  quoteText: text('quote_text').notNull(),
  audioMediaId: text('audio_media_id').references(() => mediaFiles.id),
  happenedAt: integer('happened_at').notNull(),
  timezoneName: text('timezone_name').notNull().default('Asia/Shanghai'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedBy: text('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  version: integer('version').notNull().default(1),
});

export const audioMemories = sqliteTable('audio_memories', {
  id: text('id').primaryKey(),
  familyId: text('family_id')
    .notNull()
    .references(() => families.id),
  babyId: text('baby_id')
    .notNull()
    .references(() => babies.id),
  mediaId: text('media_id')
    .notNull()
    .references(() => mediaFiles.id),
  title: text('title').notNull(),
  category: text('category').notNull().default('OTHER'),
  happenedAt: integer('happened_at').notNull(),
  timezoneName: text('timezone_name').notNull().default('Asia/Shanghai'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedBy: text('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  version: integer('version').notNull().default(1),
});

export const firstMoments = sqliteTable('first_moments', {
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
  timezoneName: text('timezone_name').notNull().default('Asia/Shanghai'),
  favorite: integer('favorite', { mode: 'boolean' }).notNull().default(false),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at').notNull(),
  updatedBy: text('updated_by')
    .notNull()
    .references(() => users.id),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  version: integer('version').notNull().default(1),
});

export const firstMomentMedia = sqliteTable(
  'first_moment_media',
  {
    firstMomentId: text('first_moment_id')
      .notNull()
      .references(() => firstMoments.id),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFiles.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.firstMomentId, table.mediaId] }),
  }),
);

export const timeCapsules = sqliteTable('time_capsules', {
  id: text('id').primaryKey(),
  familyId: text('family_id')
    .notNull()
    .references(() => families.id),
  babyId: text('baby_id').references(() => babies.id),
  creatorUserId: text('creator_user_id')
    .notNull()
    .references(() => users.id),
  recipientText: text('recipient_text'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  openAt: integer('open_at').notNull(),
  state: text('state').notNull().default('DRAFT'),
  sealedAt: integer('sealed_at'),
  openedAt: integer('opened_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
  version: integer('version').notNull().default(1),
});

export const timeCapsuleMedia = sqliteTable(
  'time_capsule_media',
  {
    timeCapsuleId: text('time_capsule_id')
      .notNull()
      .references(() => timeCapsules.id),
    mediaId: text('media_id')
      .notNull()
      .references(() => mediaFiles.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.timeCapsuleId, table.mediaId] }),
  }),
);
