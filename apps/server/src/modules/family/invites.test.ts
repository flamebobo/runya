import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { familyInvites, familyMembers, idempotencyKeys, users } from '@runew/db';
import { createUlid } from '@runew/shared-utils';
import { buildApp } from '../../app.js';
import {
  acceptFamilyInvite,
  createFamily,
  createFamilyInvite,
  createSessionForUser,
} from '../identity/service.js';
import { hashInviteToken } from '../../lib/crypto.js';

describe('M10 invitation and membership boundaries', () => {
  let app: FastifyInstance;
  let dir: string;
  let owner: string;
  let familyId: string;
  const clients: FastifyInstance[] = [];
  const previousPath = process.env.DATABASE_PATH;

  async function newUser() {
    const id = createUlid();
    await app.db
      .insert(users)
      .values({ id, nickname: '家人', createdAt: Date.now(), updatedAt: Date.now() });
    return id;
  }
  async function auth(userId: string) {
    const session = await createSessionForUser(app.db, userId, 'WEAPP', {});
    return {
      'x-client-platform': 'WEAPP',
      authorization: `Bearer ${session.session.token}`,
    };
  }
  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-invite-'));
    process.env.DATABASE_PATH = path.join(dir, 'test.db');
    process.env.LOG_LEVEL = 'silent';
    app = await buildApp();
    owner = await newUser();
    familyId = (
      await createFamily(app.db, owner, {
        name: '我们的小家',
        relationship: 'MOM',
        timezoneName: 'Asia/Shanghai',
      })
    ).id;
  });
  afterEach(async () => {
    for (const client of clients.splice(0)) await client.close();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
  });

  it('stores only a token hash and consumes an invitation once', async () => {
    const invite = await createFamilyInvite(app.db, owner, familyId);
    const [stored] = await app.db
      .select()
      .from(familyInvites)
      .where(eq(familyInvites.id, invite.id));
    expect(stored?.tokenHash).toBe(hashInviteToken(invite.token));
    expect(JSON.stringify(stored)).not.toContain(invite.token);
    expect(stored?.usedAt).toBeNull();
    const user = await newUser();
    await acceptFamilyInvite(app.db, user, invite.token, 'DAD');
    await expect(
      acceptFamilyInvite(app.db, await newUser(), invite.token, 'OTHER'),
    ).rejects.toMatchObject({ code: 'GONE' });
    const [used] = await app.db
      .select()
      .from(familyInvites)
      .where(eq(familyInvites.id, invite.id));
    expect(used?.usedBy).toBe(user);
    expect(used?.usedAt).toBeTypeOf('number');
  });

  it('makes invite creation retry-safe with an idempotency key', async () => {
    const headers = await auth(owner);
    const key = createUlid();
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: { ...headers, 'idempotency-key': key },
      payload: { expiresInHours: 24 },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: { ...headers, 'idempotency-key': key },
      payload: { expiresInHours: 24 },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(second.json().data.token).toBe(first.json().data.token);
    const reusedForDifferentPayload = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: { ...headers, 'idempotency-key': key },
      payload: { expiresInHours: 48 },
    });
    expect(reusedForDifferentPayload.statusCode).toBe(409);
    const cached = await app.db.select().from(idempotencyKeys);
    expect(JSON.stringify(cached)).not.toContain(first.json().data.token);
  });

  it('does not replay an invite after its creating member is disabled', async () => {
    const member = await newUser();
    const invite = await createFamilyInvite(app.db, owner, familyId);
    await acceptFamilyInvite(app.db, member, invite.token, 'DAD');
    const memberRow = (
      await app.db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, member)))
    )[0]!;
    const memberHeaders = await auth(member);
    const ownerHeaders = await auth(owner);
    const key = createUlid();
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: { ...memberHeaders, 'idempotency-key': key },
      payload: { expiresInHours: 24 },
    });
    expect(first.statusCode).toBe(201);
    expect(
      (await app.inject({
        method: 'POST',
        url: `/api/v1/families/${familyId}/members/${memberRow.id}/disable`,
        headers: ownerHeaders,
      })).statusCode,
    ).toBe(200);
    const replay = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: { ...memberHeaders, 'idempotency-key': key },
      payload: { expiresInHours: 24 },
    });
    expect(replay.statusCode).toBe(403);
  });

  it('creates one invite for concurrent retries with the same key', async () => {
    const headers = await auth(owner);
    const key = createUlid();
    const responses = await Promise.all([
      app.inject({ method: 'POST', url: `/api/v1/families/${familyId}/invites`, headers: { ...headers, 'idempotency-key': key }, payload: { expiresInHours: 24 } }),
      app.inject({ method: 'POST', url: `/api/v1/families/${familyId}/invites`, headers: { ...headers, 'idempotency-key': key }, payload: { expiresInHours: 24 } }),
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([201, 201]);
    expect(responses[0].json().data.id).toBe(responses[1].json().data.id);
    const invites = await app.db.select().from(familyInvites);
    expect(invites).toHaveLength(1);
  });

  it('does not consume an invite or restore a disabled membership through joining', async () => {
    const user = await newUser();
    const original = await createFamilyInvite(app.db, owner, familyId);
    await acceptFamilyInvite(app.db, user, original.token, 'DAD');
    await app.db
      .update(familyMembers)
      .set({ status: 'DISABLED' })
      .where(eq(familyMembers.userId, user));
    const invite = await createFamilyInvite(app.db, owner, familyId);
    await expect(
      acceptFamilyInvite(app.db, user, invite.token, 'DAD'),
    ).rejects.toMatchObject({ code: 'FAMILY_ACCESS_DENIED' });
    const [stored] = await app.db
      .select()
      .from(familyInvites)
      .where(eq(familyInvites.id, invite.id));
    expect(stored?.usedAt).toBeNull();
  });

  it('allows only one concurrent invitation acceptance across database connections', async () => {
    const invite = await createFamilyInvite(app.db, owner, familyId);
    const first = await newUser();
    const second = await newUser();
    const other = await buildApp();
    clients.push(other);
    const results = await Promise.allSettled([
      acceptFamilyInvite(app.db, first, invite.token, 'DAD'),
      acceptFamilyInvite(other.db, second, invite.token, 'OTHER'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({
      code: 'GONE',
    });
    const members = await app.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.familyId, familyId));
    expect(members).toHaveLength(2);
  });

  it('revokes access immediately and restores it only through the owner endpoint', async () => {
    const user = await newUser();
    const invite = await createFamilyInvite(app.db, owner, familyId);
    await acceptFamilyInvite(app.db, user, invite.token, 'DAD');
    const member = (
      await app.db
        .select()
        .from(familyMembers)
        .where(
          and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, user)),
        )
    )[0]!;
    const ownerHeaders = await auth(owner);
    const memberHeaders = await auth(user);
    const base = `/api/v1/families/${familyId}`;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${base}/members/${member.id}/disable`,
          headers: memberHeaders,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${base}/members/${member.id}/disable`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    for (const resource of ['members', 'tasks', 'anniversaries', 'achievements']) {
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `${base}/${resource}`,
            headers: memberHeaders,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${base}/members/${member.id}/restore`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `${base}/tasks`,
          headers: memberHeaders,
        })
      ).statusCode,
    ).toBe(200);
  });

  it('allows owner permission edits while rejecting member and cross-family targets', async () => {
    const user = await newUser();
    const invite = await createFamilyInvite(app.db, owner, familyId);
    await acceptFamilyInvite(app.db, user, invite.token, 'DAD');
    const member = (
      await app.db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, user)))
    )[0]!;
    const ownerHeaders = await auth(owner);
    const memberHeaders = await auth(user);
    const base = `/api/v1/families/${familyId}`;
    const permissions = [
      { resource: 'memories', action: 'VIEW', effect: 'ALLOW' as const },
      { resource: 'health', action: 'VIEW', effect: 'DENY' as const },
    ];
    const updated = await app.inject({
      method: 'PATCH',
      url: `${base}/members/${member.id}/permissions`,
      headers: ownerHeaders,
      payload: { permissions },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.permissions).toEqual(permissions);
    const detail = await app.inject({
      method: 'GET',
      url: `${base}/members/${member.id}`,
      headers: ownerHeaders,
    });
    expect(
      detail.json().data.permissions.map(
        (permission: { resource: string; action: string; effect: string }) => ({
          resource: permission.resource,
          action: permission.action,
          effect: permission.effect,
        }),
      ),
    ).toEqual(expect.arrayContaining(permissions));
    const memberAttempt = await app.inject({
      method: 'PATCH',
      url: `${base}/members/${member.id}/permissions`,
      headers: memberHeaders,
      payload: { permissions: [] },
    });
    expect(memberAttempt.statusCode).toBe(403);
    const foreignOwner = await newUser();
    const foreignFamily = await createFamily(app.db, foreignOwner, {
      name: '另一个小家',
      relationship: 'MOM',
      timezoneName: 'Asia/Shanghai',
    });
    const foreignMember = (
      await app.db
        .select()
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.familyId, foreignFamily.id),
            eq(familyMembers.userId, foreignOwner),
          ),
        )
    )[0]!;
    const crossFamilyAttempt = await app.inject({
      method: 'PATCH',
      url: `${base}/members/${foreignMember.id}/permissions`,
      headers: ownerHeaders,
      payload: { permissions: [] },
    });
    expect(crossFamilyAttempt.statusCode).toBe(404);
  });

  it('enforces an explicit family VIEW denial on reads and writes', async () => {
    const user = await newUser();
    const invite = await createFamilyInvite(app.db, owner, familyId);
    await acceptFamilyInvite(app.db, user, invite.token, 'DAD');
    const member = (
      await app.db
        .select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, user)))
    )[0]!;
    const ownerHeaders = await auth(owner);
    const memberHeaders = await auth(user);
    const base = `/api/v1/families/${familyId}`;
    const created = await app.inject({
      method: 'POST',
      url: `${base}/tasks`,
      headers: ownerHeaders,
      payload: { title: '一起散步' },
    });
    expect(created.statusCode).toBe(201);
    const updated = await app.inject({
      method: 'PATCH',
      url: `${base}/members/${member.id}/permissions`,
      headers: ownerHeaders,
      payload: {
        permissions: [
          { resource: 'family', action: 'VIEW', effect: 'DENY' },
          { resource: 'family', action: 'CREATE', effect: 'DENY' },
          { resource: 'family', action: 'MANAGE', effect: 'DENY' },
        ],
      },
    });
    expect(updated.statusCode).toBe(200);
    const inviteDenied = await app.inject({
      method: 'POST',
      url: `${base}/invites`,
      headers: memberHeaders,
      payload: { expiresInHours: 24 },
    });
    expect(inviteDenied.statusCode).toBe(403);

    for (const request of [
      { method: 'GET' as const, url: `${base}/tasks` },
      { method: 'GET' as const, url: `${base}/members` },
      { method: 'POST' as const, url: `${base}/tasks`, payload: { title: '不应写入' } },
    ]) {
      expect(
        (await app.inject({ ...request, headers: memberHeaders })).statusCode,
      ).toBe(403);
    }

    const restored = await app.inject({
      method: 'PATCH',
      url: `${base}/members/${member.id}/permissions`,
      headers: ownerHeaders,
      payload: { permissions: [] },
    });
    expect(restored.statusCode).toBe(200);
    expect(
      (
        await app.inject({ method: 'GET', url: `${base}/tasks`, headers: memberHeaders })
      ).statusCode,
    ).toBe(200);
  });
});
