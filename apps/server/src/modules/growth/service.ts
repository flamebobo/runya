import { growthRecords, milestones, syncOperations } from '@runew/db';
import type { schema } from '@runew/db';
import type {
  CreateGrowthBody,
  CreateMilestoneBody,
  GrowthLatest,
  GrowthListResponse,
  GrowthRecordPublic,
  MilestonePublic,
  MonthQuery,
  MonthlyMetricChange,
  MonthlyStoryResponse,
  UpdateGrowthBody,
  UpdateMilestoneBody,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, asc, desc, eq, gte, isNull, lt } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import { requireBabyInFamily } from '../identity/service.js';
import { appendSyncLog } from '../sync/log.js';

export type Database = LibSQLDatabase<typeof schema>;
const DEFAULT_TZ = 'Asia/Shanghai';

export function mapGrowth(row: typeof growthRecords.$inferSelect): GrowthRecordPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    babyId: row.babyId,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    headCircumferenceCm: row.headCircumferenceCm,
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

export function mapMilestone(row: typeof milestones.$inferSelect): MilestonePublic {
  return {
    id: row.id,
    familyId: row.familyId,
    babyId: row.babyId,
    title: row.title,
    description: row.description,
    happenedAt: row.happenedAt,
    timezoneName: row.timezoneName,
    coverMediaId: row.coverMediaId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function assertVersion(current: number, expected: number | null) {
  if (expected === null) throw new AppError('VALIDATION_ERROR', '缺少 If-Match', 400);
  if (expected !== current) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这笔成长内容已在别处更新', 409);
  }
}

function hasMetric(value: {
  heightCm?: number | null;
  weightKg?: number | null;
  headCircumferenceCm?: number | null;
}) {
  return value.heightCm != null || value.weightKg != null || value.headCircumferenceCm != null;
}

async function getGrowthRow(db: Database, id: string, includeDeleted = false) {
  const where = includeDeleted
    ? eq(growthRecords.id, id)
    : and(eq(growthRecords.id, id), isNull(growthRecords.deletedAt));
  const rows = await db.select().from(growthRecords).where(where).limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '这笔成长记录找不到了', 404);
  return row;
}

async function getMilestoneRow(db: Database, id: string, includeDeleted = false) {
  const where = includeDeleted
    ? eq(milestones.id, id)
    : and(eq(milestones.id, id), isNull(milestones.deletedAt));
  const rows = await db.select().from(milestones).where(where).limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '这个成长里程碑找不到了', 404);
  return row;
}

async function logEntityChange(
  db: Database,
  input: {
    operationId?: string;
    familyId: string;
    userId: string;
    entityType: 'GROWTH_RECORD' | 'MILESTONE';
    entityId: string;
    op: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
    version: number;
    changedFields?: string[];
    payload?: Record<string, unknown>;
    deleted?: boolean;
    deviceId?: string | null;
  },
  now: number,
) {
  const operationId = input.operationId ?? createUlid();
  await appendSyncLog(
    db,
    {
      operationId,
      familyId: input.familyId,
      actorUserId: input.userId,
      deviceId: input.deviceId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      op: input.op,
      entityVersion: input.version,
      changedFields: input.changedFields,
    },
    now,
  );
  await db
    .update(syncOperations)
    .set({ resultJson: JSON.stringify({ payload: input.payload, deleted: input.deleted ?? false }) })
    .where(eq(syncOperations.operationId, operationId));
}

export async function listGrowth(
  db: Database,
  userId: string,
  babyId: string,
): Promise<GrowthListResponse> {
  await requireBabyInFamily(db, userId, babyId);
  const rows = await db
    .select()
    .from(growthRecords)
    .where(and(eq(growthRecords.babyId, babyId), isNull(growthRecords.deletedAt)))
    .orderBy(desc(growthRecords.recordedAt), desc(growthRecords.id));

  const items = rows.map(mapGrowth);
  const newestWith = (field: 'heightCm' | 'weightKg' | 'headCircumferenceCm') => {
    const item = items.find((candidate) => candidate[field] != null);
    const value = item?.[field];
    return item && value != null ? { recordId: item.id, value, recordedAt: item.recordedAt } : null;
  };
  const latest: GrowthLatest = {
    height: newestWith('heightCm'),
    weight: newestWith('weightKg'),
    head: newestWith('headCircumferenceCm'),
  };
  const chronological = [...items].reverse();
  const trend = (field: 'heightCm' | 'weightKg' | 'headCircumferenceCm') =>
    chronological.flatMap((item) => {
      const value = item[field];
      return value == null ? [] : [{ recordId: item.id, recordedAt: item.recordedAt, value }];
    });

  return {
    items,
    latest,
    trends: {
      height: trend('heightCm'),
      weight: trend('weightKg'),
      head: trend('headCircumferenceCm'),
    },
  };
}

