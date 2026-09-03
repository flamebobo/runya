import type { ApiErrorCode } from '@runew/domain-types';
import { z } from 'zod';

export const apiMetaSchema = z.object({
  requestId: z.string(),
});

export const apiSuccessEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: apiMetaSchema,
  });

export const apiErrorBodySchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  details: z.record(z.unknown()).optional(),
});

export const apiErrorEnvelopeSchema = z.object({
  error: apiErrorBodySchema,
  meta: apiMetaSchema,
});

export type ApiMeta = z.infer<typeof apiMetaSchema>;
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export interface ApiSuccessEnvelope<T> {
  data: T;
  meta: ApiMeta;
}

export function createSuccessEnvelope<T>(
  data: T,
  requestId: string,
): ApiSuccessEnvelope<T> {
  return {
    data,
    meta: { requestId },
  };
}

export function createErrorEnvelope(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  options?: { retryable?: boolean; details?: Record<string, unknown> },
): ApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      retryable: options?.retryable ?? false,
      details: options?.details,
    },
    meta: { requestId },
  };
}

export const healthLiveSchema = z.object({
  status: z.literal('ok'),
});

export const healthReadySchema = z.object({
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['ok', 'error']),
});

export type HealthLiveResponse = z.infer<typeof healthLiveSchema>;
export type HealthReadyResponse = z.infer<typeof healthReadySchema>;

export * from './auth.js';
export * from './family.js';
export * from './baby.js';
export * from './bootstrap.js';
export * from './records.js';
export * from './growth.js';
export * from './knowledge.js';
export * from './health.js';
export * from './notifications.js';
export * from './sync.js';
export * from './media.js';
export * from './memories.js';

