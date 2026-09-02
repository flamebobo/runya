import { z } from 'zod';
import { babyPublicSchema } from './baby.js';
import { familyMemberPublicSchema, familyPublicSchema } from './family.js';
import { userPublicSchema } from './auth.js';

export const bootstrapResponseSchema = z.object({
  status: z.enum(['FIRST_RUN', 'MISSING_FAMILY', 'MISSING_BABY', 'READY']),
  user: userPublicSchema,
  families: z.array(familyPublicSchema),
  currentFamily: familyPublicSchema.nullable(),
  members: z.array(familyMemberPublicSchema).optional(),
  babies: z.array(babyPublicSchema),
  currentBaby: babyPublicSchema.nullable(),
  gemBalance: z.number().int(),
  unreadNotifications: z.number().int(),
  running: z.object({
    sleep: z.null(),
    feeding: z.null(),
  }),
  sync: z.object({
    cursor: z.number().int(),
    epoch: z.number().int(),
  }),
  apiVersion: z.literal('v1'),
  minSupportedClientVersion: z.string(),
  latestClientVersion: z.string(),
});

export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
