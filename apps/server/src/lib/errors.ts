import { createErrorEnvelope } from '@runew/contracts';
import type { ApiErrorCode } from '@runew/domain-types';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function errorHandler(
  error: FastifyError | AppError | ZodError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    return reply.status(400).send(
      createErrorEnvelope(
        'VALIDATION_ERROR',
        firstIssue?.message ?? '输入有误，请检查后再试',
        request.requestId,
        {
          details: {
            field: firstIssue?.path.join('.') ?? undefined,
          },
        },
      ),
    );
  }

  if (isAppError(error)) {
    request.log.warn(
      {
        errorCode: error.code,
        route: request.routeOptions.url,
        method: request.method,
      },
      error.message,
    );

    return reply.status(error.statusCode).send(
      createErrorEnvelope(error.code, error.message, request.requestId, {
        retryable: error.retryable,
        details: error.details,
      }),
    );
  }

  request.log.error(
    {
      route: request.routeOptions.url,
      method: request.method,
      err: error,
    },
    'Unhandled server error',
  );

  return reply.status(500).send(
    createErrorEnvelope(
      'INTERNAL_ERROR',
      '服务暂时不可用，请稍后再试',
      request.requestId,
      { retryable: true },
    ),
  );
}
