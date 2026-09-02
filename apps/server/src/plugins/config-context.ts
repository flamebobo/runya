import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      userId: string | null;
      sessionId: string | null;
    };
  }
}

async function configContextPlugin(app: FastifyInstance) {
  app.addHook('onRequest', async (request) => {
    request.auth = {
      userId: null,
      sessionId: null,
    };
  });
}

export default fp(configContextPlugin, { name: 'config-context' });
