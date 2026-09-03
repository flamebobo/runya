import {
  createSuccessEnvelope,
  knowledgeFeedbackBodySchema,
  putKnowledgeStateBodySchema,
} from '@runew/contracts';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../plugins/auth.js';
import { requireBabyInFamily } from '../identity/service.js';
import {
  babyAgeDays,
  getLibrary,
  getLibraryCounts,
  getKnowledgeState,
  getPublishedKnowledge,
  getRecommendations,
  listPublishedKnowledge,
  putKnowledgeState,
  saveFeedback,
  searchKnowledge,
} from './service.js';

const LIBRARY_STATES = ['saved', 'later', 'learned'] as const;
type LibraryState = (typeof LIBRARY_STATES)[number];

function libraryState(value: string | undefined): LibraryState {
  return LIBRARY_STATES.includes(value as LibraryState) ? (value as LibraryState) : 'saved';
}

export async function knowledgeRoutes(app: FastifyInstance) {
  app.get('/knowledge', { preHandler: requireAuth }, async (request) => {
    const items = await listPublishedKnowledge(app.db);
    return createSuccessEnvelope({ items }, request.requestId);
  });

  app.get('/knowledge/search', { preHandler: requireAuth }, async (request) => {
    const query = request.query as { q?: string };
    const keyword = (query.q ?? '').trim();
    const items = keyword ? await searchKnowledge(app.db, keyword) : [];
    return createSuccessEnvelope({ items }, request.requestId);
  });

  // 注意路由顺序：/knowledge/search 必须先于 /knowledge/:id 注册。
  app.get('/knowledge/:id', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const detail = await getPublishedKnowledge(app.db, id);
    return createSuccessEnvelope(detail, request.requestId);
  });

  app.post('/knowledge/:id/feedback', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const body = knowledgeFeedbackBodySchema.parse(request.body);
    await saveFeedback(app.db, { knowledgeId: id, type: body.type });
    return createSuccessEnvelope({ ok: true }, request.requestId);
  });

  app.get(
    '/babies/:babyId/knowledge/recommendations',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId } = request.params as { babyId: string };
      const baby = await requireBabyInFamily(app.db, request.auth.userId!, babyId);
      const recommendations = await getRecommendations(
        app.db,
        babyId,
        babyAgeDays(baby.birthday),
      );
      return createSuccessEnvelope(recommendations, request.requestId);
    },
  );

  app.put(
    '/babies/:babyId/knowledge/:id/state',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId, id } = request.params as { babyId: string; id: string };
      const body = putKnowledgeStateBodySchema.parse(request.body);
      await requireBabyInFamily(app.db, request.auth.userId!, babyId);
      const state = await putKnowledgeState(app.db, {
        userId: request.auth.userId!,
        babyId,
        knowledgeId: id,
        body,
      });
      return createSuccessEnvelope(state, request.requestId);
    },
  );

  app.get(
    '/babies/:babyId/knowledge/library',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId } = request.params as { babyId: string };
      const query = request.query as { state?: string };
      await requireBabyInFamily(app.db, request.auth.userId!, babyId);
      const library = await getLibrary(app.db, babyId, libraryState(query.state));
      return createSuccessEnvelope(library, request.requestId);
    },
  );

  // 快捷入口计数。注意路由顺序：必须先于 /library/:state 形态之前注册（本仓库无该形态，防御性保持在前）。
  app.get(
    '/babies/:babyId/knowledge/library/counts',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId } = request.params as { babyId: string };
      await requireBabyInFamily(app.db, request.auth.userId!, babyId);
      const counts = await getLibraryCounts(app.db, babyId);
      return createSuccessEnvelope(counts, request.requestId);
    },
  );

  // 详情页读取当前用户状态；从未互动过返回 null，由前端按默认态渲染。
  app.get(
    '/babies/:babyId/knowledge/:id/state',
    { preHandler: requireAuth },
    async (request) => {
      const { babyId, id } = request.params as { babyId: string; id: string };
      await requireBabyInFamily(app.db, request.auth.userId!, babyId);
      const state = await getKnowledgeState(app.db, {
        userId: request.auth.userId!,
        babyId,
        knowledgeId: id,
      });
      return createSuccessEnvelope(state, request.requestId);
    },
  );
}
