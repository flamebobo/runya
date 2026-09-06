import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { adminCredentials, adminSessions, auditLogs, backupRuns, exportJobs, gemTransactions } from '@runew/db';
import { createUlid } from '@runew/shared-utils';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { hashPassword } from '../../lib/password.js';
import { resetAdminAuthRateLimit } from './service.js';

const headers = { 'x-client-platform': 'WEAPP' };

describe('M12 independent admin security domain', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tempDir: string;
  let auth: Record<string, string>;
  let adminToken: string;
  let adminSessionId: string;
  let familyId: string;

  beforeEach(async () => {
    resetAdminAuthRateLimit();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-admin-test-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    app = await buildApp();
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { username: `admin_${createUlid().slice(-10)}`, password: 'Password123!', nickname: '管理员测试' },
    });
    expect(register.statusCode).toBe(201);
    const data = register.json().data;
    auth = { ...headers, authorization: `Bearer ${data.session.token as string}` };
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { relationship: 'MOM', baby: { name: '润润', birthday: '2026-01-16' }, topics: [] },
    });
    expect(onboarding.statusCode).toBe(200);
    familyId = onboarding.json().data.family.id as string;
    await app.db.insert(adminCredentials).values({
      id: createUlid(), passwordHash: await hashPassword('AdminPassword123!'), changedAt: Date.now(), updatedByUserId: null,
    });
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  async function signInAdmin(password = 'AdminPassword123!') {
    const response = await app.inject({ method: 'POST', url: '/api/v1/admin/auth', headers: auth, payload: { password } });
    if (response.statusCode === 200) {
      const data = response.json().data;
      adminToken = data.token as string;
      adminSessionId = data.sessionId as string;
    }
    return response;
  }

  function adminHeaders() {
    return { ...auth, 'x-admin-session': adminToken };
  }

  it('requires both the normal user session and the independent admin session', async () => {
    const signed = await signInAdmin();
    expect(signed.statusCode).toBe(200);
    expect(adminToken).toBeTruthy();

    const userOnly = await app.inject({ method: 'GET', url: '/api/v1/admin/session', headers: auth });
    expect(userOnly.statusCode).toBe(403);

    const adminOnly = await app.inject({ method: 'GET', url: '/api/v1/admin/session', headers: { ...headers, 'x-admin-session': adminToken } });
    expect(adminOnly.statusCode).toBe(401);

    const session = await app.inject({ method: 'GET', url: '/api/v1/admin/session', headers: adminHeaders() });
    expect(session.statusCode).toBe(200);
    expect(session.json().data.sessionId).toBe(adminSessionId);
  });

  it('limits failed admin passwords and records metadata without the password', async () => {
    const responses = [];
    for (let i = 0; i < 6; i += 1) responses.push(await signInAdmin('wrong-password'));
    expect(responses.slice(0, 5).every((response) => response.statusCode === 401)).toBe(true);
    expect(responses[5]?.statusCode).toBe(429);
    const logs = await app.db.select().from(auditLogs);
    expect(logs.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(logs)).not.toContain('wrong-password');
    expect(JSON.stringify(logs)).not.toContain('AdminPassword123!');
  });

  it('issues a two-minute scoped grant and consumes it exactly once before gem adjustment', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);
    const missingGrant = await app.inject({
      method: 'POST', url: `/api/v1/admin/families/${familyId}/gems/adjust`, headers: { ...adminHeaders(), 'idempotency-key': createUlid() },
      payload: { amount: 2, reasonText: 'private reason' },
    });
    expect(missingGrant.statusCode).toBe(403);

    const reauth = await app.inject({
      method: 'POST', url: '/api/v1/admin/reauth', headers: adminHeaders(),
      payload: { password: 'AdminPassword123!', actionScope: 'GEM_ADJUST', resourceId: familyId },
    });
    expect(reauth.statusCode).toBe(200);
    const grant = reauth.json().data.grant as string;
    expect(reauth.json().data.expiresAt - Date.now()).toBeLessThanOrEqual(120_000);

    const missingConfirmation = await app.inject({
      method: 'POST', url: `/api/v1/admin/families/${familyId}/gems/adjust`, headers: { ...adminHeaders(), 'x-admin-reauth-grant': grant, 'idempotency-key': createUlid() },
      payload: { amount: 2, reasonText: 'private reason' },
    });
    expect(missingConfirmation.statusCode).toBe(403);
    expect(missingConfirmation.json().error.code).toBe('ADMIN_REAUTH_REQUIRED');

    const wrongScopeReauth = await app.inject({
      method: 'POST', url: '/api/v1/admin/reauth', headers: adminHeaders(),
      payload: { password: 'AdminPassword123!', actionScope: 'GEM_ADJUST', resourceId: 'different-family' },
    });
    expect(wrongScopeReauth.statusCode).toBe(200);
    const wrongScope = await app.inject({
      method: 'POST', url: `/api/v1/admin/families/${familyId}/gems/adjust`, headers: { ...adminHeaders(), 'x-admin-reauth-grant': wrongScopeReauth.json().data.grant as string, 'idempotency-key': createUlid() },
      payload: { amount: 2, reasonText: 'private reason', confirm: true },
    });
    expect(wrongScope.statusCode).toBe(403);
    expect(wrongScope.json().error.code).toBe('ADMIN_GRANT_SCOPE_MISMATCH');

    const gemIdempotencyKey = createUlid();
    const confirmed = await app.inject({
      method: 'POST', url: `/api/v1/admin/families/${familyId}/gems/adjust`, headers: { ...adminHeaders(), 'x-admin-reauth-grant': grant, 'idempotency-key': gemIdempotencyKey },
      payload: { amount: 2, reasonText: 'private reason', confirm: true },
    });
    expect(confirmed.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST', url: `/api/v1/admin/families/${familyId}/gems/adjust`, headers: { ...adminHeaders(), 'x-admin-reauth-grant': grant, 'idempotency-key': gemIdempotencyKey },
      payload: { amount: 2, reasonText: 'private reason', confirm: true },
    });
    expect(replay.statusCode).toBe(403);
    expect(replay.json().error.code).toBe('ADMIN_GRANT_USED');

    const logs = await app.db.select().from(auditLogs);
    expect(JSON.stringify(logs)).not.toContain('private reason');
  });

  it('rejects an expired admin session even when the normal session remains valid', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);
    await app.db.update(adminSessions).set({ expiresAt: Date.now() - 1 }).where(eq(adminSessions.id, adminSessionId));
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/session', headers: adminHeaders() });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('ADMIN_SESSION_EXPIRED');
  });

  it('replays a gem adjustment by key without issuing a second ledger entry', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);
    const reauth = await app.inject({
      method: 'POST', url: '/api/v1/admin/reauth', headers: adminHeaders(),
      payload: { password: 'AdminPassword123!', actionScope: 'GEM_ADJUST', resourceId: familyId },
    });
    expect(reauth.statusCode).toBe(200);
    const key = createUlid();
    const first = await app.inject({
      method: 'POST', url: `/api/v1/admin/families/${familyId}/gems/adjust`,
      headers: { ...adminHeaders(), 'x-admin-reauth-grant': reauth.json().data.grant as string, 'idempotency-key': key },
      payload: { amount: 3, reasonCode: 'ADMIN_ADJUSTMENT', confirm: true },
    });
    expect(first.statusCode).toBe(200);

    // A retry gets a fresh scoped grant, but the same key returns the original
    // response and does not append another immutable ledger row.
    const retryGrant = await app.inject({
      method: 'POST', url: '/api/v1/admin/reauth', headers: adminHeaders(),
      payload: { password: 'AdminPassword123!', actionScope: 'GEM_ADJUST', resourceId: familyId },
    });
    const retry = await app.inject({
      method: 'POST', url: `/api/v1/admin/families/${familyId}/gems/adjust`,
      headers: { ...adminHeaders(), 'x-admin-reauth-grant': retryGrant.json().data.grant as string, 'idempotency-key': key },
      payload: { amount: 3, reasonCode: 'ADMIN_ADJUSTMENT', confirm: true },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data.id).toBe(first.json().data.id);

    const rows = await app.db.select().from(gemTransactions).where(eq(gemTransactions.familyId, familyId));
    expect(rows.filter((row) => row.sourceType === 'ADMIN_ADJUSTMENT' && row.idempotencyKey === `admin:${key}`)).toHaveLength(1);
  });

  it('creates one admin export per idempotency key and rejects a changed payload', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);
    const key = createUlid();
    const first = await app.inject({
      method: 'POST', url: '/api/v1/admin/exports', headers: { ...adminHeaders(), 'idempotency-key': key },
      payload: { familyId, type: 'CSV' },
    });
    expect(first.statusCode).toBe(202);
    const retry = await app.inject({
      method: 'POST', url: '/api/v1/admin/exports', headers: { ...adminHeaders(), 'idempotency-key': key },
      payload: { familyId, type: 'CSV' },
    });
    expect(retry.statusCode).toBe(202);
    expect(retry.json().data.id).toBe(first.json().data.id);
    const changed = await app.inject({
      method: 'POST', url: '/api/v1/admin/exports', headers: { ...adminHeaders(), 'idempotency-key': key },
      payload: { familyId, type: 'GROWTH_REPORT' },
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const rows = await app.db.select().from(exportJobs).where(eq(exportJobs.familyId, familyId));
    expect(rows.filter((row) => row.type === 'CSV')).toHaveLength(1);
  });

  it('serializes concurrent admin export retries with the same key', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);
    const key = createUlid();
    const payload = { familyId, type: 'CSV' as const };
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/admin/exports', headers: { ...adminHeaders(), 'idempotency-key': key }, payload }),
      app.inject({ method: 'POST', url: '/api/v1/admin/exports', headers: { ...adminHeaders(), 'idempotency-key': key }, payload }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([202, 202]);
    expect(responses[0].json().data.id).toBe(responses[1].json().data.id);
    const rows = await app.db.select().from(exportJobs).where(eq(exportJobs.familyId, familyId));
    expect(rows.filter((row) => row.type === 'CSV')).toHaveLength(1);
  });

  it('serves management modules behind the same admin gate and audits mutations', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);

    const rule = await app.inject({
      method: 'POST', url: '/api/v1/admin/gem-rules', headers: adminHeaders(),
      payload: { familyId, actionType: 'DIAPER_RECORD', amount: 1, dailyLimit: 5 },
    });
    expect(rule.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/gem-rules', headers: adminHeaders() })).statusCode).toBe(200);

    const reward = await app.inject({
      method: 'POST', url: '/api/v1/admin/rewards', headers: adminHeaders(),
      payload: { familyId, name: '管理员愿望', priceGems: 3 },
    });
    expect(reward.statusCode).toBe(200);

    const article = await app.inject({
      method: 'POST', url: '/api/v1/admin/knowledge', headers: adminHeaders(),
      payload: { title: '睡眠小贴士', summary: '摘要', body: '这段正文不应进入审计快照', category: 'SLEEP', sourceName: 'RUNEW' },
    });
    expect(article.statusCode).toBe(200);
    const articleId = article.json().data.id as string;
    expect((await app.inject({ method: 'POST', url: `/api/v1/admin/knowledge/${articleId}/publish`, headers: adminHeaders() })).statusCode).toBe(200);

    const members = await app.inject({ method: 'GET', url: `/api/v1/admin/families/${familyId}/members`, headers: adminHeaders() });
    expect(members.statusCode).toBe(200);
    expect(members.json().data.items.length).toBe(1);
    const memberId = members.json().data.items[0].id as string;
    const noGrant = await app.inject({ method: 'POST', url: `/api/v1/admin/members/${memberId}/disable`, headers: adminHeaders() });
    expect(noGrant.statusCode).toBe(403);

    const settingGrant = await app.inject({
      method: 'POST', url: '/api/v1/admin/reauth', headers: adminHeaders(),
      payload: { password: 'AdminPassword123!', actionScope: 'SYSTEM_SETTINGS', resourceId: 'night_mode' },
    });
    expect(settingGrant.statusCode).toBe(200);
    const setting = await app.inject({
      method: 'PATCH', url: '/api/v1/admin/system/settings', headers: { ...adminHeaders(), 'x-admin-reauth-grant': settingGrant.json().data.grant as string },
      payload: { key: 'night_mode', value: true, confirm: true },
    });
    expect(setting.statusCode).toBe(200);

    const logs = await app.inject({ method: 'GET', url: '/api/v1/admin/audit-logs', headers: adminHeaders() });
    expect(logs.statusCode).toBe(200);
    expect(logs.json().data.items.some((item: { action: string }) => item.action === 'KNOWLEDGE_PUBLISH')).toBe(true);
    expect(JSON.stringify(logs.json())).not.toContain('这段正文不应进入审计快照');
  });

  it('keeps dangerous grants resource-scoped and restores only verified backups', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);

    const bulkSetting = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/system/settings',
      headers: adminHeaders(),
      payload: { settings: { backup_enabled: false, night_mode: true }, confirm: true },
    });
    expect(bulkSetting.statusCode).toBe(400);

    const backupId = createUlid();
    await app.db.insert(backupRuns).values({
      id: backupId,
      status: 'RUNNING',
      startedAt: Date.now(),
      finishedAt: null,
      bytes: null,
      manifestJson: null,
      errorCode: null,
      createdAt: Date.now(),
    });
    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/reauth',
      headers: adminHeaders(),
      payload: { password: 'AdminPassword123!', actionScope: 'BACKUP_RESTORE', resourceId: backupId },
    });
    expect(grant.statusCode).toBe(200);
    const restore = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/backups/${backupId}/restore`,
      headers: { ...adminHeaders(), 'x-admin-reauth-grant': grant.json().data.grant as string },
      payload: { confirm: true },
    });
    expect(restore.statusCode).toBe(409);
  });

  it('rejects a verified-looking backup manifest outside the backup repository', async () => {
    expect((await signInAdmin()).statusCode).toBe(200);
    const outsidePath = path.join(tempDir, 'outside-backup.db');
    const outsideBytes = Buffer.from('not a repository snapshot');
    fs.writeFileSync(outsidePath, outsideBytes);
    const backupId = createUlid();
    await app.db.insert(backupRuns).values({
      id: backupId,
      status: 'READY',
      startedAt: Date.now(),
      finishedAt: Date.now(),
      bytes: outsideBytes.length,
      manifestJson: JSON.stringify({
        snapshotPath: outsidePath,
        sha256: createHash('sha256').update(outsideBytes).digest('hex'),
        sizeBytes: outsideBytes.length,
        createdAt: Date.now(),
      }),
      errorCode: null,
      createdAt: Date.now(),
    });
    const grant = await app.inject({
      method: 'POST', url: '/api/v1/admin/reauth', headers: adminHeaders(),
      payload: { password: 'AdminPassword123!', actionScope: 'BACKUP_RESTORE', resourceId: backupId },
    });
    expect(grant.statusCode).toBe(200);
    const restore = await app.inject({
      method: 'POST', url: `/api/v1/admin/backups/${backupId}/restore`,
      headers: { ...adminHeaders(), 'x-admin-reauth-grant': grant.json().data.grant as string },
      payload: { confirm: true },
    });
    expect(restore.statusCode).toBe(409);
    expect(restore.json().error.code).toBe('CONFLICT');
  });
});
