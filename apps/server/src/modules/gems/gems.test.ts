import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations } from '@runew/db';
import { families, gemRules, gemTransactions, rewards } from '@runew/db';
import { eq } from 'drizzle-orm';
import { createUlid } from '@runew/shared-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { reconcileGemBalance } from './service.js';

const headers = { 'x-client-platform': 'WEAPP' };

describe('Gems M9 integration', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let dir: string;
  let auth: Record<string, string>;
  let babyId: string;
  let userId: string;
  let familyId: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-gems-test-'));
    process.env.DATABASE_PATH = path.join(dir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);
    app = await buildApp();
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { username: `gems_${Date.now()}`, password: 'Password123!', displayName: '宝石测试' },
    });
    expect(register.statusCode).toBe(201);
    userId = register.json().data.user.id as string;
    auth = { ...headers, authorization: `Bearer ${register.json().data.session.token as string}` };
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { relationship: 'MOM', baby: { name: '润润', birthday: '2026-01-16' }, topics: [] },
    });
    expect(onboarding.statusCode).toBe(200);
    babyId = onboarding.json().data.baby.id as string;
    familyId = onboarding.json().data.family.id as string;
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function credit(amount: number) {
    await app.db.insert(gemTransactions).values({
      id: createUlid(), familyId, userId, amount, balanceAfter: amount,
      reasonCode: 'TEST_FIXTURE', sourceType: 'TEST_FIXTURE',
      idempotencyKey: createUlid(), createdAt: Date.now(),
    });
    await reconcileGemBalance(app.db, familyId);
  }

  it('resolves active family for balance and rewards routes', async () => {
    const balance = await app.inject({ method: 'GET', url: '/api/v1/gems/balance', headers: auth });
    expect(balance.statusCode).toBe(200);
    expect(balance.json().data).toEqual({ balance: 0, ledgerBalance: 0 });
    const rewards = await app.inject({ method: 'GET', url: '/api/v1/rewards', headers: auth });
    expect(rewards.statusCode).toBe(200);
    expect(rewards.json().data.length).toBeGreaterThan(0);
  });

  it('seeds default wishes when a family catalog is empty, without duplicating', async () => {
    await app.db.delete(rewards).where(eq(rewards.familyId, familyId));
    const empty = await app.db.select().from(rewards).where(eq(rewards.familyId, familyId));
    expect(empty).toHaveLength(0);
    const first = await app.inject({ method: 'GET', url: '/api/v1/rewards', headers: auth });
    const replay = await app.inject({ method: 'GET', url: '/api/v1/rewards', headers: auth });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(first.json().data.length).toBeGreaterThanOrEqual(4);
    expect(replay.json().data).toHaveLength(first.json().data.length);
  });

  it('awards one gem for diaper and food creates', async () => {
    const diaperPayload = {
      diaperType: 'WET',
      recordedAt: Date.now(),
      timezoneName: 'Asia/Shanghai',
    };
    const diaper = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/diapers`,
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: diaperPayload,
    });
    expect(diaper.statusCode).toBe(201);
    const food = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/foods`,
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { foodName: '苹果泥', recordedAt: Date.now(), timezoneName: 'Asia/Shanghai' },
    });
    expect(food.statusCode).toBe(201);
    const transactions = await app.inject({ method: 'GET', url: '/api/v1/gems/transactions', headers: auth });
    expect(transactions.statusCode).toBe(200);
    const created = (transactions.json().data as Array<{ reasonText: string; amount: number }>).filter(
      (item) => item.reasonText === 'DIAPER_RECORD' || item.reasonText === 'FOOD_RECORD',
    );
    expect(created).toHaveLength(2);
    expect(created.every((item) => item.amount === 1)).toBe(true);
  });

  it('awards a manually entered sleep exactly once on create retry', async () => {
    const request = {
      method: 'POST' as const,
      url: `/api/v1/babies/${babyId}/sleep`,
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { startedAt: Date.now() - 3_600_000, endedAt: Date.now() },
    };
    const first = await app.inject(request);
    const replay = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.id).toBe(first.json().data.id);
    const rows = await app.db.select().from(gemTransactions).where(eq(gemTransactions.familyId, familyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reasonText).toBe('SLEEP_RECORD');
    expect(rows[0]?.sourceId).toBe(first.json().data.id);
  });

  it('redeems idempotently, snapshots price, and refunds exactly once on cancel', async () => {
    await credit(2);
    const rewardResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/rewards',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { name: '一起看电影', priceGems: 2, stock: 1 },
    });
    expect(rewardResponse.statusCode).toBe(200);
    const rewardId = rewardResponse.json().data.id as string;

    const key = createUlid();
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/rewards/${rewardId}/redeem`,
      headers: { ...auth, 'idempotency-key': key },
    });
    expect(first.statusCode).toBe(200);
    const updated = await app.inject({
      method: 'PATCH', url: `/api/v1/rewards/${rewardId}`, headers: auth,
      payload: { name: '后来改名的愿望', priceGems: 9 },
    });
    expect(updated.statusCode).toBe(200);
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/rewards/${rewardId}/redeem`,
      headers: { ...auth, 'idempotency-key': key },
    });
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.order.id).toBe(first.json().data.order.id);
    expect(replay.json().data.order.priceGemsSnapshot).toBe(2);
    expect(replay.json().data.order.rewardName).toBe('一起看电影');
    const other = await app.inject({
      method: 'POST', url: '/api/v1/rewards', headers: auth,
      payload: { name: '另一个愿望', priceGems: 1 },
    });
    const reused = await app.inject({
      method: 'POST', url: `/api/v1/rewards/${other.json().data.id as string}/redeem`,
      headers: { ...auth, 'idempotency-key': key },
    });
    expect(reused.statusCode).toBe(409);

    const canceled = await app.inject({
      method: 'POST',
      url: `/api/v1/reward-orders/${first.json().data.order.id}/cancel`,
      headers: auth,
    });
    const canceledAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/reward-orders/${first.json().data.order.id}/cancel`,
      headers: auth,
    });
    expect(canceled.statusCode).toBe(200);
    expect(canceled.json().data.status).toBe('CANCELED');
    expect(canceledAgain.statusCode).toBe(200);
    const transactions = await app.inject({
      method: 'GET',
      url: '/api/v1/gems/transactions',
      headers: auth,
    });
    const refunds = (transactions.json().data as Array<{ reasonCode: string }>).filter(
      (item) => item.reasonCode === 'REWARD_CANCELED_REFUND',
    );
    expect(refunds).toHaveLength(1);
    const pull = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/pull?familyId=${familyId}&cursor=0`,
      headers: auth,
    });
    expect(pull.statusCode).toBe(200);
    expect(
      (pull.json().data.changes as Array<{ entityType: string }>).map(
        (change) => change.entityType,
      ),
    ).toContain('REWARD_ORDER');
  });

  it('rejects insufficient balance and fulfills an order with a price snapshot', async () => {
    const tooExpensive = await app.inject({
      method: 'POST',
      url: '/api/v1/rewards',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { name: '暂时还够不到', priceGems: 999 },
    });
    const insufficient = await app.inject({
      method: 'POST',
      url: `/api/v1/rewards/${tooExpensive.json().data.id as string}/redeem`,
      headers: { ...auth, 'idempotency-key': createUlid() },
    });
    expect(insufficient.statusCode).toBe(409);

    const diaper = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/diapers`,
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { diaperType: 'WET', recordedAt: Date.now(), timezoneName: 'Asia/Shanghai' },
    });
    expect(diaper.statusCode).toBe(201);
    const fulfillable = await app.inject({
      method: 'POST',
      url: '/api/v1/rewards',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { name: '睡前故事', priceGems: 1 },
    });
    const rewardId = fulfillable.json().data.id as string;
    const redeemed = await app.inject({
      method: 'POST',
      url: `/api/v1/rewards/${rewardId}/redeem`,
      headers: { ...auth, 'idempotency-key': createUlid() },
    });
    expect(redeemed.statusCode).toBe(200);
    const orderId = redeemed.json().data.order.id as string;
    const fulfilled = await app.inject({
      method: 'POST',
      url: `/api/v1/reward-orders/${orderId}/fulfill`,
      headers: auth,
      payload: {},
    });
    expect(fulfilled.statusCode).toBe(200);
    expect(fulfilled.json().data.status).toBe('COMPLETED');
    const canceled = await app.inject({
      method: 'POST',
      url: `/api/v1/reward-orders/${orderId}/cancel`,
      headers: auth,
    });
    expect(canceled.statusCode).toBe(409);
  });

  it('caps daily record rewards without rejecting the records themselves', async () => {
    const family = (await app.db.select().from(families).limit(1))[0];
    if (!family) throw new Error('family fixture missing');
    await app.db.insert(gemRules).values({
      id: createUlid(),
      familyId: family.id,
      actionType: 'DIAPER_RECORD',
      amount: 3,
      dailyLimit: 1,
      enabled: true,
      createdByAdmin: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    });
    const ids: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/babies/${babyId}/diapers`,
        headers: { ...auth, 'idempotency-key': createUlid() },
        payload: { diaperType: 'WET', recordedAt: Date.now() + i },
      });
      expect(response.statusCode).toBe(201);
      ids.push(response.json().data.id as string);
    }
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      const detail = await app.inject({ method: 'GET', url: `/api/v1/diapers/${id}`, headers: auth });
      expect(detail.statusCode).toBe(200);
    }
    const rows = await app.db.select().from(gemTransactions).where(eq(gemTransactions.familyId, familyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toBe(3);
  });

  it('allows only one concurrent redeem with balance for one order, then refunds normally', async () => {
    await credit(2);
    const reward = await app.inject({
      method: 'POST',
      url: '/api/v1/rewards',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { name: '一起留下的愿望', priceGems: 2 },
    });
    const rewardId = reward.json().data.id as string;
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/rewards/${rewardId}/redeem`,
        headers: { ...auth, 'idempotency-key': createUlid() },
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/rewards/${rewardId}/redeem`,
        headers: { ...auth, 'idempotency-key': createUlid() },
      }),
    ]);
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
    const successful = responses.find((response) => response.statusCode === 200);
    if (!successful) throw new Error('concurrent redeem fixture missing');
    const refund = await app.inject({
      method: 'POST',
      url: `/api/v1/reward-orders/${successful.json().data.order.id as string}/cancel`,
      headers: auth,
    });
    expect(refund.statusCode).toBe(200);
  });

  it('keeps ledger total and cache aligned after reconciliation', async () => {
    const balance = await app.inject({ method: 'GET', url: '/api/v1/gems/balance', headers: auth });
    const familyRows = await app.db.select().from(families).limit(1);
    const family = familyRows[0];
    expect(balance.statusCode).toBe(200);
    if (!family) throw new Error('family fixture missing');
    await app.db.update(families).set({ gemBalanceCache: 777 }).where(eq(families.id, family.id));
    const reconciled = await reconcileGemBalance(app.db, family.id);
    const ledgerRows = await app.db.select().from(gemTransactions).where(eq(gemTransactions.familyId, family.id));
    const ledgerTotal = ledgerRows.reduce((sum, row) => sum + row.amount, 0);
    expect(reconciled.balance).toBe(ledgerTotal);
    expect(reconciled.drifted).toBe(true);
    const after = await app.inject({ method: 'GET', url: '/api/v1/gems/balance', headers: auth });
    expect(after.json().data.balance).toBe(ledgerTotal);
  });

  it('keeps completion and refund mutually exclusive when cancel races fulfill', async () => {
    await credit(2);
    const reward = await app.inject({
      method: 'POST', url: '/api/v1/rewards', headers: auth,
      payload: { name: '一起散步', priceGems: 2 },
    });
    expect(reward.statusCode).toBe(200);
    const redeemed = await app.inject({
      method: 'POST', url: `/api/v1/rewards/${reward.json().data.id as string}/redeem`,
      headers: { ...auth, 'idempotency-key': createUlid() },
    });
    expect(redeemed.statusCode).toBe(200);
    const orderId = redeemed.json().data.order.id as string;
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/reward-orders/${orderId}/fulfill`, headers: auth, payload: {} }),
      app.inject({ method: 'POST', url: `/api/v1/reward-orders/${orderId}/cancel`, headers: auth }),
    ]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const detail = await app.inject({ method: 'GET', url: `/api/v1/reward-orders/${orderId}`, headers: auth });
    const transactions = await app.db.select().from(gemTransactions).where(eq(gemTransactions.familyId, familyId));
    const refunds = transactions.filter((row) => row.sourceType === 'REWARD_REFUND');
    expect(refunds).toHaveLength(detail.json().data.status === 'CANCELED' ? 1 : 0);
  });

  it('rechecks order state inside the refund transaction after an intervening fulfillment', async () => {
    await credit(2);
    const reward = await app.inject({
      method: 'POST', url: '/api/v1/rewards', headers: auth,
      payload: { name: '一起看星星', priceGems: 2 },
    });
    const redeemed = await app.inject({
      method: 'POST', url: `/api/v1/rewards/${reward.json().data.id as string}/redeem`,
      headers: { ...auth, 'idempotency-key': createUlid() },
    });
    expect(redeemed.statusCode).toBe(200);
    const orderId = redeemed.json().data.order.id as string;
    const transaction = app.db.transaction.bind(app.db);
    // 在退款取得写锁前让另一请求完成订单，固定复现 read/write 间隙。
    const spy = vi.spyOn(app.db, 'transaction').mockImplementationOnce(async (handler, config) => {
      spy.mockRestore();
      const fulfilled = await app.inject({
        method: 'POST', url: `/api/v1/reward-orders/${orderId}/fulfill`, headers: auth, payload: {},
      });
      expect(fulfilled.statusCode).toBe(200);
      return transaction(handler, config);
    });
    try {
      const canceled = await app.inject({ method: 'POST', url: `/api/v1/reward-orders/${orderId}/cancel`, headers: auth });
      expect(canceled.statusCode).toBe(409);
      const rows = await app.db.select().from(gemTransactions).where(eq(gemTransactions.familyId, familyId));
      expect(rows.filter((row) => row.sourceType === 'REWARD_REFUND')).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});
