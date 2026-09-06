import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { familyInvites, familyMembers, familyTasks, runMigrations } from '@runew/db';
import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createUlid } from '@runew/shared-utils';

describe('family collaboration API', () => {
  let dir: string;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m10-'));
    process.env.DATABASE_PATH = path.join(dir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  it('creates and completes a shared task without ranking fields', async () => {
    const app = await buildApp();
    const headers = { 'x-client-platform': 'WEAPP' };
    const registered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: {
        username: `m10_${Date.now()}`,
        password: 'password123',
        nickname: '妈妈',
      },
    });
    const token = registered.json().data.session.token as string;
    const auth = { ...headers, authorization: `Bearer ${token}` };
    const family = await app.inject({
      method: 'POST',
      url: '/api/v1/families',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: {
        name: '我们的小家',
        timezoneName: 'Asia/Shanghai',
        relationship: 'MOM',
      },
    });
    const familyId = family.json().data.id as string;
    const clientTaskId = createUlid();
    const taskCreateKey = createUlid();
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: { ...auth, 'idempotency-key': taskCreateKey },
      payload: { id: clientTaskId, title: '一起读绘本', note: '睡前一起读一页' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.note).toBe('睡前一起读一页');
    expect(created.json().data).not.toHaveProperty('mom_score');
    expect(created.json().data).not.toHaveProperty('dad_score');
    expect(created.json().data).not.toHaveProperty('contribution_rank');
    const taskId = created.json().data.id as string;
    expect(taskId).toBe(clientTaskId);
    const sameTaskRetry = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: { ...auth, 'idempotency-key': taskCreateKey },
      payload: { id: taskId, title: '一起读绘本', note: '睡前一起读一页' },
    });
    expect(sameTaskRetry.statusCode).toBe(200);
    const reusedTaskId = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: auth,
      payload: { id: taskId, title: '换一本绘本' },
    });
    expect(reusedTaskId.statusCode).toBe(409);
    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/v1/families/${familyId}/tasks/${taskId}`,
      headers: auth,
      payload: { title: '另一件事', note: '换一本也很好' },
    });
    expect(conflict.statusCode).toBe(200);
    expect(conflict.json().data.note).toBe('换一本也很好');
    const clearNote = await app.inject({
      method: 'PATCH',
      url: `/api/v1/families/${familyId}/tasks/${taskId}`,
      headers: auth,
      payload: { id: createUlid(), note: null },
    });
    expect(clearNote.statusCode).toBe(200);
    expect(clearNote.json().data.id).toBe(taskId);
    expect(clearNote.json().data.note).toBeNull();
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/families/${familyId}/tasks/${taskId}`,
      headers: { ...auth, 'if-match': '"v1"' },
      payload: { title: '旧版本' },
    });
    expect(stale.statusCode).toBe(409);
    const completed = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks/${taskId}/complete`,
      headers: auth,
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().data.completedAt).toBeTypeOf('number');
    expect(completed.json().data.version).toBe(4);
    const repeatedCompletion = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks/${taskId}/complete`,
      headers: auth,
    });
    expect(repeatedCompletion.statusCode).toBe(200);
    expect(repeatedCompletion.json().data.version).toBe(4);
    const staleCompletion = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks/${taskId}/complete`,
      headers: { ...auth, 'if-match': '"v2"' },
    });
    expect(staleCompletion.statusCode).toBe(409);
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/families/${familyId}/tasks/${taskId}`,
      headers: auth,
    });
    expect(deleted.statusCode).toBe(200);
    const deletedRow = await app.db
      .select({ status: familyTasks.status, deletedAt: familyTasks.deletedAt })
      .from(familyTasks)
      .where(eq(familyTasks.id, taskId))
      .limit(1);
    expect(deletedRow[0]?.status).toBe('DELETED');
    expect(deletedRow[0]?.deletedAt).toBeTypeOf('number');
    const deletedAgain = await app.inject({ method: 'DELETE', url: `/api/v1/families/${familyId}/tasks/${taskId}`, headers: auth });
    expect(deletedAgain.statusCode).toBe(404);
    const remaining = await app.inject({
      method: 'GET',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: auth,
    });
    expect(remaining.json().data.items).toHaveLength(0);
    await app.close();
  });
  it('rejects expired and reused invites and cross-family management', async () => {
    const app = await buildApp();
    const headers = { 'x-client-platform': 'WEAPP' };
    const register = async (name: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { ...headers, 'idempotency-key': createUlid() },
        payload: {
          username: `m10_${createUlid().slice(-8)}`,
          password: 'password123',
          nickname: name,
        },
      });
      expect(response.statusCode).toBe(201);
      return {
        token: response.json().data.session.token as string,
        userId: response.json().data.user.id as string,
      };
    };
    const owner = await register('创建者');
    const other = await register('另一家人');
    const ownerAuth = { ...headers, authorization: `Bearer ${owner.token}` };
    const otherAuth = { ...headers, authorization: `Bearer ${other.token}` };
    const family = await app.inject({
      method: 'POST',
      url: '/api/v1/families',
      headers: { ...ownerAuth, 'idempotency-key': createUlid() },
      payload: {
        name: '邀请测试家',
        timezoneName: 'Asia/Shanghai',
        relationship: 'MOM',
      },
    });
    const familyId = family.json().data.id as string;
    const invite = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: ownerAuth,
      payload: { expiresInHours: 1 },
    });
    const token = invite.json().data.token as string;
    const inviteId = invite.json().data.id as string;
    await app.db
      .update(familyInvites)
      .set({ expiresAt: Date.now() - 1 })
      .where(eq(familyInvites.id, inviteId));
    const expired = await app.inject({
      method: 'POST',
      url: `/api/v1/family-invites/${token}/accept`,
      headers: otherAuth,
      payload: { relationship: 'DAD' },
    });
    expect(expired.statusCode).toBe(410);
    const secondInvite = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: ownerAuth,
      payload: { expiresInHours: 1 },
    });
    const secondToken = secondInvite.json().data.token as string;
    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/family-invites/${secondToken}/accept`,
      headers: otherAuth,
      payload: { relationship: 'DAD' },
    });
    expect(accepted.statusCode).toBe(200);
    const reused = await app.inject({
      method: 'POST',
      url: `/api/v1/family-invites/${secondToken}/accept`,
      headers: ownerAuth,
      payload: { relationship: 'DAD' },
    });
    expect(reused.statusCode).toBe(410);
    const member = await app.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.userId, other.userId))
      .limit(1);
    const crossFamily = await app.inject({
      method: 'POST',
      url: `/api/v1/families/01J00000000000000000000000/members/${member[0]!.id}/disable`,
      headers: ownerAuth,
    });
    expect(crossFamily.statusCode).toBe(403);
    const disabled = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/members/${member[0]!.id}/disable`,
      headers: ownerAuth,
    });
    expect(disabled.statusCode).toBe(200);
    const blockedWhileDisabled = await app.inject({
      method: 'GET',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: otherAuth,
    });
    expect(blockedWhileDisabled.statusCode).toBe(403);
    const restored = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/members/${member[0]!.id}/restore`,
      headers: ownerAuth,
    });
    expect(restored.statusCode).toBe(200);
    const allowedAfterRestore = await app.inject({
      method: 'GET',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: otherAuth,
    });
    expect(allowedAfterRestore.statusCode).toBe(200);
    const stranger = await register('另一个小家的人');
    const strangerAuth = { ...headers, authorization: `Bearer ${stranger.token}` };
    const foreignFamily = await app.inject({
      method: 'POST',
      url: '/api/v1/families',
      headers: { ...strangerAuth, 'idempotency-key': createUlid() },
      payload: { name: '另一家', timezoneName: 'Asia/Shanghai', relationship: 'DAD' },
    });
    const foreignFamilyId = foreignFamily.json().data.id as string;
    const foreignTask = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${foreignFamilyId}/tasks`,
      headers: strangerAuth,
      payload: { title: '不应跨家复用' },
    });
    const duplicateForeignTask = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: ownerAuth,
      payload: { id: foreignTask.json().data.id, title: '跨家任务' },
    });
    expect(duplicateForeignTask.statusCode).toBe(403);
    const foreignAssignee = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/tasks`,
      headers: ownerAuth,
      payload: { title: '负责人边界' },
    });
    const invalidAssignee = await app.inject({
      method: 'PATCH',
      url: `/api/v1/families/${familyId}/tasks/${foreignAssignee.json().data.id}`,
      headers: ownerAuth,
      payload: { assignedTo: stranger.userId },
    });
    expect(invalidAssignee.statusCode).toBe(403);
    await app.close();
  });
  it('supports anniversary CRUD and family-scoped achievement detail', async () => {
    const app = await buildApp();
    const headers = { 'x-client-platform': 'WEAPP' };
    const registered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...headers, 'idempotency-key': createUlid() },
      payload: { username: `m10_${createUlid().slice(-8)}`, password: 'password123', nickname: '家人' },
    });
    const auth = { ...headers, authorization: `Bearer ${registered.json().data.session.token as string}` };
    const family = await app.inject({
      method: 'POST',
      url: '/api/v1/families',
      headers: { ...auth, 'idempotency-key': createUlid() },
      payload: { name: '纪念日小家', timezoneName: 'Asia/Shanghai', relationship: 'MOM' },
    });
    const familyId = family.json().data.id as string;
    const anniversary = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/anniversaries`,
      headers: auth,
      payload: { title: '第一次见面', date: '2024-05-20' },
    });
    expect(anniversary.statusCode).toBe(201);
    const invalidAnniversary = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/anniversaries`,
      headers: auth,
      payload: { title: '不存在的日期', date: '2024-02-30' },
    });
    expect(invalidAnniversary.statusCode).toBe(400);
    const anniversaryId = anniversary.json().data.id as string;
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/families/${familyId}/anniversaries/${anniversaryId}`,
      headers: auth,
      payload: { title: '第一次一起旅行' },
    });
    expect(updated.json().data.title).toBe('第一次一起旅行');
    const deleted = await app.inject({ method: 'DELETE', url: `/api/v1/families/${familyId}/anniversaries/${anniversaryId}`, headers: auth });
    expect(deleted.statusCode).toBe(200);
    const deletedAgain = await app.inject({ method: 'DELETE', url: `/api/v1/families/${familyId}/anniversaries/${anniversaryId}`, headers: auth });
    expect(deletedAgain.statusCode).toBe(404);
    const createdAchievement = await app.inject({ method: 'POST', url: `/api/v1/families/${familyId}/achievements`, headers: auth, payload: { title: '一起完成', emoji: '🌱', description: '共同记录' } });
    expect(createdAchievement.statusCode).toBe(201);
    const achievementId = createdAchievement.json().data.id as string;
    const detail = await app.inject({ method: 'GET', url: `/api/v1/families/${familyId}/achievements/${achievementId}`, headers: auth });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.description).toBe('共同记录');
    expect(detail.json().data).not.toHaveProperty('mom_score');
    expect(detail.json().data).not.toHaveProperty('dad_score');
    expect(detail.json().data).not.toHaveProperty('contribution_rank');
    const wrongFamilyDetail = await app.inject({ method: 'GET', url: `/api/v1/families/01J00000000000000000000000/achievements/${achievementId}`, headers: auth });
    expect(wrongFamilyDetail.statusCode).toBe(403);
    const wrongFamilyGrant = await app.inject({ method: 'POST', url: `/api/v1/families/01J00000000000000000000000/achievements/${achievementId}/grant`, headers: auth });
    expect(wrongFamilyGrant.statusCode).toBe(403);
    const grant = await app.inject({ method: 'POST', url: `/api/v1/families/${familyId}/achievements/${achievementId}/grant`, headers: auth });
    expect(grant.statusCode).toBe(201);
    const grantAgain = await app.inject({ method: 'POST', url: `/api/v1/families/${familyId}/achievements/${achievementId}/grant`, headers: auth });
    expect(grantAgain.statusCode).toBe(200);
    await app.close();
  });
});
