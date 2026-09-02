import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { runMigrations } from '@runew/db';
import { loadConfig } from './config/index.js';
import { AppError, errorHandler } from './lib/errors.js';
import {
  CSRF_COOKIE_NAME,
  getClientPlatform,
  isStateChangingMethod,
} from './lib/auth-constants.js';
import configContextPlugin from './plugins/config-context.js';
import dbPlugin from './plugins/db.js';
import { attachAuthContext } from './plugins/auth.js';
import { healthRoutes } from './modules/health/routes.js';
import { identityRoutes } from './modules/identity/routes.js';
import { recordsRoutes } from './modules/records/routes.js';
import Fastify from 'fastify';

export async function buildApp() {
  const config = loadConfig();

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.adminPassword',
      ],
    },
    genReqId: () => crypto.randomUUID(),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  app.decorate('config', config);
  await runMigrations(config.DATABASE_PATH);

  app.addHook('onRequest', async (request) => {
    request.requestId = request.id;
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        route: request.routeOptions.url,
        method: request.method,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      },
      'request completed',
    );
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.NODE_ENV === 'development',
    credentials: true,
  });
  await app.register(configContextPlugin);
  await app.register(dbPlugin);

  app.addHook('onRequest', attachAuthContext);

  app.addHook('preHandler', async (request) => {
    const url = request.url.split('?')[0] ?? '';
    if (!url.startsWith('/api/v1')) return;
    if (!isStateChangingMethod(request.method)) return;
    if (getClientPlatform(request) !== 'H5') return;
    if (url.endsWith('/auth/login') || url.endsWith('/auth/register')) return;
    const csrfHeader = request.headers['x-csrf-token'];
    const csrfCookie = request.cookies?.[CSRF_COOKIE_NAME];
    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new AppError('CSRF_INVALID', '请求校验失败，请刷新后重试', 403);
    }
  });

  app.setErrorHandler(errorHandler);

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(identityRoutes, { prefix: '/api/v1' });
  await app.register(recordsRoutes, { prefix: '/api/v1' });

  return app;
}
