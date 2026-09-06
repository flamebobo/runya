import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { notificationPreferencesSchema } from '@runew/contracts';
import {
  jobLocks,
  families,
  notifications as notificationsTable,
  scheduledNotifications,
} from '@runew/db';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { startScheduler } from './scheduler.js';

const WEAPP_HEADERS = { 'x-client-platform': 'WEAPP' };

// Scheduler 验收：幂等派发、Restart 不重复通知、Job Lock、DND 推迟、Notification Read。
// 种数据一律走真实 API（创建带提醒的事件），避免孤儿 sourceId 被调度器按设计作废。

describe('notification scheduler', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userSeq = 0;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m6-sched-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    app = await buildApp();
  });

  afterEach(async () => {
    // Job lock TTL 55s > 单用例耗时；不清残留会挡住下一个用例的调度轮。
    await app.db.delete(jobLocks);
  });

  async function readyFamily(preferences?: {
    dndEnabled?: boolean;
    dndStartMinute?: number;
    dndEndMinute?: number;
  }) {
    userSeq += 1;
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `m6s_${userSeq}_${Date.now().toString(36)}`,
        password: 'password123',
        nickname: '测试妈妈',
      },
    });
    const token = register.json().data.session.token as string;
    const userId = register.json().data.user.id as string;
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
        'idempotency-key': createUlid(),
      },
      payload: {
        relationship: 'MOM',
        baby: { name: `润润${userSeq}`, birthday: '2026-01-16' },
        topics: ['健康'],
      },
    });
    if (preferences) {
      await app.inject({
        method: 'PUT',
        url: '/api/v1/notification-preferences',
        headers: { ...WEAPP_HEADERS, authorization: `Bearer ${token}` },
        payload: preferences,
      });
    }
    return {
      userId,
      familyId: onboarding.json().data.family.id as string,
      babyId: onboarding.json().data.baby.id as string,
      headers: { ...WEAPP_HEADERS, authorization: `Bearer ${token}` },
    };
  }

  // 通过真实 API 创建带 D1 提醒的事件，然后把它的 scheduled notification
  // 拨到已到点（未来事件 + 过去提醒），保持 sourceId 指向真实 health_reminders 行。
  async function seedDue(input: {
    userId: string;
    babyId: string;
    headers: Record<string, string>;
    fireAt: number;
    dndOverride?: boolean;
  }) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${input.babyId}/health/events`,
      headers: { ...input.headers, 'idempotency-key': createUlid() },
      payload: {
        eventType: 'CHECKUP',
        title: `测试事项${userSeq}`,
        scheduledAt: utcNowMs() + 7 * 24 * 60 * 60 * 1000,
        reminder: {
          offsets: [{ kind: 'D1', allowDndOverride: input.dndOverride ?? false }],
        },
      },
    });
    expect(response.statusCode).toBe(201);
    const eventId = response.json().data.id as string;

    // 真实提醒行就是 scheduled_notifications.sourceId。
    const scheduled = await app.db
      .select()
      .from(scheduledNotifications)
      .where(
        and(
          eq(scheduledNotifications.sourceType, 'HEALTH_REMINDER'),
          eq(scheduledNotifications.userId, input.userId),
          eq(scheduledNotifications.status, 'SCHEDULED'),
        ),
      );
    const target = scheduled.find((row) => row.sourceId !== '');
    expect(target).toBeTruthy();
    for (const row of scheduled) {
      if (row.id === target!.id) {
        await app.db
          .update(scheduledNotifications)
          .set({ fireAt: input.fireAt, dndOverride: input.dndOverride ?? false })
          .where(eq(scheduledNotifications.id, row.id));
      } else {
        // 其他偏移的提醒不受本用例影响，直接取消。
        await app.db
          .update(scheduledNotifications)
          .set({ status: 'CANCELED' })
          .where(eq(scheduledNotifications.id, row.id));
      }
    }
    return { eventId, reminderId: target!.sourceId };
  }

  it('delivers due notifications exactly once, even across scheduler restarts', async () => {
    const family = await readyFamily({ dndEnabled: false });
    const { eventId, reminderId } = await seedDue({
      userId: family.userId,
      babyId: family.babyId,
      headers: family.headers,
      fireAt: utcNowMs() - 1000,
    });

    const schedulerA = startScheduler(app.db, app.log);
    await schedulerA.runOnce();
    await schedulerA.runOnce(); // 同一实例立刻再跑一轮
    schedulerA.stop();

    // 模拟重启：新实例。
    const schedulerB = startScheduler(app.db, app.log);
    await schedulerB.runOnce();
    schedulerB.stop();

    const rows = await app.db
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.sourceId, reminderId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('SENT');

    const delivered = await app.db
      .select()
      .from(notificationsTable)
      .where(and(eq(notificationsTable.targetId, eventId)));
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.targetType).toBe('HEALTH_EVENT');
    expect(delivered[0]!.targetId).toBe(eventId);
    expect(delivered[0]!.body).not.toMatch(/诊断|风险判断|医疗结论/);
  });

  it('schedules and delivers a family anniversary notification once', async () => {
    const family = await readyFamily({ dndEnabled: false });
    const anniversary = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${family.familyId}/anniversaries`,
      headers: family.headers,
      payload: { title: '第一次见面', date: '2026-05-20', note: '一起记得这一天' },
    });
    expect(anniversary.statusCode).toBe(201);
    const anniversaryId = anniversary.json().data.id as string;
    const fireAt = Date.UTC(2026, 4, 20, 1, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], now: fireAt - 24 * 60 * 60 * 1000 });
    const scheduler = startScheduler(app.db, app.log);
    try {
      await scheduler.runOnce();
      const scheduled = await app.db
        .select()
        .from(scheduledNotifications)
        .where(eq(scheduledNotifications.sourceId, anniversaryId));
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0]!.sourceType).toBe('FAMILY_ANNIVERSARY');
      expect(scheduled[0]!.fireAt).toBe(fireAt);

      // The scheduler job lock is intentionally 55s; advance beyond it before
      // simulating the next tick so the same process can run the due dispatch.
      vi.setSystemTime(fireAt + 60_000);
      await scheduler.runOnce();
      const delivered = await app.db
        .select()
        .from(notificationsTable)
        .where(eq(notificationsTable.targetId, anniversaryId));
      expect(delivered).toHaveLength(1);
      expect(delivered[0]!.title).toBe('家庭纪念日');
      expect(delivered[0]!.body).toContain('共同记忆');
      const rows = await app.db
        .select()
        .from(scheduledNotifications)
        .where(eq(scheduledNotifications.sourceId, anniversaryId));
      expect(rows.filter((row) => row.status === 'SENT')).toHaveLength(1);
      expect(rows.some((row) => row.fireAt > fireAt && row.status === 'SCHEDULED')).toBe(true);
    } finally {
      scheduler.stop();
      vi.useRealTimers();
    }
  });

  it('reconciles gems daily across restarts without changing notification cadence', async () => {
    const family = await readyFamily();
    const { familyId } = family;
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'], now });
    const first = startScheduler(app.db, app.log);
    const restarted = startScheduler(app.db, app.log);
    try {
      await app.db.update(families).set({ gemBalanceCache: 12 }).where(eq(families.id, familyId));
      await first.runOnce();
      const initial = await app.db.select().from(families).where(eq(families.id, familyId));
      expect(initial[0]!.gemBalanceCache).toBe(0);
      await app.db.update(families).set({ gemBalanceCache: 12 }).where(eq(families.id, familyId));
      vi.setSystemTime(now + 60_000);
      await restarted.runOnce();
      const withinDay = await app.db.select().from(families).where(eq(families.id, familyId));
      expect(withinDay[0]!.gemBalanceCache).toBe(12);
      const notificationJob = await app.db.select().from(jobLocks).where(eq(jobLocks.jobName, 'due-notifications'));
      expect(notificationJob[0]!.lastRunAt).toBe(now + 60_000);
      vi.setSystemTime(now + 24 * 60 * 60 * 1000);
      await restarted.runOnce();
      const nextDay = await app.db.select().from(families).where(eq(families.id, familyId));
      expect(nextDay[0]!.gemBalanceCache).toBe(0);
    } finally {
      first.stop();
      restarted.stop();
      vi.useRealTimers();
    }
  });

  it('uses job locks so concurrent ticks do not double-dispatch', async () => {
    const family = await readyFamily({ dndEnabled: false });
    const { reminderId } = await seedDue({
      userId: family.userId,
      babyId: family.babyId,
      headers: family.headers,
      fireAt: utcNowMs() - 1000,
    });

    const a = startScheduler(app.db, app.log);
    const b = startScheduler(app.db, app.log);
    // 两个实例并发跑同一轮。
    await Promise.all([a.runOnce(), b.runOnce()]);
    a.stop();
    b.stop();

    const rows = await app.db
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.sourceId, reminderId));
    // 两个实例抢同一把锁：至少一个被挡在锁外，最多一轮派发成功。
    expect(rows[0]!.status).toBe('SENT');
  });

  it('defers notifications inside DND and delivers after window end', async () => {
    const family = await readyFamily({
      dndEnabled: true,
      dndStartMinute: 21 * 60,
      dndEndMinute: 8 * 60,
    });
    const { reminderId } = await seedDue({
      userId: family.userId,
      babyId: family.babyId,
      headers: family.headers,
      fireAt: localAt(3, 0), // 本地凌晨 03:00，落在 21:00-08:00 内
    });

    const scheduler = startScheduler(app.db, app.log);
    await scheduler.runOnce();
    scheduler.stop();

    const rows = await app.db
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.sourceId, reminderId));
    // 凌晨 3 点在 DND 内：推迟到当天 08:00，状态仍 SCHEDULED。
    expect(rows[0]!.status).toBe('SCHEDULED');
    expect(rows[0]!.fireAt).toBeGreaterThan(localAt(3, 0));
  });

  it('delivers allow_dnd_override health reminders during DND', async () => {
    const family = await readyFamily();
    const { reminderId } = await seedDue({
      userId: family.userId,
      babyId: family.babyId,
      headers: family.headers,
      fireAt: localAt(1, 30), // 本地 01:30，DND 内
      dndOverride: true,
    });

    const scheduler = startScheduler(app.db, app.log);
    await scheduler.runOnce();
    scheduler.stop();

    const rows = await app.db
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.sourceId, reminderId));
    expect(rows[0]!.status).toBe('SENT');
  });

  it('does not dispatch reminders after the source event is completed', async () => {
    const family = await readyFamily();
    const { eventId, reminderId } = await seedDue({
      userId: family.userId,
      babyId: family.babyId,
      headers: family.headers,
      fireAt: utcNowMs() - 1000,
    });
    const completed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/health/events/${eventId}`,
      headers: family.headers,
      payload: { status: 'COMPLETED' },
    });
    expect(completed.statusCode).toBe(200);

    const scheduler = startScheduler(app.db, app.log);
    await scheduler.runOnce();
    scheduler.stop();

    const scheduled = await app.db
      .select()
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.sourceId, reminderId));
    expect(scheduled[0]!.status).toBe('CANCELED');
    const delivered = await app.db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.targetId, eventId));
    expect(delivered).toHaveLength(0);
  });

  it('marks notifications read individually and all at once', async () => {
    const family = await readyFamily({ dndEnabled: false });
    await seedDue({
      userId: family.userId,
      babyId: family.babyId,
      headers: family.headers,
      fireAt: utcNowMs() - 1000,
    });
    const scheduler = startScheduler(app.db, app.log);
    await scheduler.runOnce();
    scheduler.stop();

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: family.headers,
    });
    expect(list.statusCode).toBe(200);
    const items = list.json().data.items as Array<{
      id: string;
      readAt: number | null;
    }>;
    expect(items.length).toBeGreaterThan(0);
    expect(list.json().data.unreadCount).toBe(items.length);

    const target = items[0]!;
    const read = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${target.id}/read`,
      headers: family.headers,
    });
    expect(read.statusCode).toBe(200);

    // 重放已读：幂等不报错。
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/${target.id}/read`,
      headers: family.headers,
    });
    expect(replay.statusCode).toBe(200);

    const readAll = await app.inject({
      method: 'POST',
      url: '/api/v1/notifications/read-all',
      headers: family.headers,
    });
    expect(readAll.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: family.headers,
    });
    expect(after.json().data.unreadCount).toBe(0);
  });

  it('persists and updates notification preferences', async () => {
    const family = await readyFamily();
    const initial = await app.inject({
      method: 'GET',
      url: '/api/v1/notification-preferences',
      headers: family.headers,
    });
    expect(initial.statusCode).toBe(200);
    expect(() =>
      notificationPreferencesSchema.parse(initial.json().data),
    ).not.toThrow();
    expect(initial.json().data.dndStartMinute).toBe(21 * 60);
    expect(initial.json().data.dndEndMinute).toBe(8 * 60);

    const updated = await app.inject({
      method: 'PUT',
      url: '/api/v1/notification-preferences',
      headers: family.headers,
      payload: { dndStartMinute: 22 * 60, healthEnabled: false },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.dndStartMinute).toBe(22 * 60);
    expect(updated.json().data.healthEnabled).toBe(false);

    // 非法分钟数被拒绝。
    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/v1/notification-preferences',
      headers: family.headers,
      payload: { dndStartMinute: 1500 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('releases expired job locks so a fresh process can take over', async () => {
    const family = await readyFamily({ dndEnabled: false });
    const { reminderId } = await seedDue({
      userId: family.userId,
      babyId: family.babyId,
      headers: family.headers,
      fireAt: utcNowMs() - 1000,
    });

    const scheduler = startScheduler(app.db, app.log);
    await scheduler.runOnce();
    scheduler.stop();
    expect(
      (
        await app.db
          .select()
          .from(scheduledNotifications)
          .where(eq(scheduledNotifications.sourceId, reminderId))
      )[0]!.status,
    ).toBe('SENT');

    // 模拟崩溃残留：把锁推到过去。
    await app.db
      .update(jobLocks)
      .set({ lockedUntil: utcNowMs() - 10_000, ownerId: 'dead-process' })
      .where(eq(jobLocks.jobName, 'due-notifications'));

    const schedulerNext = startScheduler(app.db, app.log);
    await schedulerNext.runOnce();
    schedulerNext.stop();

    const lock = await app.db
      .select()
      .from(jobLocks)
      .where(eq(jobLocks.jobName, 'due-notifications'));
    expect(lock[0]!.ownerId).not.toBe('dead-process');
    expect(lock[0]!.ownerId).not.toBe('');
  });
});

// 本地时区钟面 hour:minute 对应的 UTC 时间戳（Asia/Shanghai = +8，与实现同一 P0 假设）。
function localAt(hour: number, minute: number): number {
  const tz = 480;
  const nowLocal = new Date(utcNowMs() + tz * 60_000);
  const target = new Date(nowLocal);
  target.setUTCHours(hour, minute, 0, 0);
  if (target.getTime() > nowLocal.getTime()) {
    target.setUTCDate(target.getUTCDate() - 1);
  }
  return target.getTime() - tz * 60_000;
}
