import type { Platform } from '@runew/domain-types';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import {
  SESSION_COOKIE_NAME,
  getClientPlatform,
  parseBearerToken,
} from '../lib/auth-constants.js';
import { resolveSession } from '../modules/identity/service.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      userId: string | null;
      sessionId: string | null;
      platform: Platform | null;
      deviceId: string | null;
    };
  }
}

function extractSessionToken(request: FastifyRequest): string | null {
  const platform = getClientPlatform(request);
  if (platform === 'WEAPP') {
    return parseBearerToken(request.headers.authorization);
  }
  return request.cookies?.[SESSION_COOKIE_NAME] ?? null;
}

export async function attachAuthContext(request: FastifyRequest) {
  const token = extractSessionToken(request);
  if (!token) {
    request.auth = {
      userId: null,
      sessionId: null,
      platform: getClientPlatform(request),
      deviceId: null,
    };
    return;
  }

  try {
    const session = await resolveSession(request.db ?? request.server.db, token);
    request.auth = {
      userId: session.userId,
      sessionId: session.sessionId,
      platform: session.platform,
      deviceId: session.deviceId,
    };
  } catch {
    request.auth = {
      userId: null,
      sessionId: null,
      platform: getClientPlatform(request),
      deviceId: null,
    };
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const token = extractSessionToken(request);
  if (!token) {
    throw new AppError('AUTH_REQUIRED', '请先登录', 401);
  }

  const session = await resolveSession(request.db ?? request.server.db, token);
  request.auth = {
    userId: session.userId,
    sessionId: session.sessionId,
    platform: session.platform,
    deviceId: session.deviceId,
  };
}

export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply) {
  await attachAuthContext(request);
}
