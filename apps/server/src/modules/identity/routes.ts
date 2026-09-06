import { createSuccessEnvelope } from '@runew/contracts';
import {
  acceptFamilyInviteBodySchema,
  createBabyBodySchema,
  createFamilyBodySchema,
  createFamilyInviteBodySchema,
  loginBodySchema,
  onboardingCompleteBodySchema,
  registerBodySchema,
  updateBabyBodySchema,
} from '@runew/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseIfMatch } from '@runew/shared-utils';
import { AppError } from '../../lib/errors.js';
import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  getClientPlatform,
  isStateChangingMethod,
} from '../../lib/auth-constants.js';
import { withIdempotency } from '../../lib/idempotency.js';
import { requireAuth } from '../../plugins/auth.js';
import { getRunningForBaby } from '../records/service.js';
import {
  acceptFamilyInvite,
  addBaby,
  buildBootstrap,
  completeOnboarding,
  createFamily,
  createFamilyInvite,
  listBabiesForFamily,
  listFamiliesForUser,
  loginUser,
  logoutSession,
  mapBaby,
  mapFamily,
  mapMember,
  mapUser,
  registerUser,
  requireBabyInFamily,
  requireFamilyPermission,
  requireFamilyMembership,
  updateBaby,
} from './service.js';
import { familyInvites, families, familyMembers, idempotencyKeys, users } from '@runew/db';
import { and, eq } from 'drizzle-orm';
import { generateIdempotentInviteToken, hashInviteToken, stableRequestHash } from '../../lib/crypto.js';
import { IDEMPOTENCY_TTL_MS } from '../../lib/auth-constants.js';
import { normalizeIdempotencyKey, utcNowMs } from '@runew/shared-utils';

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: number) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

function setCsrfCookie(reply: FastifyReply) {
  const csrf = crypto.randomUUID();
  reply.setCookie(CSRF_COOKIE_NAME, csrf, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return csrf;
}

function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  reply.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
}

function attachSessionToReply(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string,
  expiresAt: number,
) {
  if (getClientPlatform(request) === 'H5') {
    setSessionCookie(reply, token, expiresAt);
    setCsrfCookie(reply);
    return undefined;
  }
  return token;
}

function requestMetadata(request: FastifyRequest) {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    deviceName: String(request.headers['x-device-name'] ?? ''),
    appVersion: String(request.headers['x-client-version'] ?? ''),
  };
}

async function createInviteWithIdempotency(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  familyId: string,
  body: { relationshipHint?: string; expiresInHours?: number },
) {
  const userId = request.auth.userId!;
  await requireFamilyPermission(app.db, userId, familyId, 'family', 'MANAGE');
  const rawKey = request.headers['idempotency-key'];
  const key = normalizeIdempotencyKey(Array.isArray(rawKey) ? rawKey[0] : rawKey);
  if (!key) {
    const result = await createFamilyInvite(
      app.db,
      userId,
      familyId,
      body.relationshipHint,
      body.expiresInHours,
    );
    reply.status(201);
    return createSuccessEnvelope(result, request.requestId);
  }

  // Re-check membership before reading a replay so disabling a member revokes access immediately.
  await requireFamilyMembership(app.db, userId, familyId);
  const requestHash = stableRequestHash({ familyId, ...body });
  const scopedKey = `family-invite:${userId}:${familyId}:${key}`;
  const token = generateIdempotentInviteToken(app.config.SESSION_SECRET, `${scopedKey}:${requestHash}`);
  const existing = await app.db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, scopedKey))
    .limit(1);
  const cached = existing[0];
  if (cached) {
    if (cached.endpoint !== `families/${familyId}/invites` || cached.userId !== userId || cached.requestHash !== requestHash) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键已被不同请求使用', 409);
    }
    const cachedData = JSON.parse(cached.responseJson).data as { id: string; familyId: string; expiresAt: number };
    const invite = await app.db
      .select()
      .from(familyInvites)
      .where(and(eq(familyInvites.id, cachedData.id), eq(familyInvites.familyId, familyId)))
      .limit(1);
    if (!invite[0]) throw new AppError('NOT_FOUND', '邀请不存在', 404);
    reply.status(cached.responseStatus);
    return createSuccessEnvelope({ ...cachedData, token }, request.requestId);
  }

  let created: Awaited<ReturnType<typeof createFamilyInvite>>;
  try {
    created = await createFamilyInvite(
      app.db,
      userId,
      familyId,
      body.relationshipHint,
      body.expiresInHours,
      token,
    );
  } catch (error) {
    // Concurrent retries share the deterministic token; the loser reads the winner's invite.
    const invite = await app.db
      .select()
      .from(familyInvites)
      .where(eq(familyInvites.tokenHash, hashInviteToken(token)))
      .limit(1);
    if (!invite[0]) throw error;
    created = {
      id: invite[0].id,
      familyId: invite[0].familyId,
      token,
      expiresAt: invite[0].expiresAt,
    };
  }

  const response = createSuccessEnvelope(
    { id: created.id, familyId: created.familyId, expiresAt: created.expiresAt },
    request.requestId,
  );
  try {
    await app.db.insert(idempotencyKeys).values({
      key: scopedKey,
      userId,
      endpoint: `families/${familyId}/invites`,
      requestHash,
      responseStatus: 201,
      responseJson: JSON.stringify(response),
      createdAt: utcNowMs(),
      expiresAt: utcNowMs() + IDEMPOTENCY_TTL_MS,
    });
  } catch (error) {
    const winner = await app.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, scopedKey))
      .limit(1);
    if (!winner[0]) throw error;
  }
  reply.status(201);
  return createSuccessEnvelope(created, request.requestId);
}

