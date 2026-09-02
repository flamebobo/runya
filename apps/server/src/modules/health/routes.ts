import type { FastifyInstance } from 'fastify';
import { sendSuccess } from '../../lib/response.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health/live', async (request, reply) => {
    return sendSuccess(reply, request, { status: 'ok' as const });
  });

  app.get('/health/ready', async (request, reply) => {
    let database: 'ok' | 'error' = 'ok';

    try {
      await app.sqlClient.execute('SELECT 1');
    } catch {
      database = 'error';
    }

    const status = database === 'ok' ? ('ok' as const) : ('degraded' as const);
    const statusCode = database === 'ok' ? 200 : 503;

    return reply.status(statusCode).send({
      data: { status, database },
      meta: { requestId: request.requestId },
    });
  });
}
