import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

export const gemActionTypeSchema = z.enum([
  'FEEDING_RECORD',
  'SLEEP_RECORD',
  'DIAPER_RECORD',
  'FOOD_RECORD',
]);

export const gemTransactionSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  userId: ulidSchema.nullable(),
  amount: z.number().int(),
  balanceAfter: z.number().int(),
  reasonCode: z.string(),
  reasonText: z.string().nullable(),
  sourceType: z.string(),
  sourceId: ulidSchema.nullable(),
  createdAt: z.number().int(),
});

export const gemBalanceSchema = z.object({
  balance: z.number().int().nonnegative(),
  ledgerBalance: z.number().int().nonnegative(),
});

export const rewardStatusSchema = z.enum(['ACTIVE', 'OFFLINE']);
export const rewardSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  name: z.string(),
  description: z.string().nullable(),
  priceGems: z.number().int().positive(),
  stock: z.number().int().nonnegative().nullable(),
  illustrationKey: z.string().nullable(),
  status: rewardStatusSchema,
  custom: z.boolean(),
  sortOrder: z.number().int(),
  version: z.number().int(),
});

export const rewardOrderStatusSchema = z.enum([
  'REDEEMED',
  'WAITING',
  'COMPLETED',
  'CANCELED',
]);
export const rewardOrderSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  rewardId: ulidSchema,
  rewardName: z.string(),
  redeemedBy: ulidSchema,
  priceGemsSnapshot: z.number().int().positive(),
  status: rewardOrderStatusSchema,
  redeemedAt: z.number().int(),
  fulfilledAt: z.number().int().nullable(),
  canceledAt: z.number().int().nullable(),
  fulfilledBy: ulidSchema.nullable(),
  completionPhotoMemoryId: ulidSchema.nullable(),
  version: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const createRewardBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  priceGems: z.number().int().positive().max(100000),
  stock: z.number().int().nonnegative().nullable().optional(),
  illustrationKey: z.string().trim().max(40).nullable().optional(),
});
export const updateRewardBodySchema = createRewardBodySchema.partial();
export const redeemRewardBodySchema = z.object({});
export const fulfillRewardOrderBodySchema = z.object({
  completionPhotoMemoryId: ulidSchema.nullable().optional(),
});
export const cancelRewardOrderBodySchema = z.object({});

export type GemActionType = z.infer<typeof gemActionTypeSchema>;
export type GemTransactionPublic = z.infer<typeof gemTransactionSchema>;
export type GemBalance = z.infer<typeof gemBalanceSchema>;
export type RewardPublic = z.infer<typeof rewardSchema>;
export type RewardOrderStatus = z.infer<typeof rewardOrderStatusSchema>;
export type RewardOrderPublic = z.infer<typeof rewardOrderSchema>;
export type CreateRewardBody = z.infer<typeof createRewardBodySchema>;
export type UpdateRewardBody = z.infer<typeof updateRewardBodySchema>;
export type RedeemRewardBody = z.infer<typeof redeemRewardBodySchema>;
export type FulfillRewardOrderBody = z.infer<typeof fulfillRewardOrderBodySchema>;
export type CancelRewardOrderBody = z.infer<typeof cancelRewardOrderBodySchema>;
