import { rewards } from '@runew/db';
import type { schema } from '@runew/db';
import { createUlid } from '@runew/shared-utils';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

type Database = LibSQLDatabase<typeof schema>;

const DEFAULT_REWARDS = [
  { name: '一杯喜欢的奶茶', description: '给今天留一点甜甜的休息时间', priceGems: 8, illustrationKey: 'tea' },
  { name: '一束小花', description: '把家里点亮一点点', priceGems: 12, illustrationKey: 'flower' },
  { name: '妈妈休息两小时', description: '今天的照顾，也值得被好好接住', priceGems: 20, illustrationKey: 'rest' },
  { name: '一起吃顿喜欢的饭', description: '把愿望变成一张餐桌上的合照', priceGems: 30, illustrationKey: 'dinner' },
] as const;

export async function createDefaultRewards(
  db: Database,
  familyId: string,
  userId: string,
  now: number,
) {
  await db.insert(rewards).values(
    DEFAULT_REWARDS.map((reward, sortOrder) => ({
      id: createUlid(),
      familyId,
      name: reward.name,
      description: reward.description,
      priceGems: reward.priceGems,
      stock: null,
      illustrationKey: reward.illustrationKey,
      status: 'ACTIVE',
      sortOrder,
      custom: false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      deletedAt: null,
    })),
  );
}
