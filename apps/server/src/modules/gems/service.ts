import {
  families,
  gemRules,
  gemTransactions,
  rewardOrders,
  rewards,
} from '@runew/db';
import type { schema } from '@runew/db';
import type {
  CreateRewardBody,
  GemActionType,
  GemBalance,
  GemTransactionPublic,
  RewardOrderPublic,
  RewardPublic,
  UpdateRewardBody,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import { appendSyncLog } from '../sync/log.js';
import { requireFamilyMembership } from '../identity/service.js';

type Database = LibSQLDatabase<typeof schema>;
type DbExecutor = Pick<Database, 'select' | 'insert' | 'update'>;

const RECORD_REASON = 'RECORD_CREATED';
const RECORD_SOURCE = 'RECORD_REWARD';
const REFUND_SOURCE = 'REWARD_REFUND';

function mapTransaction(row: typeof gemTransactions.$inferSelect): GemTransactionPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    userId: row.userId,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    reasonCode: row.reasonCode,
    reasonText: row.reasonText,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    createdAt: row.createdAt,
  };
}

function mapReward(row: typeof rewards.$inferSelect): RewardPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    name: row.name,
    description: row.description,
    priceGems: row.priceGems,
    stock: row.stock,
    illustrationKey: row.illustrationKey,
    status: row.status as RewardPublic['status'],
    custom: row.custom,
    sortOrder: row.sortOrder,
    version: row.version,
  };
}

