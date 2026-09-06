import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../../plugins/auth.js';
import { AppError } from '../../lib/errors.js';
import { createSuccessEnvelope, createRewardBodySchema, updateRewardBodySchema, fulfillRewardOrderBodySchema, gemBalanceSchema, gemTransactionSchema, rewardSchema, rewardOrderSchema } from '@runew/contracts';
import { getGemBalance, listGemTransactions, listRewards, getReward, redeemReward, listRewardOrders, getRewardOrder, fulfillRewardOrder, cancelRewardOrder, createCustomReward, updateReward, deleteReward } from './service.js';
import { getActiveFamilyId } from '../identity/service.js';

export async function gemsRoutes(fastify: FastifyInstance) {
  const family = (request: FastifyRequest) => getActiveFamilyId(request.db, request.auth.userId!);
  const id = (request: FastifyRequest) => (request.params as { id: string }).id;
  fastify.get('/gems/balance', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(gemBalanceSchema.parse(await getGemBalance(request.db, request.auth.userId!, await family(request))), request.id));
  fastify.get('/gems/transactions', { preHandler: requireAuth }, async (request) => createSuccessEnvelope((await listGemTransactions(request.db, request.auth.userId!, await family(request))).map((x) => gemTransactionSchema.parse(x)), request.id));
  fastify.get('/rewards', { preHandler: requireAuth }, async (request) => createSuccessEnvelope((await listRewards(request.db, request.auth.userId!, await family(request))).map((x) => rewardSchema.parse(x)), request.id));
  fastify.get('/rewards/:id', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(rewardSchema.parse(await getReward(request.db, request.auth.userId!, id(request))), request.id));
  fastify.post('/rewards/:id/redeem', { preHandler: requireAuth }, async (request) => {
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8) throw new AppError('VALIDATION_ERROR', '请稍后重试这次愿望', 400);
    return createSuccessEnvelope(await redeemReward(request.db, request.auth.userId!, id(request), key), request.id);
  });
  fastify.get('/reward-orders', { preHandler: requireAuth }, async (request) => createSuccessEnvelope((await listRewardOrders(request.db, request.auth.userId!, await family(request))).map((x) => rewardOrderSchema.parse(x)), request.id));
  fastify.get('/reward-orders/:id', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(rewardOrderSchema.parse(await getRewardOrder(request.db, request.auth.userId!, id(request))), request.id));
  fastify.post('/reward-orders/:id/fulfill', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(rewardOrderSchema.parse(await fulfillRewardOrder(request.db, request.auth.userId!, id(request), fulfillRewardOrderBodySchema.parse(request.body).completionPhotoMemoryId)), request.id));
  fastify.post('/reward-orders/:id/cancel', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(rewardOrderSchema.parse(await cancelRewardOrder(request.db, request.auth.userId!, id(request))), request.id));
  fastify.post('/rewards', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(rewardSchema.parse(await createCustomReward(request.db, request.auth.userId!, await family(request), createRewardBodySchema.parse(request.body))), request.id));
  fastify.patch('/rewards/:id', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(rewardSchema.parse(await updateReward(request.db, request.auth.userId!, id(request), updateRewardBodySchema.parse(request.body))), request.id));
  fastify.delete('/rewards/:id', { preHandler: requireAuth }, async (request) => createSuccessEnvelope(await deleteReward(request.db, request.auth.userId!, id(request)), request.id));
}
