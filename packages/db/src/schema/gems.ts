import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { families, users } from './identity.js';
import { photoMemories } from './memories.js';

export const gemRules = sqliteTable(
  'gem_rules',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id').references(() => families.id),
    actionType: text('action_type').notNull(),
    amount: integer('amount').notNull(),
    dailyLimit: integer('daily_limit'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdByAdmin: text('created_by_admin'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => ({
    familyActionIdx: index('idx_gem_rules_family_action').on(
      table.familyId,
      table.actionType,
    ),
  }),
);

export const gemTransactions = sqliteTable(
  'gem_transactions',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    userId: text('user_id').references(() => users.id),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reasonCode: text('reason_code').notNull(),
    reasonText: text('reason_text'),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    operatorUserId: text('operator_user_id').references(() => users.id),
    adminSessionId: text('admin_session_id'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    familyIdempotencyUnique: uniqueIndex('uq_gem_transactions_family_idempotency').on(
      table.familyId,
      table.idempotencyKey,
    ),
    familyCreatedIdx: index('idx_gem_transactions_family_created').on(
      table.familyId,
      table.createdAt,
    ),
    sourceIdx: index('idx_gem_transactions_source').on(
      table.sourceType,
      table.sourceId,
    ),
  }),
);

export const rewards = sqliteTable(
  'rewards',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    name: text('name').notNull(),
    description: text('description'),
    priceGems: integer('price_gems').notNull(),
    stock: integer('stock'),
    illustrationKey: text('illustration_key'),
    status: text('status').notNull().default('ACTIVE'),
    sortOrder: integer('sort_order').notNull().default(0),
    custom: integer('custom', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    familyStatusIdx: index('idx_rewards_family_status_sort').on(
      table.familyId,
      table.status,
      table.sortOrder,
    ),
  }),
);

export const rewardOrders = sqliteTable(
  'reward_orders',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    rewardId: text('reward_id')
      .notNull()
      .references(() => rewards.id),
    redeemedBy: text('redeemed_by')
      .notNull()
      .references(() => users.id),
    priceGemsSnapshot: integer('price_gems_snapshot').notNull(),
    rewardNameSnapshot: text('reward_name_snapshot').notNull(),
    status: text('status').notNull(),
    redeemedAt: integer('redeemed_at').notNull(),
    fulfilledAt: integer('fulfilled_at'),
    canceledAt: integer('canceled_at'),
    fulfilledBy: text('fulfilled_by').references(() => users.id),
    completionPhotoMemoryId: text('completion_photo_memory_id').references(
      () => photoMemories.id,
    ),
    version: integer('version').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    familyStatusIdx: index('idx_reward_orders_family_status_updated').on(
      table.familyId,
      table.status,
      table.updatedAt,
    ),
  }),
);
