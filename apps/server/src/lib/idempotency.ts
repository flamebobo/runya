import { idempotencyKeys } from '@runew/db';
import { createUlid, normalizeIdempotencyKey, utcNowMs } from '@runew/shared-utils';
import { and, eq, lte } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';
import { stableRequestHash } from './crypto.js';
import { IDEMPOTENCY_TTL_MS } from './auth-constants.js';

interface IdempotencyOptions<T> {
  endpoint: string;
  userId: string | null;
  payload: unknown;
  /** Re-check resource authorization before returning a cached response. */
  revalidate?: () => Promise<void>;
  handler: () => Promise<{ statusCode: number; body: T }>;
}

type IdempotencyResult = { statusCode: number; body: unknown };
type InFlightEntry = {
  requestHash: string;
  userId: string | null;
  endpoint: string;
  promise: Promise<IdempotencyResult>;
};

// SQLite gives us durable replay records, while this small process-local map
// closes the SELECT -> handler -> INSERT race for concurrent requests handled
// by the same API process. The entry is removed in finally below, including
// when the handler fails.
const inFlight = new Map<string, InFlightEntry>();

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
  // The database key is global, so the process-local mutex must also be
  // global. Scoping this lock by actor/endpoint would let two different
  // handlers execute side effects concurrently before one loses the INSERT.
  const lockKey = key;
  const pending = inFlight.get(lockKey);
  if (pending) {
    if (
      pending.requestHash !== requestHash ||
      pending.userId !== options.userId ||
      pending.endpoint !== options.endpoint
    ) {
      throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键已被不同请求使用', 409);
    }
    await options.revalidate?.();
    const result = await pending.promise;
    reply.status(result.statusCode);
    return result.body as T;
  }

  // Start the lookup in a microtask after publishing the entry. This closes
  // the initial SELECT -> handler gap as well as the handler -> INSERT gap.
  const execute = async (): Promise<IdempotencyResult> => {
    const existing = await app.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);

    const now = utcNowMs();
    const row = existing[0];
    if (row) {
      // Keys are globally unique for storage, so a replay must still belong to
      // the same authenticated actor and route. Never return another scope's
      // cached response (which may contain a private resource identifier).
      if (row.userId !== options.userId || row.endpoint !== options.endpoint) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键已被不同请求使用', 409);
      }
      if (row.expiresAt > now) {
        await options.revalidate?.();
        if (row.requestHash !== requestHash) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键已被不同请求使用', 409);
        }
        return { statusCode: row.responseStatus, body: JSON.parse(row.responseJson) as T };
      }
      await app.db
        .delete(idempotencyKeys)
        .where(and(eq(idempotencyKeys.key, key), lte(idempotencyKeys.expiresAt, now)));
    }

    const result = await options.handler();
    try {
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
    } catch (error) {
      // Another process may have won the durable insert. Return its cached
      // response when the scope and payload agree; never expose another
      // actor's response through a reused global key.
      const winner = await app.db
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, key))
        .limit(1);
      const winnerRow = winner[0];
      if (!winnerRow) {
        throw error;
      }
      if (
        winnerRow.userId !== options.userId ||
        winnerRow.endpoint !== options.endpoint ||
        winnerRow.requestHash !== requestHash
      ) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', '幂等键已被不同请求使用', 409);
      }
      return { statusCode: winnerRow.responseStatus, body: JSON.parse(winnerRow.responseJson) as T };
    }
    return result;
  };
  const promise = Promise.resolve().then(execute);
  inFlight.set(lockKey, {
    requestHash,
    userId: options.userId,
    endpoint: options.endpoint,
    promise,
  });
  try {
    const result = await promise;
    reply.status(result.statusCode);
    return result.body as T;
  } finally {
    if (inFlight.get(lockKey)?.promise === promise) inFlight.delete(lockKey);
  }
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
