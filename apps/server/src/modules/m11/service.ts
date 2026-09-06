import fs from 'node:fs/promises';
import path from 'node:path';
import {
  babyChanges,
  babyPreferences,
  devices,
  exportJobs,
  notificationPreferences,
  realtimeTickets,
  searchDocuments,
  userAuthCredentials,
  userSettings,
  userSessions,
  users,
} from '@runew/db';
import type {
  CreateBabyPreferenceBody,
  CreateExportBody,
  SearchResponse,
  TrashItem,
  UpdateBabyPreferenceBody,
  UpdateUserSettingsBody,
} from '@runew/contracts';
import { updateNotificationPreferencesBodySchema } from '@runew/contracts';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { schema } from '@runew/db';
import { AppError } from '../../lib/errors.js';
import { hashToken } from '../../lib/crypto.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { appendSyncLog } from '../sync/log.js';
import { requireBabyInFamily, requireFamilyMembership } from '../identity/service.js';
import { getMediaFilePath } from '../media/media.service.js';

type Database = LibSQLDatabase<typeof schema>;

type RawSession = {
  all<T>(query: SQL): Promise<T[]>;
  run(query: SQL): Promise<unknown>;
};

function toSqlQuery(query: { sql: string; args: unknown[] }): SQL {
  const chunks = query.sql.split('?');
  const parts: SQL[] = [];
  chunks.forEach((chunk, index) => {
    if (index > 0) parts.push(sql`${query.args[index - 1]}`);
    if (chunk) parts.push(sql.raw(chunk));
  });
  return sql.fromList(parts);
}

function rawRows<T>(db: Database, query: { sql: string; args: unknown[] }): Promise<T[]> {
  const session = (db as unknown as { session?: RawSession }).session;
  if (session) return session.all<T>(toSqlQuery(query));
  const client = (db as unknown as {
    $client: { execute(statement: { sql: string; args: unknown[] }): Promise<{ rows: unknown[] }> };
  }).$client;
  return client.execute(query).then((result) => result.rows as T[]);
}

function rawRun(db: Database, query: { sql: string; args: unknown[] }): Promise<unknown> {
  const session = (db as unknown as { session?: RawSession }).session;
  if (session) return session.run(toSqlQuery(query));
  const client = (db as unknown as {
    $client: { execute(statement: { sql: string; args: unknown[] }): Promise<unknown> };
  }).$client;
  return client.execute(query);
}

// --- Baby profile preferences and recent changes ---

export async function listBabyPreferences(db: Database, userId: string, babyId: string) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  return db
    .select()
    .from(babyPreferences)
    .where(and(eq(babyPreferences.familyId, baby.familyId), eq(babyPreferences.babyId, babyId), isNull(babyPreferences.deletedAt)))
    .orderBy(desc(babyPreferences.createdAt));
}

export async function createBabyPreference(
  db: Database,
  userId: string,
  babyId: string,
  body: CreateBabyPreferenceBody,
) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  const now = utcNowMs();
  const id = createUlid();
  await db.insert(babyPreferences).values({
    id,
    familyId: baby.familyId,
    babyId,
    type: body.type,
    category: body.category ?? null,
    label: body.label,
    sourceType: body.sourceType,
    sourceId: body.sourceId ?? null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
  });
  const rows = await db.select().from(babyPreferences).where(eq(babyPreferences.id, id)).limit(1);
  return rows[0]!;
}

export async function updateBabyPreference(
  db: Database,
  userId: string,
  preferenceId: string,
  body: UpdateBabyPreferenceBody,
  expectedVersion: number | null,
) {
  const rows = await db.select().from(babyPreferences).where(eq(babyPreferences.id, preferenceId)).limit(1);
  const current = rows[0];
  if (!current || current.deletedAt !== null) throw new AppError('NOT_FOUND', '这条偏好找不到了', 404);
  await requireBabyInFamily(db, userId, current.babyId);
  if (expectedVersion !== null && expectedVersion !== current.version) {
    throw new AppError('ENTITY_VERSION_CONFLICT', '宝宝偏好刚刚被更新，请刷新后再试', 409);
  }
  const now = utcNowMs();
  await db.update(babyPreferences).set({
    type: body.type ?? current.type,
    category: body.category === undefined ? current.category : (body.category ?? null),
    label: body.label ?? current.label,
    updatedAt: now,
    version: current.version + 1,
  }).where(eq(babyPreferences.id, preferenceId));
  const updated = await db.select().from(babyPreferences).where(eq(babyPreferences.id, preferenceId)).limit(1);
  return updated[0]!;
}

export async function deleteBabyPreference(db: Database, userId: string, preferenceId: string) {
  const rows = await db.select().from(babyPreferences).where(eq(babyPreferences.id, preferenceId)).limit(1);
  const current = rows[0];
  if (!current || current.deletedAt !== null) throw new AppError('NOT_FOUND', '这条偏好找不到了', 404);
  await requireBabyInFamily(db, userId, current.babyId);
  const now = utcNowMs();
  await db.update(babyPreferences).set({ deletedAt: now, updatedAt: now, version: current.version + 1 }).where(eq(babyPreferences.id, preferenceId));
  return { id: preferenceId, deletedAt: now };
}

export async function restoreBabyPreference(db: Database, userId: string, preferenceId: string, deviceId: string | null = null) {
  const rows = await db.select().from(babyPreferences).where(eq(babyPreferences.id, preferenceId)).limit(1);
  const current = rows[0];
  if (!current || current.deletedAt === null) throw new AppError('NOT_FOUND', '这条偏好不在最近删除里', 404);
  await requireBabyInFamily(db, userId, current.babyId);
  await restoreTrashItem(db, userId, current.familyId, 'BABY_PREFERENCE', preferenceId, deviceId);
  return db.select().from(babyPreferences).where(eq(babyPreferences.id, preferenceId)).limit(1).then((result) => result[0]!);
}

export async function listBabyChanges(db: Database, userId: string, babyId: string) {
  const baby = await requireBabyInFamily(db, userId, babyId);
  return db.select().from(babyChanges)
    .where(and(eq(babyChanges.familyId, baby.familyId), eq(babyChanges.babyId, babyId)))
    .orderBy(desc(babyChanges.changedAt));
}

// --- Settings ---

