import { createSuccessEnvelope } from '@runew/contracts';
import {
  createBottleBodySchema,
  createDiaperBodySchema,
  createFoodBodySchema,
  createSleepBodySchema,
  finishSleepBodySchema,
  recordStatsQuerySchema,
  startBreastBodySchema,
  startSleepBodySchema,
  switchBreastBodySchema,
  timelineQuerySchema,
  updateDiaperBodySchema,
  updateFeedingBodySchema,
  updateFoodBodySchema,
  updateSleepBodySchema,
} from '@runew/contracts';
import { buildEtag, parseIfMatch } from '@runew/shared-utils';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withIdempotency, requireIdempotencyKey } from '../../lib/idempotency.js';
import { requireAuth } from '../../plugins/auth.js';
import {
  createBottleFeeding,
  createDiaper,
  createFood,
  createSleep,
  deleteDiaper,
  deleteFeeding,
  deleteFood,
  deleteSleep,
  finishBreast,
  finishSleep,
  getDiaper,
  getFeeding,
  getFood,
  getRecordStats,
  getSleep,
  listTimeline,
  pauseBreast,
  resumeBreast,
  startBreastFeeding,
  startSleep,
  switchBreast,
  updateDiaper,
  updateFeeding,
  updateFood,
  updateSleep,
} from './service.js';

function ifMatchVersion(request: FastifyRequest) {
  const header = request.headers['if-match'];
  return parseIfMatch(typeof header === 'string' ? header : undefined);
}

function etagReply(reply: FastifyReply, version: number) {
  reply.header('ETag', buildEtag(version));
}

