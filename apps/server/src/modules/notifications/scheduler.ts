import {
  healthEvents,
  healthReminders,
  jobLocks,
  notificationPreferences,
  notifications,
  scheduledNotifications,
  families,
  familyAnniversaries,
  familyMembers,
} from '@runew/db';
import type { schema } from '@runew/db';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, eq, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { FastifyBaseLogger } from 'fastify';
import { effectiveFireAt, isInDnd } from './dnd.js';
import { reconcileGemBalance } from '../gems/service.js';

type Database = LibSQLDatabase<typeof schema>;

// Technical Design §37：due notifications 每 60 秒。工程默认值，可按部署调整。
export const SCAN_INTERVAL_MS = 60_000;
// 锁持有时间覆盖最长一轮扫描；进程崩溃锁自动过期，重启后可安全接管。
const LOCK_TTL_MS = 55_000;
const GEM_RECONCILE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const JOB_DUE_NOTIFICATIONS = 'due-notifications';
const JOB_EXPIRE_EVENTS = 'expire-health-events';
const JOB_RECONCILE_GEMS = 'reconcile-gem-balances';
const JOB_SCHEDULE_ANNIVERSARIES = 'schedule-anniversary-notifications';

// P0 只支持固定偏移（Asia/Shanghai = +8）；多时区用户在 preferences 加列即可。
const P0_TZ_OFFSET_MINUTES = 480;

const EVENT_TYPE_LABELS: Record<string, string> = {
  CHECKUP: '体检',
  VACCINE: '疫苗',
  VISIT: '就诊',
  DENTAL: '牙科',
  MEDICATION: '用药提醒',
  OTHER: '健康事项',
};

function minutesOf(timestampMs: number, offsetMinutes: number): number {
  const localMs = timestampMs + offsetMinutes * 60_000;
  return Math.floor((localMs % 86_400_000) / 60_000);
}

function nextAnniversaryOccurrence(date: string, now: number): { key: string; fireAt: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const monthText = match[2];
  const dayText = match[3];
  if (!monthText || !dayText) return null;
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const localYear = new Date(now + P0_TZ_OFFSET_MINUTES * 60_000).getUTCFullYear();
  for (let year = localYear; year <= localYear + 4; year += 1) {
    const candidateDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > candidateDay) continue;
    const candidate = Date.UTC(year, month - 1, day, 1, 0, 0);
    if (candidate > now) {
      return { key: `${year}-${monthText}-${dayText}`, fireAt: candidate };
    }
  }
  return null;
}

async function scheduleAnniversaryNotifications(db: Database, now: number) {
  const rows = await db
    .select({ anniversary: familyAnniversaries, member: familyMembers })
    .from(familyAnniversaries)
    .innerJoin(
      familyMembers,
      and(
        eq(familyMembers.familyId, familyAnniversaries.familyId),
        eq(familyMembers.status, 'ACTIVE'),
      ),
    );
  let scheduled = 0;
  const prefCache = new Map<string, Awaited<ReturnType<typeof loadPrefs>>>();
  for (const row of rows) {
    let prefs = prefCache.get(row.member.userId);
    if (!prefs) {
      prefs = await loadPrefs(db, row.member.userId);
      prefCache.set(row.member.userId, prefs);
    }
    if (!prefs.anniversariesEnabled) continue;
    const occurrence = nextAnniversaryOccurrence(row.anniversary.date, now);
    if (occurrence === null) continue;
    const previous = await db
      .select({ occurrenceKey: scheduledNotifications.occurrenceKey })
      .from(scheduledNotifications)
      .where(
        and(
          eq(scheduledNotifications.userId, row.member.userId),
          eq(scheduledNotifications.sourceType, 'FAMILY_ANNIVERSARY'),
          eq(scheduledNotifications.sourceId, row.anniversary.id),
          eq(scheduledNotifications.status, 'SCHEDULED'),
          or(
            isNull(scheduledNotifications.occurrenceKey),
            ne(scheduledNotifications.occurrenceKey, occurrence.key),
          ),
        ),
      );
    if (previous.length > 0) {
      await db
        .update(scheduledNotifications)
        .set({ status: 'CANCELED', updatedAt: now })
        .where(
          and(
            eq(scheduledNotifications.userId, row.member.userId),
            eq(scheduledNotifications.sourceType, 'FAMILY_ANNIVERSARY'),
            eq(scheduledNotifications.sourceId, row.anniversary.id),
            eq(scheduledNotifications.status, 'SCHEDULED'),
            or(
              isNull(scheduledNotifications.occurrenceKey),
              ne(scheduledNotifications.occurrenceKey, occurrence.key),
            ),
          ),
        );
    }
    const result = await db
      .insert(scheduledNotifications)
      .values({
        id: createUlid(),
        userId: row.member.userId,
        familyId: row.anniversary.familyId,
        category: 'ANNIVERSARIES',
        sourceType: 'FAMILY_ANNIVERSARY',
        sourceId: row.anniversary.id,
        fireAt: occurrence.fireAt,
        occurrenceKey: occurrence.key,
        dndOverride: false,
        status: 'SCHEDULED',
        attempts: 0,
        lastErrorCode: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    scheduled += result.rowsAffected;
  }
  return scheduled;
}

async function loadPrefs(db: Database, userId: string) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);
  const row = rows[0];
  return {
    window: {
      enabled: row?.dndEnabled ?? true,
      startMinute: row?.dndStartMinute ?? 21 * 60,
      endMinute: row?.dndEndMinute ?? 8 * 60,
    },
    healthEnabled: row?.healthEnabled ?? true,
    anniversariesEnabled: row?.anniversariesEnabled ?? true,
  };
}

