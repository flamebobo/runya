import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { families, users } from './identity.js';

export const familyTasks = sqliteTable(
  'family_tasks',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    title: text('title').notNull(),
    note: text('note'),
    dueAt: integer('due_at'),
    repeatRule: text('repeat_rule'),
    assignedTo: text('assigned_to').references(() => users.id),
    experienceReward: integer('experience_reward').notNull().default(0),
    status: text('status').notNull().default('OPEN'),
    completedAt: integer('completed_at'),
    completedBy: text('completed_by').references(() => users.id),
    deletedAt: integer('deleted_at'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    version: integer('version').notNull().default(1),
  },
  (t) => ({ familyIdx: index('idx_family_tasks_family').on(t.familyId) }),
);

export const achievements = sqliteTable(
  'achievements',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    title: text('title').notNull(),
    description: text('description'),
    emoji: text('emoji').notNull().default('🌱'),
    unlockedAt: integer('unlocked_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({ familyIdx: index('idx_achievements_family').on(t.familyId) }),
);

export const userAchievements = sqliteTable(
  'user_achievements',
  {
    id: text('id').primaryKey(),
    achievementId: text('achievement_id')
      .notNull()
      .references(() => achievements.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    earnedAt: integer('earned_at').notNull(),
  },
  (t) => ({ unique: uniqueIndex('uq_user_achievement').on(t.achievementId, t.userId) }),
);

export const familyAnniversaries = sqliteTable(
  'family_anniversaries',
  {
    id: text('id').primaryKey(),
    familyId: text('family_id')
      .notNull()
      .references(() => families.id),
    title: text('title').notNull(),
    date: text('date').notNull(),
    note: text('note'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({ familyIdx: index('idx_family_anniversaries_family').on(t.familyId) }),
);