export async function createGrowth(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateGrowthBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  const id = createUlid();
  await db.insert(growthRecords).values({
    id,
    familyId: baby.familyId,
    babyId,
    heightCm: body.heightCm ?? null,
    weightKg: body.weightKg ?? null,
    headCircumferenceCm: body.headCircumferenceCm ?? null,
    recordedAt: body.recordedAt ?? now,
    timezoneName: body.timezoneName ?? DEFAULT_TZ,
    note: body.note ?? null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });
  const created = mapGrowth(await getGrowthRow(db, id));
  await logEntityChange(db, {
    familyId: baby.familyId,
    userId,
    entityType: 'GROWTH_RECORD',
    entityId: id,
    op: 'CREATE',
    version: created.version,
    payload: growthPayload(created),
  }, now);
  return created;
}

export async function getGrowth(db: Database, userId: string, id: string) {
  const row = await getGrowthRow(db, id);
  await requireBabyInFamily(db, userId, row.babyId);
  return mapGrowth(row);
}

export async function updateGrowth(
  db: Database,
  userId: string,
  id: string,
  body: UpdateGrowthBody,
  expectedVersion: number | null,
) {
  const current = await getGrowth(db, userId, id);
  assertVersion(current.version, expectedVersion);
  const next = {
    heightCm: body.heightCm === undefined ? current.heightCm : body.heightCm,
    weightKg: body.weightKg === undefined ? current.weightKg : body.weightKg,
    headCircumferenceCm:
      body.headCircumferenceCm === undefined
        ? current.headCircumferenceCm
        : body.headCircumferenceCm,
  };
  if (!hasMetric(next)) {
    throw new AppError('VALIDATION_ERROR', '身高、体重、头围至少保留一项', 400);
  }
  const now = utcNowMs();
  const result = await db
    .update(growthRecords)
    .set({
      ...next,
      recordedAt: body.recordedAt ?? current.recordedAt,
      timezoneName: body.timezoneName ?? current.timezoneName,
      note: body.note === undefined ? current.note : body.note,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(
      and(
        eq(growthRecords.id, id),
        eq(growthRecords.version, current.version),
        isNull(growthRecords.deletedAt),
      ),
    );
  if (result.rowsAffected !== 1) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这笔成长内容已在别处更新', 409);
  }
  const updated = await getGrowth(db, userId, id);
  await logEntityChange(db, {
    familyId: updated.familyId,
    userId,
    entityType: 'GROWTH_RECORD',
    entityId: id,
    op: 'UPDATE',
    version: updated.version,
    changedFields: Object.keys(body).filter((key) => body[key as keyof UpdateGrowthBody] !== undefined),
    payload: growthPayload(updated),
  }, now);
  return updated;
}

export async function deleteGrowth(db: Database, userId: string, id: string) {
  const current = await getGrowth(db, userId, id);
  const now = utcNowMs();
  await db
    .update(growthRecords)
    .set({ deletedAt: now, deletedBy: userId, updatedBy: userId, updatedAt: now, version: current.version + 1 })
    .where(eq(growthRecords.id, id));
  await logEntityChange(db, {
    familyId: current.familyId,
    userId,
    entityType: 'GROWTH_RECORD',
    entityId: id,
    op: 'DELETE',
    version: current.version + 1,
    payload: growthPayload(current),
    deleted: true,
  }, now);
  return { ok: true as const };
}

export async function restoreGrowth(db: Database, userId: string, id: string) {
  const row = await getGrowthRow(db, id, true);
  await requireBabyInFamily(db, userId, row.babyId);
  if (row.deletedAt == null) return mapGrowth(row);
  const now = utcNowMs();
  await db
    .update(growthRecords)
    .set({ deletedAt: null, deletedBy: null, updatedBy: userId, updatedAt: now, version: row.version + 1 })
    .where(eq(growthRecords.id, id));
  const restored = mapGrowth(await getGrowthRow(db, id));
  await logEntityChange(db, {
    familyId: restored.familyId,
    userId,
    entityType: 'GROWTH_RECORD',
    entityId: id,
    op: 'RESTORE',
    version: restored.version,
    payload: growthPayload(restored),
  }, now);
  return restored;
}

export async function listMilestones(db: Database, userId: string, babyId: string) {
  await requireBabyInFamily(db, userId, babyId);
  const rows = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.babyId, babyId), isNull(milestones.deletedAt)))
    .orderBy(desc(milestones.happenedAt), desc(milestones.id));
  return { items: rows.map(mapMilestone) };
}