async function setScheduledStatus(
  db: Database,
  id: string,
  status: 'CANCELED',
  now: number,
) {
  await db
    .update(scheduledNotifications)
    .set({ status, updatedAt: now })
    .where(
      and(
        eq(scheduledNotifications.id, id),
        eq(scheduledNotifications.status, 'SCHEDULED'),
      ),
    );
}

// 事务内派发：写 notifications 与置 SENT 同一事务，崩溃只留下「要么发了、要么还是 SCHEDULED」。
// 幂等来源：状态翻转带 status='SCHEDULED' 守卫，Job 重跑不会产生第二条通知。
async function dispatchOne(
  db: Database,
  item: typeof scheduledNotifications.$inferSelect,
  now: number,
) {
  if (item.sourceType === 'FAMILY_ANNIVERSARY') {
    const rows = await db
      .select({ title: familyAnniversaries.title, date: familyAnniversaries.date })
      .from(familyAnniversaries)
      .innerJoin(
        familyMembers,
        and(
          eq(familyMembers.familyId, familyAnniversaries.familyId),
          eq(familyMembers.userId, item.userId),
          eq(familyMembers.status, 'ACTIVE'),
        ),
      )
      .where(
        and(
          eq(familyAnniversaries.id, item.sourceId),
          eq(familyAnniversaries.familyId, item.familyId ?? ''),
        ),
      )
      .limit(1);
    const source = rows[0];
    if (!source || !item.occurrenceKey || item.occurrenceKey.slice(4) !== source.date.slice(4)) {
      await setScheduledStatus(db, item.id, 'CANCELED', now);
      return 'canceled' as const;
    }
    try {
      await db.transaction(async (tx) => {
        await tx.insert(notifications).values({
          id: createUlid(),
          userId: item.userId,
          familyId: item.familyId,
          category: item.category,
          title: '家庭纪念日',
          body: `${source.title}，今天一起记住这份共同记忆`,
          targetType: 'FAMILY_ANNIVERSARY',
          targetId: item.sourceId,
          payloadJson: null,
          createdAt: now,
        });
        const updated = await tx
          .update(scheduledNotifications)
          .set({ status: 'SENT', attempts: item.attempts + 1, updatedAt: now })
          .where(
            and(
              eq(scheduledNotifications.id, item.id),
              eq(scheduledNotifications.status, 'SCHEDULED'),
            ),
          );
        if (updated.rowsAffected !== 1) throw new Error('RACE_LOST');
      });
      return 'delivered' as const;
    } catch (error) {
      if (error instanceof Error && error.message === 'RACE_LOST') return 'skipped' as const;
      throw error;
    }
  }
  // sourceId 是 health_reminders.id；join 出事件取标题。提醒被删或事件被删 → 作废。
  const rows = await db
    .select({
      eventId: healthEvents.id,
      eventTitle: healthEvents.title,
      eventType: healthEvents.eventType,
    })
    .from(healthReminders)
    .innerJoin(healthEvents, eq(healthEvents.id, healthReminders.healthEventId))
    .where(
      and(
        eq(healthReminders.id, item.sourceId),
        eq(healthReminders.status, 'SCHEDULED'),
        eq(healthEvents.status, 'UPCOMING'),
        sql`${healthEvents.deletedAt} IS NULL`,
      ),
    )
    .limit(1);
  const source = rows[0];
  if (!source) {
    await setScheduledStatus(db, item.id, 'CANCELED', now);
    return 'canceled' as const;
  }

  const label = EVENT_TYPE_LABELS[source.eventType] ?? '健康事项';
  try {
    await db.transaction(async (tx) => {
      await tx.insert(notifications).values({
        id: createUlid(),
        userId: item.userId,
        familyId: item.familyId,
        category: item.category,
        title: label,
        body: `${source.eventTitle}的时间快到了`,
        targetType: 'HEALTH_EVENT',
        targetId: source.eventId,
        payloadJson: null,
        createdAt: now,
      });
      const updated = await tx
        .update(scheduledNotifications)
        .set({ status: 'SENT', attempts: item.attempts + 1, updatedAt: now })
        .where(
          and(
            eq(scheduledNotifications.id, item.id),
            eq(scheduledNotifications.status, 'SCHEDULED'),
          ),
        );
      if (updated.rowsAffected !== 1) {
        throw new Error('RACE_LOST');
      }
    });
    return 'delivered' as const;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'RACE_LOST') {
      // 另一个进程/上一轮已发送：幂等守卫生效，不算失败。
      return 'skipped' as const;
    }
    throw error;
  }
}

