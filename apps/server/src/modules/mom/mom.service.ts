import { and, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { diaryMedia, diaries, mediaFiles, moods } from '@runew/db';
import {
  type CreateDiaryBody,
  type CreateMoodBody,
  type DiaryPublic,
  type DiarySearchQuery,
  type MediaPublic,
  type MomHomeSummary,
  type MoodCalendarResponse,
  type MoodKind,
  type MoodPublic,
  type UpdateDiaryBody,
  type UpdateMoodBody,
  mediaPublicSchema,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';
import { restoreTrashItem } from '../m11/service.js';

type MediaKind = 'IMAGE' | 'AUDIO' | 'VIDEO' | 'FILE';

/**
 * PRIVATE 是服务端权限边界，不是前端隐藏（AGENTS §35）：
 * 只有 owner 本人能读写 PRIVATE 行；其他家庭成员（含 family admin 角色）
 * 一律按「不存在」处理，防止 IDOR 探测。
 */
function diaryVisibleTo(row: typeof diaries.$inferSelect, userId: string) {
  return row.visibility === 'FAMILY' || row.ownerUserId === userId;
}

function mapMoodPublic(row: typeof moods.$inferSelect): MoodPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    userId: row.userId,
    mood: row.mood as MoodKind,
    note: row.note,
    visibility: row.visibility as MoodPublic['visibility'],
    recordedAt: row.recordedAt,
    timezoneName: row.timezoneName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapDiaryPublic(
  row: typeof diaries.$inferSelect,
  media: MediaPublic[],
): DiaryPublic {
  return {
    id: row.id,
    familyId: row.familyId,
    ownerUserId: row.ownerUserId,
    title: row.title,
    body: row.body,
    visibility: row.visibility as DiaryPublic['visibility'],
    recordedAt: row.recordedAt,
    timezoneName: row.timezoneName,
    media,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

function mapMediaPublic(media: typeof mediaFiles.$inferSelect): MediaPublic {
  return mediaPublicSchema.parse({
    id: media.id,
    familyId: media.familyId,
    babyId: media.babyId,
    ownerUserId: media.ownerUserId,
    mediaType: media.mediaType as MediaKind,
    status: media.status,
    mimeType: media.mimeType,
    originalFilename: media.originalFilename,
    sizeBytes: media.sizeBytes,
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
    waveformJson: media.waveformJson,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
  });
}

async function getActiveFamilyId(db: Database, userId: string) {
  const membership = await db.query.familyMembers.findFirst({
    where: (familyMember, { and: whereAnd, eq: whereEq }) =>
      whereAnd(
        whereEq(familyMember.userId, userId),
        whereEq(familyMember.status, 'ACTIVE'),
      ),
  });
  if (!membership) throw new AppError('FAMILY_ACCESS_DENIED', '尚未加入任何家庭', 400);
  return membership.familyId;
}

// --- Moods ---

export async function listMoods(db: Database, userId: string): Promise<MoodPublic[]> {
  const familyId = await getActiveFamilyId(db, userId);
  // 心情只属于记录者本人（PRD 13.2：个人回顾，不做家庭对比）。
  const rows = await db.query.moods.findMany({
    where: and(
      eq(moods.familyId, familyId),
      eq(moods.userId, userId),
      isNull(moods.deletedAt),
    ),
    orderBy: [desc(moods.recordedAt)],
    limit: 200,
  });
  return rows.map(mapMoodPublic);
}

export async function createMood(
  db: Database,
  userId: string,
  body: CreateMoodBody,
): Promise<MoodPublic> {
  const familyId = await getActiveFamilyId(db, userId);
  const now = utcNowMs();
  const id = createUlid();
  await db.insert(moods).values({
    id,
    familyId,
    userId,
    mood: body.mood,
    note: body.note ?? null,
    visibility: body.visibility ?? 'PRIVATE',
    recordedAt: body.recordedAt,
    timezoneName: body.timezoneName ?? 'Asia/Shanghai',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  const row = await db.query.moods.findFirst({ where: eq(moods.id, id) });
  if (!row) throw new AppError('INTERNAL_ERROR', '心情还没有保存好，请再试一次', 500);
  return mapMoodPublic(row);
}

async function getOwnedMood(db: Database, userId: string, id: string) {
  const row = await db.query.moods.findFirst({
    where: and(eq(moods.id, id), isNull(moods.deletedAt)),
  });
  if (!row || row.userId !== userId) {
    throw new AppError('NOT_FOUND', '这条心情不存在', 404);
  }
  return row;
}

export async function updateMood(
  db: Database,
  userId: string,
  id: string,
  body: UpdateMoodBody,
  expectedVersion: number | null,
): Promise<MoodPublic> {
  const row = await getOwnedMood(db, userId, id);
  if (expectedVersion !== null && row.version !== expectedVersion) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这条心情已在别处更新', 409);
  }
  await db
    .update(moods)
    .set({
      mood: body.mood ?? row.mood,
      note: body.note !== undefined ? body.note : row.note,
      visibility: body.visibility ?? row.visibility,
      updatedAt: utcNowMs(),
      version: row.version + 1,
    })
    .where(and(eq(moods.id, id), eq(moods.userId, userId)));
  return mapMoodPublic(await getOwnedMood(db, userId, id));
}

export async function deleteMood(db: Database, userId: string, id: string) {
  const row = await getOwnedMood(db, userId, id);
  await db
    .update(moods)
    .set({ deletedAt: utcNowMs(), updatedAt: utcNowMs(), version: row.version + 1 })
    .where(and(eq(moods.id, id), eq(moods.userId, userId)));
}

export async function restoreMood(db: Database, userId: string, id: string, deviceId: string | null = null) {
  const row = await db.query.moods.findFirst({ where: eq(moods.id, id) });
  if (!row || row.userId !== userId || !row.deletedAt) {
    throw new AppError('NOT_FOUND', '这条心情不存在或不在最近删除里', 404);
  }
  await restoreTrashItem(db, userId, row.familyId, 'MOOD', id, deviceId);
  return mapMoodPublic(await getOwnedMood(db, userId, id));
}

export async function getMoodCalendar(
  db: Database,
  userId: string,
  year: number,
  month: number,
): Promise<MoodCalendarResponse> {
  const familyId = await getActiveFamilyId(db, userId);
  // UTC 月窗口只用于取数；date 字段按记录时区换算，跨月心情各归各的日子。
  const startUtc = Date.UTC(year, month - 1, 1) - 36 * 60 * 60 * 1000;
  const endUtc = Date.UTC(year, month, 1) + 36 * 60 * 60 * 1000;
  const rows = await db.query.moods.findMany({
    where: and(
      eq(moods.familyId, familyId),
      eq(moods.userId, userId),
      isNull(moods.deletedAt),
      gte(moods.recordedAt, startUtc),
      lt(moods.recordedAt, endUtc),
    ),
    orderBy: [desc(moods.recordedAt)],
  });

  const byDate = new Map<string, MoodPublic[]>();
  for (const row of rows) {
    const date = localDateKey(row.recordedAt, row.timezoneName);
    const list = byDate.get(date) ?? [];
    list.push(mapMoodPublic(row));
    byDate.set(date, list);
  }
  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    days: [...byDate.entries()]
      .map(([date, dayMoods]) => ({ date, moods: dayMoods }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

function localDateKey(timestampMs: number, timezoneName: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezoneName,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date(timestampMs));
  } catch {
    return new Date(timestampMs).toISOString().slice(0, 10);
  }
}

// --- Diaries ---

async function loadDiaryMedia(db: Database, diaryId: string): Promise<MediaPublic[]> {
  const links = await db.query.diaryMedia.findMany({
    where: eq(diaryMedia.diaryId, diaryId),
    orderBy: [diaryMedia.sortOrder],
  });
  if (!links.length) return [];
  const rows = await db.query.mediaFiles.findMany({
    where: sql`${mediaFiles.id} IN (${sql.join(
      links.map((link) => sql`${link.mediaId}`),
      sql`, `,
    )}) AND ${mediaFiles.deletedAt} IS NULL AND ${mediaFiles.status} <> 'DELETED'`,
  });
  const byId = new Map(rows.map((media) => [media.id, mapMediaPublic(media)]));
  return links.flatMap((link) => {
    const media = byId.get(link.mediaId);
    return media ? [media] : [];
  });
}

export async function listDiaries(db: Database, userId: string): Promise<DiaryPublic[]> {
  const familyId = await getActiveFamilyId(db, userId);
  const rows = await db.query.diaries.findMany({
    where: and(
      eq(diaries.familyId, familyId),
      or(
        eq(diaries.ownerUserId, userId),
        eq(diaries.visibility, 'FAMILY'),
      ),
      isNull(diaries.deletedAt),
    ),
    orderBy: [desc(diaries.recordedAt)],
    limit: 200,
  });
  const result: DiaryPublic[] = [];
  for (const row of rows) {
    result.push(mapDiaryPublic(row, await loadDiaryMedia(db, row.id)));
  }
  return result;
}

export async function searchDiaries(
  db: Database,
  userId: string,
  query: DiarySearchQuery,
): Promise<DiaryPublic[]> {
  const familyId = await getActiveFamilyId(db, userId);
  const escapedQuery = query.q.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escapedQuery}%`;
  const rows = await db.query.diaries.findMany({
    where: and(
      eq(diaries.familyId, familyId),
      or(
        eq(diaries.ownerUserId, userId),
        eq(diaries.visibility, 'FAMILY'),
      ),
      isNull(diaries.deletedAt),
      sql`(${diaries.title} LIKE ${pattern} ESCAPE '\\' OR ${diaries.body} LIKE ${pattern} ESCAPE '\\')`,
    ),
    orderBy: [desc(diaries.recordedAt)],
    limit: 50,
  });
  const result: DiaryPublic[] = [];
  for (const row of rows) {
    result.push(mapDiaryPublic(row, await loadDiaryMedia(db, row.id)));
  }
  return result;
}

async function validateDiaryMediaIds(
  db: Database,
  familyId: string,
  userId: string,
  mediaIds: string[] | undefined,
) {
  if (!mediaIds?.length) return [];
  const uniqueIds = [...new Set(mediaIds)];
  if (uniqueIds.length !== mediaIds.length) {
    throw new AppError('VALIDATION_ERROR', '同一份媒体不能重复添加', 400);
  }
  const records = await db.query.mediaFiles.findMany({
    where: and(
      sql`${mediaFiles.id} IN (${sql.join(
        uniqueIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
      eq(mediaFiles.familyId, familyId),
    ),
  });
  if (records.length !== uniqueIds.length) {
    throw new AppError('FAMILY_ACCESS_DENIED', '媒体不属于当前家庭', 403);
  }
  for (const media of records) {
    if (media.deletedAt || media.status === 'DELETED') {
      throw new AppError('GONE', '媒体已被删除，不能继续关联', 410);
    }
    // 日记附件跟随日记可见性：PRIVATE 日记只能挂本人上传的媒体。
    if (media.ownerUserId !== userId) {
      throw new AppError('FAMILY_ACCESS_DENIED', '只能添加自己上传的照片和声音', 403);
    }
  }
  return records;
}

async function replaceDiaryMedia(
  db: Database,
  diaryId: string,
  mediaIds: string[] | undefined,
) {
  if (mediaIds === undefined) return;
  await db.delete(diaryMedia).where(eq(diaryMedia.diaryId, diaryId));
  if (mediaIds.length) {
    await db.insert(diaryMedia).values(
      mediaIds.map((mediaId, index) => ({
        diaryId,
        mediaId,
        sortOrder: index,
      })),
    );
  }
}

export async function createDiary(
  db: Database,
  userId: string,
  body: CreateDiaryBody,
): Promise<DiaryPublic> {
  const familyId = await getActiveFamilyId(db, userId);
  await validateDiaryMediaIds(db, familyId, userId, body.mediaIds);
  const now = utcNowMs();
  const id = createUlid();
  await db.insert(diaries).values({
    id,
    familyId,
    ownerUserId: userId,
    title: body.title ?? null,
    body: body.body,
    visibility: body.visibility ?? 'PRIVATE',
    recordedAt: body.recordedAt,
    timezoneName: body.timezoneName ?? 'Asia/Shanghai',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  await replaceDiaryMedia(db, id, body.mediaIds ?? []);
  return getDiaryById(db, userId, id);
}

/**
 * PRIVATE 直链访问按「不存在」返回 404：既不暴露存在性，
 * 也不把正文泄漏给非 owner（普通家庭成员与管理员都不例外）。
 */
export async function getDiaryById(
  db: Database,
  userId: string,
  id: string,
): Promise<DiaryPublic> {
  const familyId = await getActiveFamilyId(db, userId);
  const row = await db.query.diaries.findFirst({
    where: and(
      eq(diaries.id, id),
      eq(diaries.familyId, familyId),
      isNull(diaries.deletedAt),
    ),
  });
  if (!row || !diaryVisibleTo(row, userId)) {
    throw new AppError('NOT_FOUND', '这篇日记不存在', 404);
  }
  return mapDiaryPublic(row, await loadDiaryMedia(db, row.id));
}

async function getOwnedDiary(db: Database, userId: string, id: string) {
  const row = await getDiaryById(db, userId, id);
  if (row.ownerUserId !== userId) {
    throw new AppError('NOT_FOUND', '这篇日记不存在', 404);
  }
  return row;
}

export async function updateDiary(
  db: Database,
  userId: string,
  id: string,
  body: UpdateDiaryBody,
  expectedVersion: number | null,
): Promise<DiaryPublic> {
  const row = await getOwnedDiary(db, userId, id);
  if (expectedVersion !== null && row.version !== expectedVersion) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '这篇日记已在别处更新', 409);
  }
  const familyId = await getActiveFamilyId(db, userId);
  await validateDiaryMediaIds(db, familyId, userId, body.mediaIds);
  await db
    .update(diaries)
    .set({
      title: body.title !== undefined ? (body.title ?? null) : row.title,
      body: body.body ?? row.body,
      visibility: body.visibility ?? row.visibility,
      updatedAt: utcNowMs(),
      version: row.version + 1,
    })
    .where(and(eq(diaries.id, id), eq(diaries.ownerUserId, userId)));
  if (body.mediaIds !== undefined) {
    await replaceDiaryMedia(db, id, body.mediaIds);
  }
  return getDiaryById(db, userId, id);
}

export async function deleteDiary(db: Database, userId: string, id: string) {
  const row = await getOwnedDiary(db, userId, id);
  const now = utcNowMs();
  await db
    .update(diaries)
    .set({
      deletedAt: now,
      deletedBy: userId,
      updatedAt: now,
      version: row.version + 1,
    })
    .where(and(eq(diaries.id, id), eq(diaries.ownerUserId, userId)));
}

export async function restoreDiary(db: Database, userId: string, id: string, deviceId: string | null = null) {
  const row = await db.query.diaries.findFirst({ where: eq(diaries.id, id) });
  if (!row || row.ownerUserId !== userId || !row.deletedAt) {
    throw new AppError('NOT_FOUND', '这篇日记不存在或不在最近删除里', 404);
  }
  await restoreTrashItem(db, userId, row.familyId, 'DIARY', id, deviceId);
  return getDiaryById(db, userId, id);
}

export async function getMomHomeSummary(
  db: Database,
  userId: string,
): Promise<MomHomeSummary> {
  const familyId = await getActiveFamilyId(db, userId);
  const [latestMoodRow, moodRows, diaryRows] = await Promise.all([
    db.query.moods.findFirst({
      where: and(
        eq(moods.familyId, familyId),
        eq(moods.userId, userId),
        isNull(moods.deletedAt),
      ),
      orderBy: [desc(moods.recordedAt)],
    }),
    db.query.moods.findMany({
      where: and(
        eq(moods.familyId, familyId),
        eq(moods.userId, userId),
        isNull(moods.deletedAt),
      ),
    }),
    db.query.diaries.findMany({
      where: and(
        eq(diaries.familyId, familyId),
        eq(diaries.ownerUserId, userId),
        isNull(diaries.deletedAt),
      ),
    }),
  ]);
  return {
    latestMood: latestMoodRow ? mapMoodPublic(latestMoodRow) : undefined,
    moodCount: moodRows.length,
    diaryCount: diaryRows.length,
  };
}
