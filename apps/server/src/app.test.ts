import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { AppError, errorHandler } from '../src/lib/errors.js';
import { runMigrations } from '@runew/db';

describe('server foundation', () => {
  let tempDir: string;
  let databasePath: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runew-server-test-'));
    databasePath = path.join(tempDir, 'runew.db');
    process.env.DATABASE_PATH = databasePath;
    process.env.LOG_LEVEL = 'silent';
    await runMigrations(databasePath);
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Windows may briefly lock SQLite sidecar files after libsql closes.
    }
  });

  it('starts and serves health endpoints', async () => {
    const app = await buildApp();

    const live = await app.inject({ method: 'GET', url: '/api/v1/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toMatchObject({
      data: { status: 'ok' },
      meta: { requestId: expect.any(String) },
    });

    const ready = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      data: { status: 'ok', database: 'ok' },
    });

    await app.close();
  });

  it('returns unified error envelope', async () => {
    const app = await buildApp();

    app.get('/api/v1/test-error', async () => {
      throw new AppError('VALIDATION_ERROR', '输入有误', 400);
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/test-error' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: '输入有误',
        retryable: false,
      },
      meta: { requestId: expect.any(String) },
    });

    await app.close();
  });

  it('handles unexpected errors safely', async () => {
    const app = await buildApp();

    app.get('/api/v1/test-boom', async () => {
      throw new Error('sqlite internal path /secret');
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/test-boom' });
    expect(response.statusCode).toBe(500);
    expect(JSON.stringify(response.json())).not.toContain('/secret');
    expect(response.json()).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: expect.any(String),
      },
    });

    await app.close();
  });
});

describe('errorHandler unit', () => {
  it('maps AppError to envelope', () => {
    const request = {
      requestId: 'req-1',
      log: { warn: () => undefined, error: () => undefined },
      routeOptions: { url: '/test' },
      method: 'GET',
    } as never;

    const reply = {
      status: (code: number) => ({
        send: (body: unknown) => ({ code, body }),
      }),
    } as never;

    const result = errorHandler(
      new AppError('NOT_FOUND', '未找到', 404),
      request,
      reply,
    ) as unknown as { code: number; body: unknown };

    expect(result.code).toBe(404);
    expect(result.body).toMatchObject({
      error: { code: 'NOT_FOUND', message: '未找到' },
      meta: { requestId: 'req-1' },
    });
  });
});
