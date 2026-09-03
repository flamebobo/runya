import {
  createHealthEventBodySchema,
  healthReminderBodySchema,
  createSuccessEnvelope,
  updateHealthEventBodySchema,
} from '@runew/contracts';
import { buildEtag, parseIfMatch, utcNowMs } from '@runew/shared-utils';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireIdempotencyKey, withIdempotency } from '../../lib/idempotency.js';
import { requireAuth } from '../../plugins/auth.js';
import {
  createEvent,
  deleteEvent,
  deleteReminder,
  getEvent,
  listEvents,
  restoreEvent,
  updateEvent,
} from './service.js';

function ifMatchVersion(request: FastifyRequest) {
  const header = request.headers['if-match'];
  return parseIfMatch(typeof header === 'string' ? header : undefined);
}

function etagReply(reply: FastifyReply, version: number) {
  reply.header('ETag', buildEtag(version));
}

export async function healthEventRoutes(app: FastifyInstance) {
  app.get(
    '/babies/:babyId/health/events',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId } = request.params as { babyId: string };
      const result = await listEvents(app.db, request.auth.userId!, babyId);
      return createSuccessEnvelope(result, request.requestId);
    },
  );

  app.post(
    '/babies/:babyId/health/events',
    { preHandler: requireAuth },
    async (request, reply) => {
      requireIdempotencyKey(request);
      const { babyId } = request.params as { babyId: string };
      const body = createHealthEventBodySchema.parse(request.body);
      return withIdempotency(app, request, reply, {
        endpoint: `babies/${babyId}/health/events`,
        userId: request.auth.userId!,
        payload: body,
        handler: async () => {
          const created = await app.db.transaction((tx) =>
            createEvent(tx as unknown as typeof app.db, request.auth.userId!, babyId, body),
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

  app.get('/health/events/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getEvent(app.db, request.auth.userId!, id);
    etagReply(reply, item.version);
    return createSuccessEnvelope(item, request.requestId);
  });

  app.patch('/health/events/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateHealthEventBodySchema.parse(request.body);
    const item = await app.db.transaction((tx) =>
      updateEvent(
        tx as unknown as typeof app.db,
        request.auth.userId!,
        id,
        body,
        ifMatchVersion(request),
      ),
    );
    etagReply(reply, item.version);
    return createSuccessEnvelope(item, request.requestId);
  });

  app.delete('/health/events/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await app.db.transaction((tx) =>
      deleteEvent(tx as unknown as typeof app.db, request.auth.userId!, id),
    );
    return createSuccessEnvelope(result, request.requestId);
  });

  app.post('/health/events/:id/restore', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await app.db.transaction((tx) =>
      restoreEvent(tx as unknown as typeof app.db, request.auth.userId!, id),
    );
    etagReply(reply, item.version);
    return createSuccessEnvelope(item, request.requestId);
  });

  // PUT 语义整体替换：offsets 为空数组 = 取消全部提醒。
  app.put(
    '/health/events/:id/reminders',
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = healthReminderBodySchema.parse(request.body);
      const item = await app.db.transaction((tx) =>
        updateEvent(
          tx as unknown as typeof app.db,
          request.auth.userId!,
          id,
          { reminder: body },
          ifMatchVersion(request),
        ),
      );
      etagReply(reply, item.version);
      return createSuccessEnvelope(item, request.requestId);
    },
  );

  app.delete(
    '/health/reminders/:id',
    { preHandler: requireAuth },
    async (request) => {
      const { id } = request.params as { id: string };
      const result = await app.db.transaction((tx) =>
        deleteReminder(tx as unknown as typeof app.db, request.auth.userId!, id),
      );
      return createSuccessEnvelope(result, request.requestId);
    },
  );
}