export async function identityRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (request, reply) => {
    const body = registerBodySchema.parse(request.body);
    const platform = getClientPlatform(request);

    const result = await withIdempotency(app, request, reply, {
      endpoint: 'auth/register',
      userId: null,
      payload: body,
      handler: async () => {
        const auth = await registerUser(app.db, body, platform, requestMetadata(request));
        const token = attachSessionToReply(request, reply, auth.session.token, auth.session.expiresAt);
        return {
          statusCode: 201,
          body: createSuccessEnvelope(
            {
              user: auth.user,
              session: {
                sessionId: auth.session.sessionId,
                expiresAt: auth.session.expiresAt,
                platform: auth.session.platform,
                token,
              },
            },
            request.requestId,
          ),
        };
      },
    });

    return result;
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const platform = getClientPlatform(request);
    const auth = await loginUser(app.db, body, platform, requestMetadata(request));
    const token = attachSessionToReply(request, reply, auth.session.token, auth.session.expiresAt);

    return createSuccessEnvelope(
      {
        user: auth.user,
        session: {
          sessionId: auth.session.sessionId,
          expiresAt: auth.session.expiresAt,
          platform: auth.session.platform,
          token,
        },
      },
      request.requestId,
    );
  });

  app.post('/auth/logout', { preHandler: requireAuth }, async (request, reply) => {
    await logoutSession(app.db, request.auth.sessionId!);
    app.realtimeHub.revokeSession(request.auth.sessionId!, 'logout');
    clearSessionCookies(reply);
    return createSuccessEnvelope({ ok: true }, request.requestId);
  });

  app.get('/auth/me', { preHandler: requireAuth }, async (request) => {
    const user = await app.db
      .select()
      .from(users)
      .where(eq(users.id, request.auth.userId!))
      .limit(1);
    if (!user[0]) {
      throw new AppError('NOT_FOUND', '用户不存在', 404);
    }
    return createSuccessEnvelope({ user: mapUser(user[0]) }, request.requestId);
  });

  app.get('/bootstrap', { preHandler: requireAuth }, async (request) => {
    const bootstrap = await buildBootstrap(
      app.db,
      request.auth.userId!,
      request.auth.deviceId,
    );
    if (bootstrap.currentBaby) {
      bootstrap.running = await getRunningForBaby(app.db, bootstrap.currentBaby.id);
    }
    return createSuccessEnvelope(bootstrap, request.requestId);
  });

  app.post('/onboarding/complete', { preHandler: requireAuth }, async (request, reply) => {
    const body = onboardingCompleteBodySchema.parse(request.body);
    const result = await withIdempotency(app, request, reply, {
      endpoint: 'onboarding/complete',
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const completed = await completeOnboarding(
          app.db,
          request.auth.userId!,
          body,
          request.auth.deviceId,
        );
        return {
          statusCode: 200,
          body: createSuccessEnvelope(completed, request.requestId),
        };
      },
    });
    return result;
  });

  app.get('/families', { preHandler: requireAuth }, async (request) => {
    const items = await listFamiliesForUser(app.db, request.auth.userId!);
    return createSuccessEnvelope(
      { items: items.map((item) => item.family) },
      request.requestId,
    );
  });

  app.post('/families', { preHandler: requireAuth }, async (request, reply) => {
    const body = createFamilyBodySchema.parse(request.body);
    const family = await withIdempotency(app, request, reply, {
      endpoint: 'families/create',
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await createFamily(app.db, request.auth.userId!, body);
        return {
          statusCode: 201,
          body: createSuccessEnvelope(created, request.requestId),
        };
      },
    });
    return family;
  });

  app.get('/families/:familyId', { preHandler: requireAuth }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    await requireFamilyPermission(app.db, request.auth.userId!, familyId, 'family', 'VIEW');
    const rows = await app.db.select().from(families).where(eq(families.id, familyId)).limit(1);
    if (!rows[0]) {
      throw new AppError('NOT_FOUND', '家庭不存在', 404);
    }
    return createSuccessEnvelope(mapFamily(rows[0]), request.requestId);
  });

  app.get('/families/:familyId/members', { preHandler: requireAuth }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    await requireFamilyPermission(app.db, request.auth.userId!, familyId, 'family', 'VIEW');
    const rows = await app.db
      .select({ member: familyMembers, user: users })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyMembers.familyId, familyId));
    return createSuccessEnvelope(
      {
        items: rows.map((row) => mapMember(row.member, row.user.nickname)),
      },
      request.requestId,
    );
  });

  app.post('/families/:familyId/invites', { preHandler: requireAuth }, async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const body = createFamilyInviteBodySchema.parse(request.body);
    return createInviteWithIdempotency(app, request, reply, familyId, body);
  });

  app.post('/family-invites/:token/accept', { preHandler: requireAuth }, async (request) => {
    const { token } = request.params as { token: string };
    const body = acceptFamilyInviteBodySchema.parse(request.body);
    const family = await acceptFamilyInvite(
      app.db,
      request.auth.userId!,
      token,
      body.relationship,
    );
    return createSuccessEnvelope(family, request.requestId);
  });

  app.get('/families/:familyId/babies', { preHandler: requireAuth }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    await requireFamilyPermission(app.db, request.auth.userId!, familyId, 'baby', 'VIEW');
    const items = await listBabiesForFamily(app.db, familyId);
    return createSuccessEnvelope({ items }, request.requestId);
  });

  app.post('/families/:familyId/babies', { preHandler: requireAuth }, async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const body = createBabyBodySchema.parse(request.body);
    await requireFamilyPermission(app.db, request.auth.userId!, familyId, 'baby', 'CREATE');
    const baby = await withIdempotency(app, request, reply, {
      endpoint: `families/${familyId}/babies`,
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await addBaby(app.db, request.auth.userId!, familyId, body);
        return {
          statusCode: 201,
          body: createSuccessEnvelope(created, request.requestId),
        };
      },
    });
    return baby;
  });

  app.get('/babies/:babyId', { preHandler: requireAuth }, async (request) => {
    const { babyId } = request.params as { babyId: string };
    const baby = await requireBabyInFamily(app.db, request.auth.userId!, babyId);
    return createSuccessEnvelope(mapBaby(baby), request.requestId);
  });

  app.patch('/babies/:babyId', { preHandler: requireAuth }, async (request, reply) => {
    const { babyId } = request.params as { babyId: string };
    const body = updateBabyBodySchema.parse(request.body);
    const updated = await updateBaby(
      app.db,
      request.auth.userId!,
      babyId,
      body,
      parseIfMatch(request.headers['if-match']),
    );
    reply.header('ETag', `"v${updated.version}"`);
    return createSuccessEnvelope(updated, request.requestId);
  });

  app.delete('/babies/:babyId', { preHandler: requireAuth }, async () => {
    // Baby deletion is a destructive, high-value operation. It is exposed
    // through the Admin security domain so a family member cannot bypass
    // re-authentication and the immutable audit trail.
    throw new AppError('ADMIN_REAUTH_REQUIRED', '删除宝宝档案需要管理员确认', 403);
  });

  app.addHook('preHandler', async (request) => {
    const url = request.url.split('?')[0] ?? '';
    if (!url.startsWith('/api/v1')) return;
    if (!isStateChangingMethod(request.method)) return;
    if (getClientPlatform(request) !== 'H5') return;
    if (url.endsWith('/auth/login') || url.endsWith('/auth/register')) {
      return;
    }
    const csrfHeader = request.headers['x-csrf-token'];
    const csrfCookie = request.cookies?.[CSRF_COOKIE_NAME];
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new AppError('CSRF_INVALID', '请求校验失败，请刷新后重试', 403);
    }
  });
}
