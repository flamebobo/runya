import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const systemMetadata = sqliteTable('system_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const SYSTEM_METADATA_KEYS = {
  SCHEMA_VERSION: 'schema_version',
  APP_VERSION: 'app_version',
  SYNC_EPOCH: 'sync_epoch',
  LAST_MIGRATION_AT: 'last_migration_at',
} as const;