export async function getUserSettings(db: Database, userId: string) {
  const now = utcNowMs();
  const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (!existing[0]) {
    await db.insert(userSettings).values({
      userId,
      appearance: 'SYSTEM',
      reduceMotion: false,
      defaultDiaryVisibility: 'PRIVATE',
      analyticsEnabled: false,
      updatedAt: now,
    });
    return {
      userId,
      appearance: 'SYSTEM' as const,
      reduceMotion: false,
      privacy: { defaultDiaryVisibility: 'PRIVATE' as const, analyticsEnabled: false },
      updatedAt: now,
    };
  }
  const row = existing[0];
  return {
    userId: row.userId,
    appearance: row.appearance as 'SYSTEM' | 'LIGHT' | 'NIGHT',
    reduceMotion: row.reduceMotion,
    privacy: {
      defaultDiaryVisibility: row.defaultDiaryVisibility as 'PRIVATE' | 'FAMILY',
      analyticsEnabled: row.analyticsEnabled,
    },
    updatedAt: row.updatedAt,
  };
}

export async function updateUserSettings(db: Database, userId: string, body: UpdateUserSettingsBody) {
  const current = await getUserSettings(db, userId);
  const now = utcNowMs();
  await db.update(userSettings).set({
    appearance: body.appearance ?? current.appearance,
    reduceMotion: body.reduceMotion ?? current.reduceMotion,
    defaultDiaryVisibility: body.privacy?.defaultDiaryVisibility ?? current.privacy.defaultDiaryVisibility,
    analyticsEnabled: body.privacy?.analyticsEnabled ?? current.privacy.analyticsEnabled,
    updatedAt: now,
  }).where(eq(userSettings.userId, userId));
  return getUserSettings(db, userId);
}

export async function getNotificationSettings(db: Database, userId: string) {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
  if (rows[0]) return rows[0];
  const now = utcNowMs();
  const row = {
    id: createUlid(), userId, healthEnabled: true, familyTasksEnabled: true,
    rewardsEnabled: true, backupEnabled: true, capsulesEnabled: true,
    anniversariesEnabled: true, dndEnabled: true, dndStartMinute: 1260,
    dndEndMinute: 480, timezoneName: 'Asia/Shanghai', updatedAt: now,
  };
  await db.insert(notificationPreferences).values(row);
  return row;
}

export async function updateNotificationSettings(db: Database, userId: string, patch: Record<string, unknown>) {
  const parsed = updateNotificationPreferencesBodySchema.parse(patch);
  const current = await getNotificationSettings(db, userId);
  const values = {
    healthEnabled: parsed.healthEnabled ?? current.healthEnabled,
    familyTasksEnabled: parsed.familyTasksEnabled ?? current.familyTasksEnabled,
    rewardsEnabled: parsed.rewardsEnabled ?? current.rewardsEnabled,
    backupEnabled: parsed.backupEnabled ?? current.backupEnabled,
    capsulesEnabled: parsed.capsulesEnabled ?? current.capsulesEnabled,
    anniversariesEnabled: parsed.anniversariesEnabled ?? current.anniversariesEnabled,
    dndEnabled: parsed.dndEnabled ?? current.dndEnabled,
    dndStartMinute: parsed.dndStartMinute ?? current.dndStartMinute,
    dndEndMinute: parsed.dndEndMinute ?? current.dndEndMinute,
    timezoneName: parsed.timezoneName ?? current.timezoneName,
    updatedAt: utcNowMs(),
  };
  await db.update(notificationPreferences).set(values).where(eq(notificationPreferences.userId, userId));
  return getNotificationSettings(db, userId);
}

export async function getSettingsSnapshot(db: Database, userId: string) {
  const [user, settings, notifications, userDevices] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    getUserSettings(db, userId),
    getNotificationSettings(db, userId),
    db.select({ id: devices.id, platform: devices.platform, deviceName: devices.deviceName, appVersion: devices.appVersion, lastSeenAt: devices.lastSeenAt })
      .from(devices).where(eq(devices.userId, userId)).orderBy(desc(devices.lastSeenAt)),
  ]);
  if (!user[0]) throw new AppError('NOT_FOUND', '用户不存在', 404);
  return { account: { id: user[0].id, nickname: user[0].nickname, locale: user[0].locale, timezoneName: user[0].timezoneName }, appearance: settings, notifications, devices: userDevices };
}

export async function changeUserPassword(db: Database, userId: string, currentPassword: string, newPassword: string) {
  const rows = await db.select().from(userAuthCredentials).where(eq(userAuthCredentials.userId, userId)).limit(1);
  const credential = rows[0];
  if (!credential || !(await verifyPassword(currentPassword, credential.passwordHash))) {
    throw new AppError('AUTH_INVALID_CREDENTIALS', '当前密码不正确', 401);
  }
  const now = utcNowMs();
  await db.update(userAuthCredentials).set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: now, failedAttempts: 0, lockedUntil: null }).where(eq(userAuthCredentials.userId, userId));
  return { changedAt: now };
}

export async function updateCurrentContext(db: Database, userId: string, deviceId: string | null, familyId: string, babyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  const baby = await requireBabyInFamily(db, userId, babyId);
  if (baby.familyId !== familyId) {
    throw new AppError('FAMILY_ACCESS_DENIED', '宝宝不属于当前家庭', 403);
  }
  if (!deviceId) return { familyId, babyId };
  await db.update(devices).set({ currentFamilyId: familyId, currentBabyId: babyId, lastSeenAt: utcNowMs() }).where(and(eq(devices.id, deviceId), eq(devices.userId, userId)));
  return { familyId, babyId };
}

// --- Search ---

export type SearchDocumentInput = {
  familyId: string | null;
  babyId?: string | null;
  ownerUserId?: string | null;
  visibility?: string;
  entityType: string;
  entityId: string;
  title?: string;
  body?: string;
  occurredAt?: number | null;
  deleted?: boolean;
  capsuleState?: string | null;
};

export async function upsertSearchDocument(db: Database, input: SearchDocumentInput) {
  const values = {
    familyId: input.familyId,
    babyId: input.babyId ?? null,
    ownerUserId: input.ownerUserId ?? null,
    visibility: input.visibility ?? 'FAMILY',
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title ?? '',
    body: input.capsuleState === 'SEALED' ? '' : (input.body ?? ''),
    occurredAt: input.occurredAt ?? null,
    deleted: input.deleted ?? false,
    capsuleState: input.capsuleState ?? null,
  };
  await db.insert(searchDocuments).values(values).onConflictDoUpdate({
    target: [searchDocuments.entityType, searchDocuments.entityId],
    set: values,
  });
}

