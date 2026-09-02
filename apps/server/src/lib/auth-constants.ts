import type { Platform } from '@runew/domain-types';
import type { FastifyRequest } from 'fastify';

export const SESSION_COOKIE_NAME = 'runew_session';
export const CSRF_COOKIE_NAME = 'runew_csrf';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const IDEMPOTENCY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function getClientPlatform(request: FastifyRequest): Platform {
  const header = request.headers['x-client-platform'];
  if (header === 'WEAPP') return 'WEAPP';
  return 'H5';
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

export function isStateChangingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}
