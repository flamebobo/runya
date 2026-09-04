import {
  diaperRecords,
  feedingRecords,
  feedingSegments,
  foodRecords,
  sleepRecords,
} from '@runew/db';
import type { schema } from '@runew/db';
import type {
  CreateBottleBody,
  CreateDiaperBody,
  CreateFoodBody,
  CreateSleepBody,
  FeedingPublic,
  FeedingSegmentPublic,
  FinishSleepBody,
  RecordStatsQuery,
  RecordStatsResponse,
  SleepPublic,
  StartBreastBody,
  StartSleepBody,
  SwitchBreastBody,
  TimelineItem,
  TimelineQuery,
  TimelineResponse,
  UpdateDiaperBody,
  UpdateFeedingBody,
  UpdateFoodBody,
  UpdateSleepBody,
} from '@runew/contracts';
import {
  BreastSide,
  DiaperType,
  FeedingStatus,
  FeedingType,
  RecordKind,
  SleepStatus,
} from '@runew/domain-types';
import {
  createUlid,
  decodeCursor,
  elapsedSecondsFromRange,
  encodeCursor,
  feedingElapsedSeconds,
  formatDurationLabel,
  utcNowMs,
} from '@runew/shared-utils';
import { and, asc, desc, eq, gte, isNull, lt, lte, or } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import { appendSyncLog } from '../sync/log.js';
import { awardRecordGem } from '../gems/service.js';
import { requireBabyInFamily } from '../identity/service.js';

type Database = LibSQLDatabase<typeof schema>;
const DEFAULT_TZ = 'Asia/Shanghai';
const MAX_SLEEP_MS = 48 * 60 * 60 * 1000;

function assertVersion(current: number, expected: number | null) {
  if (expected === null) {
    throw new AppError('VALIDATION_ERROR', '缺少 If-Match', 400);
  }
  if (expected !== current) {
    throw new AppError('CONFLICT', '记录已被更新，请刷新后再试', 409);
  }
}

function oppositeSide(side: string) {
  return side === BreastSide.LEFT ? BreastSide.RIGHT : BreastSide.LEFT;
}

function diaperLabel(type: string) {
  if (type === DiaperType.WET) return '湿';
  if (type === DiaperType.DIRTY) return '便';
  if (type === DiaperType.BOTH) return '湿+便';
  return '干';
}

function milkLabel(type: string | null) {
  if (type === 'FORMULA') return '配方奶';
  if (type === 'BREAST_MILK') return '母乳';
  if (type === 'MIXED') return '混合';
  return null;
}

function isUniqueFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNIQUE') || message.includes('uq_sleep_running_per_baby');
}

function mapSegment(row: typeof feedingSegments.$inferSelect): FeedingSegmentPublic {
  return {
    id: row.id,
    feedingRecordId: row.feedingRecordId,
    side: row.side as FeedingSegmentPublic['side'],
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
    sequenceNo: row.sequenceNo,
  };
}

export function mapFeeding(
  row: typeof feedingRecords.$inferSelect,
  segments: Array<typeof feedingSegments.$inferSelect>,
  now = utcNowMs(),
): FeedingPublic {
  const mappedSegments = segments.map(mapSegment);
  const liveDuration =
    row.status === FeedingStatus.COMPLETED
      ? row.durationSeconds
      : feedingElapsedSeconds(mappedSegments, now);

  return {
    id: row.id,
    familyId: row.familyId,
    babyId: row.babyId,
    feedingType: row.feedingType as FeedingPublic['feedingType'],
    milkType: (row.milkType as FeedingPublic['milkType']) ?? null,
    amountMl: row.amountMl,
    status: row.status as FeedingPublic['status'],
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: liveDuration,
    recordedAt: row.recordedAt,
    timezoneName: row.timezoneName,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    version: row.version,
    segments: mappedSegments,
  };
}

export function mapSleep(row: typeof sleepRecords.$inferSelect, now = utcNowMs()) {
  const liveDuration =
    row.status === SleepStatus.COMPLETED
      ? row.durationSeconds
      : elapsedSecondsFromRange(row.startedAt, row.endedAt, now);

  return {
    id: row.id,
    familyId: row.familyId,
    babyId: row.babyId,
    status: row.status as SleepPublic['status'],
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: liveDuration,
    startTimezone: row.startTimezone,
    endTimezone: row.endTimezone,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    version: row.version,
  } satisfies SleepPublic;
}