export async function recordsRoutes(app: FastifyInstance) {
  app.get('/babies/:babyId/records', { preHandler: requireAuth }, async (request) => {
    const { babyId } = request.params as { babyId: string };
    const query = timelineQuerySchema.parse(request.query);
    const timeline = await listTimeline(app.db, request.auth.userId!, babyId, query);
    return createSuccessEnvelope(timeline, request.requestId);
  });

  app.get('/babies/:babyId/records/stats', { preHandler: requireAuth }, async (request) => {
    const { babyId } = request.params as { babyId: string };
    const query = recordStatsQuerySchema.parse(request.query);
    const stats = await getRecordStats(app.db, request.auth.userId!, babyId, query);
    return createSuccessEnvelope(stats, request.requestId);
  });

  app.post('/babies/:babyId/feeding', { preHandler: requireAuth }, async (request, reply) => {
    requireIdempotencyKey(request);
    const { babyId } = request.params as { babyId: string };
    const body = createBottleBodySchema.parse(request.body);
    return withIdempotency(app, request, reply, {
      endpoint: `babies/${babyId}/feeding`,
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await createBottleFeeding(app.db, request.auth.userId!, babyId, body);
        etagReply(reply, created.version);
        return { statusCode: 201, body: createSuccessEnvelope(created, request.requestId) };
      },
    });
  });

  app.post(
    '/babies/:babyId/feeding/breast/start',
    { preHandler: requireAuth },
    async (request, reply) => {
      requireIdempotencyKey(request);
      const { babyId } = request.params as { babyId: string };
      const body = startBreastBodySchema.parse(request.body ?? {});
      return withIdempotency(app, request, reply, {
        endpoint: `babies/${babyId}/feeding/breast/start`,
        userId: request.auth.userId!,
        payload: body,
        handler: async () => {
          const created = await startBreastFeeding(app.db, request.auth.userId!, babyId, body);
          etagReply(reply, created.version);
          return { statusCode: 201, body: createSuccessEnvelope(created, request.requestId) };
        },
      });
    },
  );

  app.get('/feeding/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const feeding = await getFeeding(app.db, request.auth.userId!, id);
    etagReply(reply, feeding.version);
    return createSuccessEnvelope(feeding, request.requestId);
  });

  app.patch('/feeding/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateFeedingBodySchema.parse(request.body);
    const updated = await updateFeeding(
      app.db,
      request.auth.userId!,
      id,
      body,
      ifMatchVersion(request),
    );
    etagReply(reply, updated.version);
    return createSuccessEnvelope(updated, request.requestId);
  });

  app.delete('/feeding/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await deleteFeeding(app.db, request.auth.userId!, id);
    return createSuccessEnvelope(result, request.requestId);
  });

  app.post('/feeding/:id/breast/switch', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const body = switchBreastBodySchema.parse(request.body ?? {});
    const feeding = await switchBreast(app.db, request.auth.userId!, id, body);
    return createSuccessEnvelope(feeding, request.requestId);
  });

  app.post('/feeding/:id/breast/pause', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const feeding = await pauseBreast(app.db, request.auth.userId!, id);
    return createSuccessEnvelope(feeding, request.requestId);
  });

  app.post('/feeding/:id/breast/resume', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const feeding = await resumeBreast(app.db, request.auth.userId!, id);
    return createSuccessEnvelope(feeding, request.requestId);
  });

  app.post('/feeding/:id/breast/finish', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const feeding = await finishBreast(app.db, request.auth.userId!, id);
    return createSuccessEnvelope(feeding, request.requestId);
  });

  app.post('/babies/:babyId/sleep/start', { preHandler: requireAuth }, async (request, reply) => {
    requireIdempotencyKey(request);
    const { babyId } = request.params as { babyId: string };
    const body = startSleepBodySchema.parse(request.body ?? {});
    return withIdempotency(app, request, reply, {
      endpoint: `babies/${babyId}/sleep/start`,
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await startSleep(app.db, request.auth.userId!, babyId, body);
        etagReply(reply, created.version);
        return { statusCode: 201, body: createSuccessEnvelope(created, request.requestId) };
      },
    });
  });

  app.post('/babies/:babyId/sleep', { preHandler: requireAuth }, async (request, reply) => {
    requireIdempotencyKey(request);
    const { babyId } = request.params as { babyId: string };
    const body = createSleepBodySchema.parse(request.body);
    return withIdempotency(app, request, reply, {
      endpoint: `babies/${babyId}/sleep`,
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await createSleep(app.db, request.auth.userId!, babyId, body);
        etagReply(reply, created.version);
        return { statusCode: 201, body: createSuccessEnvelope(created, request.requestId) };
      },
    });
  });

  app.post('/sleep/:id/finish', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const body = finishSleepBodySchema.parse(request.body ?? {});
    const sleep = await finishSleep(app.db, request.auth.userId!, id, body);
    return createSuccessEnvelope(sleep, request.requestId);
  });

  app.get('/sleep/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sleep = await getSleep(app.db, request.auth.userId!, id);
    etagReply(reply, sleep.version);
    return createSuccessEnvelope(sleep, request.requestId);
  });

  app.patch('/sleep/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateSleepBodySchema.parse(request.body);
    const updated = await updateSleep(
      app.db,
      request.auth.userId!,
      id,
      body,
      ifMatchVersion(request),
    );
    etagReply(reply, updated.version);
    return createSuccessEnvelope(updated, request.requestId);
  });

  app.delete('/sleep/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await deleteSleep(app.db, request.auth.userId!, id),
      request.requestId,
    );
  });

  app.post('/babies/:babyId/diapers', { preHandler: requireAuth }, async (request, reply) => {
    requireIdempotencyKey(request);
    const { babyId } = request.params as { babyId: string };
    const body = createDiaperBodySchema.parse(request.body);
    return withIdempotency(app, request, reply, {
      endpoint: `babies/${babyId}/diapers`,
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await createDiaper(app.db, request.auth.userId!, babyId, body);
        etagReply(reply, created.version);
        return { statusCode: 201, body: createSuccessEnvelope(created, request.requestId) };
      },
    });
  });

  app.get('/diapers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const diaper = await getDiaper(app.db, request.auth.userId!, id);
    etagReply(reply, diaper.version);
    return createSuccessEnvelope(diaper, request.requestId);
  });

  app.patch('/diapers/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateDiaperBodySchema.parse(request.body);
    const updated = await updateDiaper(
      app.db,
      request.auth.userId!,
      id,
      body,
      ifMatchVersion(request),
    );
    etagReply(reply, updated.version);
    return createSuccessEnvelope(updated, request.requestId);
  });

  app.delete('/diapers/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await deleteDiaper(app.db, request.auth.userId!, id),
      request.requestId,
    );
  });

  app.post('/babies/:babyId/foods', { preHandler: requireAuth }, async (request, reply) => {
    requireIdempotencyKey(request);
    const { babyId } = request.params as { babyId: string };
    const body = createFoodBodySchema.parse(request.body);
    return withIdempotency(app, request, reply, {
      endpoint: `babies/${babyId}/foods`,
      userId: request.auth.userId!,
      payload: body,
      handler: async () => {
        const created = await createFood(app.db, request.auth.userId!, babyId, body);
        etagReply(reply, created.version);
        return { statusCode: 201, body: createSuccessEnvelope(created, request.requestId) };
      },
    });
  });

  app.get('/foods/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const food = await getFood(app.db, request.auth.userId!, id);
    etagReply(reply, food.version);
    return createSuccessEnvelope(food, request.requestId);
  });

  app.patch('/foods/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateFoodBodySchema.parse(request.body);
    const updated = await updateFood(
      app.db,
      request.auth.userId!,
      id,
      body,
      ifMatchVersion(request),
    );
    etagReply(reply, updated.version);
    return createSuccessEnvelope(updated, request.requestId);
  });

  app.delete('/foods/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await deleteFood(app.db, request.auth.userId!, id),
      request.requestId,
    );
  });
}
