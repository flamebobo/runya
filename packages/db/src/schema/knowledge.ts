import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { babies, users } from './identity.js';

// 知识内容是平台级内容（admin 管理），不属于单个 family。
// learned_version 记录“学到时”的 content_version，是实现版本闭环的唯一真相。
export const knowledge = sqliteTable(
  'knowledge',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    body: text('body').notNull(),
    category: text('category').notNull(),
    minAgeDays: integer('min_age_days'),
    maxAgeDays: integer('max_age_days'),
    sourceName: text('source_name').notNull(),
    sourceUrl: text('source_url'),
    reviewedAt: integer('reviewed_at').notNull(),
    contentVersion: integer('content_version').notNull().default(1),
    priority: integer('priority').notNull().default(0),
    status: text('status').notNull().default('DRAFT'),
    publishedAt: integer('published_at'),
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
    validAgeRange: check(
      'knowledge_valid_age_range',
      sql`${table.minAgeDays} is null or ${table.maxAgeDays} is null or ${table.minAgeDays} <= ${table.maxAgeDays}`,
    ),
    statusPublishedIdx: index('idx_knowledge_status_published').on(
      table.status,
      table.publishedAt,
    ),
    categoryIdx: index('idx_knowledge_category').on(table.category),
  }),
);

export const knowledgeUserStates = sqliteTable(
  'knowledge_user_states',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    babyId: text('baby_id')
      .notNull()
      .references(() => babies.id),
    knowledgeId: text('knowledge_id')
      .notNull()
      .references(() => knowledge.id),
    saved: integer('saved', { mode: 'boolean' }).notNull().default(false),
    readLater: integer('read_later', { mode: 'boolean' }).notNull().default(false),
    dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false),
    learnedVersion: integer('learned_version'),
    learnedAt: integer('learned_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
  },
  (table) => ({
    // 一个用户对一个宝宝对一篇知识只有一行状态，PUT upsert 到这里。
    userBabyKnowledgeUnique: uniqueIndex(
      'idx_knowledge_user_states_user_baby_knowledge',
    ).on(table.userId, table.babyId, table.knowledgeId),
    babyLearnedIdx: index('idx_knowledge_user_states_baby_learned').on(
      table.babyId,
      table.learnedAt,
    ),
  }),
);
