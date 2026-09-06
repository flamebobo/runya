import { z } from 'zod';
import { createSuccessEnvelope, createExportBodySchema, createBabyPreferenceBodySchema, updateBabyPreferenceBodySchema, updateUserSettingsBodySchema, updateNotificationPreferencesBodySchema } from '@runew/contracts';
import { backupRuns, devices, mediaFiles, userSessions, users } from '@runew/db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../../plugins/auth.js';
import { AppError } from '../../lib/errors.js';
import { requireIdempotencyKey, withIdempotency } from '../../lib/idempotency.js';
import { parseIfMatch } from '@runew/shared-utils';
import { getActiveFamilyId, requireBabyInFamily, requireFamilyMembership } from '../identity/service.js';
import {
  changeUserPassword,
  createBabyPreference,
  createExportJob,
  deleteBabyPreference,
  getExportJob,
  getNotificationSettings,
  getSettingsSnapshot,
  getUserSettings,
  issueRealtimeTicket,
  listBabyChanges,
  listBabyPreferences,
  listExportJobs,
  listTrash,
  processExportJob,
  readExportFile,
  restoreBabyPreference,
  restoreTrashItem,
  searchDocumentsForUser,
  toPublicExportJob,
  updateCurrentContext,
  updateNotificationSettings,
  updateUserSettings,
  updateBabyPreference,
} from './service.js';

const passwordBodySchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128),
});
const accountPatchSchema = z.object({
  nickname: z.string().trim().min(1).max(64).optional(),
  locale: z.string().trim().min(2).max(16).optional(),
  timezoneName: z.string().trim().min(1).max(64).optional(),
});
const dndPatchSchema = updateNotificationPreferencesBodySchema.pick({
  dndEnabled: true,
  dndStartMinute: true,
  dndEndMinute: true,
  timezoneName: true,
}).partial();
const privacyPatchSchema = z.object({
  defaultDiaryVisibility: z.enum(['PRIVATE', 'FAMILY']).optional(),
  analyticsEnabled: z.boolean().optional(),
});

