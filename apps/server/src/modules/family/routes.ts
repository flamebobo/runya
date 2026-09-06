import {
  createSuccessEnvelope,
  createFamilyTaskBodySchema,
  createFamilyAnniversaryBodySchema,
  createAchievementBodySchema,
  updateFamilyPermissionsBodySchema,
} from '@runew/contracts';
import {
  familyTasks,
  familyAnniversaries,
  achievements,
  userAchievements,
  familyMembers,
  familyMemberPermissions,
  users,
} from '@runew/db';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth } from '../../plugins/auth.js';
import { requireFamilyMembership, requireFamilyPermission } from '../identity/service.js';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { AppError } from '../../lib/errors.js';
import { parseIfMatch } from '@runew/shared-utils';

export async function familyRoutes(app: FastifyInstance) {
  const family = async (request: FastifyRequest) => {
    const id = (request.params as { familyId: string }).familyId;
    await requireFamilyMembership(app.db, request.auth.userId!, id);
    return id;
  };
  const permission = async (request: FastifyRequest, resource: string, action: string) => {
    const id = (request.params as { familyId: string }).familyId;
    await requireFamilyPermission(app.db, request.auth.userId!, id, resource, action);
    return id;
  };
  async function manageMember(request: FastifyRequest) {
    const familyId = await family(request);
    const actor = await app.db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, familyId),
          eq(familyMembers.userId, request.auth.userId!),
        ),
      )
      .limit(1);
    if (!actor[0] || !['OWNER', 'ADMIN'].includes(actor[0].role))
      throw new AppError('PERMISSION_DENIED', '只有家庭管理员可以管理成员', 403);
    await requireFamilyPermission(app.db, request.auth.userId!, familyId, 'family', 'MANAGE');
    const memberId = (request.params as { memberId: string }).memberId;
    const target = await app.db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)))
      .limit(1);
    if (!target[0]) throw new AppError('NOT_FOUND', '成员不存在', 404);
    return { familyId, target: target[0] };
  }
  app.get(
    '/families/:familyId/members/:memberId',
    { preHandler: requireAuth },
    async (request) => {
      const { familyId, memberId } = request.params as {
        familyId: string;
        memberId: string;
      };
      await permission(request, 'family', 'VIEW');
      const rows = await app.db
        .select({ member: familyMembers, user: users })
        .from(familyMembers)
        .innerJoin(users, eq(familyMembers.userId, users.id))
        .where(
          and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)),
        )
        .limit(1);
      if (!rows[0]) throw new AppError('NOT_FOUND', '成员不存在', 404);
      const permissions = await app.db
        .select()
        .from(familyMemberPermissions)
        .where(eq(familyMemberPermissions.familyMemberId, memberId));
      return createSuccessEnvelope(
        { ...rows[0].member, nickname: rows[0].user.nickname, permissions },
        request.id,
      );
    },
  );
  app.patch(
    '/families/:familyId/members/:memberId/permissions',
    { preHandler: requireAuth },
    async (request) => {
      const { target } = await manageMember(request);
      const body = updateFamilyPermissionsBodySchema.parse(request.body);
      await app.db.transaction(async (tx) => {
        await tx
          .delete(familyMemberPermissions)
          .where(eq(familyMemberPermissions.familyMemberId, target.id));
        if (body.permissions.length)
          await tx.insert(familyMemberPermissions).values(
            body.permissions.map((permission) => ({
              id: createUlid(),
              familyMemberId: target.id,
              ...permission,
            })),
          );
      });
      return createSuccessEnvelope(
        { ok: true, permissions: body.permissions },
        request.id,
      );
    },
  );
  app.post(
    '/families/:familyId/members/:memberId/disable',
    { preHandler: requireAuth },
    async (request) => {
      const { target } = await manageMember(request);
      if (target.role === 'OWNER')
        throw new AppError('PERMISSION_DENIED', '家庭创建者不能被停用', 403);
      const updated = await app.db
        .update(familyMembers)
        .set({ status: 'DISABLED', updatedAt: utcNowMs(), version: target.version + 1 })
        .where(eq(familyMembers.id, target.id))
        .returning();
      return createSuccessEnvelope(updated[0], request.id);
    },
  );
  app.post(
    '/families/:familyId/members/:memberId/restore',
    { preHandler: requireAuth },
    async (request) => {
      const { target } = await manageMember(request);
      const updated = await app.db
        .update(familyMembers)
        .set({ status: 'ACTIVE', updatedAt: utcNowMs(), version: target.version + 1 })
        .where(eq(familyMembers.id, target.id))
        .returning();
      return createSuccessEnvelope(updated[0], request.id);
    },
  );
  app.get('/families/:familyId/tasks', { preHandler: requireAuth }, async (request) => {
    const familyId = await permission(request, 'family', 'VIEW');
    const rows = await app.db
      .select()
      .from(familyTasks)
      .where(and(eq(familyTasks.familyId, familyId), isNull(familyTasks.deletedAt)));
    return createSuccessEnvelope({ items: rows }, request.id);
  });
  app.post(
    '/families/:familyId/tasks',
    { preHandler: requireAuth },
    async (request, reply) => {
      const familyId = await permission(request, 'family', 'CREATE');
      const body = createFamilyTaskBodySchema.parse(request.body);
      const now = utcNowMs();
      const existing = body.id
        ? await app.db.select().from(familyTasks).where(eq(familyTasks.id, body.id)).limit(1)
        : [];
      if (existing[0] && existing[0].familyId !== familyId)
        throw new AppError('PERMISSION_DENIED', '不能操作其他小家的任务', 403);
      if (existing[0]) {
        const samePayload =
          existing[0].title === body.title &&
          (existing[0].note ?? null) === (body.note ?? null) &&
          (existing[0].dueAt ?? null) === (body.dueAt ?? null) &&
          (existing[0].repeatRule ?? null) === (body.repeatRule ?? null) &&
          (existing[0].assignedTo ?? null) === (body.assignedTo ?? null) &&
          existing[0].experienceReward === (body.experienceReward ?? 0);
        if (!samePayload)
          throw new AppError('IDEMPOTENCY_KEY_REUSED', '任务 ID 已被不同内容使用', 409);
        return createSuccessEnvelope(existing[0], request.id);
      }
      if (body.assignedTo)
        await requireFamilyMembership(app.db, body.assignedTo, familyId);
      const row = {
        id: body.id ?? createUlid(),
        familyId,
        title: body.title,
        note: body.note ?? null,
        dueAt: body.dueAt ?? null,
        repeatRule: body.repeatRule ?? null,
        assignedTo: body.assignedTo ?? null,
        experienceReward: body.experienceReward ?? 0,
        status: 'OPEN',
        completedAt: null,
        completedBy: null,
        deletedAt: null,
        createdBy: request.auth.userId!,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      await app.db.insert(familyTasks).values(row);
      reply.code(201);
      return createSuccessEnvelope(row, request.id);
    },
  );
  app.patch(
    '/families/:familyId/tasks/:taskId',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'EDIT');
      const { taskId } = request.params as { taskId: string };
      const body = createFamilyTaskBodySchema.omit({ id: true }).partial().parse(request.body);
      const current = await app.db
        .select()
        .from(familyTasks)
        .where(
          and(
            eq(familyTasks.id, taskId),
            eq(familyTasks.familyId, familyId),
            isNull(familyTasks.deletedAt),
          ),
        )
        .limit(1);
      if (!current[0]) throw new AppError('NOT_FOUND', '任务不存在', 404);
      const expectedVersion = parseIfMatch(request.headers['if-match']);
      if (expectedVersion !== null && expectedVersion !== current[0].version) {
        throw new AppError(
          'ENTITY_VERSION_CONFLICT',
          '任务刚刚被家人更新，请刷新后再试',
          409,
        );
      }
      if (body.assignedTo)
        await requireFamilyMembership(app.db, body.assignedTo, familyId);
      const updated = {
        ...body,
        updatedAt: utcNowMs(),
        version: current[0].version + 1,
      };
      const result = await app.db
        .update(familyTasks)
        .set(updated)
        .where(
          and(
            eq(familyTasks.id, taskId),
            eq(familyTasks.familyId, familyId),
            isNull(familyTasks.deletedAt),
            eq(familyTasks.version, current[0].version),
          ),
        )
        .returning();
      if (!result[0])
        throw new AppError('ENTITY_VERSION_CONFLICT', '任务刚刚被家人更新，请刷新后再试', 409);
      return createSuccessEnvelope({ ...current[0], ...updated }, request.id);
    },
  );
  app.post(
    '/families/:familyId/tasks/:taskId/complete',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'EDIT');
      const { taskId } = request.params as { taskId: string };
      const current = await app.db
        .select()
        .from(familyTasks)
        .where(
          and(
            eq(familyTasks.id, taskId),
            eq(familyTasks.familyId, familyId),
            isNull(familyTasks.deletedAt),
          ),
        )
        .limit(1);
      if (!current[0]) throw new AppError('NOT_FOUND', '任务不存在', 404);
      const expectedVersion = parseIfMatch(request.headers['if-match']);
      if (expectedVersion !== null && expectedVersion !== current[0].version) {
        throw new AppError(
          'ENTITY_VERSION_CONFLICT',
          '任务刚刚被家人更新，请刷新后再试',
          409,
        );
      }
      if (current[0].completedAt !== null) return createSuccessEnvelope(current[0], request.id);
      const now = utcNowMs();
      const result = await app.db
        .update(familyTasks)
        .set({
          status: 'COMPLETED',
          completedAt: now,
          completedBy: request.auth.userId!,
          updatedAt: now,
          version: current[0].version + 1,
        })
        .where(
          and(
            eq(familyTasks.id, taskId),
            eq(familyTasks.familyId, familyId),
            isNull(familyTasks.deletedAt),
            eq(familyTasks.version, current[0].version),
          ),
        )
        .returning();
      if (!result[0])
        throw new AppError('ENTITY_VERSION_CONFLICT', '任务刚刚被家人更新，请刷新后再试', 409);
      return createSuccessEnvelope(result[0], request.id);
    },
  );
  app.delete(
    '/families/:familyId/tasks/:taskId',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'DELETE');
      const { taskId } = request.params as { taskId: string };
      const current = await app.db
        .select({ id: familyTasks.id, version: familyTasks.version })
        .from(familyTasks)
        .where(
          and(
            eq(familyTasks.id, taskId),
            eq(familyTasks.familyId, familyId),
            isNull(familyTasks.deletedAt),
          ),
        )
        .limit(1);
      if (!current[0]) throw new AppError('NOT_FOUND', '任务不存在', 404);
      const now = utcNowMs();
      const deleted = await app.db
        .update(familyTasks)
        .set({ status: 'DELETED', deletedAt: now, updatedAt: now, version: current[0].version + 1 })
        .where(
          and(
            eq(familyTasks.id, taskId),
            eq(familyTasks.familyId, familyId),
            isNull(familyTasks.deletedAt),
            eq(familyTasks.version, current[0].version),
          ),
        )
        .returning({ id: familyTasks.id });
      if (!deleted[0]) throw new AppError('NOT_FOUND', '任务不存在', 404);
      return createSuccessEnvelope({ ok: true }, request.id);
    },
  );
  app.get(
    '/families/:familyId/anniversaries',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'VIEW');
      return createSuccessEnvelope(
        {
          items: await app.db
            .select()
            .from(familyAnniversaries)
            .where(eq(familyAnniversaries.familyId, familyId)),
        },
        request.id,
      );
    },
  );
  app.post(
    '/families/:familyId/anniversaries',
    { preHandler: requireAuth },
    async (request, reply) => {
      const familyId = await permission(request, 'family', 'CREATE');
      const body = createFamilyAnniversaryBodySchema.parse(request.body);
      const now = utcNowMs();
      const row = {
        id: createUlid(),
        familyId,
        ...body,
        note: body.note ?? null,
        createdBy: request.auth.userId!,
        createdAt: now,
        updatedAt: now,
      };
      await app.db.insert(familyAnniversaries).values(row);
      reply.code(201);
      return createSuccessEnvelope(row, request.id);
    },
  );
  app.get(
    '/families/:familyId/achievements',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'VIEW');
      return createSuccessEnvelope(
        {
          items: await app.db
            .select()
            .from(achievements)
            .where(eq(achievements.familyId, familyId)),
        },
        request.id,
      );
    },
  );
  app.post(
    '/families/:familyId/achievements',
    { preHandler: requireAuth },
    async (request, reply) => {
      const familyId = await permission(request, 'family', 'CREATE');
      const body = createAchievementBodySchema.parse(request.body);
      const row = {
        id: createUlid(),
        familyId,
        title: body.title,
        description: body.description ?? null,
        emoji: body.emoji,
        unlockedAt: utcNowMs(),
        createdAt: utcNowMs(),
      };
      await app.db.insert(achievements).values(row);
      reply.code(201);
      return createSuccessEnvelope(row, request.id);
    },
  );
  app.get(
    '/families/:familyId/achievements/:achievementId',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'VIEW');
      const { achievementId } = request.params as { achievementId: string };
      const row = await app.db
        .select()
        .from(achievements)
        .where(
          and(eq(achievements.id, achievementId), eq(achievements.familyId, familyId)),
        )
        .limit(1);
      if (!row[0]) throw new AppError('NOT_FOUND', '成就不存在', 404);
      return createSuccessEnvelope(row[0], request.id);
    },
  );
  app.post(
    '/families/:familyId/achievements/:achievementId/grant',
    { preHandler: requireAuth },
    async (request, reply) => {
      const familyId = await permission(request, 'family', 'EDIT');
      const { achievementId } = request.params as { achievementId: string };
      const achievement = await app.db
        .select({ id: achievements.id })
        .from(achievements)
        .where(and(eq(achievements.id, achievementId), eq(achievements.familyId, familyId)))
        .limit(1);
      if (!achievement[0]) throw new AppError('NOT_FOUND', '成就不存在', 404);
      const now = utcNowMs();
      const existing = await app.db
        .select()
        .from(userAchievements)
        .where(and(eq(userAchievements.achievementId, achievementId), eq(userAchievements.userId, request.auth.userId!)))
        .limit(1);
      if (existing[0]) return createSuccessEnvelope(existing[0], request.id);
      const row = { id: createUlid(), achievementId, userId: request.auth.userId!, earnedAt: now };
      try {
        await app.db.insert(userAchievements).values(row);
      } catch (error) {
        if (!(error instanceof Error) || !/unique|constraint/i.test(error.message)) throw error;
        const concurrent = await app.db
          .select()
          .from(userAchievements)
          .where(and(eq(userAchievements.achievementId, achievementId), eq(userAchievements.userId, request.auth.userId!)))
          .limit(1);
        if (!concurrent[0]) throw error;
        return createSuccessEnvelope(concurrent[0], request.id);
      }
      reply.code(201);
      return createSuccessEnvelope(row, request.id);
    },
  );
  app.patch(
    '/families/:familyId/anniversaries/:anniversaryId',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'EDIT');
      const { anniversaryId } = request.params as { anniversaryId: string };
      const body = createFamilyAnniversaryBodySchema.partial().parse(request.body);
      const result = await app.db
        .update(familyAnniversaries)
        .set({ ...body, updatedAt: utcNowMs() })
        .where(
          and(
            eq(familyAnniversaries.id, anniversaryId),
            eq(familyAnniversaries.familyId, familyId),
          ),
        )
        .returning();
      if (!result[0]) throw new AppError('NOT_FOUND', '纪念日不存在', 404);
      return createSuccessEnvelope(result[0], request.id);
    },
  );
  app.delete(
    '/families/:familyId/anniversaries/:anniversaryId',
    { preHandler: requireAuth },
    async (request) => {
      const familyId = await permission(request, 'family', 'DELETE');
      const { anniversaryId } = request.params as { anniversaryId: string };
      const deleted = await app.db
        .delete(familyAnniversaries)
        .where(
          and(
            eq(familyAnniversaries.id, anniversaryId),
            eq(familyAnniversaries.familyId, familyId),
          ),
        )
        .returning({ id: familyAnniversaries.id });
      if (!deleted[0]) throw new AppError('NOT_FOUND', '纪念日不存在', 404);
      return createSuccessEnvelope({ ok: true }, request.id);
    },
  );
}