export async function createMilestone(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateMilestoneBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  const id = createUlid();
  await db.insert(milestones).values({
    id,
    familyId: baby.familyId,
    babyId,
    title: body.title,
    description: body.description ?? null,
    happenedAt: body.happenedAt ?? now,
    timezoneName: body.timezoneName ?? DEFAULT_TZ,
    coverMediaId: body.coverMediaId ?? null,
    createdBy: userId,
    createdAt: now,
    updatedBy: userId,
    updatedAt: now,
  });
  const created = mapMilestone(await getMilestoneRow(db, id));
  await logEntityChange(db, {
    familyId: baby.familyId,
    userId,
    entityType: 'MILESTONE',
    entityId: id,
    op: 'CREATE',
    version: created.version,
    payload: milestonePayload(created),
  }, now);
  return created;
}

export async function getMilestone(db: Database, userId: string, id: string) {
  const row = await getMilestoneRow(db, id);
  await requireBabyInFamily(db, userId, row.babyId);
  return mapMilestone(row);
}

export async function updateMilestone(
  db: Database,
  userId: string,
  id: string,
  body: UpdateMilestoneBody,
  expectedVersion: number | null,
) {
  const current = await getMilestone(db, userId, id);
  assertVersion(current.version, expectedVersion);
  const now = utcNowMs();
  const result = await db
    .update(milestones)
    .set({
      title: body.title ?? current.title,
      description: body.description === undefined ? current.description : body.description,
      happenedAt: body.happenedAt ?? current.happenedAt,
      timezoneName: body.timezoneName ?? current.timezoneName,
      coverMediaId: body.coverMediaId === undefined ? current.coverMediaId : body.coverMediaId,
      updatedBy: userId,
      updatedAt: now,
      version: current.version + 1,
    })
    .where(
      and(
        eq(milestones.id, id),
        eq(milestones.version, current.version),
        isNull(milestones.deletedAt),
      ),
    );
  if (result.rowsAffected !== 1) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这笔成长内容已在别处更新', 409);
  }
  const updated = await getMilestone(db, userId, id);
  await logEntityChange(db, {
    familyId: updated.familyId,
    userId,
    entityType: 'MILESTONE',
    entityId: id,
    op: 'UPDATE',
    version: updated.version,
    changedFields: Object.keys(body).filter((key) => body[key as keyof UpdateMilestoneBody] !== undefined),
    payload: milestonePayload(updated),
  }, now);
  return updated;
}

export async function deleteMilestone(db: Database, userId: string, id: string) {
  const current = await getMilestone(db, userId, id);
  const now = utcNowMs();
  await db
    .update(milestones)
    .set({ deletedAt: now, deletedBy: userId, updatedBy: userId, updatedAt: now, version: current.version + 1 })
    .where(eq(milestones.id, id));
  await logEntityChange(db, {
    familyId: current.familyId,
    userId,
    entityType: 'MILESTONE',
    entityId: id,
    op: 'DELETE',
    version: current.version + 1,
    payload: milestonePayload(current),
    deleted: true,
  }, now);
  return { ok: true as const };
}

