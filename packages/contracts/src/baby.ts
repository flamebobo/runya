import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

export const babyPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  name: z.string(),
  nickname: z.string().nullable(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).nullable(),
  birthday: z.string(),
  version: z.number().int(),
});

export const createBabyBodySchema = z.object({
  name: z.string().trim().min(1, '请输入宝宝昵称').max(32),
  nickname: z.string().trim().max(32).optional(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '生日格式应为 YYYY-MM-DD'),
});

export const updateBabyBodySchema = z.object({
  name: z.string().trim().min(1).max(32).optional(),
  nickname: z.string().trim().max(32).nullable().optional(),
  sex: z.enum(['MALE', 'FEMALE', 'UNKNOWN']).nullable().optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
