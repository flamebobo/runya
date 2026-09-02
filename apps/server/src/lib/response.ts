import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }

  interface FastifyRequest {
    requestId: string;
  }
}

export function sendSuccess<T>(
  reply: FastifyReply,
  request: FastifyRequest,
  data: T,
  statusCode = 200,
) {
  return reply.status(statusCode).send({
    data,
    meta: { requestId: request.requestId },
  });
}
