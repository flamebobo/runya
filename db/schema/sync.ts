import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { babies, families, users } from './identity.js';

// 同步日志是不可变账本：只 INSERT，禁止 UPDATE/DELETE。
// seq 用全局单调自增，pull 按 family 过滤后仍能保证顺序语义。
export const syncOperations = sqliteTable(
  'sync_operations',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    operationId: text('operation_id').notNull(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => users.id),
    deviceId: text('device_id'),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op').notNull(),
    entityVersion: integer('entity_version').notNull(),
    changedFieldsJson: text('changed_fields_json'),
    resultJson: text('result_json'),
    occurredAt: integer('occurred_at').notNull(),
  },
  (table) => ({
    operationIdUnique: uniqueIndex('uq_sync_operations_operation_id').on(table.operationId),
    familySeqIdx: index('idx_sync_operations_family_seq').on(table.familyId, table.seq),
    entitySeqIdx: index('idx_sync_operations_entity_seq').on(
      table.entityType,
      table.entityId,
      table.seq,
    ),
  }),
);

// 重复记录候选：只做提示，绝不自动删除任何一方。
export const duplicateCandidates = sqliteTable(
  'duplicate_candidates',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    entityType: text('entity_type').notNull(),
    entityAId: text('entity_a_id').notNull(),
    entityBId: text('entity_b_id').notNull(),
    similarityScore: real('similarity_score').notNull().default(1),
    status: text('status').notNull().default('PENDING'),
    detectedAt: integer('detected_at').notNull(),
    resolvedBy: text('resolved_by').references(() => users.id),
    resolvedAt: integer('resolved_at'),
  },
  (table) => ({
    pairUnique: uniqueIndex('uq_duplicate_candidates_pair').on(
      table.entityType,
      table.entityAId,
      table.entityBId,
    ),
    familyPendingIdx: index('idx_duplicate_candidates_family_status').on(
      table.familyId,
      table.status,
    ),
  }),
);
