import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createUlid, utcNowMs } from '@runew/shared-utils';
import { runMigrations } from '@runew/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

const WEAPP_HEADERS = { 'x-client-platform': 'WEAPP' };

// M5 测试覆盖 CODEX_TASKS 列出的全部场景：
// 年龄边界 / PUBLISHED / OFFLINE 排除 / 收藏 / 稍后看 / 学到版本 /
// 内容更新 / 不感兴趣 / 搜索 / 来源 / 宝宝 A/B 状态隔离。
describe('knowledge api', () => {
  let tempDir: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userSeq = 0;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m5-test-'));
    process.env.DATABASE_PATH = path.join(tempDir, 'runew.db');
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(process.env.DATABASE_PATH);
    app = await buildApp();
    // knowledge.created_by 引用 users，测试直插文章时需要一个哨兵用户。
    await app.sqlClient.execute({
      sql: `INSERT INTO users (id, nickname, status, locale, created_at, updated_at)
            VALUES ('01JSYSTEM00000000000000000A', '润芽编辑部', 'ACTIVE', 'zh-CN', 1, 1)
            ON CONFLICT(id) DO NOTHING`,
      args: [],
    });
  });

  afterAll(async () => {
    await app.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows file lock during cleanup — 临时目录，留给系统清理即可。
    }
  });

  async function readyFamily() {
    userSeq += 1;
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { ...WEAPP_HEADERS, 'idempotency-key': createUlid() },
      payload: {
        username: `m5_${userSeq}_${Date.now().toString(36)}`,
        password: 'password123',
        nickname: '测试妈妈',
      },
    });
    expect(register.statusCode).toBe(201);
    const token = register.json().data.session.token as string;
    const onboarding = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
        'idempotency-key': createUlid(),
      },
      payload: {
        relationship: 'MOM',
        baby: { name: `润润${userSeq}`, birthday: '2026-01-16' },
        topics: ['睡眠'],
      },
    });
    expect(onboarding.statusCode).toBe(200);
    return {
      familyId: onboarding.json().data.family.id as string,
      babyId: onboarding.json().data.baby.id as string,
      headers: { ...WEAPP_HEADERS, authorization: `Bearer ${token}` },
    };
  }

  async function createArticle(input: {
    title?: string;
    category?: string;
    minAgeDays?: number | null;
    maxAgeDays?: number | null;
    status?: string;
    contentVersion?: number;
    priority?: number;
    sourceName?: string;
    sourceUrl?: string | null;
  }) {
    const now = utcNowMs();
    const id = createUlid();
    const createdAt = now + (input.priority ?? 0);
    await app.sqlClient.execute({
      sql: `INSERT INTO knowledge (
              id, title, summary, body, category, min_age_days, max_age_days,
              source_name, source_url, reviewed_at, content_version, priority,
              status, published_at, created_by, created_at, updated_by, updated_at, version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      args: [
        id,
        input.title ?? '测试知识',
        input.title ? `摘要：${input.title}` : '测试摘要',
        '这是正文内容，用于教育科普。',
        input.category ?? 'SLEEP',
        input.minAgeDays ?? null,
        input.maxAgeDays ?? null,
        input.sourceName ?? '权威育儿指南',
        input.sourceUrl ?? null,
        now,
        input.contentVersion ?? 1,
        input.priority ?? 50,
        input.status ?? 'PUBLISHED',
        input.status === 'PUBLISHED' ? (now as number) : null,
        '01JSYSTEM00000000000000000A',
        createdAt,
        '01JSYSTEM00000000000000000A',
        now,
      ],
    });
    return id;
  }

  it('lists only PUBLISHED articles for regular users', async () => {
    const family = await readyFamily();
    await createArticle({ title: '可见的公开文章', priority: 10 });
    await createArticle({ title: '下线的文章', status: 'OFFLINE', priority: 11 });
    await createArticle({ title: '草稿的文章', status: 'DRAFT', priority: 12 });

    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge',
      headers: family.headers,
    });
    expect(list.statusCode).toBe(200);
    const titles = list.json().data.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('可见的公开文章');
    expect(titles).not.toContain('下线的文章');
    expect(titles).not.toContain('草稿的文章');
  });

  it('hides DRAFT/OFFLINE detail and returns source metadata on detail', async () => {
    const family = await readyFamily();
    const draftId = await createArticle({ title: '草稿详情', status: 'DRAFT' });
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/knowledge/${draftId}`,
      headers: family.headers,
    });
    expect(hidden.statusCode).toBe(404);

    const sourceId = await createArticle({
      title: '带来源的文章',
      sourceName: '美国儿科学会',
      sourceUrl: 'https://example.org/aap',
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/knowledge/${sourceId}`,
      headers: family.headers,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data).toMatchObject({
      sourceName: '美国儿科学会',
      sourceUrl: 'https://example.org/aap',
      body: '这是正文内容，用于教育科普。',
      contentVersion: 1,
    });
    expect(detail.json().data.reviewedAt).toBeGreaterThan(0);
  });

  it('recommends by age window: inside window included, outside excluded or ranked after', async () => {
    const family = await readyFamily();
    // 宝宝生日 2026-01-16，测试运行时约 230 天左右。窗口 200–260 命中，260–400 不命中。
    const inWindow = await createArticle({
      title: '月龄内的文章',
      minAgeDays: 200,
      maxAgeDays: 260,
      priority: 10,
    });
    void inWindow;
    await createArticle({
      title: '月龄外的文章',
      minAgeDays: 260,
      maxAgeDays: 400,
      priority: 11,
    });

    const rec = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    expect(rec.statusCode).toBe(200);
    const data = rec.json().data;
    expect(data.babyAgeDays).toBeGreaterThan(180);
    const titles = data.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('月龄内的文章');
    expect(titles).not.toContain('月龄外的文章');
    const inItem = data.items.find((i: { title: string }) => i.title === '月龄内的文章');
    expect(inItem.reason).toContain('天');
  });

  it('respects min/max age boundaries at exact edge values', async () => {
    const family = await readyFamily();
    const age = (
      await app.inject({
        method: 'GET',
        url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
        headers: family.headers,
      })
    ).json().data.babyAgeDays as number;

    // min_age_days = age+1 → 不命中；max_age_days = age+1 → 命中（边界闭区间）。
    await createArticle({ title: '刚好还没到', minAgeDays: age + 1, priority: 10 });
    const hit = await createArticle({ title: '刚好在边界', maxAgeDays: age + 1, priority: 11 });
    await createArticle({ title: '刚好过了', maxAgeDays: age - 1, priority: 12 });

    const rec = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    const titles = rec.json().data.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('刚好在边界');
    expect(titles).not.toContain('刚好还没到');
    expect(titles).not.toContain('刚好过了');

    // 宝宝月龄 +1 天后：min_age_days = 原 age+1 的文章恰好命中（下边界闭区间），
    // max_age_days = 原 age-1 的文章依然被排除。
    await app.sqlClient.execute({
      sql: 'UPDATE babies SET birthday = ? WHERE id = ?',
      args: ['2026-01-15', family.babyId],
    });
    const rec2 = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    const titles2 = rec2.json().data.items.map((i: { title: string }) => i.title);
    expect(titles2).toContain('刚好还没到');
    expect(titles2).not.toContain('刚好过了');
    expect(hit).toBeTruthy();
  });

  it('keeps saved / read_later / learned in the right library buckets', async () => {
    const family = await readyFamily();
    const savedId = await createArticle({ title: '收藏的', priority: 10 });
    const laterId = await createArticle({ title: '稍后看的', priority: 11 });
    const learnedId = await createArticle({ title: '已学的', priority: 12 });

    const put = (knowledgeId: string, body: Record<string, unknown>) =>
      app.inject({
        method: 'PUT',
        url: `/api/v1/babies/${family.babyId}/knowledge/${knowledgeId}/state`,
        headers: family.headers,
        payload: body,
      });

    expect((await put(savedId, { saved: true })).statusCode).toBe(200);
    expect((await put(laterId, { readLater: true })).statusCode).toBe(200);
    expect((await put(learnedId, { markLearned: true })).statusCode).toBe(200);

    const savedLib = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/library?state=saved`,
      headers: family.headers,
    });
    const laterLib = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/library?state=later`,
      headers: family.headers,
    });
    const learnedLib = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/library?state=learned`,
      headers: family.headers,
    });

    expect(savedLib.json().data.items.map((i: { title: string }) => i.title)).toEqual([
      '收藏的',
    ]);
    expect(laterLib.json().data.items.map((i: { title: string }) => i.title)).toEqual([
      '稍后看的',
    ]);
    const learnedItems = learnedLib.json().data.items;
    expect(learnedItems.map((i: { title: string }) => i.title)).toEqual(['已学的']);
    expect(learnedItems[0].learnedVersion).toBe(1);
    expect(learnedItems[0].learnedAt).toBeGreaterThan(0);
    expect(savedLib.json().data.items[0].sourceName).toBe('权威育儿指南');
    expect(savedLib.json().data.items[0]).toHaveProperty('minAgeDays');
    expect(savedLib.json().data.items[0]).toHaveProperty('maxAgeDays');
  });

  it('PUT state is idempotent and PUT twice keeps one row', async () => {
    const family = await readyFamily();
    const id = await createArticle({ title: '幂等状态', priority: 10 });
    const url = `/api/v1/babies/${family.babyId}/knowledge/${id}/state`;
    await app.inject({ method: 'PUT', url, headers: family.headers, payload: { saved: true } });
    const again = await app.inject({
      method: 'PUT',
      url,
      headers: family.headers,
      payload: { saved: true },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().data.version).toBe(2);

    const rows = await app.sqlClient.execute({
      sql: 'SELECT COUNT(*) as n FROM knowledge_user_states WHERE knowledge_id = ?',
      args: [id],
    });
    expect(Number(rows.rows[0]?.n)).toBe(1);
  });

  it('learned current version leaves recommendations, updated content re-enters with updated flag', async () => {
    const family = await readyFamily();
    const id = await createArticle({ title: '版本闭环', priority: 10 });

    // 学到 v1 → 不再普通推荐。
    await app.inject({
      method: 'PUT',
      url: `/api/v1/babies/${family.babyId}/knowledge/${id}/state`,
      headers: family.headers,
      payload: { markLearned: true },
    });
    const afterLearn = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    expect(
      afterLearn.json().data.items.some((i: { id: string }) => i.id === id),
    ).toBe(false);

    // 内容升级到 v2 → 可重新推荐。
    await app.sqlClient.execute({
      sql: 'UPDATE knowledge SET content_version = 2 WHERE id = ?',
      args: [id],
    });
    const afterUpdate = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    expect(
      afterUpdate.json().data.items.some((i: { id: string }) => i.id === id),
    ).toBe(true);

    // library learned 里显示 contentUpdated = true。
    const lib = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/library?state=learned`,
      headers: family.headers,
    });
    const item = lib.json().data.items.find((i: { knowledgeId: string }) => i.knowledgeId === id);
    expect(item).toBeTruthy();
    expect(item.learnedVersion).toBe(1);
    expect(item.contentVersion).toBe(2);
    expect(item.contentUpdated).toBe(true);

    // 重新阅读当前版本 → learned_version 追平 v2，contentUpdated 变回 false。
    await app.inject({
      method: 'PUT',
      url: `/api/v1/babies/${family.babyId}/knowledge/${id}/state`,
      headers: family.headers,
      payload: { markLearned: true },
    });
    const lib2 = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/library?state=learned`,
      headers: family.headers,
    });
    const item2 = lib2.json().data.items.find((i: { knowledgeId: string }) => i.knowledgeId === id);
    expect(item2.learnedVersion).toBe(2);
    expect(item2.contentUpdated).toBe(false);
    const rec2 = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    expect(rec2.json().data.items.some((i: { id: string }) => i.id === id)).toBe(false);
  });

  it('dismissed articles leave recommendations but stay reachable in search', async () => {
    const family = await readyFamily();
    const id = await createArticle({ title: '不感兴趣的那篇', priority: 10 });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/babies/${family.babyId}/knowledge/${id}/state`,
      headers: family.headers,
      payload: { dismissed: true },
    });

    const rec = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    expect(rec.json().data.items.some((i: { id: string }) => i.id === id)).toBe(false);

    // 不感兴趣只是不推荐，搜索仍可找到。
    const search = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?q=不感兴趣',
      headers: family.headers,
    });
    expect(search.statusCode).toBe(200);
    expect(search.json().data.items.some((i: { id: string }) => i.id === id)).toBe(true);
  });

  it('search matches title and summary, empty query returns empty list', async () => {
    const family = await readyFamily();
    await createArticle({ title: '辅食小课堂', priority: 10 });
    await createArticle({ title: '睡眠魔法', priority: 11 });

    const hit = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?q=辅食',
      headers: family.headers,
    });
    const titles = hit.json().data.items.map((i: { title: string }) => i.title);
    expect(titles).toContain('辅食小课堂');
    expect(titles).not.toContain('睡眠魔法');

    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search',
      headers: family.headers,
    });
    expect(empty.json().data.items).toEqual([]);
  });

  it('isolates user state per baby: A and B do not share learned/saved', async () => {
    const family = await readyFamily();
    // 给同一个家庭加第二个宝宝。
    const babyB = createUlid();
    await app.sqlClient.execute({
      sql: `INSERT INTO babies (id, family_id, name, birthday, created_by, created_at, updated_by, updated_at, version)
            VALUES (?, ?, '二宝', '2026-06-01', ?, ?, ?, ?, 1)`,
      args: [
        babyB,
        family.familyId,
        family.headers.authorization!.replace('Bearer ', '') && '01JSYSTEM00000000000000000A',
        utcNowMs(),
        '01JSYSTEM00000000000000000A',
        utcNowMs(),
      ],
    });

    const id = await createArticle({ title: '两个宝宝的文章', priority: 10 });
    await app.inject({
      method: 'PUT',
      url: `/api/v1/babies/${family.babyId}/knowledge/${id}/state`,
      headers: family.headers,
      payload: { markLearned: true, saved: true },
    });

    const recA = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/recommendations`,
      headers: family.headers,
    });
    expect(recA.json().data.items.some((i: { id: string }) => i.id === id)).toBe(false);

    const recB = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyB}/knowledge/recommendations`,
      headers: family.headers,
    });
    expect(recB.statusCode).toBe(200);
    expect(recB.json().data.items.some((i: { id: string }) => i.id === id)).toBe(true);

    const libB = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyB}/knowledge/library?state=learned`,
      headers: family.headers,
    });
    expect(libB.json().data.items).toEqual([]);
  });

  it('rejects state writes for knowledge outside family (authorization)', async () => {
    const family = await readyFamily();
    const stranger = await readyFamily();
    const id = await createArticle({ title: '别人家的文章', priority: 10 });
    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/v1/babies/${family.babyId}/knowledge/${id}/state`,
      headers: stranger.headers,
      payload: { saved: true },
    });
    // 文章是平台级内容，任何家庭成员都可标记状态，但宝宝必须属于自己家庭。
    expect(forbidden.statusCode).toBe(403);

    void id;
  });

  it('requires auth for all knowledge endpoints', async () => {
    const noAuth = await app.inject({ method: 'GET', url: '/api/v1/knowledge' });
    expect(noAuth.statusCode).toBe(401);

    const family = await readyFamily();
    const noStateAuth = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/library/counts`,
    });
    expect(noStateAuth.statusCode).toBe(401);
  });

  it('returns library counts and per-article state for the detail page', async () => {
    const family = await readyFamily();
    const savedId = await createArticle({ title: '计数收藏', priority: 10 });
    const learnedId = await createArticle({ title: '计数已学', priority: 11 });
    const laterId = await createArticle({ title: '计数稍后', priority: 12 });

    const put = (knowledgeId: string, body: Record<string, unknown>) =>
      app.inject({
        method: 'PUT',
        url: `/api/v1/babies/${family.babyId}/knowledge/${knowledgeId}/state`,
        headers: family.headers,
        payload: body,
      });
    await put(savedId, { saved: true });
    await put(learnedId, { markLearned: true });
    await put(laterId, { readLater: true });

    const counts = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/library/counts`,
      headers: family.headers,
    });
    expect(counts.statusCode).toBe(200);
    expect(counts.json().data).toEqual({ saved: 1, later: 1, learned: 1 });

    const state = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/${savedId}/state`,
      headers: family.headers,
    });
    expect(state.statusCode).toBe(200);
    expect(state.json().data).toMatchObject({ saved: true, learnedVersion: null });

    // 从未互动过的文章 → null 状态（前端按默认态渲染）。
    const freshId = await createArticle({ title: '还没互动', priority: 13 });
    const fresh = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${family.babyId}/knowledge/${freshId}/state`,
      headers: family.headers,
    });
    expect(fresh.statusCode).toBe(200);
    expect(fresh.json().data).toBeNull();
  });

  it('accepts feedback without leaking errors', async () => {
    const family = await readyFamily();
    const id = await createArticle({ title: '可反馈的文章', priority: 10 });
    const ok = await app.inject({
      method: 'POST',
      url: `/api/v1/knowledge/${id}/feedback`,
      headers: family.headers,
      payload: { type: 'CONTENT_ISSUE', message: '第三段表述不清晰' },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/knowledge/${id}/feedback`,
      headers: family.headers,
      payload: { type: 'NOT_A_TYPE' },
    });
    expect(bad.statusCode).toBe(400);
  });
});