export async function markSearchDocumentDeleted(db: Database, entityType: string, entityId: string) {
  await db.update(searchDocuments).set({ deleted: true }).where(and(eq(searchDocuments.entityType, entityType), eq(searchDocuments.entityId, entityId)));
}

type SearchSourceRow = Record<string, unknown> & {
  id: string;
  family_id: string | null;
  baby_id?: string | null;
  owner_user_id?: string | null;
  visibility?: string | null;
  title?: string | null;
  body?: string | null;
  occurred_at?: number | null;
  deleted_at?: number | null;
  state?: string | null;
};

function textValue(value: unknown) {
  return value == null ? '' : String(value);
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : value == null ? null : Number(value);
}

async function writeSearchRow(db: Database, input: {
  familyId: string | null;
  babyId?: string | null;
  ownerUserId?: string | null;
  visibility?: string | null;
  entityType: string;
  entityId: string;
  title?: string | null;
  body?: string | null;
  occurredAt?: number | null;
  deleted?: boolean;
  capsuleState?: string | null;
}) {
  const sealed = input.capsuleState === 'SEALED';
  await rawRun(db, {
    sql: `INSERT INTO search_documents
      (family_id,baby_id,owner_user_id,visibility,entity_type,entity_id,title,body,occurred_at,deleted,capsule_state)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(entity_type,entity_id) DO UPDATE SET
        family_id=excluded.family_id,
        baby_id=excluded.baby_id,
        owner_user_id=excluded.owner_user_id,
        visibility=excluded.visibility,
        title=excluded.title,
        body=excluded.body,
        occurred_at=excluded.occurred_at,
        deleted=excluded.deleted,
        capsule_state=excluded.capsule_state`,
    args: [
      input.familyId,
      input.babyId ?? null,
      input.ownerUserId ?? null,
      input.visibility ?? 'FAMILY',
      input.entityType,
      input.entityId,
      input.title ?? '',
      sealed ? '' : (input.body ?? ''),
      input.occurredAt ?? null,
      input.deleted === true ? 1 : 0,
      input.capsuleState ?? null,
    ],
  });
}

function sourceDocument(
  row: SearchSourceRow,
  entityType: string,
  title: string,
  body: string,
  occurredAt: unknown,
) {
  return {
    familyId: row.family_id,
    babyId: row.baby_id ?? null,
    ownerUserId: row.owner_user_id ?? null,
    visibility: row.visibility ?? 'FAMILY',
    entityType,
    entityId: row.id,
    title,
    body,
    occurredAt: numberValue(occurredAt),
    deleted: row.deleted_at != null,
    capsuleState: row.state ?? null,
  };
}

/**
 * Rebuild the searchable projection from business tables. This is idempotent
 * and makes records created before M11 searchable without a one-off backfill.
 */
export async function rebuildSearchIndexForFamily(db: Database, familyId: string) {
  const queries: Array<{
    sql: string;
    entityType: string;
    title: (row: SearchSourceRow) => string;
    body: (row: SearchSourceRow) => string;
    occurredAt: (row: SearchSourceRow) => unknown;
  }> = [
    { sql: 'SELECT * FROM feeding_records WHERE family_id=?', entityType: 'FEEDING_RECORD', title: () => '喂奶记录', body: (r) => [r.feeding_type, r.milk_type, r.amount_ml ? `${r.amount_ml}ml` : '', r.note].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.recorded_at },
    { sql: 'SELECT * FROM sleep_records WHERE family_id=?', entityType: 'SLEEP_RECORD', title: () => '睡眠记录', body: (r) => [r.status, r.note, r.duration_seconds ? `${r.duration_seconds}s` : ''].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.started_at },
    { sql: 'SELECT * FROM diaper_records WHERE family_id=?', entityType: 'DIAPER_RECORD', title: () => '尿布记录', body: (r) => [r.diaper_type, r.stool_color, r.stool_texture, r.note].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.recorded_at },
    { sql: 'SELECT * FROM food_records WHERE family_id=?', entityType: 'FOOD_RECORD', title: (r) => textValue(r.food_name) || '饮食记录', body: (r) => [r.food_name, r.amount_text, r.reaction, r.preference, r.note].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.recorded_at },
    { sql: 'SELECT * FROM growth_records WHERE family_id=?', entityType: 'GROWTH_RECORD', title: () => '成长记录', body: (r) => [`身高 ${textValue(r.height_cm)}`, `体重 ${textValue(r.weight_kg)}`, `头围 ${textValue(r.head_circumference_cm)}`, r.note].filter(Boolean).join(' '), occurredAt: (r) => r.recorded_at },
    { sql: 'SELECT * FROM milestones WHERE family_id=?', entityType: 'MILESTONE', title: (r) => textValue(r.title) || '成长里程碑', body: (r) => [r.title, r.description].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.happened_at },
    { sql: 'SELECT * FROM health_events WHERE family_id=?', entityType: 'HEALTH_EVENT', title: (r) => textValue(r.title) || '健康事项', body: (r) => [r.title, r.event_type, r.location_name, r.doctor_name, r.note].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.scheduled_at },
    { sql: 'SELECT * FROM photo_memories WHERE family_id=?', entityType: 'PHOTO_MEMORY', title: (r) => textValue(r.title) || '照片记忆', body: (r) => [r.title, r.story].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.happened_at },
    { sql: 'SELECT * FROM baby_quotes WHERE family_id=?', entityType: 'BABY_QUOTE', title: () => '宝宝语录', body: (r) => textValue(r.quote_text), occurredAt: (r) => r.happened_at },
    { sql: 'SELECT * FROM audio_memories WHERE family_id=?', entityType: 'AUDIO_MEMORY', title: (r) => textValue(r.title) || '声音记忆', body: (r) => [r.title, r.category].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.happened_at },
    { sql: 'SELECT * FROM first_moments WHERE family_id=?', entityType: 'FIRST_MOMENT', title: (r) => textValue(r.title) || '第一次', body: (r) => [r.title, r.description].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.happened_at },
    { sql: 'SELECT * FROM time_capsules WHERE family_id=?', entityType: 'TIME_CAPSULE', title: (r) => [r.title, r.recipient_text].map(textValue).filter(Boolean).join(' '), body: (r) => [r.body, r.recipient_text].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.open_at },
    { sql: 'SELECT * FROM diaries WHERE family_id=?', entityType: 'DIARY', title: (r) => textValue(r.title) || '妈妈日记', body: (r) => textValue(r.body), occurredAt: (r) => r.recorded_at },
    // Moods store the owner as `user_id`, unlike diaries. Alias it into the
    // projection so PRIVATE mood notes receive the same query-layer policy.
    { sql: 'SELECT *, user_id AS owner_user_id FROM moods WHERE family_id=?', entityType: 'MOOD', title: () => '心情记录', body: (r) => [r.mood, r.note].map(textValue).filter(Boolean).join(' '), occurredAt: (r) => r.recorded_at },
  ];

  for (const source of queries) {
    const rows = await rawRows<SearchSourceRow>(db, { sql: source.sql, args: [familyId] });
    for (const row of rows) {
      await writeSearchRow(db, sourceDocument(row, source.entityType, source.title(row), source.body(row), source.occurredAt(row)));
    }
  }

  // Knowledge documents are global rows. Mark the previous projection stale
  // before re-projecting only currently published content, so an article that
  // was taken offline cannot remain searchable from an old index row.
  await rawRun(db, { sql: "UPDATE search_documents SET deleted=1 WHERE entity_type='KNOWLEDGE'", args: [] });
  const knowledgeRows = await rawRows<SearchSourceRow>(db, {
    sql: "SELECT id,title,summary,body,updated_at,deleted_at,status FROM knowledge WHERE status='PUBLISHED'",
    args: [],
  });
  for (const row of knowledgeRows) {
    await writeSearchRow(db, {
      familyId: null,
      entityType: 'KNOWLEDGE',
      entityId: row.id,
      title: textValue(row.title),
      body: [row.summary, row.body].map(textValue).filter(Boolean).join(' '),
      occurredAt: numberValue(row.updated_at),
      deleted: row.deleted_at != null,
    });
  }
}

