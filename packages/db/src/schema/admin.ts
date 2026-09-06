import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { users, families, userSessions } from './identity.js';

export const adminCredentials = sqliteTable('admin_credentials', {
  id: text('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  changedAt: integer('changed_at').notNull(),
  updatedByUserId: text('updated_by_user_id').references(() => users.id),
});

export const adminSessions = sqliteTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    userSessionId: text('user_session_id')
      .notNull()
      .references(() => userSessions.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    lastActionAt: integer('last_action_at').notNull(),
    ipHash: text('ip_hash'),
  },
  (table) => ({
    tokenUnique: uniqueIndex('uq_admin_sessions_token_hash').on(table.tokenHash),
    userIdx: index('idx_admin_sessions_user').on(table.userId),
    userSessionIdx: index('idx_admin_sessions_user_session').on(table.userSessionId),
  }),
);

export const adminReauthGrants = sqliteTable(
  'admin_reauth_grants',
  {
    id: text('id').primaryKey(),
    adminSessionId: text('admin_session_id').notNull().references(() => adminSessions.id),
    actionScope: text('action_scope').notNull(),
    resourceId: text('resource_id'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
  },
  (table) => ({
    tokenUnique: uniqueIndex('uq_admin_reauth_grants_token_hash').on(table.tokenHash),
    sessionIdx: index('idx_admin_reauth_grants_session').on(table.adminSessionId),
    expiryIdx: index('idx_admin_reauth_grants_expiry').on(table.expiresAt),
  }),
);

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull(),
    actorUserId: text('actor_user_id').references(() => users.id),
    adminSessionId: text('admin_session_id').references(() => adminSessions.id),
    familyId: text('family_id').references(() => families.id),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    result: text('result').notNull(),
    errorCode: text('error_code'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    createdIdx: index('idx_audit_logs_created').on(table.createdAt),
    actorIdx: index('idx_audit_logs_actor').on(table.actorUserId),
    actionIdx: index('idx_audit_logs_action').on(table.action),
  }),
);

export const systemSettings = sqliteTable(
  'system_settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at').notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => users.id),
  },
  (table) => ({
    updatedIdx: index('idx_system_settings_updated').on(table.updatedAt),
  }),
);
