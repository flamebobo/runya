import { z } from 'zod';
import { ulidRegex } from './sync-utils.js';

export const duplicateResolveBodySchema = z.object({
  resolution: z.enum(['MERGE', 'KEEP_BOTH']),
  canonical: z.enum(['A', 'B']).optional(),
  mergedFields: z.record(z.unknown()).optional(),
  familyId: z.string().optional(),
});

export const duplicateResolveResponseSchema = z.object({
  candidateId: z.string(),
  resolution: z.enum(['MERGED', 'KEEP_BOTH']),
  canonicalId: z.string().nullable(),
  mergedId: z.string().nullable(),
});

export const ulidSchemaShared = z.string().regex(ulidRegex);
