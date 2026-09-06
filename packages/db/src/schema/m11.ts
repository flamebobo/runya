import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { babies, families, users, userSessions } from './identity.js';

export const babyPreferences = sqliteTable(
  'baby_preferences',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull().references(() => families.id),
    babyId: text('baby_id').notNull().references(() => babies.id),
    type: text('type').notNull(),
    category: text('category'),
    label: text('label').notNull(),
    sourceType: text('source_type').notNull().default('MANUAL'),
    sourceId: text('source_id'),
    createdBy: text('created_by').notNull().references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    babyTypeIdx: index('idx_baby_preferences_baby_type').on(table.babyId, table.type),
    familyUpdatedIdx: index('idx_baby_preferences_family_updated').on(
      table.familyId,
      table.updatedAt,
    ),
  }),
);

export const babyChanges = sqliteTable(
  'baby_changes',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').notNull().references(() => families.id),
    babyId: text('baby_id').notNull().references(() => babies.id),
    actorUserId: text('actor_user_id').notNull().references(() => users.id),
    field: text('field').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
    changedAt: integer('changed_at').notNull(),
  },
  (table) => ({
    babyChangedIdx: index('idx_baby_changes_baby_changed').on(table.babyId, table.changedAt),
  }),
);

export const userSettings = sqliteTable(
  'user_settings',
  {
    userId: text('user_id').primaryKey().references(() => users.id),
    appearance: text('appearance').notNull().default('SYSTEM'),
    reduceMotion: integer('reduce_motion', { mode: 'boolean' }).notNull().default(false),
    defaultDiaryVisibility: text('default_diary_visibility').notNull().default('PRIVATE'),
    analyticsEnabled: integer('analytics_enabled', { mode: 'boolean' }).notNull().default(false),
    updatedAt: integer('updated_at').notNull(),
  },
);

export const backupRuns = sqliteTable(
  'backup_runs',
  {
    id: text('id').primaryKey(),
    status: text('status').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    bytes: integer('bytes'),
    manifestJson: text('manifest_json'),
    errorCode: text('error_code'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    statusStartedIdx: index('idx_backup_runs_status_started').on(table.status, table.startedAt),
  }),
);

export const exportJobs = sqliteTable(
  'export_jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    familyId: text('family_id').notNull().references(() => families.id),
    babyId: text('baby_id').references(() => babies.id),
    type: text('type').notNull(),
    state: text('state').notNull().default('QUEUED'),
    filePath: text('file_path'),
    createdAt: integer('created_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    expiresAt: integer('expires_at').notNull(),
    errorCode: text('error_code'),
  },
  (table) => ({
    userCreatedIdx: index('idx_export_jobs_user_created').on(table.userId, table.createdAt),
    familyCreatedIdx: index('idx_export_jobs_family_created').on(table.familyId, table.createdAt),
  }),
);

export const searchDocuments = sqliteTable(
  'search_documents',
  {
    rowid: integer('rowid').primaryKey({ autoIncrement: true }),
    familyId: text('family_id').references(() => families.id),
    babyId: text('baby_id').references(() => babies.id),
    ownerUserId: text('owner_user_id').references(() => users.id),
    visibility: text('visibility').notNull().default('FAMILY'),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    occurredAt: integer('occurred_at'),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
    capsuleState: text('capsule_state'),
  },
  (table) => ({
    entityUnique: uniqueIndex('uq_search_documents_entity').on(table.entityType, table.entityId),
    familyIdx: index('idx_search_documents_family').on(table.familyId, table.deleted),
  }),
);

export const realtimeTickets = sqliteTable(
  'realtime_tickets',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id').notNull().references(() => users.id),
    sessionId: text('session_id').references(() => userSessions.id),
    familyId: text('family_id').references(() => families.id),
    deviceId: text('device_id'),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    tokenUnique: uniqueIndex('uq_realtime_tickets_token_hash').on(table.tokenHash),
    expiryIdx: index('idx_realtime_tickets_expiry').on(table.expiresAt),
  }),
);
