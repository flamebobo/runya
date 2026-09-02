import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

async function configContextPlugin(_app: FastifyInstance) {
  // Auth context is attached in plugins/auth.ts
}

export default fp(configContextPlugin, { name: 'config-context' });
