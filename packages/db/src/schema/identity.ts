import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  nickname: text('nickname').notNull(),
  avatarMediaId: text('avatar_media_id'),
  status: text('status').notNull().default('ACTIVE'),
  locale: text('locale').notNull().default('zh-CN'),
  timezoneName: text('timezone_name'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const userAuthCredentials = sqliteTable(
  'user_auth_credentials',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    identifierType: text('identifier_type').notNull(),
    identifierNormalized: text('identifier_normalized').notNull(),
    passwordHash: text('password_hash').notNull(),
    passwordChangedAt: integer('password_changed_at').notNull(),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: integer('locked_until'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    userIdUnique: uniqueIndex('uq_user_auth_credentials_user_id').on(table.userId),
    identifierUnique: uniqueIndex('uq_user_auth_credentials_identifier').on(
      table.identifierNormalized,
    ),
  }),
);

export const userSessions = sqliteTable(
  'user_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    platform: text('platform').notNull(),
    deviceId: text('device_id'),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    revokedAt: integer('revoked_at'),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('uq_user_sessions_token_hash').on(table.tokenHash),
    userIdIdx: index('idx_user_sessions_user_id').on(table.userId),
  }),
);

export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    platform: text('platform').notNull(),
    deviceName: text('device_name'),
    appVersion: text('app_version'),
    syncCursor: integer('sync_cursor').notNull().default(0),
    pushCapabilitiesJson: text('push_capabilities_json'),
    lastSeenAt: integer('last_seen_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    userIdIdx: index('idx_devices_user_id').on(table.userId),
  }),
);

export const families = sqliteTable('families', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id')
    .notNull()
    .references(() => users.id),
  gemBalanceCache: integer('gem_balance_cache').notNull().default(0),
  level: integer('level').notNull().default(1),
  experience: integer('experience').notNull().default(0),
  timezoneName: text('timezone_name').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  version: integer('version').notNull().default(1),
});

export const familyMembers = sqliteTable(
  'family_members',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    relationship: text('relationship').notNull(),
    role: text('role').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    joinedAt: integer('joined_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => ({
    familyUserUnique: uniqueIndex('uq_family_members_family_user').on(
      table.familyId,
      table.userId,
    ),
    familyIdIdx: index('idx_family_members_family_id').on(table.familyId),
  }),
);

export const familyMemberPermissions = sqliteTable(
  'family_member_permissions',
  {
    id: text('id').primaryKey(),
    familyMemberId: text('family_member_id')
      .notNull()
      .references(() => familyMembers.id),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    effect: text('effect').notNull(),
  },
  (table) => ({
    permissionUnique: uniqueIndex('uq_family_member_permissions').on(
      table.familyMemberId,
      table.resource,
      table.action,
    ),
  }),
);

export const familyInvites = sqliteTable(
  'family_invites',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    tokenHash: text('token_hash').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    relationshipHint: text('relationship_hint'),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    usedBy: text('used_by').references(() => users.id),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('uq_family_invites_token_hash').on(table.tokenHash),
  }),
);

export const babies = sqliteTable(
  'babies',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    name: text('name').notNull(),
    nickname: text('nickname'),
    sex: text('sex'),
    birthday: text('birthday').notNull(),
    birthTime: integer('birth_time'),
    avatarMediaId: text('avatar_media_id'),
    birthHeightCm: integer('birth_height_cm'),
    birthWeightKg: integer('birth_weight_kg'),
    notes: text('notes'),
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
  },
  (table) => ({
    familyIdIdx: index('idx_babies_family_id').on(table.familyId),
  }),
);
