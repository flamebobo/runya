import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  adminAuthBodySchema,
  adminReauthBodySchema,
  auditLogSchema,
  createSuccessEnvelope,
  exportTypeSchema,
} from '@runew/contracts';
import {
  auditLogs,
  backupRuns,
  babies,
  families,
  familyMemberPermissions,
  familyMembers,
  gemRules,
  gemTransactions,
  knowledge,
  knowledgeUserStates,
  exportJobs,
  idempotencyKeys,
  photoMemories,
  rewards,
  realtimeTickets,
  systemSettings,
  users,
} from '@runew/db';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { requireIdempotencyKey, withIdempotency } from '../../lib/idempotency.js';
import { requireAuth } from '../../plugins/auth.js';
import {
  ADMIN_REAUTH_HEADER,
  ADMIN_SESSION_COOKIE_NAME,
  appendAuditLog,
  authenticateAdmin,
  consumeAdminReauthGrant,
  ensureAdminCredential,
  extractAdminToken,
  issueAdminReauthGrant,
  parseAuditRow,
  resolveAdminSession,
  revokeAdminSession,
  type AdminSessionContext,
  type DbExecutor,
} from './service.js';
import { processExportJob, toPublicExportJob } from '../m11/service.js';

type Database = FastifyRequest['db'];

declare module 'fastify' {
  interface FastifyRequest {
    adminSession?: AdminSessionContext;
  }
}

const idSchema = z.string().trim().min(1).max(160);
const nullableIdSchema = idSchema.nullable().optional();

const gemAdjustSchema = z.object({
  amount: z.number().int().refine((value) => value !== 0, '调整数量不能为 0'),
  reasonCode: z.string().trim().min(1).max(80).default('ADMIN_ADJUSTMENT'),
  reasonText: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

const gemRuleCreateSchema = z.object({
  familyId: nullableIdSchema,
  actionType: z.string().trim().min(1).max(80),
  amount: z.number().int(),
  dailyLimit: z.number().int().nonnegative().nullable().optional(),
  enabled: z.boolean().optional(),
});
const gemRuleUpdateSchema = gemRuleCreateSchema.partial().omit({ familyId: true });

const rewardAdminCreateSchema = z.object({
  familyId: idSchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  priceGems: z.number().int().positive().max(100000),
  stock: z.number().int().nonnegative().nullable().optional(),
  illustrationKey: z.string().trim().max(40).nullable().optional(),
  status: z.enum(['ACTIVE', 'OFFLINE']).optional(),
  sortOrder: z.number().int().optional(),
});
const rewardAdminUpdateSchema = rewardAdminCreateSchema.partial().omit({ familyId: true });

const knowledgeCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(1000).default(''),
  body: z.string().trim().min(1).max(100000),
  category: z.string().trim().min(1).max(40),
  minAgeDays: z.number().int().nonnegative().nullable().optional(),
  maxAgeDays: z.number().int().nonnegative().nullable().optional(),
  sourceName: z.string().trim().min(1).max(200),
  sourceUrl: z.string().url().nullable().optional(),
  reviewedAt: z.number().int().positive().optional(),
  contentVersion: z.number().int().positive().optional(),
  priority: z.number().int().optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'OFFLINE']).optional(),
});
const knowledgeUpdateSchema = knowledgeCreateSchema.partial().omit({ body: true });
const knowledgeBodySchema = z.object({ body: z.string().trim().min(1).max(100000) });

const permissionsSchema = z.object({
  permissions: z.array(
    z.object({
      resource: z.string().trim().min(1).max(40),
      action: z.string().trim().min(1).max(40),
      effect: z.enum(['ALLOW', 'DENY']),
    }),
  ).max(80),
});

const systemSettingsSchema = z.object({
  key: z.string().trim().min(1).max(120).optional(),
  value: z.unknown().optional(),
  settings: z.record(z.unknown()).optional(),
}).refine((value) => value.key !== undefined || value.settings !== undefined, {
  message: '至少要更新一项系统设置',
}).refine((value) => value.key === undefined || value.value !== undefined, {
  message: '单项系统设置必须提供 value',
}).refine((value) => value.settings === undefined || Object.keys(value.settings).length > 0, {
  message: 'settings 不能为空',
}).refine((value) => value.settings === undefined || Object.keys(value.settings).length === 1, {
  message: '危险设置更新必须一次只包含一个 setting',
});