export function mapDiaper(row: typeof diaperRecords.$inferSelect) {
  return {
    id: row.id,
    familyId: row.familyId,
    babyId: row.babyId,
    diaperType: row.diaperType as 'WET' | 'DIRTY' | 'BOTH' | 'DRY',
    stoolColor: row.stoolColor,
    stoolTexture: row.stoolTexture,
    recordedAt: row.recordedAt,
    timezoneName: row.timezoneName,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export function mapFood(row: typeof foodRecords.$inferSelect) {
  return {
    id: row.id,
    familyId: row.familyId,
    babyId: row.babyId,
    foodName: row.foodName,
    amountText: row.amountText,
    reaction: row.reaction,
    preference: row.preference,
    recordedAt: row.recordedAt,
    timezoneName: row.timezoneName,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

async function loadSegments(db: Database, feedingId: string) {
  return db
    .select()
    .from(feedingSegments)
    .where(eq(feedingSegments.feedingRecordId, feedingId))
    .orderBy(asc(feedingSegments.sequenceNo));
}

async function getFeedingRow(db: Database, feedingId: string) {
  const rows = await db
    .select()
    .from(feedingRecords)
    .where(and(eq(feedingRecords.id, feedingId), isNull(feedingRecords.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', '喂奶记录不存在', 404);
  }
  return row;
}

async function getSleepRow(db: Database, sleepId: string) {
  const rows = await db
    .select()
    .from(sleepRecords)
    .where(and(eq(sleepRecords.id, sleepId), isNull(sleepRecords.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new AppError('NOT_FOUND', '睡眠记录不存在', 404);
  }
  return row;
}

async function requireFeedingAccess(db: Database, userId: string, feedingId: string) {
  const row = await getFeedingRow(db, feedingId);
  await requireBabyInFamily(db, userId, row.babyId);
  const segments = await loadSegments(db, feedingId);
  return { row, segments };
}

async function requireSleepAccess(db: Database, userId: string, sleepId: string) {
  const row = await getSleepRow(db, sleepId);
  await requireBabyInFamily(db, userId, row.babyId);
  return row;
}

function openSegment(segments: Array<typeof feedingSegments.$inferSelect>) {
  return [...segments].reverse().find((segment) => segment.endedAt == null) ?? null;
}

function closeSegmentValues(
  segment: typeof feedingSegments.$inferSelect,
  endedAt: number,
) {
  return {
    endedAt,
    durationSeconds: elapsedSecondsFromRange(segment.startedAt, endedAt, endedAt),
  };
}

export async function getRunningForBaby(db: Database, babyId: string) {
  const sleepRows = await db
    .select()
    .from(sleepRecords)
    .where(
      and(
        eq(sleepRecords.babyId, babyId),
        eq(sleepRecords.status, SleepStatus.RUNNING),
        isNull(sleepRecords.deletedAt),
      ),
    )
    .limit(1);

  const feedingRows = await db
    .select()
    .from(feedingRecords)
    .where(
      and(
        eq(feedingRecords.babyId, babyId),
        or(
          eq(feedingRecords.status, FeedingStatus.RUNNING),
          eq(feedingRecords.status, FeedingStatus.PAUSED),
        ),
        isNull(feedingRecords.deletedAt),
      ),
    )
    .limit(1);

  const feeding = feedingRows[0];
  return {
    sleep: sleepRows[0] ? mapSleep(sleepRows[0]) : null,
    feeding: feeding ? mapFeeding(feeding, await loadSegments(db, feeding.id)) : null,
  };
}

export async function createBottleFeeding(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateBottleBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  const recordedAt = body.recordedAt ?? now;
  const id = createUlid();

  await db.transaction(async (tx) => {
    await tx.insert(feedingRecords).values({
      id,
      familyId: baby.familyId,
      babyId,
      feedingType: FeedingType.BOTTLE,
      milkType: body.milkType ?? null,
      amountMl: body.amountMl,
      status: FeedingStatus.COMPLETED,
      startedAt: recordedAt,
      endedAt: recordedAt,
      durationSeconds: 0,
      recordedAt,
      timezoneName: body.timezoneName ?? DEFAULT_TZ,
      note: body.note ?? null,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
    });
    await awardRecordGem(tx, baby.familyId, userId, 'FEEDING_RECORD', id, now);
    await appendSyncLog(
      tx,
      {
        operationId: createUlid(),
        familyId: baby.familyId,
        actorUserId: userId,
        deviceId: null,
        entityType: 'FEEDING_RECORD',
        entityId: id,
        op: 'CREATE',
        entityVersion: 1,
      },
      now,
    );
  });

  return mapFeeding(await getFeedingRow(db, id), []);
}

export async function startBreastFeeding(
  db: Database,
  userId: string,
  babyId: string,
  body: StartBreastBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const running = await getRunningForBaby(db, babyId);
  if (running.feeding) {
    throw new AppError('CONFLICT', '已经有一次喂奶正在进行', 409);
  }

  const now = utcNowMs();
  const startedAt = body.startedAt ?? now;
  const feedingId = createUlid();
  const segmentId = createUlid();
  const side = body.side ?? BreastSide.LEFT;

  await db.transaction(async (tx) => {
    await tx.insert(feedingRecords).values({
      id: feedingId,
      familyId: baby.familyId,
      babyId,
      feedingType: FeedingType.BREAST,
      milkType: 'BREAST_MILK',
      amountMl: null,
      status: FeedingStatus.RUNNING,
      startedAt,
      endedAt: null,
      durationSeconds: null,
      recordedAt: startedAt,
      timezoneName: body.timezoneName ?? DEFAULT_TZ,
      note: body.note ?? null,
      createdBy: userId,
      createdAt: now,
      updatedBy: userId,
      updatedAt: now,
    });
    await tx.insert(feedingSegments).values({
      id: segmentId,
      feedingRecordId: feedingId,
      side,
      startedAt,
      endedAt: null,
      durationSeconds: null,
      sequenceNo: 1,
      createdAt: now,
    });
    await awardRecordGem(tx, baby.familyId, userId, 'FEEDING_RECORD', feedingId, now);
    await appendSyncLog(
      tx,
      {
        operationId: createUlid(),
        familyId: baby.familyId,
        actorUserId: userId,
        deviceId: null,
        entityType: 'FEEDING_RECORD',
        entityId: feedingId,
        op: 'CREATE',
        entityVersion: 1,
      },
      now,
    );
  });

  const { row, segments } = await requireFeedingAccess(db, userId, feedingId);
  return mapFeeding(row, segments);
}

async function mutateBreast(
  db: Database,
  userId: string,
  feedingId: string,
  action: 'switch' | 'pause' | 'resume' | 'finish',
  body?: SwitchBreastBody,
) {
  const { row, segments } = await requireFeedingAccess(db, userId, feedingId);
  if (row.feedingType !== FeedingType.BREAST) {
    throw new AppError('VALIDATION_ERROR', '只有母乳记录可以计时', 400);
  }

  const now = utcNowMs();
  const current = openSegment(segments);
  const last = segments[segments.length - 1];

  if (action === 'switch') {
    if (row.status !== FeedingStatus.RUNNING || !current) {
      throw new AppError('VALIDATION_ERROR', '请先继续计时再换边', 400);
    }
    const nextSide = body?.side ?? oppositeSide(current.side);
    if (nextSide === current.side) {
      return mapFeeding(row, segments, now);
    }
    const closed = closeSegmentValues(current, now);
    await db.transaction(async (tx) => {
      await tx
        .update(feedingSegments)
        .set(closed)
        .where(eq(feedingSegments.id, current.id));
      await tx.insert(feedingSegments).values({
        id: createUlid(),
        feedingRecordId: feedingId,
        side: nextSide,
        startedAt: now,
        endedAt: null,
        durationSeconds: null,
        sequenceNo: current.sequenceNo + 1,
        createdAt: now,
      });
      await tx
        .update(feedingRecords)
        .set({ updatedBy: userId, updatedAt: now, version: row.version + 1 })
        .where(eq(feedingRecords.id, feedingId));
    });
  }

  if (action === 'pause') {
    if (row.status !== FeedingStatus.RUNNING) {
      throw new AppError('VALIDATION_ERROR', '现在没有正在计时的喂奶', 400);
    }
    await db.transaction(async (tx) => {
      if (current) {
        await tx
          .update(feedingSegments)
          .set(closeSegmentValues(current, now))
          .where(eq(feedingSegments.id, current.id));
      }
      await tx
        .update(feedingRecords)
        .set({
          status: FeedingStatus.PAUSED,
          updatedBy: userId,
          updatedAt: now,
          version: row.version + 1,
        })
        .where(eq(feedingRecords.id, feedingId));
    });
  }

  if (action === 'resume') {
    if (row.status !== FeedingStatus.PAUSED) {
      throw new AppError('VALIDATION_ERROR', '喂奶还没有暂停', 400);
    }
    if (current) {
      throw new AppError('CONFLICT', '喂奶计时状态不一致', 409);
    }
    await db.transaction(async (tx) => {
      await tx.insert(feedingSegments).values({
        id: createUlid(),
        feedingRecordId: feedingId,
        side: last?.side ?? BreastSide.LEFT,
        startedAt: now,
        endedAt: null,
        durationSeconds: null,
        sequenceNo: (last?.sequenceNo ?? 0) + 1,
        createdAt: now,
      });
      await tx
        .update(feedingRecords)
        .set({
          status: FeedingStatus.RUNNING,
          updatedBy: userId,
          updatedAt: now,
          version: row.version + 1,
        })
        .where(eq(feedingRecords.id, feedingId));
    });
  }

  if (action === 'finish') {
    if (row.status === FeedingStatus.COMPLETED) {
      throw new AppError('VALIDATION_ERROR', '这次喂奶已经结束', 400);
    }
    await db.transaction(async (tx) => {
      if (current) {
        await tx
          .update(feedingSegments)
          .set(closeSegmentValues(current, now))
          .where(eq(feedingSegments.id, current.id));
      }
      const nextSegments = await tx
        .select()
        .from(feedingSegments)
        .where(eq(feedingSegments.feedingRecordId, feedingId));
      const durationSeconds = feedingElapsedSeconds(
        nextSegments.map((segment) => ({
          startedAt: segment.startedAt,
          endedAt: segment.endedAt,
        })),
        now,
      );
      await tx
        .update(feedingRecords)
        .set({
          status: FeedingStatus.COMPLETED,
          endedAt: now,
          durationSeconds,
          updatedBy: userId,
          updatedAt: now,
          version: row.version + 1,
        })
        .where(eq(feedingRecords.id, feedingId));
    });
  }

  const updated = await requireFeedingAccess(db, userId, feedingId);
  return mapFeeding(updated.row, updated.segments);
}

export function switchBreast(
  db: Database,
  userId: string,
  feedingId: string,
  body: SwitchBreastBody,
) {
  return mutateBreast(db, userId, feedingId, 'switch', body);
}

export function pauseBreast(db: Database, userId: string, feedingId: string) {
  return mutateBreast(db, userId, feedingId, 'pause');
}

export function resumeBreast(db: Database, userId: string, feedingId: string) {
  return mutateBreast(db, userId, feedingId, 'resume');
}

export function finishBreast(db: Database, userId: string, feedingId: string) {
  return mutateBreast(db, userId, feedingId, 'finish');
}

export async function getFeeding(db: Database, userId: string, feedingId: string) {
  const { row, segments } = await requireFeedingAccess(db, userId, feedingId);
  return mapFeeding(row, segments);
}

export async function updateFeeding(
  db: Database,
  userId: string,
  feedingId: string,
  body: UpdateFeedingBody,
  expectedVersion: number | null,
) {
  const { row, segments } = await requireFeedingAccess(db, userId, feedingId);
  assertVersion(row.version, expectedVersion);
  if (
    row.status !== FeedingStatus.COMPLETED &&
    (body.amountMl !== undefined || body.recordedAt)
  ) {
    throw new AppError('VALIDATION_ERROR', '进行中的喂奶请用计时操作', 400);
  }
  if (row.feedingType === FeedingType.BOTTLE && body.amountMl === null) {
    throw new AppError('VALIDATION_ERROR', '奶瓶需要填写毫升数', 400);
  }

  const now = utcNowMs();
  const recordedAt = body.recordedAt ?? row.recordedAt;
  await db
    .update(feedingRecords)
    .set({
      amountMl: body.amountMl === undefined ? row.amountMl : body.amountMl,
      milkType: body.milkType === undefined ? row.milkType : body.milkType,
      recordedAt,
      startedAt: row.feedingType === FeedingType.BOTTLE ? recordedAt : row.startedAt,
      endedAt: row.feedingType === FeedingType.BOTTLE ? recordedAt : row.endedAt,
      note: body.note === undefined ? row.note : body.note,
      updatedBy: userId,
      updatedAt: now,
      version: row.version + 1,
    })
    .where(eq(feedingRecords.id, feedingId));

  const updated = await getFeedingRow(db, feedingId);
  return mapFeeding(updated, segments);
}

export async function deleteFeeding(db: Database, userId: string, feedingId: string) {
  const { row } = await requireFeedingAccess(db, userId, feedingId);
  const now = utcNowMs();
  await db
    .update(feedingRecords)
    .set({
      deletedAt: now,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: now,
      version: row.version + 1,
    })
    .where(eq(feedingRecords.id, feedingId));
  return { ok: true as const };
}

export async function startSleep(
  db: Database,
  userId: string,
  babyId: string,
  body: StartSleepBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const existing = await getRunningForBaby(db, babyId);
  if (existing.sleep) {
    throw new AppError('CONFLICT', '宝宝已经在睡觉了', 409);
  }

  const now = utcNowMs();
  const startedAt = body.startedAt ?? now;
  const id = createUlid();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(sleepRecords).values({
        id,
        familyId: baby.familyId,
        babyId,
        status: SleepStatus.RUNNING,
        startedAt,
        endedAt: null,
        durationSeconds: null,
        startTimezone: body.timezoneName ?? DEFAULT_TZ,
        endTimezone: null,
        note: body.note ?? null,
        createdBy: userId,
        createdAt: now,
        updatedBy: userId,
        updatedAt: now,
      });
      await awardRecordGem(tx, baby.familyId, userId, 'SLEEP_RECORD', id, now);
      await appendSyncLog(
        tx,
        {
          operationId: createUlid(),
          familyId: baby.familyId,
          actorUserId: userId,
          deviceId: null,
          entityType: 'SLEEP_RECORD',
          entityId: id,
          op: 'CREATE',
          entityVersion: 1,
        },
        now,
      );
    });
  } catch (error) {
    if (isUniqueFailure(error)) {
      throw new AppError('CONFLICT', '宝宝已经在睡觉了', 409);
    }
    throw error;
  }

  return mapSleep(await getSleepRow(db, id));
}

export async function createSleep(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateSleepBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  if (body.endedAt < body.startedAt) {
    throw new AppError('VALIDATION_ERROR', '醒来要比睡着晚一点点', 400);
  }
  if (body.endedAt - body.startedAt > MAX_SLEEP_MS) {
    throw new AppError('VALIDATION_ERROR', '这一觉时间有点太长了，请再检查一下', 400);
  }

  const now = utcNowMs();
  const id = createUlid();
  await db.insert(sleepRecords).values({
    id,
    familyId: baby.familyId,
    babyId,
    status: SleepStatus.COMPLETED,
    startedAt: body.startedAt,
    endedAt: body.endedAt,
    durationSeconds: elapsedSecondsFromRange(
      body.startedAt,
      body.endedAt,
      body.endedAt,
    ),
    startTimezone: body.timezoneName ?? DEFAULT_TZ,
    endTimezone: body.timezoneName ?? DEFAULT_TZ,
    note: body.note ?? null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });
  return mapSleep(await getSleepRow(db, id));
}

export async function finishSleep(
  db: Database,
  userId: string,
  sleepId: string,
  body: FinishSleepBody,
) {
  const row = await requireSleepAccess(db, userId, sleepId);
  if (row.status !== SleepStatus.RUNNING) {
    throw new AppError('VALIDATION_ERROR', '这一觉已经结束了', 400);
  }
  const now = utcNowMs();
  const endedAt = body.endedAt ?? now;
  if (endedAt < row.startedAt) {
    throw new AppError('VALIDATION_ERROR', '醒来要比睡着晚一点点', 400);
  }

  await db
    .update(sleepRecords)
    .set({
      status: SleepStatus.COMPLETED,
      endedAt,
      durationSeconds: elapsedSecondsFromRange(row.startedAt, endedAt, endedAt),
      endTimezone: body.timezoneName ?? row.startTimezone,
      note: body.note === undefined ? row.note : body.note,
      updatedBy: userId,
      updatedAt: now,
      version: row.version + 1,
    })
    .where(eq(sleepRecords.id, sleepId));

  return mapSleep(await getSleepRow(db, sleepId));
}

export async function getSleep(db: Database, userId: string, sleepId: string) {
  return mapSleep(await requireSleepAccess(db, userId, sleepId));
}

export async function updateSleep(
  db: Database,
  userId: string,
  sleepId: string,
  body: UpdateSleepBody,
  expectedVersion: number | null,
) {
  const row = await requireSleepAccess(db, userId, sleepId);
  assertVersion(row.version, expectedVersion);

  const startedAt = body.startedAt ?? row.startedAt;
  const endedAt = body.endedAt === undefined ? row.endedAt : body.endedAt;
  if (row.status === SleepStatus.RUNNING && endedAt) {
    throw new AppError('VALIDATION_ERROR', '进行中的睡眠请用结束操作', 400);
  }
  if (endedAt != null && endedAt < startedAt) {
    throw new AppError('VALIDATION_ERROR', '醒来要比睡着晚一点点', 400);
  }

  const now = utcNowMs();
  await db
    .update(sleepRecords)
    .set({
      startedAt,
      endedAt,
      durationSeconds:
        endedAt != null
          ? elapsedSecondsFromRange(startedAt, endedAt, endedAt)
          : row.durationSeconds,
      note: body.note === undefined ? row.note : body.note,
      updatedBy: userId,
      updatedAt: now,
      version: row.version + 1,
    })
    .where(eq(sleepRecords.id, sleepId));

  return mapSleep(await getSleepRow(db, sleepId));
}

export async function deleteSleep(db: Database, userId: string, sleepId: string) {
  const row = await requireSleepAccess(db, userId, sleepId);
  const now = utcNowMs();
  await db
    .update(sleepRecords)
    .set({
      deletedAt: now,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: now,
      version: row.version + 1,
    })
    .where(eq(sleepRecords.id, sleepId));
  return { ok: true as const };
}

export async function createDiaper(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateDiaperBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  const id = createUlid();
  await db.insert(diaperRecords).values({
    id,
    familyId: baby.familyId,
    babyId,
    diaperType: body.diaperType,
    stoolColor: body.stoolColor ?? null,
    stoolTexture: body.stoolTexture ?? null,
    recordedAt: body.recordedAt ?? now,
    timezoneName: body.timezoneName ?? DEFAULT_TZ,
    note: body.note ?? null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });
  const rows = await db
    .select()
    .from(diaperRecords)
    .where(eq(diaperRecords.id, id))
    .limit(1);
  // 在线创建也进同步日志：离线端 pull 时能看到同一条真相。
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: baby.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'DIAPER_RECORD',
      entityId: id,
      op: 'CREATE',
      entityVersion: 1,
    },
    now,
  );
  return mapDiaper(rows[0]!);
}

export async function getDiaper(db: Database, userId: string, diaperId: string) {
  const rows = await db
    .select()
    .from(diaperRecords)
    .where(and(eq(diaperRecords.id, diaperId), isNull(diaperRecords.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '尿布记录不存在', 404);
  await requireBabyInFamily(db, userId, row.babyId);
  return mapDiaper(row);
}

export async function updateDiaper(
  db: Database,
  userId: string,
  diaperId: string,
  body: UpdateDiaperBody,
  expectedVersion: number | null,
) {
  const current = await getDiaper(db, userId, diaperId);
  assertVersion(current.version, expectedVersion);
  const now = utcNowMs();
  await db
    .update(diaperRecords)
    .set({
      diaperType: body.diaperType ?? current.diaperType,
      stoolColor: body.stoolColor === undefined ? current.stoolColor : body.stoolColor,
      stoolTexture:
        body.stoolTexture === undefined ? current.stoolTexture : body.stoolTexture,
      recordedAt: body.recordedAt ?? current.recordedAt,
      note: body.note === undefined ? current.note : body.note,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(eq(diaperRecords.id, diaperId));
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: current.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'DIAPER_RECORD',
      entityId: diaperId,
      op: 'UPDATE',
      entityVersion: current.version + 1,
      changedFields: Object.keys(body).filter(
        (key) => body[key as keyof UpdateDiaperBody] !== undefined,
      ),
    },
    now,
  );
  return getDiaper(db, userId, diaperId);
}

export async function deleteDiaper(db: Database, userId: string, diaperId: string) {
  const current = await getDiaper(db, userId, diaperId);
  const now = utcNowMs();
  await db
    .update(diaperRecords)
    .set({
      deletedAt: now,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(eq(diaperRecords.id, diaperId));
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: current.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'DIAPER_RECORD',
      entityId: diaperId,
      op: 'DELETE',
      entityVersion: current.version + 1,
    },
    now,
  );
  return { ok: true as const };
}

export async function createFood(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateFoodBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  const id = createUlid();
  await db.insert(foodRecords).values({
    id,
    familyId: baby.familyId,
    babyId,
    foodName: body.foodName,
    amountText: body.amountText ?? null,
    reaction: body.reaction ?? null,
    preference: body.preference ?? null,
    recordedAt: body.recordedAt ?? now,
    timezoneName: body.timezoneName ?? DEFAULT_TZ,
    note: body.note ?? null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });
  const rows = await db
    .select()
    .from(foodRecords)
    .where(eq(foodRecords.id, id))
    .limit(1);
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: baby.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'FOOD_RECORD',
      entityId: id,
      op: 'CREATE',
      entityVersion: 1,
    },
    now,
  );
  return mapFood(rows[0]!);
}

export async function getFood(db: Database, userId: string, foodId: string) {
  const rows = await db
    .select()
    .from(foodRecords)
    .where(and(eq(foodRecords.id, foodId), isNull(foodRecords.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '辅食记录不存在', 404);
  await requireBabyInFamily(db, userId, row.babyId);
  return mapFood(row);
}

export async function updateFood(
  db: Database,
  userId: string,
  foodId: string,
  body: UpdateFoodBody,
  expectedVersion: number | null,
) {
  const current = await getFood(db, userId, foodId);
  assertVersion(current.version, expectedVersion);
  const now = utcNowMs();
  await db
    .update(foodRecords)
    .set({
      foodName: body.foodName ?? current.foodName,
      amountText: body.amountText === undefined ? current.amountText : body.amountText,
      reaction: body.reaction === undefined ? current.reaction : body.reaction,
      preference: body.preference === undefined ? current.preference : body.preference,
      recordedAt: body.recordedAt ?? current.recordedAt,
      note: body.note === undefined ? current.note : body.note,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(eq(foodRecords.id, foodId));
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: current.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'FOOD_RECORD',
      entityId: foodId,
      op: 'UPDATE',
      entityVersion: current.version + 1,
      changedFields: Object.keys(body).filter(
        (key) => body[key as keyof UpdateFoodBody] !== undefined,
      ),
    },
    now,
  );
  return getFood(db, userId, foodId);
}

export async function deleteFood(db: Database, userId: string, foodId: string) {
  const current = await getFood(db, userId, foodId);
  const now = utcNowMs();
  await db
    .update(foodRecords)
    .set({
      deletedAt: now,
      deletedBy: userId,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(eq(foodRecords.id, foodId));
  await appendSyncLog(
    db,
    {
      operationId: createUlid(),
      familyId: current.familyId,
      actorUserId: userId,
      deviceId: null,
      entityType: 'FOOD_RECORD',
      entityId: foodId,
      op: 'DELETE',
      entityVersion: current.version + 1,
    },
    now,
  );
  return { ok: true as const };
}

function feedingTitle(row: typeof feedingRecords.$inferSelect) {
  if (row.feedingType === FeedingType.BOTTLE) {
    const amount = row.amountMl != null ? `${Math.round(row.amountMl)}ml` : '';
    return amount ? `喂奶 · ${amount}` : '喂奶 · 奶瓶';
  }
  const duration =
    row.durationSeconds != null ? formatDurationLabel(row.durationSeconds) : '母乳';
  return `母乳 · ${duration}`;
}

function sleepTitle(row: typeof sleepRecords.$inferSelect) {
  if (row.status === SleepStatus.RUNNING) return '睡着了';
  if (row.durationSeconds != null)
    return `睡着了 · ${formatDurationLabel(row.durationSeconds)}`;
  return '睡着了';
}

function toTimelineItem(row: {
  id: string;
  kind: TimelineItem['kind'];
  recordedAt: number;
  title: string;
  subtitle: string | null;
  status: string | null;
  version: number;
  feedingType?: TimelineItem['feedingType'];
  diaperType?: TimelineItem['diaperType'];
}): TimelineItem {
  return row;
}

export async function listTimeline(
  db: Database,
  userId: string,
  babyId: string,
  query: TimelineQuery,
): Promise<TimelineResponse> {
  await requireBabyInFamily(db, userId, babyId);
  const limit = query.limit;
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const cursorAfter =
    cursor?.after && cursor.afterAt != null
      ? { after: cursor.after, afterAt: cursor.afterAt }
      : null;

  const kind = query.kind;
  const items: TimelineItem[] = [];

  if (kind === 'all' || kind === 'feeding') {
    const conditions = [
      eq(feedingRecords.babyId, babyId),
      isNull(feedingRecords.deletedAt),
      eq(feedingRecords.status, FeedingStatus.COMPLETED),
    ];
    if (query.from != null) conditions.push(gte(feedingRecords.recordedAt, query.from));
    if (query.to != null) conditions.push(lte(feedingRecords.recordedAt, query.to));
    if (cursorAfter) {
      conditions.push(
        or(
          lt(feedingRecords.recordedAt, cursorAfter.afterAt),
          and(
            eq(feedingRecords.recordedAt, cursorAfter.afterAt),
            lt(feedingRecords.id, cursorAfter.after),
          ),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(feedingRecords)
      .where(and(...conditions))
      .orderBy(desc(feedingRecords.recordedAt), desc(feedingRecords.id))
      .limit(limit + 1);
    for (const row of rows) {
      items.push(
        toTimelineItem({
          id: row.id,
          kind: RecordKind.FEEDING,
          recordedAt: row.recordedAt,
          title: feedingTitle(row),
          subtitle: milkLabel(row.milkType),
          status: row.status,
          version: row.version,
          feedingType: row.feedingType as TimelineItem['feedingType'],
        }),
      );
    }
  }

  if (kind === 'all' || kind === 'sleep') {
    const conditions = [
      eq(sleepRecords.babyId, babyId),
      isNull(sleepRecords.deletedAt),
      eq(sleepRecords.status, SleepStatus.COMPLETED),
    ];
    if (query.from != null && query.to != null) {
      conditions.push(lte(sleepRecords.startedAt, query.to));
      conditions.push(gte(sleepRecords.endedAt, query.from));
    } else if (query.from != null) {
      conditions.push(gte(sleepRecords.endedAt, query.from));
    } else if (query.to != null) {
      conditions.push(lte(sleepRecords.startedAt, query.to));
    }
    if (cursorAfter) {
      conditions.push(
        or(
          lt(sleepRecords.startedAt, cursorAfter.afterAt),
          and(
            eq(sleepRecords.startedAt, cursorAfter.afterAt),
            lt(sleepRecords.id, cursorAfter.after),
          ),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(sleepRecords)
      .where(and(...conditions))
      .orderBy(desc(sleepRecords.startedAt), desc(sleepRecords.id))
      .limit(limit + 1);
    for (const row of rows) {
      items.push(
        toTimelineItem({
          id: row.id,
          kind: RecordKind.SLEEP,
          recordedAt: row.startedAt,
          title: sleepTitle(row),
          subtitle: null,
          status: row.status,
          version: row.version,
        }),
      );
    }
  }

  if (kind === 'all' || kind === 'diaper') {
    const conditions = [
      eq(diaperRecords.babyId, babyId),
      isNull(diaperRecords.deletedAt),
    ];
    if (query.from != null) conditions.push(gte(diaperRecords.recordedAt, query.from));
    if (query.to != null) conditions.push(lte(diaperRecords.recordedAt, query.to));
    if (cursorAfter) {
      conditions.push(
        or(
          lt(diaperRecords.recordedAt, cursorAfter.afterAt),
          and(
            eq(diaperRecords.recordedAt, cursorAfter.afterAt),
            lt(diaperRecords.id, cursorAfter.after),
          ),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(diaperRecords)
      .where(and(...conditions))
      .orderBy(desc(diaperRecords.recordedAt), desc(diaperRecords.id))
      .limit(limit + 1);
    for (const row of rows) {
      items.push(
        toTimelineItem({
          id: row.id,
          kind: RecordKind.DIAPER,
          recordedAt: row.recordedAt,
          title: `尿布 · ${diaperLabel(row.diaperType)}`,
          subtitle: null,
          status: null,
          version: row.version,
          diaperType: row.diaperType as TimelineItem['diaperType'],
        }),
      );
    }
  }

  if (kind === 'all' || kind === 'food') {
    const conditions = [eq(foodRecords.babyId, babyId), isNull(foodRecords.deletedAt)];
    if (query.from != null) conditions.push(gte(foodRecords.recordedAt, query.from));
    if (query.to != null) conditions.push(lte(foodRecords.recordedAt, query.to));
    if (cursorAfter) {
      conditions.push(
        or(
          lt(foodRecords.recordedAt, cursorAfter.afterAt),
          and(
            eq(foodRecords.recordedAt, cursorAfter.afterAt),
            lt(foodRecords.id, cursorAfter.after),
          ),
        )!,
      );
    }
    const rows = await db
      .select()
      .from(foodRecords)
      .where(and(...conditions))
      .orderBy(desc(foodRecords.recordedAt), desc(foodRecords.id))
      .limit(limit + 1);
    for (const row of rows) {
      items.push(
        toTimelineItem({
          id: row.id,
          kind: RecordKind.FOOD,
          recordedAt: row.recordedAt,
          title: row.amountText
            ? `辅食 · ${row.foodName} ${row.amountText}`
            : `辅食 · ${row.foodName}`,
          subtitle: row.reaction,
          status: null,
          version: row.version,
        }),
      );
    }
  }

  items.sort((a, b) => {
    if (b.recordedAt !== a.recordedAt) return b.recordedAt - a.recordedAt;
    return b.id.localeCompare(a.id);
  });

  const page = items.slice(0, limit);
  const hasMore = items.length > limit;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ after: last.id, afterAt: last.recordedAt, limit })
      : null;

  let sleepSeconds = 0;
  for (const item of items.filter((entry) => entry.kind === RecordKind.SLEEP)) {
    const row = (
      await db.select().from(sleepRecords).where(eq(sleepRecords.id, item.id)).limit(1)
    )[0];
    if (row?.durationSeconds) sleepSeconds += row.durationSeconds;
  }

  return {
    items: page,
    nextCursor,
    summary: {
      feedingCount: items.filter((item) => item.kind === RecordKind.FEEDING).length,
      sleepSeconds,
      diaperCount: items.filter((item) => item.kind === RecordKind.DIAPER).length,
      foodCount: items.filter((item) => item.kind === RecordKind.FOOD).length,
    },
    running: await getRunningForBaby(db, babyId),
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// 睡眠最多拆到 7 天窗口，异常超长记录不会拖死聚合
const MAX_SLEEP_SPLIT_MS = 7 * MS_PER_DAY;

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function localIsoToday(utcOffsetMinutes: number) {
  const localNow = new Date(Date.now() + utcOffsetMinutes * 60_000);
  const month = String(localNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localNow.getUTCDate()).padStart(2, '0');
  return `${localNow.getUTCFullYear()}-${month}-${day}`;
}

interface StatsWindow {
  label: string;
  start: number;
  end: number;
}

function localDate(startMs: number, utcOffsetMinutes: number) {
  return new Date(startMs + utcOffsetMinutes * 60_000);
}

function weekdayLabel(startMs: number, utcOffsetMinutes: number) {
  return WEEKDAY_LABELS[localDate(startMs, utcOffsetMinutes).getUTCDay()] ?? '';
}

function monthDayLabel(startMs: number, utcOffsetMinutes: number) {
  const date = localDate(startMs, utcOffsetMinutes);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function calendarMonthWindows(
  anchorStartMs: number,
  utcOffsetMinutes: number,
): StatsWindow[] {
  const anchor = localDate(anchorStartMs, utcOffsetMinutes);
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();

  return Array.from({ length: 12 }, (_, index) => {
    const monthIndex = anchorMonth - 11 + index;
    const start = Date.UTC(anchorYear, monthIndex, 1) - utcOffsetMinutes * 60_000;
    const end = Date.UTC(anchorYear, monthIndex + 1, 1) - utcOffsetMinutes * 60_000;
    const month = localDate(start, utcOffsetMinutes).getUTCMonth() + 1;
    return { label: `${month}月`, start, end };
  });
}

function dailyWindows(
  length: number,
  anchorStartMs: number,
  utcOffsetMinutes: number,
  label: (startMs: number, utcOffsetMinutes: number) => string,
): StatsWindow[] {
  const firstStart = anchorStartMs - (length - 1) * MS_PER_DAY;
  return Array.from({ length }, (_, index) => {
    const start = firstStart + index * MS_PER_DAY;
    return { label: label(start, utcOffsetMinutes), start, end: start + MS_PER_DAY };
  });
}

function buildWindows(
  range: RecordStatsQuery['range'],
  anchorStartMs: number,
  utcOffsetMinutes: number,
): StatsWindow[] {
  if (range === 'day') {
    return Array.from({ length: 24 }, (_, hour) => ({
      label: `${hour}`,
      start: anchorStartMs + hour * 3_600_000,
      end: anchorStartMs + (hour + 1) * 3_600_000,
    }));
  }
  if (range === 'week') {
    return dailyWindows(7, anchorStartMs, utcOffsetMinutes, weekdayLabel);
  }
  if (range === 'month') {
    return dailyWindows(30, anchorStartMs, utcOffsetMinutes, monthDayLabel);
  }
  return calendarMonthWindows(anchorStartMs, utcOffsetMinutes);
}

function overlapSeconds(start: number, end: number, window: StatsWindow) {
  const from = Math.max(start, window.start);
  const to = Math.min(end, window.end);
  return to > from ? Math.floor((to - from) / 1000) : 0;
}

export async function getRecordStats(
  db: Database,
  userId: string,
  babyId: string,
  query: RecordStatsQuery,
): Promise<RecordStatsResponse> {
  await requireBabyInFamily(db, userId, babyId);

  // 展示时区 = 客户端本地时区（缺省回落服务器时区）
  const utcOffsetMinutes = query.utcOffsetMinutes ?? -new Date().getTimezoneOffset();
  const anchorIso = query.date ?? localIsoToday(utcOffsetMinutes);
  const [year, month, day] = anchorIso.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  // anchor 本地零点的 UTC 时刻 = Date.UTC(日期) - 偏移
  const anchorStartMs = Date.UTC(year, month - 1, day) - utcOffsetMinutes * 60_000;
  const windows = buildWindows(query.range, anchorStartMs, utcOffsetMinutes);
  const rangeStart = windows[0]!.start;
  const rangeEnd = windows[windows.length - 1]!.end;

  function valuesByWindows<T extends { recordedAt: number }>(
    rows: T[],
    value: (row: T) => number,
  ) {
    const totals = windows.map(() => 0);
    for (const row of rows) {
      const index = windows.findIndex(
        (window) => row.recordedAt >= window.start && row.recordedAt < window.end,
      );
      if (index >= 0) totals[index]! += value(row);
    }
    return totals;
  }

  const feedingAmounts = valuesByWindows(
    await db
      .select({
        recordedAt: feedingRecords.recordedAt,
        amountMl: feedingRecords.amountMl,
      })
      .from(feedingRecords)
      .where(
        and(
          eq(feedingRecords.babyId, babyId),
          isNull(feedingRecords.deletedAt),
          eq(feedingRecords.status, FeedingStatus.COMPLETED),
          gte(feedingRecords.recordedAt, rangeStart),
          lt(feedingRecords.recordedAt, rangeEnd),
        ),
      ),
    (row) => row.amountMl ?? 0,
  );

  const diaperCounts = valuesByWindows(
    await db
      .select({ recordedAt: diaperRecords.recordedAt })
      .from(diaperRecords)
      .where(
        and(
          eq(diaperRecords.babyId, babyId),
          isNull(diaperRecords.deletedAt),
          gte(diaperRecords.recordedAt, rangeStart),
          lt(diaperRecords.recordedAt, rangeEnd),
        ),
      ),
    () => 1,
  );

  const foodCounts = valuesByWindows(
    await db
      .select({ recordedAt: foodRecords.recordedAt })
      .from(foodRecords)
      .where(
        and(
          eq(foodRecords.babyId, babyId),
          isNull(foodRecords.deletedAt),
          gte(foodRecords.recordedAt, rangeStart),
          lt(foodRecords.recordedAt, rangeEnd),
        ),
      ),
    () => 1,
  );

  const sleepTotals = windows.map(() => 0);
  const sleepRows = await db
    .select({ startedAt: sleepRecords.startedAt, endedAt: sleepRecords.endedAt })
    .from(sleepRecords)
    .where(
      and(
        eq(sleepRecords.babyId, babyId),
        isNull(sleepRecords.deletedAt),
        eq(sleepRecords.status, SleepStatus.COMPLETED),
        lt(sleepRecords.startedAt, rangeEnd),
        gte(sleepRecords.endedAt, rangeStart),
      ),
    );
  for (const row of sleepRows) {
    if (row.endedAt == null) continue;
    const clippedStart = Math.max(row.startedAt, rangeStart - MAX_SLEEP_SPLIT_MS);
    const clippedEnd = Math.min(row.endedAt, rangeEnd);
    for (let index = 0; index < windows.length; index += 1) {
      const seconds = overlapSeconds(clippedStart, clippedEnd, windows[index]!);
      if (seconds > 0) sleepTotals[index]! += seconds;
    }
  }

  return {
    range: query.range,
    buckets: windows.map((window, index) => ({
      label: window.label,
      feedingAmountMl: feedingAmounts[index]!,
      sleepSeconds: sleepTotals[index]!,
      diaperCount: diaperCounts[index]!,
      foodCount: foodCounts[index]!,
    })),
  };
}
