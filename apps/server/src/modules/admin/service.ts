import fs from 'node:fs/promises';
import {
  adminCredentials,
  adminReauthGrants,
  adminSessions,
  auditLogs,
} from '@runew/db';
import type { schema } from '@runew/db';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { AppError } from '../../lib/errors.js';
import {
  generateSessionToken,
  hashClientMetadata,
  hashToken,
} from '../../lib/crypto.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';

type Database = LibSQLDatabase<typeof schema>;
export type DbExecutor = Pick<Database, 'select' | 'insert' | 'update'>;

export const ADMIN_SESSION_TTL_MS = 30 * 60 * 1000;
export const ADMIN_REAUTH_TTL_MS = 2 * 60 * 1000;
export const ADMIN_AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
export const ADMIN_AUTH_RATE_MAX_FAILURES = 5;
export const ADMIN_SESSION_COOKIE_NAME = 'runew_admin_session';
export const ADMIN_REAUTH_HEADER = 'x-admin-reauth-grant';

export type AdminSessionContext = {
  id: string;
  userId: string;
  userSessionId: string;
  createdAt: number;
  expiresAt: number;
  lastActionAt: number;
  ipHash: string | null;
};

type AttemptState = { windowStartedAt: number; failures: number };
const authAttempts = new Map<string, AttemptState>();

/** Test/process isolation hook; no credential or token data is retained here. */
export function resetAdminAuthRateLimit() {
  authAttempts.clear();
}

function attemptKey(userId: string, ip: string | undefined) {
  return `${userId}:${hashClientMetadata(ip?.trim() || 'unknown')}`;
}

function assertRateLimitAvailable(userId: string, ip: string | undefined, now: number) {
  const key = attemptKey(userId, ip);
  const state = authAttempts.get(key);
  if (!state) return;
  if (now - state.windowStartedAt >= ADMIN_AUTH_RATE_WINDOW_MS) {
    authAttempts.delete(key);
    return;
  }
  if (state.failures >= ADMIN_AUTH_RATE_MAX_FAILURES) {
    throw new AppError('ADMIN_RATE_LIMITED', '管理员验证次数过多，请稍后再试', 429, true, {
      retryAfterMs: ADMIN_AUTH_RATE_WINDOW_MS - (now - state.windowStartedAt),
    });
  }
}

function recordFailedAttempt(userId: string, ip: string | undefined, now: number) {
  const key = attemptKey(userId, ip);
  const current = authAttempts.get(key);
  if (!current || now - current.windowStartedAt >= ADMIN_AUTH_RATE_WINDOW_MS) {
    authAttempts.set(key, { windowStartedAt: now, failures: 1 });
    return;
  }
  current.failures += 1;
}

function clearFailedAttempts(userId: string, ip: string | undefined) {
  authAttempts.delete(attemptKey(userId, ip));
}

function stringHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

/** Admin token is deliberately separate from the normal Bearer token. */
export function extractAdminToken(input: {
  headers?: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
}): string | null {
  const headers = input.headers ?? {};
  const direct =
    stringHeader(headers['x-admin-session']) ??
    stringHeader(headers['x-admin-token']) ??
    stringHeader(headers['x-admin-authorization']);
  if (direct) return direct.replace(/^Bearer\s+/i, '').trim();

  const authorization = stringHeader(headers.authorization);
  if (authorization && /^Admin\s+/i.test(authorization)) {
    return authorization.replace(/^Admin\s+/i, '').trim() || null;
  }
  return input.cookies?.[ADMIN_SESSION_COOKIE_NAME] ?? null;
}

function asJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(sanitizeAuditSnapshot(value));
}

/**
 * Audit snapshots are metadata only.  Sensitive names are redacted recursively
 * so a future caller cannot accidentally persist private text or credentials.
 */
