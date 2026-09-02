import { idempotencyKeys } from '@runew/db';
import { createUlid, normalizeIdempotencyKey, utcNowMs } from '@runew/shared-utils';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';
import { stableRequestHash } from './crypto.js';
import { IDEMPOTENCY_TTL_MS } from './auth-constants.js';

interface IdempotencyOptions<T> {
  endpoint: string;
  userId: string | null;
  payload: unknown;
  handler: () => Promise<{ statusCode: number; body: T }>;
}

export async function withIdempotency<T>(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  options: IdempotencyOptions<T>,
): Promise<T | void> {
  const rawKey = request.headers['idempotency-key'];
  const key = normalizeIdempotencyKey(
    Array.isArray(rawKey) ? rawKey[0] : rawKey,
  );
  if (!key) {
    const result = await options.handler();
    reply.status(result.statusCode);
    return result.body;
  }

  const requestHash = stableRequestHash(options.payload);
  const existing = await app.db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);

  const now = utcNowMs();
  const row = existing[0];
  if (row) {
    if (row.requestHash !== requestHash) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键已被不同请求使用', 409);
    }
    reply.status(row.responseStatus);
    return JSON.parse(row.responseJson) as T;
  }

  const result = await options.handler();
  await app.db.insert(idempotencyKeys).values({
    key,
    userId: options.userId,
    endpoint: options.endpoint,
    requestHash,
    responseStatus: result.statusCode,
    responseJson: JSON.stringify(result.body),
    createdAt: now,
    expiresAt: now + IDEMPOTENCY_TTL_MS,
  });
  reply.status(result.statusCode);
  return result.body;
}

export function requireIdempotencyKey(request: FastifyRequest): string {
  const rawKey = request.headers['idempotency-key'];
  const key = normalizeIdempotencyKey(
    Array.isArray(rawKey) ? rawKey[0] : rawKey,
  );
  if (!key) {
    throw new AppError('VALIDATION_ERROR', '缺少 Idempotency-Key', 400);
  }
  return key;
}

export function createIdempotencyKey(): string {
  return createUlid();
}
