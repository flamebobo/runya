import type { FastifyInstance } from 'fastify';
import {
  createPhotoMemoryBodySchema,
  updatePhotoMemoryBodySchema,
  createBabyQuoteBodySchema,
  updateBabyQuoteBodySchema,
  createAudioMemoryBodySchema,
  updateAudioMemoryBodySchema,
  createFirstMomentBodySchema,
  updateFirstMomentBodySchema,
  createTimeCapsuleBodySchema,
  updateTimeCapsuleBodySchema,
  createSuccessEnvelope,
} from '@runew/contracts';
import { requireAuth } from '../../plugins/auth.js';
import {
  createPhotoMemory,
  getPhotoMemoryById,
  listPhotoMemories,
  updatePhotoMemory,
  deletePhotoMemory,
  createBabyQuote,
  getBabyQuoteById,
  listBabyQuotes,
  updateBabyQuote,
  deleteBabyQuote,
  createAudioMemory,
  getAudioMemoryById,
  listAudioMemories,
  updateAudioMemory,
  deleteAudioMemory,
  createFirstMoment,
  getFirstMomentById,
  listFirstMoments,
  updateFirstMoment,
  deleteFirstMoment,
  createTimeCapsule,
  getTimeCapsuleById,
  listTimeCapsules,
  updateTimeCapsule,
  sealTimeCapsule,
  openTimeCapsule,
  deleteTimeCapsule,
  getMemoriesHomeSummary,
  getOnThisDayMemories,
} from './memories.service.js';
import { AppError } from '../../lib/errors.js';
import type { Database } from '../../plugins/db.js';

async function getActiveFamilyId(db: Database, userId: string): Promise<string> {
  const membership = await db.query.familyMembers.findFirst({
    where: (fm, { and, eq }) =>
      and(eq(fm.userId, userId), eq(fm.status, 'ACTIVE')),
  });
  if (!membership) {
    throw new AppError('FAMILY_ACCESS_DENIED', '尚未加入任何家庭', 400);
  }
  return membership.familyId;
}

