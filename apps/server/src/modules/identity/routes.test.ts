import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, userSessions, users } from '@runew/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createUlid, utcNowMs } from '@runew/shared-utils';

const WEAPP_HEADERS = {
  'x-client-platform': 'WEAPP',
};

describe('identity api', () => {
  let tempDir: string;
  let databasePath: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-m1-test-'));
    databasePath = path.join(tempDir, 'runew.db');
    process.env.DATABASE_PATH = databasePath;
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(databasePath);
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore Windows lock
    }
  });

  async function registerUser(username: string, password = 'password123') {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        ...WEAPP_HEADERS,
        'idempotency-key': createUlid(),
      },
      payload: { username, password, nickname: '测试妈妈' },
    });
    await app.close();
    return response;
  }

  it('registers, logs in, bootstraps and logs out', async () => {
    const register = await registerUser('mom_user');
    expect(register.statusCode).toBe(201);
    const registerBody = register.json();
    const token = registerBody.data.session.token as string;
    expect(token).toBeTruthy();

    const app = await buildApp();
    const bootstrap = await app.inject({
      method: 'GET',
      url: '/api/v1/bootstrap',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    });
    expect(bootstrap.statusCode).toBe(200);
    expect(bootstrap.json().data.status).toBe('MISSING_FAMILY');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    });
    expect(me.statusCode).toBe(401);
    await app.close();
  });

  it('rejects wrong password', async () => {
    await registerUser('wrong_pw_user');
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: WEAPP_HEADERS,
      payload: { username: 'wrong_pw_user', password: 'bad-password' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('AUTH_INVALID_CREDENTIALS');
    await app.close();
  });

  it('rejects disabled user', async () => {
    const register = await registerUser('disabled_user');
    const token = register.json().data.session.token as string;
    const app = await buildApp();
    await app.db
      .update(users)
      .set({ status: 'DISABLED' })
      .where(eq(users.id, register.json().data.user.id));

    const bootstrap = await app.inject({
      method: 'GET',
      url: '/api/v1/bootstrap',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    });
    expect(bootstrap.statusCode).toBe(403);
    expect(bootstrap.json().error.code).toBe('AUTH_ACCOUNT_DISABLED');
    await app.close();
  });

  it('rejects revoked session', async () => {
    const register = await registerUser('revoked_user');
    const token = register.json().data.session.token as string;
    const sessionId = register.json().data.session.sessionId as string;
    const app = await buildApp();
    await app.db
      .update(userSessions)
      .set({ revokedAt: utcNowMs() })
      .where(eq(userSessions.id, sessionId));

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('AUTH_SESSION_REVOKED');
    await app.close();
  });

  it('rejects expired session', async () => {
    const register = await registerUser('expired_user');
    const token = register.json().data.session.token as string;
    const sessionId = register.json().data.session.sessionId as string;
    const app = await buildApp();
    await app.db
      .update(userSessions)
      .set({ expiresAt: utcNowMs() - 1 })
      .where(eq(userSessions.id, sessionId));

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('AUTH_SESSION_EXPIRED');
    await app.close();
  });

  it('denies cross-family access and baby-family mismatch', async () => {
    const userA = await registerUser('family_a_user');
    const tokenA = userA.json().data.session.token as string;
    const userB = await registerUser('family_b_user');
    const tokenB = userB.json().data.session.token as string;

    const app = await buildApp();
    const onboardingA = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${tokenA}`,
        'idempotency-key': createUlid(),
      },
      payload: {
        relationship: 'MOM',
        baby: { name: '润润A', birthday: '2026-01-16' },
        topics: ['睡眠'],
      },
    });
    expect(onboardingA.statusCode).toBe(200);
    const familyAId = onboardingA.json().data.family.id as string;
    const babyAId = onboardingA.json().data.baby.id as string;

    const onboardingB = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${tokenB}`,
        'idempotency-key': createUlid(),
      },
      payload: {
        relationship: 'DAD',
        baby: { name: '润润B', birthday: '2026-02-01' },
        topics: ['喂养'],
      },
    });
    expect(onboardingB.statusCode).toBe(200);

    const deniedFamily = await app.inject({
      method: 'GET',
      url: `/api/v1/families/${familyAId}`,
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${tokenB}`,
      },
    });
    expect(deniedFamily.statusCode).toBe(403);

    const deniedBaby = await app.inject({
      method: 'GET',
      url: `/api/v1/babies/${babyAId}`,
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${tokenB}`,
      },
    });
    expect(deniedBaby.statusCode).toBe(403);
    await app.close();
  });

  it('completes onboarding idempotently', async () => {
    const register = await registerUser('onboarding_user');
    const token = register.json().data.session.token as string;
    const idempotencyKey = createUlid();
    const payload = {
      relationship: 'MOM',
      baby: { name: '润润', birthday: '2026-01-16', sex: 'FEMALE' },
      topics: ['睡眠', '喂养'],
    };

    const app = await buildApp();
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/complete',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
        'idempotency-key': idempotencyKey,
      },
      payload,
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().data.family.id).toBe(second.json().data.family.id);
    expect(first.json().data.baby.id).toBe(second.json().data.baby.id);

    const bootstrap = await app.inject({
      method: 'GET',
      url: '/api/v1/bootstrap',
      headers: {
        ...WEAPP_HEADERS,
        authorization: `Bearer ${token}`,
      },
    });
    expect(bootstrap.json().data.status).toBe('READY');
    await app.close();
  });

  it('returns validation error for empty register body', async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: WEAPP_HEADERS,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('supports H5 cookie session', async () => {
    const app = await buildApp();
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: {
        'x-client-platform': 'H5',
        'idempotency-key': createUlid(),
      },
      payload: { username: 'h5_user', password: 'password123' },
    });
    expect(register.statusCode).toBe(201);
    const cookie = register.headers['set-cookie'];
    expect(cookie).toBeTruthy();

    const bootstrap = await app.inject({
      method: 'GET',
      url: '/api/v1/bootstrap',
      headers: {
        'x-client-platform': 'H5',
        cookie: Array.isArray(cookie) ? cookie.join('; ') : String(cookie),
      },
    });
    expect(bootstrap.statusCode).toBe(200);
    await app.close();
  });
});