export async function restoreMilestone(db: Database, userId: string, id: string) {
  const row = await getMilestoneRow(db, id, true);
  await requireBabyInFamily(db, userId, row.babyId);
  if (row.deletedAt == null) return mapMilestone(row);
  const now = utcNowMs();
  await db
    .update(milestones)
    .set({ deletedAt: null, deletedBy: null, updatedBy: userId, updatedAt: now, version: row.version + 1 })
    .where(eq(milestones.id, id));
  const restored = mapMilestone(await getMilestoneRow(db, id));
  await logEntityChange(db, {
    familyId: restored.familyId,
    userId,
    entityType: 'MILESTONE',
    entityId: id,
    op: 'RESTORE',
    version: restored.version,
    payload: milestonePayload(restored),
  }, now);
  return restored;
}

function monthBounds(query: MonthQuery) {
  const [year, month] = query.month.split('-').map(Number) as [number, number];
  const offsetMs = query.utcOffsetMinutes * 60_000;
  return {
    start: Date.UTC(year, month - 1, 1) - offsetMs,
    end: Date.UTC(year, month, 1) - offsetMs,
  };
}

function metricChange(
  rows: Array<typeof growthRecords.$inferSelect>,
  metric: MonthlyMetricChange['metric'],
  field: 'heightCm' | 'weightKg' | 'headCircumferenceCm',
  unit: MonthlyMetricChange['unit'],
): MonthlyMetricChange | null {
  const values = rows.flatMap((row) => (row[field] == null ? [] : [row[field]]));
  if (values.length === 0) return null;
  const first = values[0]!;
  const latest = values[values.length - 1]!;
  return { metric, first, latest, delta: Number((latest - first).toFixed(2)), unit };
}

export async function getMonthlyStory(
  db: Database,
  userId: string,
  babyId: string,
  query: MonthQuery,
): Promise<MonthlyStoryResponse> {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const { start, end } = monthBounds(query);
  const growthRows = await db
    .select()
    .from(growthRecords)
    .where(and(eq(growthRecords.babyId, babyId), isNull(growthRecords.deletedAt), gte(growthRecords.recordedAt, start), lt(growthRecords.recordedAt, end)))
    .orderBy(asc(growthRecords.recordedAt), asc(growthRecords.id));
  const milestoneRows = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.babyId, babyId), isNull(milestones.deletedAt), gte(milestones.happenedAt, start), lt(milestones.happenedAt, end)))
    .orderBy(asc(milestones.happenedAt), asc(milestones.id));
  const changes = [
    metricChange(growthRows, 'height', 'heightCm', 'cm'),
    metricChange(growthRows, 'weight', 'weightKg', 'kg'),
    metricChange(growthRows, 'head', 'headCircumferenceCm', 'cm'),
  ].filter((value): value is MonthlyMetricChange => value !== null);
  const babyName = baby.nickname ?? baby.name;
  const facts: string[] = [];
  if (growthRows.length > 0) facts.push(`留下了 ${growthRows.length} 次成长测量`);
  if (milestoneRows.length > 0) facts.push(`收藏了 ${milestoneRows.length} 个第一次`);
  for (const change of changes.filter((item) => item.delta !== 0)) {
    const label = change.metric === 'height' ? '身高' : change.metric === 'weight' ? '体重' : '头围';
    facts.push(`${label}从 ${change.first}${change.unit} 来到 ${change.latest}${change.unit}`);
  }
  return {
    month: query.month,
    title: `这个月的${babyName}`,
    summary: facts.length > 0 ? `${facts.join('，')}。每一点变化，都被家人好好接住了。` : '这个月还留着一页空白，等下一次测量或新的第一次慢慢写进来。',
    growthRecordCount: growthRows.length,
    milestoneCount: milestoneRows.length,
    changes,
    milestones: milestoneRows.map(mapMilestone),
  };
}

export function growthPayload(value: GrowthRecordPublic) {
  return {
    babyId: value.babyId,
    heightCm: value.heightCm,
    weightKg: value.weightKg,
    headCircumferenceCm: value.headCircumferenceCm,
    recordedAt: value.recordedAt,
    timezoneName: value.timezoneName,
    note: value.note,
  };
}

export function milestonePayload(value: MilestonePublic) {
  return {
    babyId: value.babyId,
    title: value.title,
    description: value.description,
    happenedAt: value.happenedAt,
    timezoneName: value.timezoneName,
    coverMediaId: value.coverMediaId,
  };
}
