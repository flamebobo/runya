import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

export const babyPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  name: z.string(),
  nickname: z.string().nullable(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).nullable(),
  birthday: z.string(),
  birthTime: z.number().int().nullable().optional(),
  avatarMediaId: z.string().nullable().optional(),
  birthHeightCm: z.number().nullable().optional(),
  birthWeightKg: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  version: z.number().int(),
});

export const createBabyBodySchema = z.object({
  name: z.string().trim().min(1, '请输入宝宝昵称').max(32),
  nickname: z.string().trim().max(32).optional(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '生日格式应为 YYYY-MM-DD'),
  birthTime: z.number().int().nonnegative().optional(),
  avatarMediaId: z.string().trim().min(1).max(128).nullable().optional(),
  birthHeightCm: z.number().positive().max(200).optional(),
  birthWeightKg: z.number().positive().max(100).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const updateBabyBodySchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  nickname: z.string().trim().max(32).nullable().optional(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).nullable().optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  birthTime: z.number().int().nonnegative().nullable().optional(),
  avatarMediaId: z.string().trim().min(1).max(128).nullable().optional(),
  birthHeightCm: z.number().positive().max(200).nullable().optional(),
  birthWeightKg: z.number().positive().max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const onboardingCompleteBodySchema = z.object({
  familyName: z.string().trim().min(1).max(32).optional(),
  timezoneName: z.string().trim().min(1).default('Asia/Shanghai'),
  relationship: z.enum(['MOM', 'DAD', 'GRANDPARENT', 'OTHER']),
  baby: createBabyBodySchema,
  topics: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
});

export type BabyPublic = z.infer<typeof babyPublicSchema>;
export type CreateBabyBody = z.infer<typeof createBabyBodySchema>;
export type UpdateBabyBody = z.infer<typeof updateBabyBodySchema>;
export type OnboardingCompleteBody = z.infer<typeof onboardingCompleteBodySchema>;
