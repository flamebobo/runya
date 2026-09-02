import { isUlid } from '@runew/shared-utils';
import { z } from 'zod';

export const ulidSchema = z.string().refine(isUlid, {
  message: 'Invalid ULID',
});

export const utcMsSchema = z.number().int().nonnegative();

export const paginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const idempotencyHeaderSchema = z
  .string()
  .min(8)
  .max(128)
  .optional();

export const etagHeaderSchema = z
  .string()
  .regex(/^"v\d+"$/)
  .optional();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