function queryString(request: FastifyRequest, key: string) {
  const value = (request.query as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value : undefined;
}

async function familyForRequest(request: FastifyRequest) {
  const familyId = queryString(request, 'familyId') ?? String((request.body as { familyId?: string } | null)?.familyId ?? '');
  if (familyId) {
    await requireFamilyMembership(request.db, request.auth.userId!, familyId);
    return familyId;
  }
  return getActiveFamilyId(request.db, request.auth.userId!);
}

export async function m11Routes(app: FastifyInstance) {
  // Baby preferences and recent profile changes.
  app.get('/babies/:babyId/preferences', { preHandler: requireAuth }, async (request) => {
    const { babyId } = request.params as { babyId: string };
    const items = await listBabyPreferences(request.db, request.auth.userId!, babyId);
    return createSuccessEnvelope({ items }, request.id);
  });

  app.post('/babies/:babyId/preferences', { preHandler: requireAuth }, async (request, reply) => {
    requireIdempotencyKey(request);
    const { babyId } = request.params as { babyId: string };
    const body = createBabyPreferenceBodySchema.parse(request.body);
    return withIdempotency(app, request, reply, {
      endpoint: `babies/${babyId}/preferences`,
      userId: request.auth.userId!,
      payload: body,
      revalidate: async () => { await requireBabyInFamily(request.db, request.auth.userId!, babyId); },
      handler: async () => ({ statusCode: 201, body: createSuccessEnvelope(await createBabyPreference(request.db, request.auth.userId!, babyId, body), request.id) }),
    });
  });

  app.patch('/baby-preferences/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateBabyPreferenceBodySchema.parse(request.body);
    const item = await updateBabyPreference(request.db, request.auth.userId!, id, body, parseIfMatch(request.headers['if-match']));
    return createSuccessEnvelope(item, request.id);
  });

  app.delete('/baby-preferences/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(await deleteBabyPreference(request.db, request.auth.userId!, id), request.id);
  });

  app.post('/baby-preferences/:id/restore', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(await restoreBabyPreference(request.db, request.auth.userId!, id, request.auth.deviceId), request.id);
  });

  app.get('/babies/:babyId/changes', { preHandler: requireAuth }, async (request) => {
    const { babyId } = request.params as { babyId: string };
    return createSuccessEnvelope({ items: await listBabyChanges(request.db, request.auth.userId!, babyId) }, request.id);
  });

  // Current context is persisted per device, so a baby switch affects every baby-scoped query.
  app.post('/context', { preHandler: requireAuth }, async (request) => {
    const body = z.object({ familyId: z.string().min(1), babyId: z.string().min(1) }).parse(request.body);
    return createSuccessEnvelope(await updateCurrentContext(request.db, request.auth.userId!, request.auth.deviceId, body.familyId, body.babyId), request.id);
  });

  // Settings aggregate and focused mutations.
  app.get('/settings', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await getSettingsSnapshot(request.db, request.auth.userId!), request.id));
  app.get('/settings/account', { preHandler: requireAuth }, async (request) => {
    const row = await request.db.select({ id: users.id, nickname: users.nickname, locale: users.locale, timezoneName: users.timezoneName }).from(users).where(eq(users.id, request.auth.userId!)).limit(1);
    if (!row[0]) throw new AppError('NOT_FOUND', '用户不存在', 404);
    return createSuccessEnvelope(row[0], request.id);
  });
  app.patch('/settings/account', { preHandler: requireAuth }, async (request) => {
    const patch = accountPatchSchema.parse(request.body);
    const updated = await request.db.update(users).set({ ...patch, updatedAt: Date.now() }).where(eq(users.id, request.auth.userId!)).returning({ id: users.id, nickname: users.nickname, locale: users.locale, timezoneName: users.timezoneName });
    if (!updated[0]) throw new AppError('NOT_FOUND', '用户不存在', 404);
    return createSuccessEnvelope(updated[0], request.id);
  });
  app.post('/settings/password', { preHandler: requireAuth }, async (request) => {
    const body = passwordBodySchema.parse(request.body);
    return createSuccessEnvelope(await changeUserPassword(request.db, request.auth.userId!, body.currentPassword, body.newPassword), request.id);
  });
  app.get('/settings/devices', { preHandler: requireAuth }, async (request) => {
    const rows = await request.db.select({
      id: devices.id,
      platform: devices.platform,
      deviceName: devices.deviceName,
      appVersion: devices.appVersion,
      currentFamilyId: devices.currentFamilyId,
      currentBabyId: devices.currentBabyId,
      lastSeenAt: devices.lastSeenAt,
    }).from(devices).where(eq(devices.userId, request.auth.userId!));
    return createSuccessEnvelope({ items: rows }, request.id);
  });
  app.delete('/settings/devices/:deviceId', { preHandler: requireAuth }, async (request) => {
    const { deviceId } = request.params as { deviceId: string };
    const sessions = await request.db.select({ id: userSessions.id }).from(userSessions).where(and(eq(userSessions.userId, request.auth.userId!), eq(userSessions.deviceId, deviceId), isNull(userSessions.revokedAt)));
    if (sessions.length) await request.db.update(userSessions).set({ revokedAt: Date.now() }).where(and(eq(userSessions.userId, request.auth.userId!), eq(userSessions.deviceId, deviceId), isNull(userSessions.revokedAt)));
    for (const session of sessions) request.server.realtimeHub.revokeSession(session.id, 'device revoked');
    return createSuccessEnvelope({ deviceId, revokedSessions: sessions.length }, request.id);
  });
  app.get('/settings/notifications', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await getNotificationSettings(request.db, request.auth.userId!), request.id));
  app.put('/settings/notifications', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await updateNotificationSettings(request.db, request.auth.userId!, updateNotificationPreferencesBodySchema.parse(request.body)), request.id));
  app.get('/settings/dnd', { preHandler: requireAuth }, async (request) => {
    const row = await getNotificationSettings(request.db, request.auth.userId!);
    return createSuccessEnvelope({ enabled: row.dndEnabled, startMinute: row.dndStartMinute, endMinute: row.dndEndMinute, timezoneName: row.timezoneName }, request.id);
  });
  app.put('/settings/dnd', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await updateNotificationSettings(request.db, request.auth.userId!, dndPatchSchema.parse(request.body)), request.id));
  app.get('/settings/appearance', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await getUserSettings(request.db, request.auth.userId!), request.id));
  app.put('/settings/appearance', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await updateUserSettings(request.db, request.auth.userId!, updateUserSettingsBodySchema.parse(request.body)), request.id));
  app.get('/settings/privacy', { preHandler: requireAuth }, async (request) => createSuccessEnvelope((await getUserSettings(request.db, request.auth.userId!)).privacy, request.id));
  app.put('/settings/privacy', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await updateUserSettings(request.db, request.auth.userId!, { privacy: privacyPatchSchema.parse(request.body) }), request.id));
  app.get('/settings/backup-status', { preHandler: requireAuth }, async (request) => {
    const rows = await request.db.select({
      id: backupRuns.id,
      status: backupRuns.status,
      startedAt: backupRuns.startedAt,
      finishedAt: backupRuns.finishedAt,
      bytes: backupRuns.bytes,
      errorCode: backupRuns.errorCode,
      createdAt: backupRuns.createdAt,
    }).from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(1);
    return createSuccessEnvelope({ status: rows[0]?.status ?? 'NEVER_RUN', lastRun: rows[0] ?? null }, request.id);
  });
  app.get('/settings/backup-history', { preHandler: requireAuth }, async (request) => {
    const rows = await request.db.select({
      id: backupRuns.id,
      status: backupRuns.status,
      startedAt: backupRuns.startedAt,
      finishedAt: backupRuns.finishedAt,
      bytes: backupRuns.bytes,
      errorCode: backupRuns.errorCode,
      createdAt: backupRuns.createdAt,
    }).from(backupRuns).orderBy(desc(backupRuns.startedAt)).limit(30);
    return createSuccessEnvelope({ items: rows }, request.id);
  });
  app.get('/settings/storage', { preHandler: requireAuth }, async (request) => {
    const rows = await request.db.select({ bytes: mediaFiles.sizeBytes }).from(mediaFiles).where(and(eq(mediaFiles.ownerUserId, request.auth.userId!), isNull(mediaFiles.deletedAt)));
    return createSuccessEnvelope({ mediaBytes: rows.reduce((total, row) => total + (row.bytes ?? 0), 0), mediaCount: rows.length }, request.id);
  });
  app.get('/settings/about', { preHandler: requireAuth }, async (request) => createSuccessEnvelope({ name: '润芽 · RUNEW', version: '0.1.0', apiVersion: 'v1' }, request.id));

  // Global search. familyId is optional for global knowledge documents.
  app.get('/search', { preHandler: requireAuth }, async (request) => {
    const query = queryString(request, 'q')?.trim() ?? '';
    if (!query || query.length > 100) throw new AppError('SEARCH_QUERY_INVALID', '请输入想找的内容', 400);
    const familyId = queryString(request, 'familyId') ?? await getActiveFamilyId(request.db, request.auth.userId!);
    await requireFamilyMembership(request.db, request.auth.userId!, familyId);
    const rawLimit = Number(queryString(request, 'limit') ?? 30);
    const result = await searchDocumentsForUser(request.db, request.auth.userId!, query, familyId, Number.isFinite(rawLimit) ? rawLimit : 30);
    return createSuccessEnvelope(result, request.id);
  });

  // Unified recently deleted view and server-side permission recheck on restore.
  app.get('/trash', { preHandler: requireAuth }, async (request) => createSuccessEnvelope({ items: await listTrash(request.db, request.auth.userId!, await familyForRequest(request)), retentionDays: 30 }, request.id));
  app.post('/trash/:entityType/:id/restore', { preHandler: requireAuth }, async (request) => {
    const { entityType, id } = request.params as { entityType: string; id: string };
    const familyId = await familyForRequest(request);
    const restored = await restoreTrashItem(request.db, request.auth.userId!, familyId, entityType, id, request.auth.deviceId);
    app.realtimeHub.broadcast({ type: 'sync_hint', familyId });
    return createSuccessEnvelope(restored, request.id);
  });

  // Export jobs are private resources; GET/download always re-check the owner and expiry.
  app.post('/exports', { preHandler: requireAuth }, async (request, reply) => {
    requireIdempotencyKey(request);
    const body = createExportBodySchema.parse(request.body);
    const result = await withIdempotency(app, request, reply, {
      endpoint: 'exports',
      userId: request.auth.userId!,
      payload: body,
      revalidate: async () => {
        await requireFamilyMembership(request.db, request.auth.userId!, body.familyId);
        if (body.babyId) await requireBabyInFamily(request.db, request.auth.userId!, body.babyId);
      },
      handler: async () => ({ statusCode: 202, body: createSuccessEnvelope(toPublicExportJob(await createExportJob(request.db, request.auth.userId!, body)), request.id) }),
    });
    const jobId = (result as { data?: { id?: string } } | undefined)?.data?.id;
    if (jobId) {
      setTimeout(() => {
        void processExportJob(request.db, jobId, app.config.BACKUP_ROOT).catch(() => undefined);
      }, 0);
    }
    return result;
  });
  app.get('/exports', { preHandler: requireAuth }, async (request) => {
    const familyId = await familyForRequest(request);
    const rows = await listExportJobs(request.db, request.auth.userId!, familyId);
    return createSuccessEnvelope({ items: rows.map(toPublicExportJob) }, request.id);
  });
  app.get('/exports/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const initial = await getExportJob(request.db, request.auth.userId!, id);
    const processed = initial.state === 'QUEUED' ? await processExportJob(request.db, id, app.config.BACKUP_ROOT) : initial;
    if (!processed) throw new AppError('NOT_FOUND', '导出任务不存在', 404);
    const row = processed;
    return createSuccessEnvelope(toPublicExportJob(row), request.id);
  });
  app.get('/exports/:id/download', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // A download can be the first read after queueing. Claim a queued job here
    // so callers do not have to race the background tick or poll a detail URL.
    const initial = await getExportJob(request.db, request.auth.userId!, id);
    if (initial.state === 'QUEUED') await processExportJob(request.db, id, app.config.BACKUP_ROOT);
    const { row, content } = await readExportFile(request.db, request.auth.userId!, id);
    const extension = row.type === 'CSV' ? 'csv' : row.type === 'PHOTO_AUDIO_ARCHIVE' ? 'zip' : 'json';
    reply.header('Content-Disposition', `attachment; filename="runew-${row.type.toLowerCase()}-${row.id}.${extension}"`);
    reply.type(row.type === 'CSV' ? 'text/csv; charset=utf-8' : row.type === 'PHOTO_AUDIO_ARCHIVE' ? 'application/zip' : 'application/json; charset=utf-8');
    return reply.send(content);
  });

  app.post('/realtime/ticket', { preHandler: requireAuth }, async (request) => {
    const body = z.object({ familyId: z.string().nullable().optional() }).parse(request.body ?? {});
    return createSuccessEnvelope(await issueRealtimeTicket(request.db, request.auth.userId!, request.auth.sessionId!, body.familyId ?? null, request.auth.deviceId), request.id);
  });
}