export function sanitizeAuditSnapshot(value: unknown, key = '', depth = 0): unknown {
  if (depth > 5) return '[TRUNCATED]';
  if (/(password|passwd|token|secret|authorization|cookie|session|admin.?key|body|diary|audio|photo|binary|content|private)/i.test(key)) {
    return '[REDACTED]';
  }
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}...[TRUNCATED]` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeAuditSnapshot(item, '', depth + 1));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      output[childKey] = sanitizeAuditSnapshot(childValue, childKey, depth + 1);
    }
    return output;
  }
  return value;
}

export type AuditInput = {
  requestId: string;
  actorUserId?: string | null;
  adminSessionId?: string | null;
  familyId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  result: 'SUCCESS' | 'FAILED';
  errorCode?: string | null;
  createdAt?: number;
};

export async function appendAuditLog(db: DbExecutor, input: AuditInput) {
  const row = {
    id: createUlid(),
    requestId: input.requestId || 'system',
    actorUserId: input.actorUserId ?? null,
    adminSessionId: input.adminSessionId ?? null,
    familyId: input.familyId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    beforeJson: asJson(input.before),
    afterJson: asJson(input.after),
    result: input.result,
    errorCode: input.errorCode ?? null,
    createdAt: input.createdAt ?? utcNowMs(),
  };
  await db.insert(auditLogs).values(row);
  return row;
}

export async function getAdminCredential(db: Database) {
  const rows = await db
    .select()
    .from(adminCredentials)
    .orderBy(desc(adminCredentials.changedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * First deployment may provide a one-time password file.  No default password
 * is embedded in source, and the file contents are never logged or returned.
 */
export async function ensureAdminCredential(db: Database) {
  const existing = await getAdminCredential(db);
  if (existing) return existing;

  const passwordFile = process.env.ADMIN_BOOTSTRAP_PASSWORD_FILE;
  const envPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  let password: string | null = envPassword?.trim() || null;
  if (!password && passwordFile) {
    try {
      password = (await fs.readFile(passwordFile, 'utf8')).trim();
    } catch {
      // A missing bootstrap file means setup is incomplete, not a server crash.
      password = null;
    }
  }
  if (!password) return null;
  if (password.length < 8 || password.length > 128) {
    throw new AppError('VALIDATION_ERROR', '管理员密码长度必须为 8 至 128 位', 400);
  }

  const now = utcNowMs();
  const row = {
    id: createUlid(),
    passwordHash: await hashPassword(password),
    changedAt: now,
    updatedByUserId: null,
  };
  try {
    await db.insert(adminCredentials).values(row);
    return row;
  } catch {
    // Another app instance may have bootstrapped concurrently; read the winner.
    return getAdminCredential(db);
  }
}

export async function authenticateAdmin(
  db: Database,
  input: {
    userId: string;
    userSessionId: string;
    password: string;
    requestId: string;
    ip?: string;
    userAgent?: string;
  },
) {
  const now = utcNowMs();
  assertRateLimitAvailable(input.userId, input.ip, now);
  const credential = await getAdminCredential(db);
  const valid = credential ? await verifyPassword(input.password, credential.passwordHash) : false;
  if (!valid) {
    recordFailedAttempt(input.userId, input.ip, now);
    await appendAuditLog(db, {
      requestId: input.requestId,
      actorUserId: input.userId,
      action: 'ADMIN_AUTH',
      resourceType: 'ADMIN_CREDENTIAL',
      result: 'FAILED',
      errorCode: credential ? 'ADMIN_INVALID_CREDENTIALS' : 'ADMIN_NOT_CONFIGURED',
      after: { ipHash: input.ip ? hashClientMetadata(input.ip) : null },
      createdAt: now,
    });
    if (!credential) {
      throw new AppError('ADMIN_NOT_CONFIGURED', '管理员入口还没有完成初始化', 503, true);
    }
    throw new AppError('ADMIN_INVALID_CREDENTIALS', '管理员密码不正确', 401);
  }

  clearFailedAttempts(input.userId, input.ip);
  const token = generateSessionToken();
  const sessionId = createUlid();
  await db.insert(adminSessions).values({
    id: sessionId,
    userId: input.userId,
    userSessionId: input.userSessionId,
    tokenHash: hashToken(token),
    createdAt: now,
    expiresAt: now + ADMIN_SESSION_TTL_MS,
    revokedAt: null,
    lastActionAt: now,
    ipHash: input.ip ? hashClientMetadata(input.ip) : null,
  });
  await appendAuditLog(db, {
    requestId: input.requestId,
    actorUserId: input.userId,
    adminSessionId: sessionId,
    action: 'ADMIN_AUTH',
    resourceType: 'ADMIN_SESSION',
    resourceId: sessionId,
    result: 'SUCCESS',
    after: { expiresAt: now + ADMIN_SESSION_TTL_MS, ipHash: input.ip ? hashClientMetadata(input.ip) : null },
    createdAt: now,
  });
  return {
    token,
    session: {
      id: sessionId,
      userId: input.userId,
      userSessionId: input.userSessionId,
      createdAt: now,
      expiresAt: now + ADMIN_SESSION_TTL_MS,
      lastActionAt: now,
      ipHash: input.ip ? hashClientMetadata(input.ip) : null,
    } satisfies AdminSessionContext,
  };
}

export async function resolveAdminSession(
  db: Database,
  input: { token: string | null; userId: string; userSessionId: string },
): Promise<AdminSessionContext> {
  if (!input.token) throw new AppError('ADMIN_REQUIRED', '请先验证管理员身份', 403);
  const rows = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.tokenHash, hashToken(input.token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.userId !== input.userId || row.userSessionId !== input.userSessionId) {
    throw new AppError('ADMIN_REQUIRED', '请先验证管理员身份', 403);
  }
  const now = utcNowMs();
  if (row.revokedAt) {
    throw new AppError('ADMIN_SESSION_REVOKED', '管理员会话已撤销，请重新验证', 401);
  }
  if (row.expiresAt <= now) {
    throw new AppError('ADMIN_SESSION_EXPIRED', '管理员会话已过期，请重新验证', 401);
  }
  // Touch activity for observability only; expiresAt remains absolute.
  await db.update(adminSessions).set({ lastActionAt: now }).where(eq(adminSessions.id, row.id));
  return {
    id: row.id,
    userId: row.userId,
    userSessionId: row.userSessionId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastActionAt: now,
    ipHash: row.ipHash,
  };
}

export async function revokeAdminSession(
  db: Database,
  session: AdminSessionContext,
  requestId: string,
) {
  const now = utcNowMs();
  await db
    .update(adminSessions)
    .set({ revokedAt: now, lastActionAt: now })
    .where(and(eq(adminSessions.id, session.id), isNull(adminSessions.revokedAt)));
  await appendAuditLog(db, {
    requestId,
    actorUserId: session.userId,
    adminSessionId: session.id,
    action: 'ADMIN_SESSION_REVOKE',
    resourceType: 'ADMIN_SESSION',
    resourceId: session.id,
    result: 'SUCCESS',
    createdAt: now,
  });
}

const ACTION_ALIASES: Record<string, string> = {
  DISABLE_MEMBER: 'MEMBER_DISABLE',
  RESTORE_MEMBER: 'MEMBER_RESTORE',
  ADJUST_GEMS: 'GEM_ADJUST',
  DELETE_BABY: 'BABY_DELETE',
  DELETE_ALL_PHOTOS: 'PHOTOS_DELETE_ALL',
  RESTORE_BACKUP: 'BACKUP_RESTORE',
  DISABLE_BACKUP: 'BACKUP_DISABLE',
  SETTINGS: 'SYSTEM_SETTINGS',
};

export function normalizeActionScope(actionScope: string) {
  const normalized = actionScope.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ACTION_ALIASES[normalized] ?? normalized;
}

export async function issueAdminReauthGrant(
  db: Database,
  input: {
    session: AdminSessionContext;
    password: string;
    actionScope: string;
    resourceId?: string | null;
    requestId: string;
    ip?: string;
  },
) {
  const now = utcNowMs();
  assertRateLimitAvailable(input.session.userId, input.ip, now);
  const credential = await getAdminCredential(db);
  const valid = credential ? await verifyPassword(input.password, credential.passwordHash) : false;
  if (!valid) {
    recordFailedAttempt(input.session.userId, input.ip, now);
    await appendAuditLog(db, {
      requestId: input.requestId,
      actorUserId: input.session.userId,
      adminSessionId: input.session.id,
      action: 'ADMIN_REAUTH',
      resourceType: 'ADMIN_REAUTH_GRANT',
      result: 'FAILED',
      errorCode: credential ? 'ADMIN_REAUTH_INVALID' : 'ADMIN_NOT_CONFIGURED',
      after: { actionScope: normalizeActionScope(input.actionScope), resourceId: input.resourceId ?? null },
      createdAt: now,
    });
    throw new AppError('ADMIN_REAUTH_INVALID', '管理员密码不正确', 401);
  }

  clearFailedAttempts(input.session.userId, input.ip);
  const token = generateSessionToken();
  const actionScope = normalizeActionScope(input.actionScope);
  const resourceId = input.resourceId?.trim() || null;
  const expiresAt = Math.min(input.session.expiresAt, now + ADMIN_REAUTH_TTL_MS);
  const id = createUlid();
  await db.insert(adminReauthGrants).values({
    id,
    adminSessionId: input.session.id,
    actionScope,
    resourceId,
    tokenHash: hashToken(token),
    expiresAt,
    usedAt: null,
  });
  await appendAuditLog(db, {
    requestId: input.requestId,
    actorUserId: input.session.userId,
    adminSessionId: input.session.id,
    action: 'ADMIN_REAUTH',
    resourceType: 'ADMIN_REAUTH_GRANT',
    resourceId,
    result: 'SUCCESS',
    after: { actionScope, expiresAt },
    createdAt: now,
  });
  return { grant: token, token, actionScope, resourceId, expiresAt };
}

export async function consumeAdminReauthGrant(
  db: Database,
  input: {
    session: AdminSessionContext;
    token: string | null;
    actionScope: string;
    resourceId?: string | null;
  },
) {
  if (!input.token) throw new AppError('ADMIN_REAUTH_REQUIRED', '这项操作需要再次验证', 403);
  const rows = await db
    .select()
    .from(adminReauthGrants)
    .where(eq(adminReauthGrants.tokenHash, hashToken(input.token)))
    .limit(1);
  const grant = rows[0];
  const actionScope = normalizeActionScope(input.actionScope);
  const resourceId = input.resourceId?.trim() || null;
  const now = utcNowMs();
  if (
    !grant ||
    grant.adminSessionId !== input.session.id ||
    grant.actionScope !== actionScope ||
    grant.resourceId !== resourceId ||
    grant.usedAt !== null ||
    grant.expiresAt <= now
  ) {
    if (!grant || grant.adminSessionId !== input.session.id || grant.actionScope !== actionScope || grant.resourceId !== resourceId) {
      throw new AppError('ADMIN_GRANT_SCOPE_MISMATCH', '管理员二次验证范围不匹配，请重新验证', 403);
    }
    if (grant.usedAt !== null) {
      throw new AppError('ADMIN_GRANT_USED', '管理员二次验证已经使用，请重新验证', 403);
    }
    throw new AppError('ADMIN_REAUTH_INVALID', '管理员二次验证已失效，请重新验证', 403);
  }

  // Conditional update makes consumption single-use under concurrent requests.
  const consumed = await db
    .update(adminReauthGrants)
    .set({ usedAt: now })
    .where(
      and(
        eq(adminReauthGrants.id, grant.id),
        eq(adminReauthGrants.adminSessionId, input.session.id),
        isNull(adminReauthGrants.usedAt),
        gt(adminReauthGrants.expiresAt, now),
      ),
    )
    .returning({ id: adminReauthGrants.id });
  if (!consumed[0]) {
    throw new AppError('ADMIN_GRANT_USED', '管理员二次验证已经使用，请重新验证', 403);
  }
  return { ...grant, usedAt: now };
}

export function parseAuditRow(row: typeof auditLogs.$inferSelect) {
  const parse = (value: string | null) => {
    if (!value) return null;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { redacted: true };
    }
  };
  return {
    id: row.id,
    requestId: row.requestId,
    actorUserId: row.actorUserId,
    adminSessionId: row.adminSessionId,
    familyId: row.familyId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    before: parse(row.beforeJson),
    after: parse(row.afterJson),
    result: row.result as 'SUCCESS' | 'FAILED',
    errorCode: row.errorCode,
    createdAt: row.createdAt,
  };
}
