import { describe, expect, it } from 'vitest';
import { createUlid } from '@runew/shared-utils';
import { paginationQuerySchema, ulidSchema } from './index.js';

describe('validation', () => {
  it('validates ULID schema', () => {
    expect(ulidSchema.safeParse(createUlid()).success).toBe(true);
    expect(ulidSchema.safeParse('bad').success).toBe(false);
  });

  it('validates pagination query', () => {
    const result = paginationQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });
});