function mapOrder(row: typeof rewardOrders.$inferSelect): RewardOrderPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    rewardId: row.rewardId,
    rewardName: row.rewardNameSnapshot,
    redeemedBy: row.redeemedBy,
    priceGemsSnapshot: row.priceGemsSnapshot,
    status: row.status as RewardOrderPublic['status'],
    redeemedAt: row.redeemedAt,
    fulfilledAt: row.fulfilledAt,
    canceledAt: row.canceledAt,
    fulfilledBy: row.fulfilledBy,
    completionPhotoMemoryId: row.completionPhotoMemoryId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function ledgerTotal(db: DbExecutor, familyId: string) {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${gemTransactions.amount}), 0)` })
    .from(gemTransactions)
    .where(eq(gemTransactions.familyId, familyId));
  return Number(rows[0]?.total ?? 0);
}

async function setBalanceCache(db: DbExecutor, familyId: string, balance: number, now: number) {
  await db
    .update(families)
    .set({ gemBalanceCache: balance, updatedAt: now, version: sql`${families.version} + 1` })
    .where(eq(families.id, familyId));
}

function localDateKey(timestamp: number, timezoneName: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneName,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

async function findGemRule(db: DbExecutor, familyId: string, actionType: GemActionType) {
  const familyRows = await db
    .select()
    .from(gemRules)
    .where(and(eq(gemRules.familyId, familyId), eq(gemRules.actionType, actionType)))
    .limit(1);
  if (familyRows[0]) return familyRows[0];

  const globalRows = await db
    .select()
    .from(gemRules)
    .where(and(isNull(gemRules.familyId), eq(gemRules.actionType, actionType)))
    .limit(1);
  return globalRows[0] ?? null;
}

/**
 * 必須由建立 Record 的同一個資料庫交易呼叫。Daily Limit 只跳過獎勵，
 * 不會阻止 Record 寫入；唯一鍵讓同一來源不可能再次發放。
 */
export async function awardRecordGem(
  db: DbExecutor,
  familyId: string,
  userId: string,
  actionType: GemActionType,
  sourceId: string,
  now: number,
) {
  const rule = await findGemRule(db, familyId, actionType);
  if (!rule || !rule.enabled || rule.amount <= 0) return null;

  const idempotencyKey = `record:${actionType}:${sourceId}`;
  const existing = await db
    .select()
    .from(gemTransactions)
    .where(
      and(
        eq(gemTransactions.familyId, familyId),
        eq(gemTransactions.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing[0]) return mapTransaction(existing[0]);

  const familyRows = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  const family = familyRows[0];
  if (!family) throw new AppError('NOT_FOUND', '小家不存在', 404);

  if (rule.dailyLimit != null) {
    const today = localDateKey(now, family.timezoneName);
    const issuedRows = await db
      .select()
      .from(gemTransactions)
      .where(
        and(
          eq(gemTransactions.familyId, familyId),
          eq(gemTransactions.sourceType, RECORD_SOURCE),
          eq(gemTransactions.reasonCode, RECORD_REASON),
          eq(gemTransactions.reasonText, actionType),
        ),
      );
    const issuedToday = issuedRows.filter(
      (row) => localDateKey(row.createdAt, family.timezoneName) === today,
    ).length;
    if (issuedToday >= rule.dailyLimit) return null;
  }

  const balance = await ledgerTotal(db, familyId);
  const transaction = {
    id: createUlid(),
    familyId,
    userId,
    amount: rule.amount,
    balanceAfter: balance + rule.amount,
    reasonCode: RECORD_REASON,
    reasonText: actionType,
    sourceType: RECORD_SOURCE,
    sourceId,
    idempotencyKey,
    operatorUserId: null,
    adminSessionId: null,
    createdAt: now,
  } as const;
  await db.insert(gemTransactions).values(transaction);
  await setBalanceCache(db, familyId, transaction.balanceAfter, now);
  return mapTransaction(transaction as typeof gemTransactions.$inferSelect);
}

export async function getGemBalance(
  db: Database,
  userId: string,
  familyId: string,
): Promise<GemBalance> {
  await requireFamilyMembership(db, userId, familyId);
  const familyRows = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  const family = familyRows[0];
  if (!family) throw new AppError('NOT_FOUND', '小家不存在', 404);
  return { balance: family.gemBalanceCache, ledgerBalance: await ledgerTotal(db, familyId) };
}

export async function reconcileGemBalance(db: Database, familyId: string) {
  const now = utcNowMs();
  const ledgerBalance = await ledgerTotal(db, familyId);
  const familyRows = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  const family = familyRows[0];
  if (!family) throw new AppError('NOT_FOUND', '小家不存在', 404);
  if (family.gemBalanceCache !== ledgerBalance) {
    await setBalanceCache(db, familyId, ledgerBalance, now);
  }
  return { balance: ledgerBalance, ledgerBalance, drifted: family.gemBalanceCache !== ledgerBalance };
}

export async function listGemTransactions(
  db: Database,
  userId: string,
  familyId: string,
  limit = 50,
) {
  await requireFamilyMembership(db, userId, familyId);
  const rows = await db
    .select()
    .from(gemTransactions)
    .where(eq(gemTransactions.familyId, familyId))
    .orderBy(desc(gemTransactions.createdAt), desc(gemTransactions.id))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map(mapTransaction);
}

export async function getGemTransaction(db: Database, userId: string, id: string) {
  const rows = await db.select().from(gemTransactions).where(eq(gemTransactions.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '宝石流水不存在', 404);
  await requireFamilyMembership(db, userId, row.familyId);
  return mapTransaction(row);
}

async function getRewardRow(db: Database, rewardId: string) {
  const rows = await db
    .select()
    .from(rewards)
    .where(
      and(
        eq(rewards.id, rewardId),
        eq(rewards.status, 'ACTIVE'),
        isNull(rewards.deletedAt),
      ),
    )
    .limit(1);
  const reward = rows[0];
  if (!reward) throw new AppError('NOT_FOUND', '这个小愿望已经不在这里了', 404);
  return reward;
}

export async function listRewards(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  const rows = await db
    .select()
    .from(rewards)
    .where(
      and(
        eq(rewards.familyId, familyId),
        eq(rewards.status, 'ACTIVE'),
        isNull(rewards.deletedAt),
      ),
    )
    .orderBy(rewards.sortOrder, rewards.createdAt);
  return rows.map(mapReward);
}

export async function getReward(db: Database, userId: string, rewardId: string) {
  const reward = await getRewardRow(db, rewardId);
  await requireFamilyMembership(db, userId, reward.familyId);
  return mapReward(reward);
}

export async function redeemReward(
  db: Database,
  userId: string,
  rewardId: string,
  requestKey: string,
) {
  const reward = await getRewardRow(db, rewardId);
  await requireFamilyMembership(db, userId, reward.familyId);
  const now = utcNowMs();
  const idempotencyKey = `redeem:${requestKey}`;
  const orderId = createUlid();

  try {
    return await db.transaction(async (tx) => {
      const existingRows = await tx
        .select()
        .from(gemTransactions)
        .where(
          and(
            eq(gemTransactions.familyId, reward.familyId),
            eq(gemTransactions.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      const existing = existingRows[0];
      if (existing) {
        const orderRows = await tx
          .select()
          .from(rewardOrders)
          .where(eq(rewardOrders.id, existing.sourceId ?? ''))
          .limit(1);
        const order = orderRows[0];
        if (!order) throw new AppError('CONFLICT', '这笔兑换正在整理中，请稍后查看', 409, true);
        return { order: mapOrder(order), balance: existing.balanceAfter };
      }

      const balance = await ledgerTotal(tx, reward.familyId);
      await setBalanceCache(tx, reward.familyId, balance, now);
      const debited = await tx
        .update(families)
        .set({
          gemBalanceCache: sql`${families.gemBalanceCache} - ${reward.priceGems}`,
          updatedAt: now,
          version: sql`${families.version} + 1`,
        })
        .where(
          and(
            eq(families.id, reward.familyId),
            gt(families.gemBalanceCache, reward.priceGems - 1),
          ),
        )
        .returning({ balance: families.gemBalanceCache });
      const newBalance = debited[0]?.balance;
      if (newBalance == null || balance < reward.priceGems) {
        throw new AppError('CONFLICT', '还差一点宝石，再留下几次记录就好啦', 409);
      }

      if (reward.stock != null) {
        const stocked = await tx
          .update(rewards)
          .set({
            stock: sql`${rewards.stock} - 1`,
            updatedAt: now,
            version: sql`${rewards.version} + 1`,
          })
          .where(and(eq(rewards.id, reward.id), gt(rewards.stock, 0)))
          .returning({ id: rewards.id });
        if (!stocked[0]) throw new AppError('CONFLICT', '这个小愿望暂时被大家留给未来了', 409);
      }

      await tx.insert(gemTransactions).values({
        id: createUlid(),
        familyId: reward.familyId,
        userId,
        amount: -reward.priceGems,
        balanceAfter: newBalance,
        reasonCode: 'REWARD_REDEEMED',
        reasonText: reward.name,
        sourceType: 'REWARD_ORDER',
        sourceId: orderId,
        idempotencyKey,
        operatorUserId: null,
        adminSessionId: null,
        createdAt: now,
      });

      const order = {
        id: orderId,
        familyId: reward.familyId,
        rewardId: reward.id,
        rewardNameSnapshot: reward.name,
        redeemedBy: userId,
        priceGemsSnapshot: reward.priceGems,
        status: 'WAITING',
        redeemedAt: now,
        fulfilledAt: null,
        canceledAt: null,
        fulfilledBy: null,
        completionPhotoMemoryId: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      } as typeof rewardOrders.$inferSelect;
      await tx.insert(rewardOrders).values(order);
      await setBalanceCache(tx, reward.familyId, newBalance, now);
      return { order: mapOrder(order), balance: newBalance };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('busy') || message.includes('locked')) {
      throw new AppError('CONFLICT', '小家正在处理另一笔兑换，请稍后再试', 409, true);
    }
    if (message.includes('uq_gem_transactions_family_idempotency')) {
      throw new AppError('CONFLICT', '这笔兑换正在整理中，请稍后查看', 409, true);
    }
    throw error;
  }
}

export async function listRewardOrders(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  const rows = await db
    .select()
    .from(rewardOrders)
    .where(eq(rewardOrders.familyId, familyId))
    .orderBy(desc(rewardOrders.updatedAt), desc(rewardOrders.id));
  return rows.map(mapOrder);
}

async function getOrderRow(db: Database, orderId: string) {
  const rows = await db.select().from(rewardOrders).where(eq(rewardOrders.id, orderId)).limit(1);
  const order = rows[0];
  if (!order) throw new AppError('NOT_FOUND', '这笔兑换不存在', 404);
  return order;
}

export async function getRewardOrder(db: Database, userId: string, orderId: string) {
  const order = await getOrderRow(db, orderId);
  await requireFamilyMembership(db, userId, order.familyId);
  return mapOrder(order);
}

export async function fulfillRewardOrder(
  db: Database,
  userId: string,
  orderId: string,
  completionPhotoMemoryId?: string | null,
) {
  const current = await getOrderRow(db, orderId);
  await requireFamilyMembership(db, userId, current.familyId);
  if (current.status === 'COMPLETED') return mapOrder(current);
  if (current.status !== 'WAITING' && current.status !== 'REDEEMED') {
    throw new AppError('CONFLICT', '这笔兑换现在不能完成兑现', 409);
  }
  const now = utcNowMs();
  await db
    .update(rewardOrders)
    .set({
      status: 'COMPLETED',
      fulfilledAt: now,
      fulfilledBy: userId,
      completionPhotoMemoryId: completionPhotoMemoryId ?? null,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(and(eq(rewardOrders.id, orderId), eq(rewardOrders.status, current.status)));
  return getRewardOrder(db, userId, orderId);
}

export async function cancelRewardOrder(db: Database, userId: string, orderId: string) {
  const current = await getOrderRow(db, orderId);
  await requireFamilyMembership(db, userId, current.familyId);
  if (current.status === 'CANCELED') return mapOrder(current);
  if (current.status === 'COMPLETED') {
    throw new AppError('CONFLICT', '已经完成的愿望不能取消', 409);
  }
  if (current.status !== 'WAITING' && current.status !== 'REDEEMED') {
    throw new AppError('CONFLICT', '这笔兑换现在不能取消', 409);
  }

  const now = utcNowMs();
  const refundKey = `refund:reward_order:${orderId}`;
  await db.transaction(async (tx) => {
    const existingRefund = await tx
      .select()
      .from(gemTransactions)
      .where(and(eq(gemTransactions.familyId, current.familyId), eq(gemTransactions.idempotencyKey, refundKey)))
      .limit(1);
    if (!existingRefund[0]) {
      const balance = await ledgerTotal(tx, current.familyId);
      const refund = {
        id: createUlid(),
        familyId: current.familyId,
        userId,
        amount: current.priceGemsSnapshot,
        balanceAfter: balance + current.priceGemsSnapshot,
        reasonCode: 'REWARD_CANCELED_REFUND',
        reasonText: current.rewardNameSnapshot,
        sourceType: REFUND_SOURCE,
        sourceId: orderId,
        idempotencyKey: refundKey,
        operatorUserId: null,
        adminSessionId: null,
        createdAt: now,
      } as const;
      await tx.insert(gemTransactions).values(refund);
      await setBalanceCache(tx, current.familyId, refund.balanceAfter, now);
    }
    await tx
      .update(rewardOrders)
      .set({ status: 'CANCELED', canceledAt: now, updatedAt: now, version: current.version + 1 })
      .where(and(eq(rewardOrders.id, orderId), or(eq(rewardOrders.status, 'WAITING'), eq(rewardOrders.status, 'REDEEMED'))));
  });
  return getRewardOrder(db, userId, orderId);
}

export async function createCustomReward(
  db: Database,
  userId: string,
  familyId: string,
  body: CreateRewardBody,
) {
  await requireFamilyMembership(db, userId, familyId);
  const now = utcNowMs();
  const reward = {
    id: createUlid(),
    familyId,
    name: body.name,
    description: body.description ?? null,
    priceGems: body.priceGems,
    stock: body.stock ?? null,
    illustrationKey: body.illustrationKey ?? 'wish',
    status: 'ACTIVE',
    sortOrder: 99,
    custom: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
  } as const;
  await db.insert(rewards).values(reward);
  return mapReward(reward as typeof rewards.$inferSelect);
}

export async function updateReward(
  db: Database,
  userId: string,
  rewardId: string,
  body: UpdateRewardBody,
) {
  const current = await getRewardRow(db, rewardId);
  await requireFamilyMembership(db, userId, current.familyId);
  const now = utcNowMs();
  await db
    .update(rewards)
    .set({
      name: body.name ?? current.name,
      description: body.description === undefined ? current.description : body.description,
      priceGems: body.priceGems ?? current.priceGems,
      stock: body.stock === undefined ? current.stock : body.stock,
      illustrationKey:
        body.illustrationKey === undefined ? current.illustrationKey : body.illustrationKey,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(eq(rewards.id, rewardId));
  return getReward(db, userId, rewardId);
}

export async function deleteReward(db: Database, userId: string, rewardId: string) {
  const current = await getRewardRow(db, rewardId);
  await requireFamilyMembership(db, userId, current.familyId);
  const now = utcNowMs();
  await db
    .update(rewards)
    .set({ deletedAt: now, status: 'OFFLINE', updatedAt: now, version: current.version + 1 })
    .where(eq(rewards.id, rewardId));
  return { ok: true as const };
}

export async function appendRecordGemSyncLog(
  db: DbExecutor,
  familyId: string,
  userId: string,
  entityType: string,
  entityId: string,
  now: number,
) {
  await appendSyncLog(db as Database, {
    operationId: createUlid(),
    familyId,
    actorUserId: userId,
    deviceId: null,
    entityType,
    entityId,
    op: 'CREATE',
    entityVersion: 1,
  }, now);
}
