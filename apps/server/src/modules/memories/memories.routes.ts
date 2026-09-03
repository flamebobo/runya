import type { FastifyInstance } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import {
  annualReviewResponseSchema,
  createAudioMemoryBodySchema,
  createBabyQuoteBodySchema,
  createFirstMomentBodySchema,
  createPhotoMemoryBodySchema,
  createSuccessEnvelope,
  createTimeCapsuleBodySchema,
  memoriesFavoritesSchema,
  memoriesHomeSummarySchema,
  onThisDayResponseSchema,
  updateAudioMemoryBodySchema,
  updateBabyQuoteBodySchema,
  updateFirstMomentBodySchema,
  updatePhotoMemoryBodySchema,
  updateTimeCapsuleBodySchema,
  updateTimeCapsuleFavoriteBodySchema,
} from '@runew/contracts';
import { babies } from '@runew/db';
import { requireAuth } from '../../plugins/auth.js';
import { AppError } from '../../lib/errors.js';
import { withIdempotency } from '../../lib/idempotency.js';
import type { Database } from '../../plugins/db.js';
import {
  createAudioMemory,
  createBabyQuote,
  createFirstMoment,
  createPhotoMemory,
  createTimeCapsule,
  deleteAudioMemory,
  deleteBabyQuote,
  deleteFirstMoment,
  deletePhotoMemory,
  deleteTimeCapsule,
  getAnnualReview,
  getAudioMemoryById,
  getBabyQuoteById,
  getFavoriteMemories,
  getFirstMomentById,
  getMemoriesHomeSummary,
  getOnThisDayMemories,
  getPhotoMemoryById,
  getTimeCapsuleById,
  listAudioMemories,
  listBabyQuotes,
  listFirstMoments,
  listPhotoMemories,
  listTimeCapsules,
  openTimeCapsule,
  restoreAudioMemory,
  restoreBabyQuote,
  restoreFirstMoment,
  restorePhotoMemory,
  restoreTimeCapsule,
  sealTimeCapsule,
  updateAudioMemory,
  updateBabyQuote,
  updateFirstMoment,
  updatePhotoMemory,
  updateTimeCapsule,
  updateTimeCapsuleFavorite,
} from './memories.service.js';

async function getActiveFamilyId(db: Database, userId: string) {
  const membership = await db.query.familyMembers.findFirst({
    where: (familyMember, { and: whereAnd, eq: whereEq }) =>
      whereAnd(
        whereEq(familyMember.userId, userId),
        whereEq(familyMember.status, 'ACTIVE'),
      ),
  });
  if (!membership) throw new AppError('FAMILY_ACCESS_DENIED', '尚未加入任何家庭', 400);
  return membership.familyId;
}

async function getBabyContext(db: Database, userId: string, babyId: string) {
  const familyId = await getActiveFamilyId(db, userId);
  const baby = await db.query.babies.findFirst({
    where: and(
      eq(babies.id, babyId),
      eq(babies.familyId, familyId),
      isNull(babies.deletedAt),
    ),
  });
  if (!baby) throw new AppError('FAMILY_ACCESS_DENIED', '无权访问这个宝宝的回忆', 403);
  return { familyId, babyId };
}

async function getYear(request: { query: unknown }) {
  const rawYear = (request.query as { year?: string }).year;
  const year = Number(rawYear);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1970 || year > currentYear + 1) {
    throw new AppError('VALIDATION_ERROR', '年度回顾年份不正确', 400);
  }
  return year;
}