function bigramTerms(query: string) {
  const normalized = query.trim().replaceAll('\0', '');
  const chars = [...normalized];
  if (chars.length < 2) return [normalized];
  const terms: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) terms.push(`${chars[index]}${chars[index + 1]}`);
  return terms;
}

function ftsQuery(query: string) {
  return bigramTerms(query).map((term) => `"${term.replace(/"/g, '""')}"`).join(' AND ');
}

// A stale projection can outlive a soft-deleted baby. Search must enforce the
// parent lifecycle at query time instead of trusting only the projection flag.
const ACTIVE_BABY_SEARCH_PREDICATE = `(d.baby_id IS NULL OR EXISTS (
  SELECT 1 FROM babies b
  WHERE b.id = d.baby_id
    AND b.family_id = d.family_id
    AND b.deleted_at IS NULL
))`;

type SearchRow = {
  rowid: number;
  family_id: string | null;
  baby_id: string | null;
  owner_user_id: string | null;
  visibility: string;
  entity_type: string;
  entity_id: string;
  title: string;
  body: string;
  occurred_at: number | null;
  capsule_state?: string | null;
};

function mapSearchRows(rows: SearchRow[], query: string, hasMore = false): SearchResponse {
  return {
    query,
    items: rows.map((row) => ({
      id: `${row.entity_type}:${row.entity_id}`,
      familyId: row.family_id,
      babyId: row.baby_id,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
      entityType: row.entity_type,
      entityId: row.entity_id,
      title: row.title,
      snippet: row.capsule_state === 'SEALED' ? '' : (row.body.length > 180 ? `${row.body.slice(0, 180)}…` : row.body),
      occurredAt: row.occurred_at,
    })),
    hasMore,
  };
}

