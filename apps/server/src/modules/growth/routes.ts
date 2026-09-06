import {
  createGrowthBodySchema,
  createMilestoneBodySchema,
  createSuccessEnvelope,
  monthQuerySchema,
  updateGrowthBodySchema,
  updateMilestoneBodySchema,
} from '@runew/contracts';
import { buildEtag, parseIfMatch } from '@runew/shared-utils';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireIdempotencyKey, withIdempotency } from '../../lib/idempotency.js';
import { requireAuth } from '../../plugins/auth.js';
import {
  createGrowth,
  createMilestone,
  deleteGrowth,
  deleteMilestone,
  getGrowth,
  getMilestone,
  getMonthlyStory,
  listGrowth,
  listMilestones,
  restoreGrowth,
  restoreMilestone,
  updateGrowth,
  updateMilestone,
} from './service.js';

function ifMatchVersion(request: FastifyRequest) {
  const header = request.headers['if-match'];
  return parseIfMatch(typeof header === 'string' ? header : undefined);
}

function etagReply(reply: FastifyReply, version: number) {
  reply.header('ETag', buildEtag(version));
}

function growthTransaction<T>(
  app: FastifyInstance,
  operation: (db: typeof app.db) => Promise<T>,
) {
  return app.db.transaction((tx) => operation(tx as unknown as typeof app.db));
}

export async function growthRoutes(app: FastifyInstance) {
  app.get('/babies/:babyId/growth', { preHandler: requireAuth }, async (request) => {
    const { babyId } = request.params as { babyId: string };
    return createSuccessEnvelope(
      await listGrowth(app.db, request.auth.userId!, babyId),
      request.requestId,
    );
  });

  app.post(
    '/babies/:babyId/growth',
    { preHandler: requireAuth },
    async (request, reply) => {
      requireIdempotencyKey(request);
      const { babyId } = request.params as { babyId: string };
      const body = createGrowthBodySchema.parse(request.body);
      return withIdempotency(app, request, reply, {
        endpoint: `babies/${babyId}/growth`,
        userId: request.auth.userId!,
        payload: body,
        handler: async () => {
          const created = await growthTransaction(app, (db) =>
            createGrowth(db, request.auth.userId!, babyId, body),
          );
          etagReply(reply, created.version);
          return {
            statusCode: 201,
            body: createSuccessEnvelope(created, request.requestId),
          };
        },
      });
    },
  );

  app.get('/growth/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getGrowth(app.db, request.auth.userId!, id);
    etagReply(reply, item.version);
    return createSuccessEnvelope(item, request.requestId);
  });

  app.patch('/growth/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateGrowthBodySchema.parse(request.body);
    const item = await growthTransaction(app, (db) =>
      updateGrowth(db, request.auth.userId!, id, body, ifMatchVersion(request)),
    );
    etagReply(reply, item.version);
    return createSuccessEnvelope(item, request.requestId);
  });

  app.delete('/growth/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await growthTransaction(app, (db) => deleteGrowth(db, request.auth.userId!, id)),
      request.requestId,
    );
  });

  app.post(
    '/growth/:id/restore',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = await growthTransaction(app, (db) =>
        restoreGrowth(db, request.auth.userId!, id, request.auth.deviceId),
      );
      etagReply(reply, item.version);
      return createSuccessEnvelope(item, request.requestId);
    },
  );

  app.get(
    '/babies/:babyId/milestones',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId } = request.params as { babyId: string };
      return createSuccessEnvelope(
        await listMilestones(app.db, request.auth.userId!, babyId),
        request.requestId,
      );
    },
  );

  app.post(
    '/babies/:babyId/milestones',
    { preHandler: requireAuth },
    async (request, reply) => {
      requireIdempotencyKey(request);
      const { babyId } = request.params as { babyId: string };
      const body = createMilestoneBodySchema.parse(request.body);
      return withIdempotency(app, request, reply, {
        endpoint: `babies/${babyId}/milestones`,
        userId: request.auth.userId!,
        payload: body,
        handler: async () => {
          const created = await growthTransaction(app, (db) =>
            createMilestone(db, request.auth.userId!, babyId, body),
          );
          etagReply(reply, created.version);
          return {
            statusCode: 201,
            body: createSuccessEnvelope(created, request.requestId),
          };
        },
      });
    },
  );

  app.get('/milestones/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getMilestone(app.db, request.auth.userId!, id);
    etagReply(reply, item.version);
    return createSuccessEnvelope(item, request.requestId);
  });

  app.patch('/milestones/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateMilestoneBodySchema.parse(request.body);
    const item = await growthTransaction(app, (db) =>
      updateMilestone(db, request.auth.userId!, id, body, ifMatchVersion(request)),
    );
    etagReply(reply, item.version);
    return createSuccessEnvelope(item, request.requestId);
  });

  app.delete('/milestones/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await growthTransaction(app, (db) =>
        deleteMilestone(db, request.auth.userId!, id),
      ),
      request.requestId,
    );
  });

  app.post(
    '/milestones/:id/restore',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = await growthTransaction(app, (db) =>
        restoreMilestone(db, request.auth.userId!, id, request.auth.deviceId),
      );
      etagReply(reply, item.version);
      return createSuccessEnvelope(item, request.requestId);
    },
  );

  app.get(
    '/babies/:babyId/growth/monthly-story',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId } = request.params as { babyId: string };
      const query = monthQuerySchema.parse(request.query);
      return createSuccessEnvelope(
        await getMonthlyStory(app.db, request.auth.userId!, babyId, query),
        request.requestId,
      );
    },
  );
}
