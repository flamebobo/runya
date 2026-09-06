import type { FastifyInstance } from 'fastify';
import {
  createDiaryBodySchema,
  createMoodBodySchema,
  createSuccessEnvelope,
  diarySearchQuerySchema,
  diaryPublicSchema,
  momHomeSummarySchema,
  moodCalendarResponseSchema,
  moodPublicSchema,
  updateDiaryBodySchema,
  updateMoodBodySchema,
} from '@runew/contracts';
import { buildEtag, parseIfMatch } from '@runew/shared-utils';
import { requireAuth } from '../../plugins/auth.js';
import { AppError } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import {
  createDiary,
  createMood,
  deleteDiary,
  deleteMood,
  getDiaryById,
  getMomHomeSummary,
  getMoodCalendar,
  listDiaries,
  listMoods,
  restoreDiary,
  searchDiaries,
  restoreMood,
  updateDiary,
  updateMood,
} from './mom.service.js';

function ifMatchVersion(request: { headers: Record<string, unknown> }) {
  const header = request.headers['if-match'];
  return parseIfMatch(typeof header === 'string' ? header : undefined);
}

export async function momRoutes(fastify: FastifyInstance) {
  // --- Summary ---
  fastify.get('/mom/summary', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const result = momHomeSummarySchema.parse(
      await getMomHomeSummary(request.db, userId),
    );
    return createSuccessEnvelope(result, request.id);
  });

  // --- Moods ---
  fastify.get('/mom/moods', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const items = await listMoods(request.db, userId);
    return createSuccessEnvelope(
      items.map((item) => moodPublicSchema.parse(item)),
      request.id,
    );
  });

  fastify.post('/mom/moods', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const body = createMoodBodySchema.parse(request.body);
    return withIdempotency(fastify, request, reply, {
      endpoint: 'mom/moods',
      userId,
      payload: body,
      handler: async () => ({
        statusCode: 200,
        body: createSuccessEnvelope(
          moodPublicSchema.parse(await createMood(request.db, userId, body)),
          request.id,
        ),
      }),
    });
  });

  fastify.patch('/mom/moods/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const body = updateMoodBodySchema.parse(request.body);
    const item = moodPublicSchema.parse(
      await updateMood(request.db, userId, id, body, ifMatchVersion(request)),
    );
    reply.header('ETag', buildEtag(item.version));
    return createSuccessEnvelope(item, request.id);
  });

  fastify.delete('/mom/moods/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    await deleteMood(request.db, userId, id);
    return createSuccessEnvelope({ id, deleted: true }, request.id);
  });

  fastify.post('/mom/moods/:id/restore', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      moodPublicSchema.parse(await restoreMood(request.db, userId, id, request.auth.deviceId)),
      request.id,
    );
  });

  // --- Mood Calendar ---
  fastify.get('/mom/mood-calendar', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const query = request.query as { month?: string };
    const match = (query.month ?? '').match(/^(\d{4})-(\d{2})$/);
    const year = match ? Number(match[1]) : NaN;
    const month = match ? Number(match[2]) : NaN;
    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      year < 1970 ||
      year > new Date().getUTCFullYear() + 1
    ) {
      throw new AppError('VALIDATION_ERROR', '想看哪一个月的心情呢？', 400);
    }
    const result = moodCalendarResponseSchema.parse(
      await getMoodCalendar(request.db, userId, year, month),
    );
    return createSuccessEnvelope(result, request.id);
  });

  // --- Diaries ---
  fastify.get('/mom/diaries', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const items = await listDiaries(request.db, userId);
    return createSuccessEnvelope(
      items.map((item) => diaryPublicSchema.parse(item)),
      request.id,
    );
  });

  fastify.post('/mom/diaries', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const body = createDiaryBodySchema.parse(request.body);
    return withIdempotency(fastify, request, reply, {
      endpoint: 'mom/diaries',
      userId,
      payload: body,
      handler: async () => ({
        statusCode: 200,
        body: createSuccessEnvelope(
          diaryPublicSchema.parse(await createDiary(request.db, userId, body)),
          request.id,
        ),
      }),
    });
  });

  fastify.get('/mom/diaries/search', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const query = diarySearchQuerySchema.parse(request.query);
    const items = await searchDiaries(request.db, userId, query);
    return createSuccessEnvelope(
      items.map((item) => diaryPublicSchema.parse(item)),
      request.id,
    );
  });

  fastify.get('/mom/diaries/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const item = diaryPublicSchema.parse(await getDiaryById(request.db, userId, id));
    return createSuccessEnvelope(item, request.id);
  });

  fastify.patch('/mom/diaries/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const body = updateDiaryBodySchema.parse(request.body);
    const item = diaryPublicSchema.parse(
      await updateDiary(request.db, userId, id, body, ifMatchVersion(request)),
    );
    reply.header('ETag', buildEtag(item.version));
    return createSuccessEnvelope(item, request.id);
  });

  fastify.delete('/mom/diaries/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    await deleteDiary(request.db, userId, id);
    return createSuccessEnvelope({ id, deleted: true }, request.id);
  });

  fastify.post('/mom/diaries/:id/restore', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      diaryPublicSchema.parse(await restoreDiary(request.db, userId, id, request.auth.deviceId)),
      request.id,
    );
  });
}
