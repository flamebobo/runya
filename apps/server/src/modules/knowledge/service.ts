import { knowledge, knowledgeUserStates } from '@runew/db';
import type { schema } from '@runew/db';
import type {
  KnowledgeDetail,
  KnowledgeLibraryResponse,
  KnowledgePublic,
  KnowledgeRecommendation,
  KnowledgeRecommendationsResponse,
  KnowledgeUserState,
  PutKnowledgeStateBody,
} from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';

export type Database = LibSQLDatabase<typeof schema>;

type KnowledgeRow = typeof knowledge.$inferSelect;
type KnowledgeUserStateRow = typeof knowledgeUserStates.$inferSelect;

export function mapKnowledge(row: KnowledgeRow): KnowledgePublic {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category as KnowledgePublic['category'],
    minAgeDays: row.minAgeDays,
    maxAgeDays: row.maxAgeDays,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    reviewedAt: row.reviewedAt,
    contentVersion: row.contentVersion,
    priority: row.priority,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

export function mapKnowledgeDetail(row: KnowledgeRow): KnowledgeDetail {
  return { ...mapKnowledge(row), body: row.body };
}

// 版本闭环唯一判定：学到的是旧版本而内容已升级 → “内容有更新”。
export function isContentUpdated(
  learnedVersion: number | null,
  contentVersion: number,
): boolean {
  return learnedVersion != null && learnedVersion < contentVersion;
}

export function mapUserState(
  row: KnowledgeUserStateRow,
  contentVersion: number,
): KnowledgeUserState {
  return {
    knowledgeId: row.knowledgeId,
    saved: row.saved,
    readLater: row.readLater,
    dismissed: row.dismissed,
    learnedVersion: row.learnedVersion,
    learnedAt: row.learnedAt,
    contentVersion,
    contentUpdated: isContentUpdated(row.learnedVersion, contentVersion),
    version: row.version,
  };
}

async function getKnowledgeRow(db: Database, id: string): Promise<KnowledgeRow> {
  const rows = await db
    .select()
    .from(knowledge)
    .where(and(eq(knowledge.id, id), isNull(knowledge.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '这篇知识找不到了', 404);
  return row;
}

async function getStateRow(
  db: Database,
  userId: string,
  babyId: string,
  knowledgeId: string,
): Promise<KnowledgeUserStateRow | null> {
  const rows = await db
    .select()
    .from(knowledgeUserStates)
    .where(
      and(
        eq(knowledgeUserStates.userId, userId),
        eq(knowledgeUserStates.babyId, babyId),
        eq(knowledgeUserStates.knowledgeId, knowledgeId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// 普通用户只看到 PUBLISHED 且未删除的知识。
export async function listPublishedKnowledge(db: Database): Promise<KnowledgePublic[]> {
  const rows = await db
    .select()
    .from(knowledge)
    .where(and(eq(knowledge.status, 'PUBLISHED'), isNull(knowledge.deletedAt)))
    .orderBy(desc(knowledge.priority), desc(knowledge.publishedAt));
  return rows.map(mapKnowledge);
}

export async function getPublishedKnowledge(
  db: Database,
  id: string,
): Promise<KnowledgeDetail> {
  const row = await getKnowledgeRow(db, id);
  if (row.status !== 'PUBLISHED') {
    throw new AppError('NOT_FOUND', '这篇知识找不到了', 404);
  }
  return mapKnowledgeDetail(row);
}

export async function searchKnowledge(
  db: Database,
  query: string,
): Promise<KnowledgePublic[]> {
  const keyword = `%${query.trim()}%`;
  const rows = await db
    .select()
    .from(knowledge)
    .where(
      and(
        eq(knowledge.status, 'PUBLISHED'),
        isNull(knowledge.deletedAt),
        or(
          sql`${knowledge.title} LIKE ${keyword}`,
          sql`${knowledge.summary} LIKE ${keyword}`,
        ),
      ),
    )
    .orderBy(desc(knowledge.priority), desc(knowledge.publishedAt))
    .limit(50);
  return rows.map(mapKnowledge);
}

// 宝宝出生满多少天。birthday 是本地日期，按本地日历计算天数差。
export function babyAgeDays(birthday: string, now = new Date()): number {
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(
    0,
    Math.floor((today.getTime() - birth.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

function ageOverlap(
  item: { minAgeDays: number | null; maxAgeDays: number | null },
  ageDays: number,
): boolean {
  if (item.minAgeDays != null && ageDays < item.minAgeDays) return false;
  if (item.maxAgeDays != null && ageDays > item.maxAgeDays) return false;
  return true;
}

function ageLabel(item: { minAgeDays: number | null; maxAgeDays: number | null }): string {
  if (item.minAgeDays != null && item.maxAgeDays != null) {
    return `适合 ${item.minAgeDays}–${item.maxAgeDays} 天大的宝宝`;
  }
  if (item.minAgeDays != null) return `适合 ${item.minAgeDays} 天以后的宝宝`;
  if (item.maxAgeDays != null) return `适合 ${item.maxAgeDays} 天以内的宝宝`;
  return '这个阶段值得了解的知识';
}

// 透明推荐规则（P0，无 AI）：
// 1. PUBLISHED 且未删除；
// 2. dismissed 的不再出现在普通推荐；
// 3. learned_version >= content_version（当前版本已学）不再普通推荐；
// 4. learned_version < content_version 视为“内容有更新”，可重新推荐；
// 5. 只推荐适合当前月龄的（月龄不匹配的走全部知识/分类浏览，不进推荐流），
//    按 priority / 发布时间排序。
export async function getRecommendations(
  db: Database,
  babyId: string,
  ageDays: number,
): Promise<KnowledgeRecommendationsResponse> {
  const stateRows = await db
    .select()
    .from(knowledgeUserStates)
    .where(eq(knowledgeUserStates.babyId, babyId));
  const stateByKnowledge = new Map(stateRows.map((row) => [row.knowledgeId, row]));

  const rows = await db
    .select()
    .from(knowledge)
    .where(and(eq(knowledge.status, 'PUBLISHED'), isNull(knowledge.deletedAt)))
    .orderBy(desc(knowledge.priority), desc(knowledge.publishedAt));

  const items: KnowledgeRecommendation[] = [];
  for (const row of rows) {
    const state = stateByKnowledge.get(row.id);
    if (state?.dismissed) continue;
    if (state?.learnedVersion != null && state.learnedVersion >= row.contentVersion) {
      continue;
    }
    if (!ageOverlap(row, ageDays)) continue;
    items.push({
      ...mapKnowledge(row),
      reason: state?.saved ? '你收藏过的内容' : ageLabel(row),
    });
  }

  return { items, babyAgeDays: ageDays };
}

export async function getLibrary(
  db: Database,
  babyId: string,
  state: 'saved' | 'later' | 'learned',
): Promise<KnowledgeLibraryResponse> {
  const filters = [eq(knowledgeUserStates.babyId, babyId)];
  if (state === 'saved') filters.push(eq(knowledgeUserStates.saved, true));
  if (state === 'later') filters.push(eq(knowledgeUserStates.readLater, true));
  if (state === 'learned') filters.push(gt(knowledgeUserStates.learnedVersion, 0));

  const rows = await db
    .select({ state: knowledgeUserStates, article: knowledge })
    .from(knowledgeUserStates)
    .innerJoin(knowledge, eq(knowledgeUserStates.knowledgeId, knowledge.id))
    .where(and(...filters))
    .orderBy(desc(knowledgeUserStates.updatedAt));

  return {
    items: rows
      .filter(
        (row) =>
          row.article.deletedAt == null && row.article.status === 'PUBLISHED',
      )
      .map((row) => ({
        ...mapUserState(row.state, row.article.contentVersion),
        title: row.article.title,
        summary: row.article.summary,
        category: row.article.category as KnowledgePublic['category'],
      })),
  };
}

// PUT 语义：传入字段整体覆盖，缺省保持原值，天然幂等。
// markLearned 写入当前 content_version，这是版本闭环的唯一写入点。
export async function putKnowledgeState(
  db: Database,
  input: {
    userId: string;
    babyId: string;
    knowledgeId: string;
    body: PutKnowledgeStateBody;
  },
): Promise<KnowledgeUserState> {
  const article = await getKnowledgeRow(db, input.knowledgeId);
  if (article.status !== 'PUBLISHED') {
    throw new AppError('NOT_FOUND', '这篇知识找不到了', 404);
  }

  const existing = await getStateRow(
    db,
    input.userId,
    input.babyId,
    input.knowledgeId,
  );
  const now = utcNowMs();

  const saved = input.body.saved ?? existing?.saved ?? false;
  const readLater = input.body.readLater ?? existing?.readLater ?? false;
  const dismissed = input.body.dismissed ?? existing?.dismissed ?? false;
  const markLearned = input.body.markLearned ?? false;
  const learnedVersion = markLearned
    ? article.contentVersion
    : (existing?.learnedVersion ?? null);
  const learnedAt = markLearned ? now : (existing?.learnedAt ?? null);

  if (existing) {
    await db
      .update(knowledgeUserStates)
      .set({
        saved,
        readLater,
        dismissed,
        learnedVersion,
        learnedAt,
        updatedAt: now,
        version: existing.version + 1,
      })
      .where(eq(knowledgeUserStates.id, existing.id));
  } else {
    await db.insert(knowledgeUserStates).values({
      id: createUlid(),
      userId: input.userId,
      babyId: input.babyId,
      knowledgeId: input.knowledgeId,
      saved,
      readLater,
      dismissed,
      learnedVersion,
      learnedAt,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
  }

  const fresh = (await getStateRow(
    db,
    input.userId,
    input.babyId,
    input.knowledgeId,
  ))!;
  return mapUserState(fresh, article.contentVersion);
}

// 反馈是轻量信号：校验知识存在即可，P0 不建独立反馈表、不做任何推荐惩罚。
export async function saveFeedback(
  db: Database,
  input: { knowledgeId: string; type: 'REDUCE_CATEGORY' | 'CONTENT_ISSUE' },
): Promise<void> {
  await getKnowledgeRow(db, input.knowledgeId);
}

// 详情页用：读取当前用户对某宝宝某篇知识的状态，无状态行返回 null（尚未互动）。
export async function getKnowledgeState(
  db: Database,
  input: {
    userId: string;
    babyId: string;
    knowledgeId: string;
  },
): Promise<KnowledgeUserState | null> {
  const article = await getKnowledgeRow(db, input.knowledgeId);
  if (article.status !== 'PUBLISHED') {
    throw new AppError('NOT_FOUND', '这篇知识找不到了', 404);
  }
  const row = await getStateRow(
    db,
    input.userId,
    input.babyId,
    input.knowledgeId,
  );
  return row ? mapUserState(row, article.contentVersion) : null;
}

// 快捷入口计数：按宝宝过滤，三个 bucket 各自独立 COUNT，不必拉全量行。
export async function getLibraryCounts(
  db: Database,
  babyId: string,
): Promise<{ saved: number; later: number; learned: number }> {
  const babyEq = eq(knowledgeUserStates.babyId, babyId);
  const count = (extra: Parameters<typeof and>[0]) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(knowledgeUserStates)
      .where(and(babyEq, extra));

  const [saved, later, learned] = await Promise.all([
    count(eq(knowledgeUserStates.saved, true)),
    count(eq(knowledgeUserStates.readLater, true)),
    count(gt(knowledgeUserStates.learnedVersion, 0)),
  ]);
  return {
    saved: Number(saved[0]?.n ?? 0),
    later: Number(later[0]?.n ?? 0),
    learned: Number(learned[0]?.n ?? 0),
  };
}