async function dispatchDue(db: Database, now: number, logger: FastifyBaseLogger) {
  const due = await db
    .select()
    .from(scheduledNotifications)
    .where(
      and(
        eq(scheduledNotifications.status, 'SCHEDULED'),
        lte(scheduledNotifications.fireAt, now),
      ),
    )
    .limit(200);

  let delivered = 0;
  let deferred = 0;

  const prefCache = new Map<string, Awaited<ReturnType<typeof loadPrefs>>>();

  for (const item of due) {
    let prefs = prefCache.get(item.userId);
    if (!prefs) {
      prefs = await loadPrefs(db, item.userId);
      prefCache.set(item.userId, prefs);
    }

    // 用户关闭健康类通知：作废而不是无限推迟。
    if (
      (item.category === 'HEALTH' && !prefs.healthEnabled) ||
      (item.category === 'ANNIVERSARY' && !prefs.anniversariesEnabled)
    ) {
      await setScheduledStatus(db, item.id, 'CANCELED', now);
      continue;
    }

    // DND：普通提醒推迟到 DND 结束那一刻；allowDndOverride 的健康提醒原时点发送。
    if (
      isInDnd(prefs.window, minutesOf(item.fireAt, P0_TZ_OFFSET_MINUTES)) &&
      !item.dndOverride
    ) {
      const effective = effectiveFireAt(
        prefs.window,
        item.fireAt,
        item.dndOverride,
        P0_TZ_OFFSET_MINUTES,
      );
      if (effective > item.fireAt) {
        await db
          .update(scheduledNotifications)
          .set({ fireAt: effective, updatedAt: now })
          .where(
            and(
              eq(scheduledNotifications.id, item.id),
              eq(scheduledNotifications.status, 'SCHEDULED'),
            ),
          );
        deferred += 1;
        continue;
      }
    }

    try {
      const outcome = await dispatchOne(db, item, now);
      if (outcome === 'delivered') delivered += 1;
    } catch (error) {
      // 失败记录留在 scheduled_notifications（attempts + last_error_code），下一轮重试。
      logger.warn(
        { err: error, id: item.id },
        'scheduler: dispatch failed, will retry',
      );
      await db
        .update(scheduledNotifications)
        .set({
          attempts: item.attempts + 1,
          lastErrorCode: 'DISPATCH_FAILED',
          updatedAt: now,
        })
        .where(
          and(
            eq(scheduledNotifications.id, item.id),
            eq(scheduledNotifications.status, 'SCHEDULED'),
          ),
        );
    }
  }
  return { delivered, deferred, scanned: due.length };
}

// 已到点未完成的事项翻 EXPIRED：单条状态翻转天然幂等，不需要事务。
async function expireOverdueEvents(db: Database, now: number): Promise<number> {
  const result = await db
    .update(healthEvents)
    .set({ status: 'EXPIRED', updatedAt: now })
    .where(
      and(
        eq(healthEvents.status, 'UPCOMING'),
        lte(healthEvents.scheduledAt, now),
        sql`${healthEvents.deletedAt} IS NULL`,
      ),
    );
  return result.rowsAffected;
}

