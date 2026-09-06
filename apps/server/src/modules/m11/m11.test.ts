import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { babies, babyPreferences, exportJobs, searchDocuments, syncOperations, runMigrations } from '@runew/db';
import { eq } from 'drizzle-orm';
import { createUlid } from '@runew/shared-utils';
import WebSocket from 'ws';
import { buildApp } from '../../app.js';
import { consumeRealtimeTicket, upsertSearchDocument } from './service.js';

const platformHeaders = { 'x-client-platform': 'WEAPP' };

describe('M11 baby, search, trash, export and realtime', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let tempDir: string;
  let auth: Record<string, string>;
  let userId: string;
  let familyId: string;
  let babyId: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m11-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.BACKUP_ROOT = path.join(tempDir, 'backups');
    process.env.LOG_LEVEL = 'silent';
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
    await runMigrations(process.env.DATABASE_PATH);
    app = await buildApp();

    const registered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...platformHeaders, 'idempotency-key': createUlid() },
      payload: { username: `m11_${createUlid().slice(-10)}`, password: 'Password123!', nickname: '妈妈' },
    });
    expect(registered.statusCode).toBe(201);
    const registeredData = registered.json().data as { user: { id: string }; session: { token: string } };
    userId = registeredData.user.id;
    auth = { ...platformHeaders, authorization: `Bearer ${registeredData.session.token}` };

    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { relationship: 'MOM', familyName: 'M11 小家', baby: { name: '润润', birthday: '2026-01-16' }, topics: [] },
    });
    expect(onboarding.statusCode).toBe(200);
    const onboardingData = onboarding.json().data as { family: { id: string }; baby: { id: string } };
    familyId = onboardingData.family.id;
    babyId = onboardingData.baby.id;
  });

  afterEach(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('isolates multiple baby context and records profile changes', async () => {
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/babies`,
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { name: '小芽', birthday: '2025-12-01', notes: '喜欢看云' },
    });
    expect(second.statusCode).toBe(201);
    const secondBabyId = second.json().data.id as string;
    expect(secondBabyId).not.toBe(babyId);

    const list = await app.inject({ method: 'GET', url: `/api/v1/families/${familyId}/babies`, headers: auth });
    expect(list.json().data.items).toHaveLength(2);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/babies/${secondBabyId}`,
      headers: { ...auth, 'if-match': '"v1"' },
      payload: { nickname: '小芽芽', birthHeightCm: 51.2 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.nickname).toBe('小芽芽');
    const changes = await app.inject({ method: 'GET', url: `/api/v1/babies/${secondBabyId}/changes`, headers: auth });
    expect(changes.json().data.items.some((item: { field: string }) => item.field === 'nickname')).toBe(true);

    const context = await app.inject({
      method: 'POST',
      url: '/api/v1/context',
      headers: auth,
      payload: { familyId, babyId: secondBabyId },
    });
    expect(context.statusCode).toBe(200);
    const bootstrap = await app.inject({ method: 'GET', url: '/api/v1/bootstrap', headers: auth });
    expect(bootstrap.json().data.currentBaby.id).toBe(secondBabyId);

    const deniedDelete = await app.inject({ method: 'DELETE', url: `/api/v1/babies/${secondBabyId}`, headers: auth });
    expect(deniedDelete.statusCode).toBe(403);
    await app.db.update(babies).set({ deletedAt: Date.now(), version: 2 }).where(eq(babies.id, secondBabyId));
    const trash = await app.inject({ method: 'GET', url: `/api/v1/trash?familyId=${familyId}`, headers: auth });
    expect(trash.json()).toMatchObject({
      data: { items: expect.arrayContaining([expect.objectContaining({ entityType: 'BABY', entityId: secondBabyId })]) },
    });
    const restored = await app.inject({ method: 'POST', url: `/api/v1/trash/BABY/${secondBabyId}/restore?familyId=${familyId}`, headers: auth });
    expect(restored.statusCode).toBe(200);
    const restoreLog = await app.db.select().from(syncOperations).where(eq(syncOperations.entityId, secondBabyId));
    expect(restoreLog.some((row) => row.op === 'RESTORE')).toBe(true);
  });

  it('routes legacy baby preference restore through the shared trash policy', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/preferences`,
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { type: 'LIKE', label: '香蕉' },
    });
    expect(created.statusCode).toBe(201);
    const preferenceId = created.json().data.id as string;
    const deletedAt = Date.now();
    await app.db.update(babyPreferences).set({ deletedAt, version: 2 }).where(eq(babyPreferences.id, preferenceId));
    await upsertSearchDocument(app.db, {
      familyId,
      babyId,
      entityType: 'BABY_PREFERENCE',
      entityId: preferenceId,
      title: '香蕉',
      body: '喜欢香蕉',
      deleted: true,
    });

    const restored = await app.inject({ method: 'POST', url: `/api/v1/baby-preferences/${preferenceId}/restore`, headers: auth });
    expect(restored.statusCode).toBe(200);
    const restoredRow = (await app.db.select().from(babyPreferences).where(eq(babyPreferences.id, preferenceId)).limit(1))[0]!;
    expect(restoredRow.deletedAt).toBeNull();
    expect(restoredRow.version).toBe(3);
    const projection = (await app.db.select().from(searchDocuments).where(eq(searchDocuments.entityId, preferenceId)).limit(1))[0]!;
    expect(projection.deleted).toBe(false);
    const restoreLog = await app.db.select().from(syncOperations).where(eq(syncOperations.entityId, preferenceId));
    expect(restoreLog.filter((row) => row.op === 'RESTORE')).toHaveLength(1);

    const expired = await app.inject({
      method: 'POST',
      url: `/api/v1/babies/${babyId}/preferences`,
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { type: 'DISLIKE', label: '过期样本' },
    });
    const expiredId = expired.json().data.id as string;
    await app.db.update(babyPreferences).set({ deletedAt: Date.now() - 31 * 24 * 60 * 60 * 1000, version: 2 }).where(eq(babyPreferences.id, expiredId));
    const expiredRestore = await app.inject({ method: 'POST', url: `/api/v1/baby-preferences/${expiredId}/restore`, headers: auth });
    expect(expiredRestore.statusCode).toBe(410);
  });

  it('filters private, deleted and sealed content in query layer', async () => {
    const ownDiaryId = createUlid();
    const otherDiaryId = createUlid();
    const deletedId = createUlid();
    const capsuleId = createUlid();
    await upsertSearchDocument(app.db, { familyId, ownerUserId: userId, visibility: 'PRIVATE', entityType: 'DIARY', entityId: ownDiaryId, title: '我的片段', body: '星河里的私密记录' });
    const other = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...platformHeaders, 'idempotency-key': createUlid() },
      payload: { username: `m11_other_${createUlid().slice(-8)}`, password: 'Password123!', nickname: '另一位家人' },
    });
    const otherUserId = other.json().data.user.id as string;
    await upsertSearchDocument(app.db, { familyId, ownerUserId: otherUserId, visibility: 'PRIVATE', entityType: 'DIARY', entityId: otherDiaryId, title: '另一位家人的片段', body: '星河里的别人的秘密' });
    await upsertSearchDocument(app.db, { familyId, visibility: 'FAMILY', entityType: 'MEMORY', entityId: deletedId, title: '已删除记忆', body: '星河', deleted: true });
    await upsertSearchDocument(app.db, { familyId, visibility: 'FAMILY', entityType: 'TIME_CAPSULE', entityId: capsuleId, title: '给未来的信', body: '星河正文不能被普通搜索看到', capsuleState: 'SEALED' });

    const ownSearch = await app.inject({ method: 'GET', url: `/api/v1/search?q=星河&familyId=${familyId}`, headers: auth });
    expect(ownSearch.statusCode).toBe(200);
    const ownItems = ownSearch.json().data.items as Array<{ entityId: string; snippet: string }>;
    expect(ownItems.some((item) => item.entityId === ownDiaryId)).toBe(true);
    expect(ownItems.some((item) => item.entityId === otherDiaryId)).toBe(false);
    expect(ownItems.some((item) => item.entityId === deletedId)).toBe(false);
    expect(ownItems.some((item) => item.snippet.includes('不能被普通搜索'))).toBe(false);

    const capsuleSearch = await app.inject({ method: 'GET', url: `/api/v1/search?q=未来&familyId=${familyId}`, headers: auth });
    expect(capsuleSearch.json().data.items).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: capsuleId, snippet: '' })]));
  });

  it('matches Chinese application-level bigrams across a longer phrase', async () => {
    const memoryId = createUlid();
    await upsertSearchDocument(app.db, {
      familyId,
      visibility: 'FAMILY',
      entityType: 'PHOTO_MEMORY',
      entityId: memoryId,
      title: '小小记忆',
      body: '宝宝喜欢在窗边看云',
    });

    const response = await app.inject({ method: 'GET', url: `/api/v1/search?q=宝喜&familyId=${familyId}`, headers: auth });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.items).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: memoryId })]));
  });

  it('hides baby-scoped search documents while a baby is soft-deleted and restores them afterward', async () => {
    const memoryId = createUlid();
    await upsertSearchDocument(app.db, {
      familyId,
      babyId,
      visibility: 'FAMILY',
      entityType: 'PHOTO_MEMORY',
      entityId: memoryId,
      title: '宝宝专属记忆',
      body: '软删除搜索回归专属词',
    });

    const beforeDelete = await app.inject({ method: 'GET', url: `/api/v1/search?q=专属词&familyId=${familyId}`, headers: auth });
    expect(beforeDelete.statusCode).toBe(200);
    expect((beforeDelete.json().data.items as Array<{ entityId: string }>).some((item) => item.entityId === memoryId)).toBe(true);

    await app.db.update(babies).set({ deletedAt: Date.now(), version: 2 }).where(eq(babies.id, babyId));
    const whileDeleted = await app.inject({ method: 'GET', url: `/api/v1/search?q=专属词&familyId=${familyId}`, headers: auth });
    expect(whileDeleted.statusCode).toBe(200);
    expect((whileDeleted.json().data.items as Array<{ entityId: string }>).some((item) => item.entityId === memoryId)).toBe(false);

    await app.db.update(babies).set({ deletedAt: null, version: 3 }).where(eq(babies.id, babyId));
    const afterRestore = await app.inject({ method: 'GET', url: `/api/v1/search?q=专属词&familyId=${familyId}`, headers: auth });
    expect(afterRestore.statusCode).toBe(200);
    expect((afterRestore.json().data.items as Array<{ entityId: string }>).some((item) => item.entityId === memoryId)).toBe(true);
  });

  it('creates private export jobs, enforces ownership and expiry, and consumes realtime tickets once', async () => {
    const privateOwnId = createUlid();
    const privateOtherId = createUlid();
    const other = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...platformHeaders, 'idempotency-key': createUlid() },
      payload: { username: `m11_export_other_${createUlid().slice(-8)}`, password: 'Password123!', nickname: '另一位家人' },
    });
    const otherUserId = other.json().data.user.id as string;
    await upsertSearchDocument(app.db, {
      familyId,
      ownerUserId: userId,
      visibility: 'PRIVATE',
      entityType: 'DIARY',
      entityId: privateOwnId,
      title: '我的导出片段',
      body: '我的私密正文',
    });
    await upsertSearchDocument(app.db, {
      familyId,
      ownerUserId: otherUserId,
      visibility: 'PRIVATE',
      entityType: 'DIARY',
      entityId: privateOtherId,
      title: '别人的导出片段',
      body: '不应出现在导出中的正文',
    });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/exports',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { familyId, type: 'CSV' },
    });
    expect(created.statusCode).toBe(202);
    const jobId = created.json().data.id as string;
    const ready = await app.inject({ method: 'GET', url: `/api/v1/exports/${jobId}`, headers: auth });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().data.state).toBe('READY');
    const download = await app.inject({ method: 'GET', url: `/api/v1/exports/${jobId}/download`, headers: auth });
    expect(download.statusCode).toBe(200);
    expect(download.body).toContain('entity_type');
    expect(download.body).toContain(privateOwnId);
    expect(download.body).not.toContain(privateOtherId);
    expect(download.body).not.toContain('不应出现在导出中的正文');
    expect(ready.json().data.filePath).toBeUndefined();

    const archive = await app.inject({
      method: 'POST',
      url: '/api/v1/exports',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { familyId, type: 'PHOTO_AUDIO_ARCHIVE' },
    });
    expect(archive.statusCode).toBe(202);
    const archiveId = archive.json().data.id as string;
    const archiveDownload = await app.inject({ method: 'GET', url: `/api/v1/exports/${archiveId}/download`, headers: auth });
    expect(archiveDownload.statusCode).toBe(200);
    expect(archiveDownload.headers['content-type']).toContain('application/zip');
    expect(archiveDownload.body.slice(0, 2)).toBe('PK');

    await app.db.update(exportJobs).set({ expiresAt: Date.now() - 1 }).where(eq(exportJobs.id, jobId));
    const expired = await app.inject({ method: 'GET', url: `/api/v1/exports/${jobId}/download`, headers: auth });
    expect(expired.statusCode).toBe(410);

    const ticketResponse = await app.inject({ method: 'POST', url: '/api/v1/realtime/ticket', headers: auth, payload: { familyId } });
    expect(ticketResponse.statusCode).toBe(200);
    const ticket = ticketResponse.json().data.ticket as string;
    const consumed = await consumeRealtimeTicket(app.db, ticket);
    expect(consumed.userId).toBe(userId);
    await expect(consumeRealtimeTicket(app.db, ticket)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('persists night appearance and device context', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/v1/settings/appearance', headers: auth });
    expect(before.json().data.appearance).toBe('SYSTEM');
    const changed = await app.inject({ method: 'PUT', url: '/api/v1/settings/appearance', headers: auth, payload: { appearance: 'NIGHT', reduceMotion: true } });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().data.appearance).toBe('NIGHT');
    const devices = await app.inject({ method: 'GET', url: '/api/v1/settings/devices', headers: auth });
    expect(devices.json().data.items[0]).toHaveProperty('currentBabyId');
  });

  it('accepts a one-time ticket on /ws and emits only hint events', async () => {
    const ticketResponse = await app.inject({ method: 'POST', url: '/api/v1/realtime/ticket', headers: auth, payload: { familyId } });
    const ticket = ticketResponse.json().data.ticket as string;
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('server did not expose a port');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?ticket=${encodeURIComponent(ticket)}`);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    const message = new Promise<string>((resolve, reject) => {
      socket.once('message', (value) => resolve(value.toString()));
      socket.once('error', reject);
    });
    app.realtimeHub.broadcast({ type: 'maintenance', familyId, reason: 'scheduled' });
    expect(JSON.parse(await message)).toEqual({ type: 'maintenance', familyId, reason: 'scheduled' });
    socket.close();
    await new Promise<void>((resolve) => socket.once('close', () => resolve()));
  });

  it('rejects realtime tickets after the session is revoked', async () => {
    const ticketResponse = await app.inject({ method: 'POST', url: '/api/v1/realtime/ticket', headers: auth, payload: { familyId } });
    expect(ticketResponse.statusCode).toBe(200);
    const ticket = ticketResponse.json().data.ticket as string;

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: auth });
    expect(logout.statusCode).toBe(200);

    await expect(consumeRealtimeTicket(app.db, ticket)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
