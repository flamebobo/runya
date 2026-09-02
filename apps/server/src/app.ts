import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { loadConfig } from './config/index.js';
import { errorHandler } from './lib/errors.js';
import configContextPlugin from './plugins/config-context.js';
import dbPlugin from './plugins/db.js';
import { healthRoutes } from './modules/health/routes.js';
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
  await app.register(cors, {
    origin: config.NODE_ENV === 'development',
    credentials: true,
  });
  await app.register(configContextPlugin);
  await app.register(dbPlugin);

  app.setErrorHandler(errorHandler);

  await app.register(healthRoutes, { prefix: '/api/v1' });

  return app;
}