function escapeLikeTerm(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

async function searchLikeBigrams(db: Database, userId: string, familyId: string | null, query: string, limit: number) {
  const terms = bigramTerms(query);
  const predicates = terms.map(() => `(d.title LIKE ? ESCAPE '\\' OR d.body LIKE ? ESCAPE '\\')`).join(' AND ');
  const likeArgs = terms.flatMap((term) => {
    const escaped = escapeLikeTerm(term);
    return [escaped, escaped];
  });
  return rawRows<SearchRow>(db, {
    sql: `SELECT d.rowid,d.family_id,d.baby_id,d.owner_user_id,d.visibility,d.entity_type,d.entity_id,d.title,d.body,d.occurred_at,d.capsule_state
          FROM search_documents d
          WHERE d.deleted=0 AND (d.family_id IS NULL OR d.family_id = ?)
            AND ${ACTIVE_BABY_SEARCH_PREDICATE}
            AND (d.visibility <> 'PRIVATE' OR d.owner_user_id = ?)
            AND (d.capsule_state IS NULL OR d.capsule_state <> 'SEALED')
            AND ${predicates}
          ORDER BY COALESCE(d.occurred_at,0) DESC LIMIT ?`,
    args: [familyId, userId, ...likeArgs, limit],
  });
}

export async function searchDocumentsForUser(db: Database, userId: string, query: string, familyId: string | null, limit = 30) {
  if (familyId) await rebuildSearchIndexForFamily(db, familyId);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : 30;
  const args = [ftsQuery(query), familyId, userId, safeLimit];
  let rows: SearchRow[] = [];
  try {
    rows = await rawRows<SearchRow>(db, {
      sql: `SELECT d.rowid,d.family_id,d.baby_id,d.owner_user_id,d.visibility,d.entity_type,d.entity_id,d.title,d.body,d.occurred_at,d.capsule_state
            FROM search_documents d JOIN search_documents_fts f ON f.rowid=d.rowid
            WHERE search_documents_fts MATCH ?
              AND d.deleted=0
              AND (d.family_id IS NULL OR d.family_id = ?)
              AND ${ACTIVE_BABY_SEARCH_PREDICATE}
              AND (d.visibility <> 'PRIVATE' OR d.owner_user_id = ?)
              AND (d.capsule_state IS NULL OR d.capsule_state <> 'SEALED')
            ORDER BY COALESCE(d.occurred_at,0) DESC LIMIT ?`,
      args: [...args.slice(0, -1), safeLimit + 1],
    });
  } catch {
    // FTS can reject punctuation; keep permissions while applying app-level 2-grams.
    rows = await searchLikeBigrams(db, userId, familyId, query, safeLimit + 1);
  }
  if (rows.length === 0) {
    rows = await searchLikeBigrams(db, userId, familyId, query, safeLimit + 1);
  }
  const sealedQuery = `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`;
  const sealed = await rawRows<SearchRow>(db, {
    sql: `SELECT d.rowid,d.family_id,d.baby_id,d.owner_user_id,d.visibility,d.entity_type,d.entity_id,d.title,d.body,d.occurred_at,d.capsule_state
          FROM search_documents d
          WHERE d.deleted=0 AND d.capsule_state='SEALED'
            AND (d.family_id IS NULL OR d.family_id = ?)
            AND ${ACTIVE_BABY_SEARCH_PREDICATE}
            AND (d.visibility <> 'PRIVATE' OR d.owner_user_id = ?)
            AND d.title LIKE ? ESCAPE '\\'
          ORDER BY COALESCE(d.occurred_at,0) DESC LIMIT ?`,
    args: [familyId, userId, sealedQuery, safeLimit + 1],
  });
  rows = [...rows, ...sealed.filter((candidate) => !rows.some((row) => row.rowid === candidate.rowid))]
    .sort((a, b) => (b.occurred_at ?? 0) - (a.occurred_at ?? 0));
  const hasMore = rows.length > safeLimit;
  return mapSearchRows(rows.slice(0, safeLimit), query, hasMore);
}

// --- Trash / restore ---

type TrashSource = { table: string; entityType: string; title: string; babyId: string | null; deletedBy: boolean; privateOwner: boolean; ownerColumn?: string };
const TRASH_SOURCES: TrashSource[] = [
  { table: 'babies', entityType: 'BABY', title: 'name', babyId: null, deletedBy: false, privateOwner: false },
  { table: 'baby_preferences', entityType: 'BABY_PREFERENCE', title: 'label', babyId: 'baby_id', deletedBy: false, privateOwner: false },
  { table: 'feeding_records', entityType: 'FEEDING_RECORD', title: "'喂奶记录'", babyId: 'baby_id', deletedBy: true, privateOwner: false },
  { table: 'sleep_records', entityType: 'SLEEP_RECORD', title: "'睡眠记录'", babyId: 'baby_id', deletedBy: true, privateOwner: false },
  { table: 'diaper_records', entityType: 'DIAPER_RECORD', title: "'尿布记录'", babyId: 'baby_id', deletedBy: true, privateOwner: false },
  { table: 'food_records', entityType: 'FOOD_RECORD', title: 'food_name', babyId: 'baby_id', deletedBy: true, privateOwner: false },
  { table: 'growth_records', entityType: 'GROWTH_RECORD', title: "'成长记录'", babyId: 'baby_id', deletedBy: true, privateOwner: false },
  { table: 'milestones', entityType: 'MILESTONE', title: 'title', babyId: 'baby_id', deletedBy: true, privateOwner: false },
  { table: 'health_events', entityType: 'HEALTH_EVENT', title: 'title', babyId: 'baby_id', deletedBy: true, privateOwner: false },
  { table: 'moods', entityType: 'MOOD', title: "'心情记录'", babyId: null, deletedBy: false, privateOwner: true, ownerColumn: 'user_id' },
  { table: 'diaries', entityType: 'DIARY', title: "COALESCE(title,'妈妈日记')", babyId: null, deletedBy: true, privateOwner: true },
  { table: 'photo_memories', entityType: 'PHOTO_MEMORY', title: 'title', babyId: 'baby_id', deletedBy: false, privateOwner: false },
  { table: 'baby_quotes', entityType: 'BABY_QUOTE', title: "'宝宝语录'", babyId: 'baby_id', deletedBy: false, privateOwner: false },
  { table: 'audio_memories', entityType: 'AUDIO_MEMORY', title: 'title', babyId: 'baby_id', deletedBy: false, privateOwner: false },
  { table: 'first_moments', entityType: 'FIRST_MOMENT', title: 'title', babyId: 'baby_id', deletedBy: false, privateOwner: false },
  { table: 'time_capsules', entityType: 'TIME_CAPSULE', title: 'title', babyId: 'baby_id', deletedBy: false, privateOwner: false },
];

type TrashDbRow = { entity_id: string; family_id: string; baby_id: string | null; title: string; deleted_at: number; deleted_by: string | null; owner_user_id: string | null };
const DEFAULT_TRASH_RETENTION_DAYS = 30;
const TRASH_RETENTION_MS = DEFAULT_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function listTrash(db: Database, userId: string, familyId: string, retentionDays = DEFAULT_TRASH_RETENTION_DAYS): Promise<TrashItem[]> {
  await requireFamilyMembership(db, userId, familyId);
  const cutoff = utcNowMs() - retentionDays * 24 * 60 * 60 * 1000;
  const items: TrashItem[] = [];
  for (const source of TRASH_SOURCES) {
    const babyColumn = source.babyId ? `, ${source.babyId} AS baby_id` : ', NULL AS baby_id';
    const deletedByColumn = source.deletedBy ? ', deleted_by' : ', NULL AS deleted_by';
    const ownerField = source.ownerColumn ?? 'owner_user_id';
    const ownerColumn = source.privateOwner ? `, ${ownerField} AS owner_user_id` : ', NULL AS owner_user_id';
    try {
      const rows = await rawRows<TrashDbRow>(db, {
        sql: `SELECT id AS entity_id,family_id${babyColumn},${source.title} AS title,deleted_at${deletedByColumn}${ownerColumn}
              FROM ${source.table} WHERE family_id=? AND deleted_at IS NOT NULL AND deleted_at >= ? ORDER BY deleted_at DESC`,
        args: [familyId, cutoff],
      });
      for (const row of rows) {
        if (source.privateOwner && row.owner_user_id !== userId) continue;
        items.push({ entityType: source.entityType, entityId: row.entity_id, familyId: row.family_id, babyId: row.baby_id, title: row.title, deletedAt: row.deleted_at, deletedBy: row.deleted_by, expiresAt: row.deleted_at + retentionDays * 24 * 60 * 60 * 1000, mediaGraceUntil: source.entityType.includes('PHOTO') || source.entityType.includes('AUDIO') ? row.deleted_at + 90 * 24 * 60 * 60 * 1000 : null });
      }
    } catch {
      // A table introduced by a later optional module may not exist in a legacy database.
    }
  }
  return items.sort((a, b) => b.deletedAt - a.deletedAt);
}

function sourceForEntity(entityType: string) {
  return TRASH_SOURCES.find((source) => source.entityType === entityType);
}

export async function restoreTrashItem(db: Database, userId: string, familyId: string, entityType: string, entityId: string, deviceId: string | null = null) {
  await requireFamilyMembership(db, userId, familyId);
  const source = sourceForEntity(entityType);
  if (!source) throw new AppError('VALIDATION_ERROR', '不支持恢复这类内容', 400);
  const ownerField = source.ownerColumn ?? 'owner_user_id';
  const ownerPredicate = source.privateOwner ? ` AND ${ownerField} = ?` : '';
  const args: unknown[] = [entityId, familyId];
  if (source.privateOwner) args.push(userId);
  // Restore, search reactivation, and the sync change must commit together.
  // Otherwise a crash between these writes can make an item look restored in
  // one surface while remaining deleted (or unsynced) in another.
  return db.transaction(async (tx) => {
    const transactionDb = tx as unknown as Database;
    await requireFamilyMembership(transactionDb, userId, familyId);
    const existing = await rawRows<TrashDbRow>(transactionDb, {
      sql: `SELECT id AS entity_id,family_id,deleted_at${source.privateOwner ? `, ${ownerField} AS owner_user_id` : ', NULL AS owner_user_id'} FROM ${source.table} WHERE id=? AND family_id=? AND deleted_at IS NOT NULL${ownerPredicate} LIMIT 1`,
      args,
    });
    const row = existing[0];
    if (!row) throw new AppError('NOT_FOUND', '内容不存在或已恢复', 404);
    const now = utcNowMs();
    if (row.deleted_at < now - TRASH_RETENTION_MS) {
      throw new AppError('GONE', '内容已超过最近删除保留期限', 410);
    }
    const updateArgs: unknown[] = [entityId, familyId];
    const updateOwnerPredicate = source.privateOwner ? ` AND ${ownerField} = ?` : '';
    if (source.privateOwner) updateArgs.push(userId);
    const updatedRows = await rawRows<{ version: number }>(transactionDb, {
      sql: `UPDATE ${source.table} SET deleted_at=NULL, version=version+1${source.deletedBy ? ', deleted_by=NULL' : ''} WHERE id=? AND family_id=?${updateOwnerPredicate} AND deleted_at IS NOT NULL RETURNING version`,
      args: updateArgs,
    });
    if (!updatedRows[0]) throw new AppError('CONFLICT', '内容刚刚发生变化，请重新打开最近删除', 409);

    const searchOwnerPredicate = source.privateOwner ? ' AND owner_user_id = ?' : '';
    const searchArgs: unknown[] = [entityType, entityId, familyId];
    if (source.privateOwner) searchArgs.push(userId);
    await rawRun(transactionDb, {
      sql: `UPDATE search_documents SET deleted=0 WHERE entity_type=? AND entity_id=? AND family_id=?${searchOwnerPredicate}`,
      args: searchArgs,
    });
    const version = updatedRows[0].version;
    await appendSyncLog(tx, { operationId: createUlid(), familyId, actorUserId: userId, deviceId, entityType, entityId, op: 'RESTORE', entityVersion: version }, now);
    return { entityType, entityId, restored: true, version };
  });
}

// --- Export jobs ---

export async function createExportJob(db: Database, userId: string, body: CreateExportBody) {
  await requireFamilyMembership(db, userId, body.familyId);
  if (body.babyId) {
    const baby = await requireBabyInFamily(db, userId, body.babyId);
    if (baby.familyId !== body.familyId) {
      throw new AppError('FAMILY_ACCESS_DENIED', '宝宝不属于当前家庭', 403);
    }
  }
  const now = utcNowMs();
  const id = createUlid();
  const row = { id, userId, familyId: body.familyId, babyId: body.babyId ?? null, type: body.type, state: 'QUEUED', filePath: null, createdAt: now, startedAt: null, finishedAt: null, expiresAt: now + 48 * 60 * 60 * 1000, errorCode: null };
  await db.insert(exportJobs).values(row);
  return row;
}

export async function getExportJob(db: Database, userId: string, id: string) {
  const rows = await db.select().from(exportJobs).where(and(eq(exportJobs.id, id), eq(exportJobs.userId, userId))).limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '导出任务不存在', 404);
  // An export remains a family resource even after it has been queued. Recheck
  // membership on every read/download so a removed member cannot use an old
  // job as a data exfiltration path.
  await requireFamilyMembership(db, userId, row.familyId);
  if (row.expiresAt <= utcNowMs() && row.state !== 'EXPIRED') {
    if (row.filePath) {
      await fs.unlink(row.filePath).catch(() => undefined);
    }
    await db.update(exportJobs).set({ state: 'EXPIRED', filePath: null }).where(eq(exportJobs.id, id));
    return { ...row, state: 'EXPIRED' as const, filePath: null };
  }
  return row;
}