export async function memoriesRoutes(fastify: FastifyInstance) {
  // --- Summary, On-This-Day, Favorites & Annual Review ---
  fastify.get(
    '/babies/:babyId/memories/summary',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const result = memoriesHomeSummarySchema.parse(
        await getMemoriesHomeSummary(request.db, babyId, familyId),
      );
      return createSuccessEnvelope(result, request.id);
    },
  );

  fastify.get(
    '/babies/:babyId/memories/on-this-day',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const result = onThisDayResponseSchema.parse(
        await getOnThisDayMemories(request.db, babyId, familyId),
      );
      return createSuccessEnvelope(result, request.id);
    },
  );

  fastify.get(
    '/babies/:babyId/memories/favorites',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const result = memoriesFavoritesSchema.parse(
        await getFavoriteMemories(request.db, babyId, familyId),
      );
      return createSuccessEnvelope(result, request.id);
    },
  );

  fastify.get(
    '/babies/:babyId/memories/annual-review',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const year = await getYear(request);
      const result = annualReviewResponseSchema.parse(
        await getAnnualReview(request.db, babyId, familyId, year),
      );
      return createSuccessEnvelope(result, request.id);
    },
  );

  // --- Photo Memories ---
  fastify.get(
    '/babies/:babyId/memories/photos',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      return createSuccessEnvelope(
        await listPhotoMemories(request.db, familyId, babyId),
        request.id,
      );
    },
  );

  fastify.post(
    '/babies/:babyId/memories/photos',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const body = createPhotoMemoryBodySchema.parse(request.body);
      return withIdempotency(fastify, request, reply, {
        endpoint: `babies/${babyId}/memories/photos`,
        userId,
        payload: body,
        handler: async () => ({
          statusCode: 200,
          body: createSuccessEnvelope(
            await createPhotoMemory(request.db, userId, familyId, babyId, body),
            request.id,
          ),
        }),
      });
    },
  );

  fastify.get('/memories/photos/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await getPhotoMemoryById(request.db, familyId, id),
      request.id,
    );
  });

  fastify.patch(
    '/memories/photos/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      const body = updatePhotoMemoryBodySchema.parse(request.body);
      return createSuccessEnvelope(
        await updatePhotoMemory(request.db, userId, familyId, id, body),
        request.id,
      );
    },
  );

  fastify.delete(
    '/memories/photos/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      await deletePhotoMemory(request.db, userId, familyId, id);
      return createSuccessEnvelope({ id, deleted: true }, request.id);
    },
  );

  fastify.post(
    '/memories/photos/:id/restore',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await restorePhotoMemory(request.db, userId, familyId, id),
        request.id,
      );
    },
  );

  // --- Baby Quotes ---
  fastify.get(
    '/babies/:babyId/memories/quotes',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      return createSuccessEnvelope(
        await listBabyQuotes(request.db, familyId, babyId),
        request.id,
      );
    },
  );

  fastify.post(
    '/babies/:babyId/memories/quotes',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const body = createBabyQuoteBodySchema.parse(request.body);
      return withIdempotency(fastify, request, reply, {
        endpoint: `babies/${babyId}/memories/quotes`,
        userId,
        payload: body,
        handler: async () => ({
          statusCode: 200,
          body: createSuccessEnvelope(
            await createBabyQuote(request.db, userId, familyId, babyId, body),
            request.id,
          ),
        }),
      });
    },
  );

  fastify.get('/memories/quotes/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await getBabyQuoteById(request.db, familyId, id),
      request.id,
    );
  });

  fastify.patch(
    '/memories/quotes/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      const body = updateBabyQuoteBodySchema.parse(request.body);
      return createSuccessEnvelope(
        await updateBabyQuote(request.db, userId, familyId, id, body),
        request.id,
      );
    },
  );

  fastify.delete(
    '/memories/quotes/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      await deleteBabyQuote(request.db, userId, familyId, id);
      return createSuccessEnvelope({ id, deleted: true }, request.id);
    },
  );

  fastify.post(
    '/memories/quotes/:id/restore',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await restoreBabyQuote(request.db, userId, familyId, id),
        request.id,
      );
    },
  );

  // --- Audio Memories ---
  fastify.get(
    '/babies/:babyId/memories/audios',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      return createSuccessEnvelope(
        await listAudioMemories(request.db, familyId, babyId),
        request.id,
      );
    },
  );

  fastify.post(
    '/babies/:babyId/memories/audios',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const body = createAudioMemoryBodySchema.parse(request.body);
      return withIdempotency(fastify, request, reply, {
        endpoint: `babies/${babyId}/memories/audios`,
        userId,
        payload: body,
        handler: async () => ({
          statusCode: 200,
          body: createSuccessEnvelope(
            await createAudioMemory(request.db, userId, familyId, babyId, body),
            request.id,
          ),
        }),
      });
    },
  );

  fastify.get('/memories/audios/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await getAudioMemoryById(request.db, familyId, id),
      request.id,
    );
  });

  fastify.patch(
    '/memories/audios/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      const body = updateAudioMemoryBodySchema.parse(request.body);
      return createSuccessEnvelope(
        await updateAudioMemory(request.db, userId, familyId, id, body),
        request.id,
      );
    },
  );

  fastify.delete(
    '/memories/audios/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      await deleteAudioMemory(request.db, userId, familyId, id);
      return createSuccessEnvelope({ id, deleted: true }, request.id);
    },
  );

  fastify.post(
    '/memories/audios/:id/restore',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await restoreAudioMemory(request.db, userId, familyId, id),
        request.id,
      );
    },
  );

  // --- First Moments ---
  fastify.get(
    '/babies/:babyId/memories/firsts',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      return createSuccessEnvelope(
        await listFirstMoments(request.db, familyId, babyId),
        request.id,
      );
    },
  );

  fastify.post(
    '/babies/:babyId/memories/firsts',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const body = createFirstMomentBodySchema.parse(request.body);
      return withIdempotency(fastify, request, reply, {
        endpoint: `babies/${babyId}/memories/firsts`,
        userId,
        payload: body,
        handler: async () => ({
          statusCode: 200,
          body: createSuccessEnvelope(
            await createFirstMoment(request.db, userId, familyId, babyId, body),
            request.id,
          ),
        }),
      });
    },
  );

  fastify.get('/memories/firsts/:id', { preHandler: requireAuth }, async (request) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { id } = request.params as { id: string };
    return createSuccessEnvelope(
      await getFirstMomentById(request.db, familyId, id),
      request.id,
    );
  });

  fastify.patch(
    '/memories/firsts/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      const body = updateFirstMomentBodySchema.parse(request.body);
      return createSuccessEnvelope(
        await updateFirstMoment(request.db, userId, familyId, id, body),
        request.id,
      );
    },
  );

  fastify.delete(
    '/memories/firsts/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      await deleteFirstMoment(request.db, userId, familyId, id);
      return createSuccessEnvelope({ id, deleted: true }, request.id);
    },
  );

  fastify.post(
    '/memories/firsts/:id/restore',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await restoreFirstMoment(request.db, userId, familyId, id),
        request.id,
      );
    },
  );

  // --- Time Capsules ---
  fastify.get(
    '/babies/:babyId/memories/capsules',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      return createSuccessEnvelope(
        await listTimeCapsules(request.db, familyId, babyId),
        request.id,
      );
    },
  );

  fastify.post(
    '/babies/:babyId/memories/capsules',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth.userId!;
      const { babyId } = request.params as { babyId: string };
      const { familyId } = await getBabyContext(request.db, userId, babyId);
      const body = createTimeCapsuleBodySchema.parse(request.body);
      return withIdempotency(fastify, request, reply, {
        endpoint: `babies/${babyId}/memories/capsules`,
        userId,
        payload: body,
        handler: async () => ({
          statusCode: 200,
          body: createSuccessEnvelope(
            await createTimeCapsule(request.db, userId, familyId, babyId, body),
            request.id,
          ),
        }),
      });
    },
  );

  fastify.get(
    '/memories/capsules/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await getTimeCapsuleById(request.db, familyId, id),
        request.id,
      );
    },
  );

  fastify.patch(
    '/memories/capsules/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      const body = updateTimeCapsuleBodySchema.parse(request.body);
      return createSuccessEnvelope(
        await updateTimeCapsule(request.db, userId, familyId, id, body),
        request.id,
      );
    },
  );

  fastify.patch(
    '/memories/capsules/:id/favorite',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      const body = updateTimeCapsuleFavoriteBodySchema.parse(request.body);
      return withIdempotency(fastify, request, reply, {
        endpoint: `PATCH /memories/capsules/${id}/favorite`,
        userId,
        payload: body,
        handler: async () => ({
          statusCode: 200,
          body: createSuccessEnvelope(
            await updateTimeCapsuleFavorite(request.db, userId, familyId, id, body),
            request.id,
          ),
        }),
      });
    },
  );

  fastify.post(
    '/memories/capsules/:id/seal',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await sealTimeCapsule(request.db, userId, familyId, id),
        request.id,
      );
    },
  );

  fastify.post(
    '/memories/capsules/:id/open',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await openTimeCapsule(request.db, userId, familyId, id),
        request.id,
      );
    },
  );

  fastify.delete(
    '/memories/capsules/:id',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      await deleteTimeCapsule(request.db, userId, familyId, id);
      return createSuccessEnvelope({ id, deleted: true }, request.id);
    },
  );

  fastify.post(
    '/memories/capsules/:id/restore',
    { preHandler: requireAuth },
    async (request) => {
      const userId = request.auth.userId!;
      const familyId = await getActiveFamilyId(request.db, userId);
      const { id } = request.params as { id: string };
      return createSuccessEnvelope(
        await restoreTimeCapsule(request.db, userId, familyId, id),
        request.id,
      );
    },
  );
}