// job_locks：UPDATE ... WHERE locked_until <= now 抢锁。抢到的进程执行，抢不到跳过。
// 崩溃的进程锁会过期，下一个 tick 任何实例都能重新抢到——Restart-safe 的关键。
async function acquireJobLock(
  db: Database,
  jobName: string,
  now: number,
  ownerId: string,
) {
  // 锁行不存在时先 seed，保证首次可抢。
  await db
    .insert(jobLocks)
    .values({ jobName, lockedUntil: 0, ownerId })
    .onConflictDoNothing();
  const result = await db
    .update(jobLocks)
    .set({ lockedUntil: now + LOCK_TTL_MS, ownerId, lastRunAt: now, lastError: null })
    .where(and(eq(jobLocks.jobName, jobName), lte(jobLocks.lockedUntil, now)));
  return result.rowsAffected === 1;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function runLockedJob<T>(
  db: Database,
  jobName: string,
  now: number,
  ownerId: string,
  run: () => Promise<T>,
  successIntervalMs = LOCK_TTL_MS,
): Promise<T | null> {
  if (!(await acquireJobLock(db, jobName, now, ownerId))) return null;
  try {
    const result = await run();
    await db
      .update(jobLocks)
      // 成功后持久化下次运行时间；失败保留短锁，重启后也能重试。
      .set({ lastError: null, lockedUntil: now + successIntervalMs })
      .where(and(eq(jobLocks.jobName, jobName), eq(jobLocks.ownerId, ownerId)));
    return result;
  } catch (error) {
    await db
      .update(jobLocks)
      .set({ lastError: errorMessage(error) })
      .where(eq(jobLocks.jobName, jobName));
    throw error;
  }
}

export interface SchedulerHandle {
  stop(): void;
  runOnce(): Promise<void>;
}

export function startScheduler(
  db: Database,
  logger: FastifyBaseLogger,
): SchedulerHandle {
  const ownerId = createUlid();
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  async function tick() {
    if (running) return; // 同进程防重入
    running = true;
    try {
      const now = utcNowMs();
      try {
        const scheduled = await runLockedJob(
          db,
          JOB_SCHEDULE_ANNIVERSARIES,
          now,
          ownerId,
          () => scheduleAnniversaryNotifications(db, now),
        );
        if (scheduled && scheduled > 0)
          logger.info({ scheduled }, 'scheduler: anniversary notifications scheduled');
      } catch (error) {
        logger.error(
          { err: error, jobName: JOB_SCHEDULE_ANNIVERSARIES },
          'scheduler job failed',
        );
      }
      try {
        const result = await runLockedJob(db, JOB_DUE_NOTIFICATIONS, now, ownerId, () =>
          dispatchDue(db, now, logger),
        );
        if (result === null) return;
        if (result.delivered || result.deferred) {
          logger.info(result, 'scheduler: due notifications processed');
        }
      } catch (error) {
        logger.error(
          { err: error, jobName: JOB_DUE_NOTIFICATIONS },
          'scheduler job failed',
        );
        return;
      }
      try {
        const reconciled = await runLockedJob(db, JOB_RECONCILE_GEMS, utcNowMs(), ownerId, async () => {
          const rows = await db.select({ id: families.id }).from(families);
          for (const row of rows) await reconcileGemBalance(db, row.id);
          return rows.length;
        }, GEM_RECONCILE_INTERVAL_MS);
        if (reconciled && reconciled > 0) logger.info({ families: reconciled }, 'scheduler: gem balances reconciled');
      } catch (error) {
        logger.error({ err: error, jobName: JOB_RECONCILE_GEMS }, 'scheduler job failed');
      }
      const expireNow = utcNowMs();
      try {
        const expired = await runLockedJob(
          db,
          JOB_EXPIRE_EVENTS,
          expireNow,
          ownerId,
          () => expireOverdueEvents(db, expireNow),
        );
        if (expired && expired > 0)
          logger.info({ expired }, 'scheduler: health events expired');
      } catch (error) {
        logger.error(
          { err: error, jobName: JOB_EXPIRE_EVENTS },
          'scheduler job failed',
        );
      }
    } finally {
      running = false;
    }
  }

  timer = setInterval(() => void tick(), SCAN_INTERVAL_MS);
  timer.unref?.();

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    runOnce: tick,
  };
}