/**
 * Lists only jobs the caller can still access and normalizes expired rows on
 * the read path.  This keeps the list contract consistent with detail and
 * download, even when the scheduler has not run recently.
 */
export async function listExportJobs(db: Database, userId: string, familyId: string) {
  await requireFamilyMembership(db, userId, familyId);
  const rows = await db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.userId, userId), eq(exportJobs.familyId, familyId)))
    .orderBy(desc(exportJobs.createdAt));
  const now = utcNowMs();
  const result: Array<typeof exportJobs.$inferSelect> = [];
  for (const row of rows) {
    if (row.expiresAt <= now && row.state !== 'EXPIRED') {
      if (row.filePath) await fs.unlink(row.filePath).catch(() => undefined);
      const expired = await db
        .update(exportJobs)
        .set({ state: 'EXPIRED', filePath: null })
        .where(and(eq(exportJobs.id, row.id), eq(exportJobs.userId, userId)))
        .returning();
      result.push(expired[0] ?? { ...row, state: 'EXPIRED', filePath: null });
    } else {
      result.push(row);
    }
  }
  return result;
}

/** Never expose the server-side export path through the API. */
export function toPublicExportJob(row: typeof exportJobs.$inferSelect) {
  const { filePath: _filePath, ...publicRow } = row;
  return publicRow;
}

