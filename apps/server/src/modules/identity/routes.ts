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
import {
  acceptFamilyInvite,
  buildBootstrap,
  completeOnboarding,
  createBaby,
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
  requireFamilyMembership,
  updateBaby,
} from './service.js';
import { families, familyMembers, users } from '@runew/db';
import { eq } from 'drizzle-orm';

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
    await requireFamilyMembership(app.db, request.auth.userId!, familyId);
    const rows = await app.db.select().from(families).where(eq(families.id, familyId)).limit(1);
    if (!rows[0]) {
      throw new AppError('NOT_FOUND', '家庭不存在', 404);
    }
    return createSuccessEnvelope(mapFamily(rows[0]), request.requestId);
  });

  app.get('/families/:familyId/members', { preHandler: requireAuth }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    await requireFamilyMembership(app.db, request.auth.userId!, familyId);
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

  app.post('/families/:familyId/invites', { preHandler: requireAuth }, async (request) => {
    const { familyId } = request.params as { familyId: string };
    const body = createFamilyInviteBodySchema.parse(request.body);
    const invite = await createFamilyInvite(
      app.db,
      request.auth.userId!,
      familyId,
      body.relationshipHint,
      body.expiresInHours,
    );
    return createSuccessEnvelope(invite, request.requestId);
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
    await requireFamilyMembership(app.db, request.auth.userId!, familyId);
    const items = await listBabiesForFamily(app.db, familyId);
    return createSuccessEnvelope({ items }, request.requestId);
  });

  app.post('/families/:familyId/babies', { preHandler: requireAuth }, async (request, reply) => {
    const { familyId } = request.params as { familyId: string };
    const body = createBabyBodySchema.parse(request.body);
    const baby = await withIdempotency(app, request, reply, {
      endpoint: `families/${familyId}/babies`,
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await createBaby(app.db, request.auth.userId!, familyId, body);
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
