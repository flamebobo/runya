import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mediaFiles, runMigrations } from '@runew/db';
import { createUlid } from '@runew/shared-utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS, buildApp } from '../../app.js';

const WEAPP_HEADERS = { 'x-client-platform': 'WEAPP' };

/**
 * M8 安全边界（AGENTS §35 / §36 / §66）：
 * 妈妈的 PRIVATE 日记与心情，其他家庭成员（含 DAD / family ADMIN 角色）
 * 必须：List 看不到、直连 API 拿不到（按不存在 404，防 IDOR 探测）。
 * 靠前端隐藏 = M8 NOT READY；这些测试就是防回归的硬门槛。
 */
describe('Mom Space PRIVATE boundary (M8)', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let momHeaders: Record<string, string>;
  let dadHeaders: Record<string, string>;
  let familyId: string;
  let privateDiaryId: string;
  let familyDiaryId: string;
  let privateDiaryMediaId: string;
  let moodId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-mom-test-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);

    app = await buildApp();

    // --- 妈妈（owner）---
    const momRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `mom_${Date.now()}`,
        password: 'Password123!',
        displayName: '润润妈妈',
      },
    });
    expect(momRegister.statusCode).toBe(201);
    momHeaders = {
      ...WEAPP_HEADERS,
      authorization: `Bearer ${momRegister.json().data.session.token as string}`,
    };
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: { ...momHeaders, 'idempotency-key': createUlid() },
      payload: {
        relationship: 'MOM',
        baby: { name: '润润', birthday: '2026-01-16' },
        topics: [],
      },
    });
    expect(onboarding.statusCode).toBe(200);
    familyId = onboarding.json().data.family.id as string;

    // --- 爸爸（同家庭成员）---
    const dadRegister = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `dad_${Date.now()}`,
        password: 'Password123!',
        displayName: '润润爸爸',
      },
    });
    dadHeaders = {
      ...WEAPP_HEADERS,
      authorization: `Bearer ${dadRegister.json().data.session.token as string}`,
    };
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/families/${familyId}/invites`,
      headers: { ...momHeaders, 'idempotency-key': createUlid() },
      payload: { relationshipHint: 'DAD' },
    });
    expect(inviteRes.statusCode).toBe(201);
    const inviteToken = inviteRes.json().data.token as string;
    const acceptRes = await app.inject({
      method: 'POST',
      url: `/api/v1/family-invites/${inviteToken}/accept`,
      headers: { ...dadHeaders, 'idempotency-key': createUlid() },
      payload: { relationship: 'DAD' },
    });
    expect(acceptRes.statusCode).toBe(200);

    // --- 妈妈写 PRIVATE 日记 + FAMILY 日记 + 心情 ---
    const privateDiary = await app.inject({
      method: 'POST',
      url: '/api/v1/mom/diaries',
      headers: { ...momHeaders, 'idempotency-key': createUlid() },
      payload: {
        title: '深夜心事',
        body: '只有我自己知道的话',
        visibility: 'PRIVATE',
        recordedAt: Date.now(),
      },
    });
    expect(privateDiary.statusCode).toBe(200);
    privateDiaryId = privateDiary.json().data.id as string;

    privateDiaryMediaId = createUlid();
    const now = Date.now();
    await app.db.insert(mediaFiles).values({
      id: privateDiaryMediaId,
      familyId,
      ownerUserId: momRegister.json().data.user.id as string,
      mediaType: 'IMAGE',
      status: 'READY',
      mimeType: 'image/png',
      originalFilename: 'private-diary.png',
      sizeBytes: 1,
      sha256: '0'.repeat(64),
      keepOriginal: true,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    const attachPrivateMedia = await app.inject({
      method: 'PATCH',
      url: `/api/v1/mom/diaries/${privateDiaryId}`,
      headers: momHeaders,
      payload: { mediaIds: [privateDiaryMediaId] },
    });
    expect(attachPrivateMedia.statusCode).toBe(200);

    const familyDiary = await app.inject({
      method: 'POST',
      url: '/api/v1/mom/diaries',
      headers: { ...momHeaders, 'idempotency-key': createUlid() },
      payload: {
        title: '一家人的一天',
        body: '这条家人可以看',
        visibility: 'FAMILY',
        recordedAt: Date.now(),
      },
    });
    expect(familyDiary.statusCode).toBe(200);
    familyDiaryId = familyDiary.json().data.id as string;

    const mood = await app.inject({
      method: 'POST',
      url: '/api/v1/mom/moods',
      headers: { ...momHeaders, 'idempotency-key': createUlid() },
      payload: {
        mood: 'TIRED',
        note: '今天有点累',
        recordedAt: Date.now(),
      },
    });
    expect(mood.statusCode).toBe(200);
    moodId = mood.json().data.id as string;
  });

  afterAll(async () => {
    await app.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore Windows temp file lock
    }
  });

  it('mom sees her PRIVATE diary in her own list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/mom/diaries',
      headers: momHeaders,
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().data as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(privateDiaryId);
  });

  it('dad list hides mom PRIVATE diary and includes FAMILY diary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/mom/diaries',
      headers: dadHeaders,
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{ id: string; body: string }>;
    const ids = data.map((item) => item.id);
    expect(ids).not.toContain(privateDiaryId);
    expect(ids).toContain(familyDiaryId);
    // 响应任何位置都不能出现 PRIVATE 正文（先返回再前端隐藏 = 违规）。
    expect(JSON.stringify(data)).not.toContain('只有我自己知道的话');
  });

  it('dad direct GET on PRIVATE diary → 404 (anti-IDOR)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mom/diaries/${privateDiaryId}`,
      headers: dadHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain('只有我自己知道的话');
  });

  it('dad can read a FAMILY diary in the active family', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mom/diaries/${familyDiaryId}`,
      headers: dadHeaders,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(familyDiaryId);
    expect(res.json().data.body).toBe('这条家人可以看');
  });

  it('dad cannot edit a FAMILY diary owned by mom', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/mom/diaries/${familyDiaryId}`,
      headers: dadHeaders,
      payload: { body: '越权修改' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('search keeps PRIVATE diary IDs and text invisible but returns FAMILY diary', async () => {
    const dadPrivateSearch = await app.inject({
      method: 'GET',
      url: '/api/v1/mom/diaries/search?q=%E5%8F%AA%E6%9C%89%E6%88%91%E8%87%AA%E5%B7%B1',
      headers: dadHeaders,
    });
    expect(dadPrivateSearch.statusCode).toBe(200);
    expect(dadPrivateSearch.json().data).toEqual([]);
    expect(JSON.stringify(dadPrivateSearch.json())).not.toContain(privateDiaryId);
    expect(JSON.stringify(dadPrivateSearch.json())).not.toContain('只有我自己知道的话');

    const dadFamilySearch = await app.inject({
      method: 'GET',
      url: '/api/v1/mom/diaries/search?q=%E4%B8%80%E5%AE%B6%E4%BA%BA',
      headers: dadHeaders,
    });
    expect(dadFamilySearch.statusCode).toBe(200);
    expect((dadFamilySearch.json().data as Array<{ id: string }>).map((item) => item.id))
      .toContain(familyDiaryId);
  });

  it('dad cannot fetch media attached to a PRIVATE diary', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/media/${privateDiaryMediaId}/content`,
      headers: dadHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain(privateDiaryMediaId);
  });

  it('logger configuration redacts private diary body fields', () => {
    expect(LOG_REDACT_PATHS).toEqual(expect.arrayContaining([
      'req.body.body',
      'req.body.note',
      'req.body.title',
    ]));
  });

  it('dad direct PATCH on PRIVATE diary → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/mom/diaries/${privateDiaryId}`,
      headers: dadHeaders,
      payload: { body: '篡改尝试' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('dad direct DELETE on PRIVATE diary → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/mom/diaries/${privateDiaryId}`,
      headers: dadHeaders,
    });
    expect(res.statusCode).toBe(404);
  });

  it('dad summary/mood-calendar/moods never include mom mood note', async () => {
    const summary = await app.inject({
      method: 'GET',
      url: '/api/v1/mom/summary',
      headers: dadHeaders,
    });
    expect(summary.statusCode).toBe(200);
    expect(JSON.stringify(summary.json())).not.toContain('今天有点累');

    const moods = await app.inject({
      method: 'GET',
      url: '/api/v1/mom/moods',
      headers: dadHeaders,
    });
    expect(moods.statusCode).toBe(200);
    const items = moods.json().data as Array<{ id: string }>;
    expect(items.map((item) => item.id)).not.toContain(moodId);
    expect(JSON.stringify(items)).not.toContain('今天有点累');
  });

  it('dad cannot patch/delete mom mood (anti-IDOR)', async () => {
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/mom/moods/${moodId}`,
      headers: dadHeaders,
      payload: { mood: 'GREAT' },
    });
    expect(patch.statusCode).toBe(404);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/mom/moods/${moodId}`,
      headers: dadHeaders,
    });
    expect(del.statusCode).toBe(404);
  });

  it('If-Match version conflict on diary update → ENTITY_VERSION_CONFLICT (draft safety)', async () => {
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/mom/diaries/${familyDiaryId}`,
      headers: momHeaders,
    });
    const version = (getRes.json().data as { version: number }).version;

    // 先用当前版本成功更新一次 → version 递增。
    const fresh = await app.inject({
      method: 'PATCH',
      url: `/api/v1/mom/diaries/${familyDiaryId}`,
      headers: { ...momHeaders, 'if-match': `"v${version}"` },
      payload: { body: '基于最新版本的修改' },
    });
    expect(fresh.statusCode).toBe(200);
    expect((fresh.json().data as { version: number }).version).toBe(version + 1);

    // 再用旧版本（stale draft 的 baseVersion）发起 If-Match → 必须拒绝。
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/mom/diaries/${familyDiaryId}`,
      headers: { ...momHeaders, 'if-match': `"v${version}"` },
      payload: { body: '基于旧版本的修改' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('ENTITY_VERSION_CONFLICT');
  });

  it('mood calendar returns only own moods keyed by local date', async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/mom/mood-calendar?month=${month}`,
      headers: momHeaders,
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as { month: string; days: Array<{ moods: Array<{ mood: string }> }> };
    expect(data.month).toBe(month);
    const allMoods = data.days.flatMap((day) => day.moods);
    expect(allMoods.some((mood) => mood.mood === 'TIRED')).toBe(true);
  });

  it('soft-deleted diary can be restored by owner within trash window', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/mom/diaries',
      headers: { ...momHeaders, 'idempotency-key': createUlid() },
      payload: {
        title: '待删除',
        body: '删了又找回',
        recordedAt: Date.now(),
      },
    });
    const id = createRes.json().data.id as string;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/mom/diaries/${id}`,
      headers: momHeaders,
    });
    expect(delRes.statusCode).toBe(200);

    const restoreRes = await app.inject({
      method: 'POST',
      url: `/api/v1/mom/diaries/${id}/restore`,
      headers: momHeaders,
    });
    expect(restoreRes.statusCode).toBe(200);
    expect(restoreRes.json().data.deletedAt ?? null).toBeNull();
  });
});
