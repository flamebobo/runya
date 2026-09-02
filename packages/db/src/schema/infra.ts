import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './identity.js';

export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').primaryKey(),
  userId: text('user_id').references(() => users.id),
  endpoint: text('endpoint').notNull(),
  requestHash: text('request_hash').notNull(),
  responseStatus: integer('response_status').notNull(),
  responseJson: text('response_json').notNull(),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
