import {
  createSuccessEnvelope,
  syncPullResponseSchema,
  syncPushRequestSchema,
  syncPushResponseSchema,
  syncSnapshotResponseSchema,
} from '@runew/contracts';
import type { RecordPayload } from '@runew/contracts';
import {
  diaperRecords,
  foodRecords,
  systemMetadata,
  SYSTEM_METADATA_KEYS,
} from '@runew/db';
import type { schema } from '@runew/db';
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../lib/errors.js';
import { requireAuth } from '../../plugins/auth.js';
import { requireFamilyMembership } from '../identity/service.js';
import { latestSeq, readSyncLog } from './log.js';
import {
  applyPendingOperation,
  listPendingDuplicates,
  resolveDuplicate,
} from './service.js';
import { duplicateResolveBodySchema, duplicateResolveResponseSchema } from './schemas.js';

type Database = LibSQLDatabase<typeof schema>;

// SQLite 事务里写 sync_operations + 实体；snapshot 阶段无网络调用。
async function readSyncEpoch(db: Database): Promise<number> {
  const rows = await db
    .select()
    .from(systemMetadata)
    .where(eq(systemMetadata.key, SYSTEM_METADATA_KEYS.SYNC_EPOCH))
    .limit(1);
  return Number(rows[0]?.value ?? 1);
}

export async function syncRoutes(app: FastifyInstance) {
  app.post('/sync/push', { preHandler: requireAuth }, async (request) => {
    const body = syncPushRequestSchema.parse(request.body);
    const userId = request.auth.userId!;
    await requireFamilyMembership(app.db, userId, body.familyId);
    if (body.operations.length > 100) {
      throw new AppError('VALIDATION_ERROR', '一次同步的操作有点多，请分批发送', 400);
    }

    const results = [];
    for (const operation of body.operations) {
      if (operation.familyId !== body.familyId) {
        // 拒绝跨家庭混包：整个 batch 一并拒绝，客户端会重试并修正。
        throw new AppError('FAMILY_ACCESS_DENIED', '这份同步里有不属于你家庭的操作', 403);
      }
      results.push(await applyPendingOperation(app.db, userId, operation));
    }

    const serverCursor = await latestSeq(app.db);
    const serverEpoch = await readSyncEpoch(app.db);
    return createSuccessEnvelope(
      syncPushResponseSchema.parse({
        results,
        serverCursor,
        serverEpoch,
      }),
      request.requestId,
    );
  });

  app.get('/sync/pull', { preHandler: requireAuth }, async (request) => {
    const query = request.query as { familyId?: string; cursor?: string; limit?: string };
    const familyId = query.familyId;
    if (!familyId) {
      throw new AppError('VALIDATION_ERROR', '缺少家庭信息', 400);
    }
    await requireFamilyMembership(app.db, request.auth.userId!, familyId);
    const cursor = Number.parseInt(query.cursor ?? '0', 10);
    if (!Number.isFinite(cursor) || cursor < 0) {
      throw new AppError('SYNC_CURSOR_EXPIRED', '同步进度失效，需要重新对齐', 409);
    }
    const limit = Math.min(Math.max(Number.parseInt(query.limit ?? '200', 10) || 200, 1), 500);

    const { changes, nextCursor, hasMore } = await readSyncLog(
      app.db,
      familyId,
      cursor,
      limit,
    );
    const serverEpoch = await readSyncEpoch(app.db);
    return createSuccessEnvelope(
      syncPullResponseSchema.parse({
        changes,
        nextCursor,
        hasMore,
        serverEpoch,
      }),
      request.requestId,
    );
  });

  app.get('/sync/snapshot', { preHandler: requireAuth }, async (request) => {
    const query = request.query as { familyId?: string };
    const familyId = query.familyId;
    if (!familyId) {
      throw new AppError('VALIDATION_ERROR', '缺少家庭信息', 400);
    }
    await requireFamilyMembership(app.db, request.auth.userId!, familyId);

    const entities = [];
    const diaperRows = await app.db
      .select()
      .from(diaperRecords)
      .where(eq(diaperRecords.familyId, familyId));
    for (const row of diaperRows) {
      entities.push({
        entityType: 'DIAPER_RECORD' as const,
        entityId: row.id,
        version: row.version,
        deleted: row.deletedAt != null,
        payload: {
          babyId: row.babyId,
          diaperType: row.diaperType as RecordPayload['diaperType'],
          recordedAt: row.recordedAt,
          timezoneName: row.timezoneName,
          note: row.note,
        },
      });
    }
    const foodRows = await app.db.select().from(foodRecords).where(eq(foodRecords.familyId, familyId));
    for (const row of foodRows) {
      entities.push({
        entityType: 'FOOD_RECORD' as const,
        entityId: row.id,
        version: row.version,
        deleted: row.deletedAt != null,
        payload: {
          babyId: row.babyId,
          foodName: row.foodName,
          amountText: row.amountText,
          recordedAt: row.recordedAt,
          timezoneName: row.timezoneName,
          note: row.note,
        },
      });
    }

    const serverCursor = await latestSeq(app.db);
    const serverEpoch = await readSyncEpoch(app.db);
    return createSuccessEnvelope(
      syncSnapshotResponseSchema.parse({
        serverEpoch,
        serverCursor,
        entities,
      }),
      request.requestId,
    );
  });

  app.get('/sync/duplicates', { preHandler: requireAuth }, async (request) => {
    const query = request.query as { familyId?: string };
    const familyId = query.familyId;
    if (!familyId) {
      throw new AppError('VALIDATION_ERROR', '缺少家庭信息', 400);
    }
    const items = await listPendingDuplicates(app.db, request.auth.userId!, familyId);
    return createSuccessEnvelope({ items }, request.requestId);
  });

  app.post('/sync/duplicates/:id/resolve', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const body = duplicateResolveBodySchema.parse(request.body);
    const query = request.query as { familyId?: string };
    const familyId =
      query.familyId ??
      (
        (request.body as { familyId?: string } | undefined) ??
        {}
      ).familyId;
    if (!familyId) {
      throw new AppError('VALIDATION_ERROR', '缺少家庭信息', 400);
    }
    const result = await resolveDuplicate(app.db, request.auth.userId!, familyId, id, body);
    return createSuccessEnvelope(
      duplicateResolveResponseSchema.parse(result),
      request.requestId,
    );
  });
}