function setAdminCookie(reply: FastifyReply, token: string, expiresAt: number) {
  reply.setCookie(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

function clearAdminCookie(reply: FastifyReply) {
  reply.clearCookie(ADMIN_SESSION_COOKIE_NAME, { path: '/' });
}

async function requireAdminSession(request: FastifyRequest, _reply: FastifyReply) {
  // Keep this check explicit even when mounted after requireAuth: Admin is a
  // separate capability and a family ADMIN role must never satisfy it.
  if (!request.auth.userId || !request.auth.sessionId) {
    throw new AppError('AUTH_REQUIRED', '请先登录', 401);
  }
  const token = extractAdminToken({ headers: request.headers, cookies: request.cookies });
  request.adminSession = await resolveAdminSession(request.db, {
    token,
    userId: request.auth.userId,
    userSessionId: request.auth.sessionId,
  });
}

const adminPreHandler = [requireAuth, requireAdminSession];

function grantToken(request: FastifyRequest) {
  const value = request.headers[ADMIN_REAUTH_HEADER];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function consumeGrant(
  request: FastifyRequest,
  actionScope: string,
  resourceId?: string | null,
) {
  if (!request.adminSession) throw new AppError('ADMIN_REQUIRED', '请先验证管理员身份', 403);
  return consumeAdminReauthGrant(request.db, {
    session: request.adminSession,
    token: grantToken(request),
    actionScope,
    resourceId,
  });
}

/**
 * A reauth grant is only an authorization capability.  A separate explicit
 * confirmation is required on the final request so accidental retries or
 * stale UI submits cannot execute a destructive mutation.
 */
function requireFinalConfirmation(request: FastifyRequest) {
  const body = request.body;
  const confirmed = Boolean(
    body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      ((body as Record<string, unknown>).confirm === true ||
        (body as Record<string, unknown>).confirmed === true ||
        (body as Record<string, unknown>).finalConfirm === true),
  );
  if (!confirmed) throw new AppError('ADMIN_REAUTH_REQUIRED', '请确认这项危险操作', 403);
}

async function requireFamily(db: Database, familyId: string) {
  const rows = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
  if (!rows[0]) throw new AppError('NOT_FOUND', '家庭不存在', 404);
  return rows[0];
}

async function requireMember(db: Database, memberId: string) {
  const rows = await db
    .select({ member: familyMembers, user: users })
    .from(familyMembers)
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(eq(familyMembers.id, memberId))
    .limit(1);
  if (!rows[0]) throw new AppError('NOT_FOUND', '成员不存在', 404);
  return rows[0];
}

function parseStoredValue(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

type BackupManifest = {
  snapshotPath: string;
  sha256: string;
  sizeBytes: number;
  createdAt: number;
};

function parseBackupManifest(value: string | null): BackupManifest | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BackupManifest>;
    const sizeBytes = parsed.sizeBytes;
    const createdAt = parsed.createdAt;
    if (
      typeof parsed.snapshotPath !== 'string' ||
      !path.isAbsolute(parsed.snapshotPath) ||
      typeof parsed.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(parsed.sha256) ||
      typeof sizeBytes !== 'number' ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0 ||
      typeof createdAt !== 'number' ||
      !Number.isSafeInteger(createdAt) ||
      createdAt < 0
    ) return null;
    return parsed as BackupManifest;
  } catch {
    return null;
  }
}

function publicBackup(row: typeof backupRuns.$inferSelect) {
  const manifest = parseBackupManifest(row.manifestJson);
  return {
    id: row.id,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    bytes: row.bytes,
    checksum: manifest?.sha256 ?? null,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
  };
}

async function hashFile(filePath: string) {
  const content = await fs.readFile(filePath);
  return { bytes: content.byteLength, sha256: createHash('sha256').update(content).digest('hex') };
}

async function runBackupSnapshot(app: FastifyInstance, request: FastifyRequest) {
  const id = createUlid();
  const now = utcNowMs();
  await app.db.insert(backupRuns).values({
    id,
    status: 'RUNNING',
    startedAt: now,
    finishedAt: null,
    bytes: null,
    manifestJson: null,
    errorCode: null,
    createdAt: now,
  });
  try {
    const directory = path.resolve(app.config.BACKUP_ROOT, 'snapshots');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const snapshotPath = path.join(directory, `${id}.db`);
    try {
      await app.sqlClient.execute({ sql: 'VACUUM INTO ?', args: [snapshotPath] });
    } catch {
      // Older SQLite/libsql builds reject a bound VACUUM path; the generated
      // path is trusted and quoted explicitly as a compatibility fallback.
      await app.sqlClient.execute(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`);
    }
    const file = await hashFile(snapshotPath);
    const finishedAt = utcNowMs();
    const manifest: BackupManifest = { snapshotPath, sha256: file.sha256, sizeBytes: file.bytes, createdAt: finishedAt };
    const updated = await app.db.update(backupRuns).set({ status: 'READY', finishedAt, bytes: file.bytes, manifestJson: JSON.stringify(manifest) }).where(eq(backupRuns.id, id)).returning();
    await recordAudit(request, { action: 'BACKUP_CREATE', resourceType: 'BACKUP', resourceId: id, result: 'SUCCESS', after: { status: 'READY', bytes: file.bytes, checksum: file.sha256 }, createdAt: finishedAt });
    return updated[0] ?? (await app.db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1))[0]!;
  } catch {
    const finishedAt = utcNowMs();
    const updated = await app.db.update(backupRuns).set({ status: 'FAILED', finishedAt, errorCode: 'BACKUP_CREATE_FAILED' }).where(eq(backupRuns.id, id)).returning();
    await recordAudit(request, { action: 'BACKUP_CREATE', resourceType: 'BACKUP', resourceId: id, result: 'FAILED', errorCode: 'BACKUP_CREATE_FAILED', createdAt: finishedAt });
    return updated[0] ?? (await app.db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1))[0]!;
  }
}

async function verifyBackupSnapshot(app: FastifyInstance, row: typeof backupRuns.$inferSelect) {
  const manifest = parseBackupManifest(row.manifestJson);
  if (!manifest) return false;
  try {
    const snapshotPath = await resolveVerifiedBackupPath(app, manifest.snapshotPath);
    if (!snapshotPath) return false;
    const file = await hashFile(snapshotPath);
    return file.bytes === manifest.sizeBytes && file.sha256 === manifest.sha256;
  } catch {
    return false;
  }
}

function pathWithin(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** Keep restore reads inside the configured backup repository, including symlinks. */
async function resolveVerifiedBackupPath(app: FastifyInstance, snapshotPath: string) {
  const configuredRoot = path.resolve(app.config.BACKUP_ROOT);
  const candidate = path.resolve(snapshotPath);
  if (!pathWithin(configuredRoot, candidate)) return null;
  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.realpath(configuredRoot),
      fs.realpath(candidate),
    ]);
    return pathWithin(realRoot, realCandidate) ? realCandidate : null;
  } catch {
    return null;
  }
}

async function stageBackupRestore(app: FastifyInstance, request: FastifyRequest, backupId: string) {
  requireFinalConfirmation(request);
  const rows = await app.db.select().from(backupRuns).where(eq(backupRuns.id, backupId)).limit(1);
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', '备份不存在', 404);
  if (row.status !== 'READY') {
    throw new AppError('CONFLICT', '只有已验证通过的备份可以恢复', 409);
  }
  if (!(await verifyBackupSnapshot(app, row))) {
    throw new AppError('CONFLICT', '备份校验未通过，暂不执行恢复', 409);
  }
  await consumeGrant(request, 'BACKUP_RESTORE', backupId);
  const manifest = parseBackupManifest(row.manifestJson)!;
  const verifiedSnapshotPath = await resolveVerifiedBackupPath(app, manifest.snapshotPath);
  if (!verifiedSnapshotPath) {
    throw new AppError('CONFLICT', '备份路径不在受信目录内，暂不执行恢复', 409);
  }
  const stagingPath = `${app.config.DATABASE_PATH}.restore-${backupId}-${createUlid()}`;
  await fs.copyFile(verifiedSnapshotPath, stagingPath);
  await recordAudit(request, {
    action: 'BACKUP_RESTORE',
    resourceType: 'BACKUP',
    resourceId: backupId,
    result: 'SUCCESS',
    after: { status: 'STAGED', checksum: manifest.sha256, restartRequired: true },
  });
  return { backupId, status: 'STAGED', restartRequired: true };
}

async function deleteAllPhotosForFamily(app: FastifyInstance, request: FastifyRequest, familyId: string) {
  requireFinalConfirmation(request);
  await requireFamily(app.db, familyId);
  await consumeGrant(request, 'PHOTOS_DELETE_ALL', familyId);
  const now = utcNowMs();
  const updated = await app.db
    .update(photoMemories)
    .set({ deletedAt: now, updatedAt: now, version: sql`${photoMemories.version} + 1` })
    .where(and(eq(photoMemories.familyId, familyId), isNull(photoMemories.deletedAt)))
    .returning({ id: photoMemories.id });
  await recordAudit(request, {
    action: 'PHOTOS_DELETE_ALL',
    resourceType: 'PHOTO_MEMORIES',
    resourceId: familyId,
    familyId,
    result: 'SUCCESS',
    after: { deletedCount: updated.length, mediaPhysicalPurge: false },
  });
  return { familyId, deletedCount: updated.length, mediaPhysicalPurge: false };
}

async function deleteBabyForFamily(app: FastifyInstance, request: FastifyRequest, familyId: string, babyId: string) {
  requireFinalConfirmation(request);
  await requireFamily(app.db, familyId);
  const current = await app.db.select({ id: babies.id }).from(babies).where(and(eq(babies.id, babyId), eq(babies.familyId, familyId), isNull(babies.deletedAt))).limit(1);
  if (!current[0]) throw new AppError('NOT_FOUND', '宝宝档案不存在或已删除', 404);
  await consumeGrant(request, 'BABY_DELETE', babyId);
  const now = utcNowMs();
  const updated = await app.db
    .update(babies)
    .set({ deletedAt: now, updatedAt: now, version: sql`${babies.version} + 1` })
    .where(and(eq(babies.id, babyId), eq(babies.familyId, familyId), isNull(babies.deletedAt)))
    .returning({ id: babies.id });
  if (!updated[0]) throw new AppError('CONFLICT', '宝宝档案刚刚发生变化，请重新确认', 409);
  await recordAudit(request, {
    action: 'BABY_DELETE',
    resourceType: 'BABY',
    resourceId: babyId,
    familyId,
    result: 'SUCCESS',
    after: { deletedAt: now },
  });
  return { familyId, babyId, deleted: true };
}

async function disableBackups(app: FastifyInstance, request: FastifyRequest) {
  requireFinalConfirmation(request);
  await consumeGrant(request, 'BACKUP_DISABLE', 'backup_enabled');
  const now = utcNowMs();
  await app.db.insert(systemSettings).values({ key: 'backup_enabled', value: 'false', updatedAt: now, updatedByUserId: request.auth.userId! }).onConflictDoUpdate({ target: systemSettings.key, set: { value: 'false', updatedAt: now, updatedByUserId: request.auth.userId! } });
  await recordAudit(request, { action: 'BACKUP_DISABLE', resourceType: 'SYSTEM_SETTING', resourceId: 'backup_enabled', result: 'SUCCESS', after: { enabled: false } });
  return { key: 'backup_enabled', enabled: false };
}

async function recordAudit(
  request: FastifyRequest,
  input: Omit<Parameters<typeof appendAuditLog>[1], 'requestId' | 'actorUserId' | 'adminSessionId'>,
) {
  return appendAuditLog(request.db, {
    ...input,
    requestId: request.requestId,
    actorUserId: request.auth.userId,
    adminSessionId: request.adminSession?.id ?? null,
  });
}

export async function adminRoutes(app: FastifyInstance) {
  // Bootstrap is idempotent and only reads an explicitly configured secret.
  await ensureAdminCredential(app.db);

  app.post('/admin/auth', { preHandler: requireAuth }, async (request, reply) => {
    const raw = request.body as Record<string, unknown>;
    const body = adminAuthBodySchema.parse({ password: raw?.password ?? raw?.adminPassword });
    const auth = await authenticateAdmin(app.db, {
      userId: request.auth.userId!,
      userSessionId: request.auth.sessionId!,
      password: body.password,
      requestId: request.requestId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    if (request.auth.platform === 'H5') setAdminCookie(reply, auth.token, auth.session.expiresAt);
    return createSuccessEnvelope(
      {
        sessionId: auth.session.id,
        userId: auth.session.userId,
        createdAt: auth.session.createdAt,
        expiresAt: auth.session.expiresAt,
        lastActionAt: auth.session.lastActionAt,
        // H5 uses an HttpOnly cookie; WEAPP clients receive the opaque token.
        token: request.auth.platform === 'H5' ? undefined : auth.token,
      },
      request.requestId,
    );
  });

  app.delete('/admin/auth', { preHandler: adminPreHandler }, async (request, reply) => {
    await revokeAdminSession(app.db, request.adminSession!, request.requestId);
    clearAdminCookie(reply);
    return createSuccessEnvelope({ ok: true }, request.requestId);
  });

  app.get('/admin/session', { preHandler: adminPreHandler }, async (request) =>
    createSuccessEnvelope(
      {
        sessionId: request.adminSession!.id,
        userId: request.adminSession!.userId,
        createdAt: request.adminSession!.createdAt,
        expiresAt: request.adminSession!.expiresAt,
        lastActionAt: request.adminSession!.lastActionAt,
      },
      request.requestId,
    ));

  app.post('/admin/reauth', { preHandler: adminPreHandler }, async (request) => {
    const raw = request.body as Record<string, unknown>;
    const body = adminReauthBodySchema.parse({
      password: raw?.password ?? raw?.adminPassword,
      actionScope: raw?.actionScope ?? raw?.action,
      resourceId: raw?.resourceId ?? null,
    });
    const grant = await issueAdminReauthGrant(app.db, {
      session: request.adminSession!,
      password: body.password,
      actionScope: body.actionScope,
      resourceId: body.resourceId,
      requestId: request.requestId,
      ip: request.ip,
    });
    return createSuccessEnvelope(grant, request.requestId);
  });

  // ------------------------------ Gems ------------------------------
  app.get('/admin/families/:familyId/gems', { preHandler: adminPreHandler }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    const family = await requireFamily(app.db, familyId);
    const rows = await app.db
      .select({ total: sql<number>`coalesce(sum(${gemTransactions.amount}), 0)` })
      .from(gemTransactions)
      .where(eq(gemTransactions.familyId, familyId));
    const ledgerBalance = Number(rows[0]?.total ?? 0);
    return createSuccessEnvelope(
      { familyId, balance: family.gemBalanceCache, ledgerBalance, drifted: family.gemBalanceCache !== ledgerBalance },
      request.requestId,
    );
  });

  app.get('/admin/families/:familyId/gem-transactions', { preHandler: adminPreHandler }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    await requireFamily(app.db, familyId);
    const query = request.query as { limit?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 100) || 100, 1), 500);
    const rows = await app.db
      .select()
      .from(gemTransactions)
      .where(eq(gemTransactions.familyId, familyId))
      .orderBy(desc(gemTransactions.createdAt), desc(gemTransactions.id))
      .limit(limit);
    return createSuccessEnvelope({ items: rows }, request.requestId);
  });

  app.post('/admin/families/:familyId/gems/adjust', { preHandler: adminPreHandler }, async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    requireFinalConfirmation(request);
    const body = gemAdjustSchema.parse(request.body);
    const requestKey = requireIdempotencyKey(request);
    if (body.idempotencyKey && body.idempotencyKey !== requestKey) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键载荷不一致', 409);
    }
    await requireFamily(app.db, familyId);
    // A replay still needs a fresh one-time grant. Cached responses are
    // returned only after this check, so a consumed grant cannot authorize a
    // second request accidentally.
    await consumeGrant(request, 'GEM_ADJUST', familyId);
    const idempotencyKey = `admin:${requestKey}`;
    const result = await withIdempotency(app, request, reply, {
      endpoint: `admin:gems:${familyId}:adjust`,
      userId: request.auth.userId!,
      payload: { familyId, amount: body.amount, reasonCode: body.reasonCode, reasonText: body.reasonText ?? null },
      revalidate: async () => { await requireFamily(app.db, familyId); },
      handler: async () => {
        const row = await app.db.transaction(async (tx) => {
          const existing = await tx
            .select()
            .from(gemTransactions)
            .where(and(eq(gemTransactions.familyId, familyId), eq(gemTransactions.idempotencyKey, idempotencyKey)))
            .limit(1);
          if (existing[0]) {
            const samePayload = existing[0].amount === body.amount &&
              existing[0].reasonCode === body.reasonCode &&
              existing[0].reasonText === (body.reasonText ?? null);
            if (!samePayload) throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键载荷不一致', 409);
            return existing[0];
          }
          const totalRows = await tx
            .select({ total: sql<number>`coalesce(sum(${gemTransactions.amount}), 0)` })
            .from(gemTransactions)
            .where(eq(gemTransactions.familyId, familyId));
          const balanceAfter = Number(totalRows[0]?.total ?? 0) + body.amount;
          if (balanceAfter < 0) throw new AppError('CONFLICT', '宝石余额不能低于 0', 409);
          const now = utcNowMs();
          const next = {
            id: createUlid(),
            familyId,
            userId: null,
            amount: body.amount,
            balanceAfter,
            reasonCode: body.reasonCode,
            reasonText: body.reasonText ?? null,
            sourceType: 'ADMIN_ADJUSTMENT',
            sourceId: null,
            idempotencyKey,
            operatorUserId: request.auth.userId!,
            adminSessionId: request.adminSession!.id,
            createdAt: now,
          };
          await tx.insert(gemTransactions).values(next);
          await tx.update(families).set({ gemBalanceCache: balanceAfter, updatedAt: now }).where(eq(families.id, familyId));
          await appendAuditLog(tx as unknown as DbExecutor, {
            requestId: request.requestId,
            actorUserId: request.auth.userId,
            adminSessionId: request.adminSession!.id,
            familyId,
            action: 'GEM_ADJUSTMENT',
            resourceType: 'FAMILY_GEMS',
            resourceId: familyId,
            result: 'SUCCESS',
            after: { amount: body.amount, balanceAfter, reasonCode: body.reasonCode },
            createdAt: now,
          });
          return next;
        });
        return { statusCode: 200, body: createSuccessEnvelope(row, request.requestId) };
      },
    });
    return result;
  });

  app.get('/admin/gem-rules', { preHandler: adminPreHandler }, async (request) => {
    const query = request.query as { familyId?: string };
    const rows = await app.db
      .select()
      .from(gemRules)
      .where(query.familyId ? eq(gemRules.familyId, query.familyId) : undefined)
      .orderBy(asc(gemRules.actionType));
    return createSuccessEnvelope({ items: rows }, request.requestId);
  });

  app.post('/admin/gem-rules', { preHandler: adminPreHandler }, async (request) => {
    const body = gemRuleCreateSchema.parse(request.body);
    if (body.familyId) await requireFamily(app.db, body.familyId);
    const now = utcNowMs();
    const row = {
      id: createUlid(),
      familyId: body.familyId ?? null,
      actionType: body.actionType,
      amount: body.amount,
      dailyLimit: body.dailyLimit ?? null,
      enabled: body.enabled ?? true,
      createdByAdmin: request.adminSession!.id,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await app.db.insert(gemRules).values(row);
    await recordAudit(request, {
      action: 'GEM_RULE_CHANGE', resourceType: 'GEM_RULE', resourceId: row.id,
      result: 'SUCCESS', after: { familyId: row.familyId, actionType: row.actionType, amount: row.amount, enabled: row.enabled },
    });
    return createSuccessEnvelope(row, request.requestId);
  });

  app.patch('/admin/gem-rules/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const body = gemRuleUpdateSchema.parse(request.body);
    const current = await app.db.select().from(gemRules).where(eq(gemRules.id, id)).limit(1);
    if (!current[0]) throw new AppError('NOT_FOUND', '宝石规则不存在', 404);
    const now = utcNowMs();
    const updated = await app.db.update(gemRules).set({ ...body, updatedAt: now, version: current[0].version + 1 }).where(eq(gemRules.id, id)).returning();
    await recordAudit(request, {
      action: 'GEM_RULE_CHANGE', resourceType: 'GEM_RULE', resourceId: id,
      result: 'SUCCESS', before: { amount: current[0].amount, dailyLimit: current[0].dailyLimit, enabled: current[0].enabled },
      after: { amount: updated[0]?.amount, dailyLimit: updated[0]?.dailyLimit, enabled: updated[0]?.enabled },
    });
    return createSuccessEnvelope(updated[0], request.requestId);
  });

  // ------------------------------ Rewards ------------------------------
  app.get('/admin/rewards', { preHandler: adminPreHandler }, async (request) => {
    const query = request.query as { familyId?: string };
    const rows = await app.db.select().from(rewards).where(query.familyId ? eq(rewards.familyId, query.familyId) : undefined).orderBy(asc(rewards.sortOrder), desc(rewards.updatedAt));
    return createSuccessEnvelope({ items: rows }, request.requestId);
  });

  app.post('/admin/rewards', { preHandler: adminPreHandler }, async (request) => {
    const body = rewardAdminCreateSchema.parse(request.body);
    await requireFamily(app.db, body.familyId);
    const now = utcNowMs();
    const row = {
      id: createUlid(), familyId: body.familyId, name: body.name, description: body.description ?? null,
      priceGems: body.priceGems, stock: body.stock ?? null, illustrationKey: body.illustrationKey ?? null,
      status: body.status ?? 'ACTIVE', sortOrder: body.sortOrder ?? 0, custom: false,
      createdBy: request.auth.userId!, createdAt: now, updatedAt: now, version: 1, deletedAt: null,
    };
    await app.db.insert(rewards).values(row);
    await recordAudit(request, { action: 'REWARD_CHANGE', resourceType: 'REWARD', resourceId: row.id, familyId: row.familyId, result: 'SUCCESS', after: { name: row.name, priceGems: row.priceGems, status: row.status } });
    return createSuccessEnvelope(row, request.requestId);
  });

  app.get('/admin/rewards/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await app.db.select().from(rewards).where(eq(rewards.id, id)).limit(1);
    if (!rows[0]) throw new AppError('NOT_FOUND', '奖励不存在', 404);
    return createSuccessEnvelope(rows[0], request.requestId);
  });

  app.patch('/admin/rewards/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const body = rewardAdminUpdateSchema.parse(request.body);
    const current = await app.db.select().from(rewards).where(eq(rewards.id, id)).limit(1);
    if (!current[0]) throw new AppError('NOT_FOUND', '奖励不存在', 404);
    const now = utcNowMs();
    const updated = await app.db.update(rewards).set({ ...body, updatedAt: now, version: current[0].version + 1 }).where(eq(rewards.id, id)).returning();
    await recordAudit(request, { action: 'REWARD_CHANGE', resourceType: 'REWARD', resourceId: id, familyId: current[0].familyId, result: 'SUCCESS', before: { name: current[0].name, priceGems: current[0].priceGems, status: current[0].status }, after: { name: updated[0]?.name, priceGems: updated[0]?.priceGems, status: updated[0]?.status } });
    return createSuccessEnvelope(updated[0], request.requestId);
  });

  app.post('/admin/rewards/reorder', { preHandler: adminPreHandler }, async (request) => {
    const body = z.object({ items: z.array(z.object({ id: idSchema, sortOrder: z.number().int() })).min(1).max(200) }).parse(request.body);
    await app.db.transaction(async (tx) => {
      for (const item of body.items) await tx.update(rewards).set({ sortOrder: item.sortOrder, updatedAt: utcNowMs() }).where(eq(rewards.id, item.id));
    });
    await recordAudit(request, { action: 'REWARD_CHANGE', resourceType: 'REWARD_ORDER', result: 'SUCCESS', after: { count: body.items.length } });
    return createSuccessEnvelope({ ok: true }, request.requestId);
  });

  app.post('/admin/rewards/:id/offline', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const current = await app.db.select().from(rewards).where(eq(rewards.id, id)).limit(1);
    if (!current[0]) throw new AppError('NOT_FOUND', '奖励不存在', 404);
    const updated = await app.db.update(rewards).set({ status: 'OFFLINE', updatedAt: utcNowMs(), version: current[0].version + 1 }).where(eq(rewards.id, id)).returning();
    await recordAudit(request, { action: 'REWARD_OFFLINE', resourceType: 'REWARD', resourceId: id, familyId: current[0].familyId, result: 'SUCCESS', before: { status: current[0].status }, after: { status: 'OFFLINE' } });
    return createSuccessEnvelope(updated[0], request.requestId);
  });

  // ------------------------------ Knowledge ------------------------------
  app.get('/admin/knowledge', { preHandler: adminPreHandler }, async (request) => {
    const query = request.query as { status?: string };
    const rows = await app.db.select().from(knowledge).where(query.status ? eq(knowledge.status, query.status) : undefined).orderBy(desc(knowledge.updatedAt));
    // Body is deliberately omitted from list responses to reduce accidental exposure.
    return createSuccessEnvelope({ items: rows.map(({ body: _body, ...item }) => item) }, request.requestId);
  });

  app.post('/admin/knowledge', { preHandler: adminPreHandler }, async (request) => {
    const body = knowledgeCreateSchema.parse(request.body);
    const now = utcNowMs();
    if (body.minAgeDays != null && body.maxAgeDays != null && body.minAgeDays > body.maxAgeDays) throw new AppError('VALIDATION_ERROR', '适用月龄范围有误', 400);
    const row = {
      id: createUlid(), title: body.title, summary: body.summary, body: body.body, category: body.category,
      minAgeDays: body.minAgeDays ?? null, maxAgeDays: body.maxAgeDays ?? null, sourceName: body.sourceName,
      sourceUrl: body.sourceUrl ?? null, reviewedAt: body.reviewedAt ?? now, contentVersion: body.contentVersion ?? 1,
      priority: body.priority ?? 0, status: body.status ?? 'DRAFT', publishedAt: body.status === 'PUBLISHED' ? now : null,
      createdBy: request.auth.userId!, createdAt: now, updatedBy: request.auth.userId!, updatedAt: now, version: 1, deletedAt: null,
    };
    await app.db.insert(knowledge).values(row);
    await recordAudit(request, { action: 'KNOWLEDGE_CHANGE', resourceType: 'KNOWLEDGE', resourceId: row.id, result: 'SUCCESS', after: { title: row.title, category: row.category, status: row.status, contentVersion: row.contentVersion } });
    return createSuccessEnvelope(row, request.requestId);
  });

  app.get('/admin/knowledge/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await app.db.select().from(knowledge).where(eq(knowledge.id, id)).limit(1);
    if (!rows[0]) throw new AppError('NOT_FOUND', '知识内容不存在', 404);
    return createSuccessEnvelope(rows[0], request.requestId);
  });

  app.patch('/admin/knowledge/:id/body', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const body = knowledgeBodySchema.parse(request.body);
    const current = await app.db.select().from(knowledge).where(eq(knowledge.id, id)).limit(1);
    if (!current[0]) throw new AppError('NOT_FOUND', '知识内容不存在', 404);
    const now = utcNowMs();
    const updated = await app.db.update(knowledge).set({ body: body.body, contentVersion: current[0].contentVersion + 1, updatedBy: request.auth.userId!, updatedAt: now, version: current[0].version + 1 }).where(eq(knowledge.id, id)).returning();
    await recordAudit(request, { action: 'KNOWLEDGE_CHANGE', resourceType: 'KNOWLEDGE', resourceId: id, result: 'SUCCESS', before: { contentVersion: current[0].contentVersion }, after: { contentVersion: updated[0]?.contentVersion } });
    return createSuccessEnvelope(updated[0], request.requestId);
  });

  app.patch('/admin/knowledge/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const body = knowledgeUpdateSchema.parse(request.body);
    const current = await app.db.select().from(knowledge).where(eq(knowledge.id, id)).limit(1);
    if (!current[0]) throw new AppError('NOT_FOUND', '知识内容不存在', 404);
    const now = utcNowMs();
    const updated = await app.db.update(knowledge).set({ ...body, updatedBy: request.auth.userId!, updatedAt: now, version: current[0].version + 1 }).where(eq(knowledge.id, id)).returning();
    await recordAudit(request, { action: 'KNOWLEDGE_CHANGE', resourceType: 'KNOWLEDGE', resourceId: id, result: 'SUCCESS', before: { title: current[0].title, status: current[0].status, contentVersion: current[0].contentVersion }, after: { title: updated[0]?.title, status: updated[0]?.status, contentVersion: updated[0]?.contentVersion } });
    return createSuccessEnvelope(updated[0], request.requestId);
  });

  app.post('/admin/knowledge/:id/publish', { preHandler: adminPreHandler }, async (request) => updateKnowledgeStatus(app, request, 'PUBLISHED'));
  app.post('/admin/knowledge/:id/offline', { preHandler: adminPreHandler }, async (request) => updateKnowledgeStatus(app, request, 'OFFLINE'));

  app.get('/admin/knowledge/:id/user-stats', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await app.db.select({ count: sql<number>`count(*)` }).from(knowledgeUserStates).where(eq(knowledgeUserStates.knowledgeId, id));
    return createSuccessEnvelope({ knowledgeId: id, users: Number(rows[0]?.count ?? 0) }, request.requestId);
  });

  // ------------------------------ Members ------------------------------
  app.get('/admin/families/:familyId/members', { preHandler: adminPreHandler }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    await requireFamily(app.db, familyId);
    const rows = await app.db.select({ member: familyMembers, user: users }).from(familyMembers).innerJoin(users, eq(familyMembers.userId, users.id)).where(eq(familyMembers.familyId, familyId)).orderBy(asc(familyMembers.createdAt));
    return createSuccessEnvelope({ items: rows.map(({ member, user }) => ({ ...member, nickname: user.nickname })) }, request.requestId);
  });

  app.get('/admin/members/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const row = await requireMember(app.db, id);
    const permissions = await app.db.select().from(familyMemberPermissions).where(eq(familyMemberPermissions.familyMemberId, id));
    return createSuccessEnvelope({ ...row.member, nickname: row.user.nickname, permissions }, request.requestId);
  });

  app.patch('/admin/members/:id/permissions', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    requireFinalConfirmation(request);
    const body = permissionsSchema.parse(request.body);
    const current = await requireMember(app.db, id);
    await consumeGrant(request, 'MEMBER_PERMISSIONS', id);
    const now = utcNowMs();
    await app.db.transaction(async (tx) => {
      await tx.delete(familyMemberPermissions).where(eq(familyMemberPermissions.familyMemberId, id));
      if (body.permissions.length) await tx.insert(familyMemberPermissions).values(body.permissions.map((permission) => ({ id: createUlid(), familyMemberId: id, ...permission })));
      await appendAuditLog(tx as unknown as DbExecutor, { requestId: request.requestId, actorUserId: request.auth.userId, adminSessionId: request.adminSession!.id, familyId: current.member.familyId, action: 'MEMBER_PERMISSION_CHANGE', resourceType: 'FAMILY_MEMBER', resourceId: id, result: 'SUCCESS', after: { permissions: body.permissions }, createdAt: now });
    });
    return createSuccessEnvelope({ ok: true, permissions: body.permissions }, request.requestId);
  });

  app.post('/admin/members/:id/disable', { preHandler: adminPreHandler }, async (request) => updateMemberStatus(app, request, 'DISABLED'));
  app.post('/admin/members/:id/restore', { preHandler: adminPreHandler }, async (request) => updateMemberStatus(app, request, 'ACTIVE'));

  // ------------------------------ High-value data actions ------------------------------
  // Every destructive route below requires both the admin session and a
  // short-lived, action/resource-scoped reauth grant plus final confirmation.
  app.post('/admin/families/:familyId/photos/delete-all', { preHandler: adminPreHandler }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    return createSuccessEnvelope(await deleteAllPhotosForFamily(app, request, familyId), request.requestId);
  });
  // Compatibility alias used by the admin data-center client.
  app.post('/admin/families/:familyId/photos/delete', { preHandler: adminPreHandler }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    return createSuccessEnvelope(await deleteAllPhotosForFamily(app, request, familyId), request.requestId);
  });
  app.post('/admin/families/:familyId/babies/:babyId/delete', { preHandler: adminPreHandler }, async (request) => {
    const { familyId, babyId } = request.params as { familyId: string; babyId: string };
    return createSuccessEnvelope(await deleteBabyForFamily(app, request, familyId, babyId), request.requestId);
  });
  app.post('/admin/babies/:babyId/delete', { preHandler: adminPreHandler }, async (request) => {
    const { babyId } = request.params as { babyId: string };
    const rows = await app.db.select({ familyId: babies.familyId }).from(babies).where(eq(babies.id, babyId)).limit(1);
    if (!rows[0]) throw new AppError('NOT_FOUND', '宝宝档案不存在', 404);
    return createSuccessEnvelope(await deleteBabyForFamily(app, request, rows[0].familyId, babyId), request.requestId);
  });

  // ------------------------------ Backup / export operations ------------------------------
  app.post('/admin/backups', { preHandler: adminPreHandler }, async (request, reply) => {
    requireIdempotencyKey(request);
    const result = await withIdempotency(app, request, reply, {
      endpoint: 'admin:backups:create',
      userId: request.auth.userId!,
      payload: { operation: 'snapshot' },
      handler: async () => {
        const row = await runBackupSnapshot(app, request);
        return { statusCode: 201, body: createSuccessEnvelope(publicBackup(row), request.requestId) };
      },
    });
    return result;
  });
  app.get('/admin/backups', { preHandler: adminPreHandler }, async (request) => {
    const rows = await app.db.select().from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(100);
    return createSuccessEnvelope({ items: rows.map(publicBackup) }, request.requestId);
  });
  app.get('/admin/backups/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await app.db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1);
    if (!rows[0]) throw new AppError('NOT_FOUND', '备份不存在', 404);
    return createSuccessEnvelope(publicBackup(rows[0]), request.requestId);
  });
  app.post('/admin/backups/:id/verify', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await app.db.select().from(backupRuns).where(eq(backupRuns.id, id)).limit(1);
    if (!rows[0]) throw new AppError('NOT_FOUND', '备份不存在', 404);
    const valid = await verifyBackupSnapshot(app, rows[0]);
    const status = valid ? 'READY' : 'FAILED';
    const updated = await app.db.update(backupRuns).set({ status, errorCode: valid ? null : 'BACKUP_VERIFY_FAILED' }).where(eq(backupRuns.id, id)).returning();
    await recordAudit(request, { action: 'BACKUP_VERIFY', resourceType: 'BACKUP', resourceId: id, result: valid ? 'SUCCESS' : 'FAILED', errorCode: valid ? null : 'BACKUP_VERIFY_FAILED', after: { valid } });
    return createSuccessEnvelope({ valid, backup: publicBackup(updated[0] ?? rows[0]) }, request.requestId);
  });
  app.post('/admin/backups/:id/restore', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(await stageBackupRestore(app, request, id), request.requestId);
  });
  app.post('/admin/backups/disable', { preHandler: adminPreHandler }, async (request) => createSuccessEnvelope(await disableBackups(app, request), request.requestId));
  app.post('/admin/system/backup/disable', { preHandler: adminPreHandler }, async (request) => createSuccessEnvelope(await disableBackups(app, request), request.requestId));

  app.post('/admin/exports', { preHandler: adminPreHandler }, async (request, reply) => {
    const body = z.object({ familyId: idSchema, babyId: idSchema.optional(), type: exportTypeSchema }).parse(request.body);
    requireIdempotencyKey(request);
    const validateScope = async () => {
      await requireFamily(app.db, body.familyId);
      if (body.babyId) {
        const baby = await app.db.select({ familyId: babies.familyId }).from(babies).where(and(eq(babies.id, body.babyId), isNull(babies.deletedAt))).limit(1);
        if (!baby[0] || baby[0].familyId !== body.familyId) throw new AppError('RESOURCE_PERMISSION_DENIED', '宝宝不属于这个家庭', 403);
      }
    };
    const result = await withIdempotency(app, request, reply, {
      endpoint: 'admin:exports',
      userId: request.auth.userId!,
      payload: body,
      revalidate: validateScope,
      handler: async () => {
        await validateScope();
        const now = utcNowMs();
        const row = {
          id: createUlid(), userId: request.auth.userId!, familyId: body.familyId, babyId: body.babyId ?? null,
          type: body.type, state: 'QUEUED', filePath: null, createdAt: now, startedAt: null, finishedAt: null,
          expiresAt: now + 48 * 60 * 60 * 1000, errorCode: null,
        };
        await app.db.insert(exportJobs).values(row);
        const processed = await processExportJob(app.db, row.id, app.config.BACKUP_ROOT);
        await recordAudit(request, { action: 'ADMIN_EXPORT_CREATE', resourceType: 'EXPORT', resourceId: row.id, familyId: body.familyId, result: 'SUCCESS', after: { type: body.type } });
        return { statusCode: 202, body: createSuccessEnvelope(toPublicExportJob(processed ?? row), request.requestId) };
      },
    });
    return result;
  });
  app.post('/admin/cache/cleanup', { preHandler: adminPreHandler }, async (request) => {
    const now = utcNowMs();
    const expiredTickets = await app.db.select({ id: realtimeTickets.id }).from(realtimeTickets).where(lt(realtimeTickets.expiresAt, now));
    if (expiredTickets.length) await app.db.delete(realtimeTickets).where(lt(realtimeTickets.expiresAt, now));
    const expiredExports = await app.db.select().from(exportJobs).where(lt(exportJobs.expiresAt, now));
    for (const row of expiredExports) if (row.filePath) await fs.unlink(row.filePath).catch(() => undefined);
    if (expiredExports.length) await app.db.update(exportJobs).set({ state: 'EXPIRED', filePath: null }).where(lt(exportJobs.expiresAt, now));
    const expiredIdempotency = await app.db
      .select({ key: idempotencyKeys.key })
      .from(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, now));
    if (expiredIdempotency.length) {
      await app.db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, now));
    }
    await recordAudit(request, { action: 'CACHE_CLEANUP', resourceType: 'CACHE', result: 'SUCCESS', after: { expiredTickets: expiredTickets.length, expiredExports: expiredExports.length, expiredIdempotency: expiredIdempotency.length } });
    return createSuccessEnvelope({ expiredTickets: expiredTickets.length, expiredExports: expiredExports.length, expiredIdempotency: expiredIdempotency.length }, request.requestId);
  });

  // ------------------------------ Data / System / Audit ------------------------------
  app.get('/admin/data/status', { preHandler: adminPreHandler }, async (request) => {
    const tables = ['users', 'families', 'babies', 'gem_transactions', 'knowledge', 'audit_logs'] as const;
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const rows = await app.sqlClient.execute(`SELECT count(*) AS count FROM ${table}`);
      counts[table] = Number(rows.rows[0]?.count ?? 0);
    }
    return createSuccessEnvelope({ status: 'ok', counts }, request.requestId);
  });

  app.get('/admin/system/settings', { preHandler: adminPreHandler }, async (request) => {
    const rows = await app.db.select().from(systemSettings).orderBy(asc(systemSettings.key));
    return createSuccessEnvelope({ items: rows.map((row) => ({ key: row.key, value: parseStoredValue(row.value), updatedAt: row.updatedAt, updatedByUserId: row.updatedByUserId })) }, request.requestId);
  });

  app.patch('/admin/system/settings', { preHandler: adminPreHandler }, async (request) => {
    requireFinalConfirmation(request);
    const body = systemSettingsSchema.parse(request.body);
    const settings = body.settings ?? (body.key ? { [body.key]: body.value } : {});
    const keys = Object.keys(settings);
    const resourceId = keys.length === 1 ? keys[0] : null;
    await consumeGrant(request, 'SYSTEM_SETTINGS', resourceId);
    const now = utcNowMs();
    await app.db.transaction(async (tx) => {
      for (const key of keys) {
        const serializedValue = JSON.stringify(settings[key]) ?? 'null';
        await tx.insert(systemSettings).values({ key, value: serializedValue, updatedAt: now, updatedByUserId: request.auth.userId! }).onConflictDoUpdate({ target: systemSettings.key, set: { value: serializedValue, updatedAt: now, updatedByUserId: request.auth.userId! } });
      }
      await appendAuditLog(tx as unknown as DbExecutor, { requestId: request.requestId, actorUserId: request.auth.userId, adminSessionId: request.adminSession!.id, action: 'SYSTEM_SETTING_CHANGE', resourceType: 'SYSTEM_SETTINGS', resourceId, result: 'SUCCESS', after: { keys }, createdAt: now });
    });
    return createSuccessEnvelope({ items: keys.map((key) => ({ key, value: settings[key] })) }, request.requestId);
  });

  app.get('/admin/system/app', { preHandler: adminPreHandler }, async (request) => createSuccessEnvelope({ nodeEnv: process.env.NODE_ENV ?? 'development', version: process.env.APP_VERSION ?? 'development' }, request.requestId));
  app.get('/admin/system/database', { preHandler: adminPreHandler }, async (request) => {
    const [journal, foreignKeys] = await Promise.all([app.sqlClient.execute('PRAGMA journal_mode'), app.sqlClient.execute('PRAGMA foreign_keys')]);
    return createSuccessEnvelope({ status: 'ok', journalMode: String(journal.rows[0]?.journal_mode ?? journal.rows[0]?.[0] ?? '').toLowerCase(), foreignKeys: Number(foreignKeys.rows[0]?.foreign_keys ?? foreignKeys.rows[0]?.[0] ?? 0) === 1 }, request.requestId);
  });
  app.get('/admin/system/media', { preHandler: adminPreHandler }, async (request) => createSuccessEnvelope({ configured: Boolean(process.env.MEDIA_ROOT), status: 'managed' }, request.requestId));
  app.get('/admin/system/tunnel', { preHandler: adminPreHandler }, async (request) => createSuccessEnvelope({ configured: Boolean(process.env.CLOUDFLARE_TUNNEL_TOKEN || process.env.CLOUDFLARE_TUNNEL_CONFIG) }, request.requestId));

  app.get('/admin/audit-logs', { preHandler: adminPreHandler }, async (request) => {
    const query = request.query as { limit?: string; action?: string };
    const limit = Math.min(Math.max(Number(query.limit ?? 100) || 100, 1), 500);
    const rows = await app.db.select().from(auditLogs).where(query.action ? eq(auditLogs.action, query.action) : undefined).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit);
    return createSuccessEnvelope({ items: rows.map(parseAuditRow) }, request.requestId);
  });
  app.get('/admin/audit-logs/:id', { preHandler: adminPreHandler }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await app.db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);
    if (!rows[0]) throw new AppError('NOT_FOUND', '审计记录不存在', 404);
    return createSuccessEnvelope(auditLogSchema.parse(parseAuditRow(rows[0])), request.requestId);
  });
}

async function updateKnowledgeStatus(app: FastifyInstance, request: FastifyRequest, status: 'PUBLISHED' | 'OFFLINE') {
  const { id } = request.params as { id: string };
  const current = await app.db.select().from(knowledge).where(eq(knowledge.id, id)).limit(1);
  if (!current[0]) throw new AppError('NOT_FOUND', '知识内容不存在', 404);
  const now = utcNowMs();
  const updated = await app.db.update(knowledge).set({ status, publishedAt: status === 'PUBLISHED' ? (current[0].publishedAt ?? now) : current[0].publishedAt, updatedBy: request.auth.userId!, updatedAt: now, version: current[0].version + 1 }).where(eq(knowledge.id, id)).returning();
  await recordAudit(request, { action: status === 'PUBLISHED' ? 'KNOWLEDGE_PUBLISH' : 'KNOWLEDGE_OFFLINE', resourceType: 'KNOWLEDGE', resourceId: id, result: 'SUCCESS', before: { status: current[0].status }, after: { status } });
  return createSuccessEnvelope(updated[0], request.requestId);
}

async function updateMemberStatus(app: FastifyInstance, request: FastifyRequest, status: 'ACTIVE' | 'DISABLED') {
  const { id } = request.params as { id: string };
  requireFinalConfirmation(request);
  const current = await requireMember(app.db, id);
  if (current.member.role === 'OWNER' && status === 'DISABLED') throw new AppError('PERMISSION_DENIED', '家庭创建者不能被停用', 403);
  await consumeGrant(request, status === 'DISABLED' ? 'MEMBER_DISABLE' : 'MEMBER_RESTORE', id);
  const now = utcNowMs();
  const updated = await app.db.update(familyMembers).set({ status, updatedAt: now, version: current.member.version + 1 }).where(eq(familyMembers.id, id)).returning();
  await recordAudit(request, { action: status === 'DISABLED' ? 'MEMBER_DISABLE' : 'MEMBER_RESTORE', resourceType: 'FAMILY_MEMBER', resourceId: id, familyId: current.member.familyId, result: 'SUCCESS', before: { status: current.member.status }, after: { status } });
  return createSuccessEnvelope(updated[0], request.requestId);
}