type ExportMediaRow = {
  media_id: string;
  storage_key: string | null;
  original_storage_key: string | null;
  mime_type: string;
  original_filename: string | null;
  entity_type: string;
  entity_id: string;
};

function crc32(value: Buffer) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Small dependency-free ZIP writer for export archives. Files are stored
 * without compression so the implementation stays portable across H5,
 * Weapp, and the server's bundled Node runtime.
 */
function buildStoredZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, entry.data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + entry.data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function archiveExtension(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('wav')) return 'wav';
  if (normalized.includes('mpeg')) return 'mp3';
  if (normalized.includes('mp4')) return 'm4a';
  if (normalized.includes('ogg')) return 'ogg';
  return 'bin';
}

async function writeExportFile(db: Database, row: typeof exportJobs.$inferSelect, root: string) {
  const directory = path.resolve(root, 'exports');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const targetExtension = row.type === 'CSV' ? 'csv' : row.type === 'PHOTO_AUDIO_ARCHIVE' ? 'zip' : 'json';
  const target = path.join(directory, `${row.id}.${targetExtension}`);
  // Search is a projection, so refresh it immediately before exporting. This
  // also makes a just-deleted baby disappear even when no scheduler ran yet.
  await rebuildSearchIndexForFamily(db, row.familyId);
  const babyPredicate = row.babyId ? ' AND (baby_id=? OR baby_id IS NULL)' : '';
  const baseArgs: unknown[] = [row.familyId, row.userId];
  if (row.babyId) baseArgs.push(row.babyId);
  const docs = await rawRows<{
    entity_type: string;
    entity_id: string;
    title: string;
    body: string;
    occurred_at: number | null;
    capsule_state: string | null;
  }>(db, {
    sql: `SELECT entity_type,entity_id,title,
            CASE WHEN capsule_state='SEALED' THEN '' ELSE body END AS body,
            occurred_at,capsule_state
          FROM search_documents
          WHERE family_id=? AND deleted=0
            AND (visibility <> 'PRIVATE' OR owner_user_id=?)${babyPredicate}
            AND (baby_id IS NULL OR EXISTS (SELECT 1 FROM babies b WHERE b.id=baby_id AND b.family_id=search_documents.family_id AND b.deleted_at IS NULL))
          ORDER BY occurred_at DESC`,
    args: baseArgs,
  });

  const growthTypes = new Set(['GROWTH_RECORD', 'MILESTONE']);
  const mediaTypes = new Set(['PHOTO_MEMORY', 'AUDIO_MEMORY']);
  const memoryTypes = new Set(['PHOTO_MEMORY', 'AUDIO_MEMORY', 'BABY_QUOTE', 'FIRST_MOMENT', 'TIME_CAPSULE']);
  const scoped = (types?: Set<string>) => (types ? docs.filter((item) => types.has(item.entity_type)) : docs);
  const jsonEnvelope = (format: string, items: typeof docs) => JSON.stringify({ format, familyId: row.familyId, babyId: row.babyId, generatedAt: utcNowMs(), items }, null, 2);
  let body = '';
  if (row.type === 'CSV') {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    body = [
      'entity_type,entity_id,title,occurred_at',
      ...docs.map((item) => [item.entity_type, item.entity_id, quote(item.title), item.occurred_at ?? ''].join(',')),
    ].join('\n');
  } else if (row.type === 'GROWTH_REPORT') {
    body = jsonEnvelope('GROWTH_REPORT', scoped(growthTypes));
  } else if (row.type === 'PHOTO_AUDIO_ARCHIVE') {
    const mediaDocs = scoped(mediaTypes);
    const mediaBabyPredicate = row.babyId ? ' AND d.baby_id=?' : '';
    const mediaArgs: unknown[] = [row.familyId, row.userId];
    if (row.babyId) mediaArgs.push(row.babyId);
    const mediaRows = await rawRows<ExportMediaRow>(db, {
      sql: `SELECT m.id AS media_id,m.storage_key,m.original_storage_key,m.mime_type,m.original_filename,
              d.entity_type,d.entity_id
            FROM search_documents d
            JOIN photo_memory_media pmm ON d.entity_type='PHOTO_MEMORY' AND d.entity_id=pmm.photo_memory_id
            JOIN media_files m ON m.id=pmm.media_id
            WHERE d.family_id=? AND d.deleted=0 AND d.entity_type='PHOTO_MEMORY'
              AND (d.visibility <> 'PRIVATE' OR d.owner_user_id=?)${mediaBabyPredicate}
              AND (d.baby_id IS NULL OR EXISTS (SELECT 1 FROM babies b WHERE b.id=d.baby_id AND b.family_id=d.family_id AND b.deleted_at IS NULL))
              AND m.status='READY' AND m.deleted_at IS NULL
            UNION ALL
            SELECT m.id AS media_id,m.storage_key,m.original_storage_key,m.mime_type,m.original_filename,
              d.entity_type,d.entity_id
            FROM search_documents d
            JOIN audio_memories am ON d.entity_type='AUDIO_MEMORY' AND d.entity_id=am.id
            JOIN media_files m ON m.id=am.media_id
            WHERE d.family_id=? AND d.deleted=0 AND d.entity_type='AUDIO_MEMORY'
              AND (d.visibility <> 'PRIVATE' OR d.owner_user_id=?)${mediaBabyPredicate}
              AND (d.baby_id IS NULL OR EXISTS (SELECT 1 FROM babies b WHERE b.id=d.baby_id AND b.family_id=d.family_id AND b.deleted_at IS NULL))
              AND m.status='READY' AND m.deleted_at IS NULL`,
      args: row.babyId ? [...mediaArgs, row.familyId, row.userId, row.babyId] : [...mediaArgs, row.familyId, row.userId],
    });
    const entries: Array<{ name: string; data: Buffer }> = [];
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const media of mediaRows) {
      if (seen.has(media.media_id)) continue;
      seen.add(media.media_id);
      const storageKey = media.original_storage_key ?? media.storage_key;
      if (!storageKey) {
        missing.push(media.media_id);
        continue;
      }
      try {
        const file = await fs.readFile(await getMediaFilePath(storageKey));
        entries.push({ name: `media/${media.media_id}.${archiveExtension(media.mime_type)}`, data: file });
      } catch {
        // Keep the manifest useful when a legacy row has lost its physical file.
        missing.push(media.media_id);
      }
    }
    const manifest = {
      format: 'PHOTO_AUDIO_ARCHIVE',
      familyId: row.familyId,
      babyId: row.babyId,
      generatedAt: utcNowMs(),
      documents: mediaDocs,
      files: entries.map((entry) => entry.name),
      missingMediaIds: missing,
    };
    entries.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') });
    return await writeExportTarget(target, buildStoredZip(entries));
  } else if (row.type === 'MEMORY_ARCHIVE') {
    body = jsonEnvelope('MEMORY_ARCHIVE', scoped(memoryTypes));
  } else {
    // Annual review keeps all family-visible records and lets the client group
    // them by local year without exposing private or sealed body content.
    const years = new Map<string, typeof docs>();
    for (const item of docs) {
      const year = item.occurred_at ? String(new Date(item.occurred_at).getUTCFullYear()) : 'unknown';
      const list = years.get(year) ?? [];
      list.push(item);
      years.set(year, list);
    }
    body = JSON.stringify({ format: 'ANNUAL_REVIEW', familyId: row.familyId, babyId: row.babyId, generatedAt: utcNowMs(), years: Object.fromEntries(years) }, null, 2);
  }
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, body, 'utf8');
  await fs.rename(temporary, target);
  return target;
}