export async function memoriesRoutes(fastify: FastifyInstance) {
  // --- Summary & On-This-Day ---
  fastify.get('/babies/:babyId/memories/summary', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { babyId } = request.params as { babyId: string };

    const result = await getMemoriesHomeSummary(request.db, babyId, familyId);
    return createSuccessEnvelope(result, request.id);
  });

  fastify.get('/babies/:babyId/memories/on-this-day', { preHandler: requireAuth }, async (request, reply) => {
    const { babyId } = request.params as { babyId: string };

    const result = await getOnThisDayMemories(request.db, babyId);
    return createSuccessEnvelope(result, request.id);
  });

  // --- Photo Memories ---
  fastify.get('/babies/:babyId/memories/photos', { preHandler: requireAuth }, async (request, reply) => {
    const { babyId } = request.params as { babyId: string };
    const items = await listPhotoMemories(request.db, babyId);
    return createSuccessEnvelope(items, request.id);
  });

  fastify.post('/babies/:babyId/memories/photos', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { babyId } = request.params as { babyId: string };
    const body = createPhotoMemoryBodySchema.parse(request.body);

    const result = await createPhotoMemory(request.db, userId, familyId, babyId, body);
    return createSuccessEnvelope(result, request.id);
  });

  fastify.get('/memories/photos/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getPhotoMemoryById(request.db, id);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.patch('/memories/photos/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const body = updatePhotoMemoryBodySchema.parse(request.body);

    const item = await updatePhotoMemory(request.db, userId, id, body);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.delete('/memories/photos/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    await deletePhotoMemory(request.db, userId, id);
    return createSuccessEnvelope({ id, deleted: true }, request.id);
  });

  // --- Baby Quotes ---
  fastify.get('/babies/:babyId/memories/quotes', { preHandler: requireAuth }, async (request, reply) => {
    const { babyId } = request.params as { babyId: string };
    const items = await listBabyQuotes(request.db, babyId);
    return createSuccessEnvelope(items, request.id);
  });

  fastify.post('/babies/:babyId/memories/quotes', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { babyId } = request.params as { babyId: string };
    const body = createBabyQuoteBodySchema.parse(request.body);

    const result = await createBabyQuote(request.db, userId, familyId, babyId, body);
    return createSuccessEnvelope(result, request.id);
  });

  fastify.get('/memories/quotes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getBabyQuoteById(request.db, id);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.patch('/memories/quotes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const body = updateBabyQuoteBodySchema.parse(request.body);

    const item = await updateBabyQuote(request.db, userId, id, body);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.delete('/memories/quotes/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    await deleteBabyQuote(request.db, userId, id);
    return createSuccessEnvelope({ id, deleted: true }, request.id);
  });

  // --- Audio Memories ---
  fastify.get('/babies/:babyId/memories/audios', { preHandler: requireAuth }, async (request, reply) => {
    const { babyId } = request.params as { babyId: string };
    const items = await listAudioMemories(request.db, babyId);
    return createSuccessEnvelope(items, request.id);
  });

  fastify.post('/babies/:babyId/memories/audios', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { babyId } = request.params as { babyId: string };
    const body = createAudioMemoryBodySchema.parse(request.body);

    const result = await createAudioMemory(request.db, userId, familyId, babyId, body);
    return createSuccessEnvelope(result, request.id);
  });

  fastify.get('/memories/audios/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getAudioMemoryById(request.db, id);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.patch('/memories/audios/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const body = updateAudioMemoryBodySchema.parse(request.body);

    const item = await updateAudioMemory(request.db, userId, id, body);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.delete('/memories/audios/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    await deleteAudioMemory(request.db, userId, id);
    return createSuccessEnvelope({ id, deleted: true }, request.id);
  });

  // --- First Moments ---
  fastify.get('/babies/:babyId/memories/firsts', { preHandler: requireAuth }, async (request, reply) => {
    const { babyId } = request.params as { babyId: string };
    const items = await listFirstMoments(request.db, babyId);
    return createSuccessEnvelope(items, request.id);
  });

  fastify.post('/babies/:babyId/memories/firsts', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { babyId } = request.params as { babyId: string };
    const body = createFirstMomentBodySchema.parse(request.body);

    const result = await createFirstMoment(request.db, userId, familyId, babyId, body);
    return createSuccessEnvelope(result, request.id);
  });

  fastify.get('/memories/firsts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getFirstMomentById(request.db, id);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.patch('/memories/firsts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const body = updateFirstMomentBodySchema.parse(request.body);

    const item = await updateFirstMoment(request.db, userId, id, body);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.delete('/memories/firsts/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    await deleteFirstMoment(request.db, userId, id);
    return createSuccessEnvelope({ id, deleted: true }, request.id);
  });

  // --- Time Capsules ---
  fastify.get('/babies/:babyId/memories/capsules', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const items = await listTimeCapsules(request.db, familyId);
    return createSuccessEnvelope(items, request.id);
  });

  fastify.post('/babies/:babyId/memories/capsules', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const familyId = await getActiveFamilyId(request.db, userId);
    const { babyId } = request.params as { babyId: string };
    const body = createTimeCapsuleBodySchema.parse(request.body);

    const result = await createTimeCapsule(request.db, userId, familyId, babyId, body);
    return createSuccessEnvelope(result, request.id);
  });

  fastify.get('/memories/capsules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getTimeCapsuleById(request.db, id);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.patch('/memories/capsules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };
    const body = updateTimeCapsuleBodySchema.parse(request.body);

    const item = await updateTimeCapsule(request.db, userId, id, body);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.post('/memories/capsules/:id/seal', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    const item = await sealTimeCapsule(request.db, userId, id);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.post('/memories/capsules/:id/open', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    const item = await openTimeCapsule(request.db, userId, id);
    return createSuccessEnvelope(item, request.id);
  });

  fastify.delete('/memories/capsules/:id', { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.auth.userId!;
    const { id } = request.params as { id: string };

    await deleteTimeCapsule(request.db, userId, id);
    return createSuccessEnvelope({ id, deleted: true }, request.id);
  });
}