async function writeExportTarget(target: string, content: Buffer | string) {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, content);
  await fs.rename(temporary, target);
  return target;
}

export async function processExportJob(db: Database, id: string, root: string) {
  const rows = await db.select().from(exportJobs).where(eq(exportJobs.id, id)).limit(1);
  const row = rows[0];
  if (!row || row.state !== 'QUEUED') return row ?? null;
  const now = utcNowMs();
  if (row.expiresAt <= now) {
    if (row.filePath) await fs.unlink(row.filePath).catch(() => undefined);
    const expired = await db
      .update(exportJobs)
      .set({ state: 'EXPIRED', filePath: null, finishedAt: row.finishedAt ?? now })
      .where(and(eq(exportJobs.id, id), eq(exportJobs.state, 'QUEUED')))
      .returning();
    return expired[0] ?? { ...row, state: 'EXPIRED', filePath: null, finishedAt: row.finishedAt ?? now };
  }
  const claimed = await db.update(exportJobs).set({ state: 'RUNNING', startedAt: now }).where(and(eq(exportJobs.id, id), eq(exportJobs.state, 'QUEUED'))).returning();
  if (!claimed[0]) return getExportJob(db, row.userId, id);
  try {
    const filePath = await writeExportFile(db, claimed[0], root);
    const finishedAt = utcNowMs();
    // A large archive can outlive its lease while it is being assembled. Do
    // not publish a file that is already expired when generation completes.
    if (finishedAt >= claimed[0].expiresAt) {
      await fs.unlink(filePath).catch(() => undefined);
      const expired = await db
        .update(exportJobs)
        .set({ state: 'EXPIRED', filePath: null, finishedAt })
        .where(and(eq(exportJobs.id, id), eq(exportJobs.state, 'RUNNING')))
        .returning();
      return expired[0] ?? { ...claimed[0], state: 'EXPIRED', filePath: null, finishedAt };
    }
    const ready = await db.update(exportJobs).set({ state: 'READY', filePath, finishedAt }).where(eq(exportJobs.id, id)).returning();
    return ready[0] ?? claimed[0];
  } catch {
    const failed = await db.update(exportJobs).set({ state: 'FAILED', errorCode: 'EXPORT_BUILD_FAILED', finishedAt: utcNowMs() }).where(eq(exportJobs.id, id)).returning();
    return failed[0] ?? claimed[0];
  }
}

export async function readExportFile(db: Database, userId: string, id: string) {
  const row = await getExportJob(db, userId, id);
  if (row.state === 'EXPIRED' || row.expiresAt <= utcNowMs()) throw new AppError('EXPORT_EXPIRED', '导出文件已过期，请重新导出', 410);
  if (row.state !== 'READY' || !row.filePath) throw new AppError('CONFLICT', '导出还在准备中，请稍后再试', 409, true);
  try {
    return { row, content: await fs.readFile(row.filePath) };
  } catch {
    throw new AppError('NOT_FOUND', '导出文件已被清理，请重新导出', 404);
  }
}

// --- Realtime one-time tickets ---

export async function issueRealtimeTicket(db: Database, userId: string, sessionId: string, familyId: string | null, deviceId: string | null) {
  if (familyId) await requireFamilyMembership(db, userId, familyId);
  const token = createUlid() + createUlid();
  const now = utcNowMs();
  await db.insert(realtimeTickets).values({ id: createUlid(), tokenHash: hashToken(token), userId, sessionId, familyId, deviceId, expiresAt: now + 60_000, usedAt: null, createdAt: now });
  return { ticket: token, expiresAt: now + 60_000, wsPath: '/ws' as const };
}

export async function consumeRealtimeTicket(db: Database, token: string) {
  const rows = await db.select().from(realtimeTickets).where(eq(realtimeTickets.tokenHash, hashToken(token))).limit(1);
  const row = rows[0];
  const now = utcNowMs();
  if (!row || row.usedAt !== null || row.expiresAt <= now || !row.sessionId) throw new AppError('AUTH_REQUIRED', '实时连接票据已失效', 401);
  const claimed = await db.update(realtimeTickets).set({ usedAt: now }).where(and(
    eq(realtimeTickets.id, row.id),
    eq(realtimeTickets.sessionId, row.sessionId),
    isNull(realtimeTickets.usedAt),
    gt(realtimeTickets.expiresAt, now),
    sql`exists (
      select 1
      from ${userSessions}
      where ${userSessions.id} = ${row.sessionId}
        and ${userSessions.userId} = ${row.userId}
        and ${userSessions.revokedAt} is null
        and ${userSessions.expiresAt} > ${now}
    )`,
  )).returning();
  if (!claimed[0]) throw new AppError('AUTH_REQUIRED', '实时连接票据已使用', 401);
  return { userId: row.userId, sessionId: row.sessionId, familyId: row.familyId, deviceId: row.deviceId };
}
