import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

export const familyPublicSchema = z.object({
  id: ulidSchema,
  name: z.string(),
  ownerUserId: ulidSchema,
  gemBalance: z.number().int(),
  level: z.number().int(),
  timezoneName: z.string(),
  version: z.number().int(),
});

export const familyMemberPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  userId: ulidSchema,
  relationship: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
  status: z.enum(['ACTIVE', 'DISABLED']),
  nickname: z.string().optional(),
});

export const createFamilyBodySchema = z.object({
  name: z.string().trim().min(1, '请输入家庭名称').max(32),
  timezoneName: z.string().trim().min(1).default('Asia/Shanghai'),
  relationship: z.enum(['MOM', 'DAD', 'GRANDPARENT', 'OTHER']).default('MOM'),
});

export const createFamilyInviteBodySchema = z.object({
  relationshipHint: z.enum(['MOM', 'DAD', 'GRANDPARENT', 'OTHER']).optional(),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});

export const familyInvitePublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  token: z.string(),
  expiresAt: z.number().int(),
});

export const acceptFamilyInviteBodySchema = z.object({
  relationship: z.enum(['MOM', 'DAD', 'GRANDPARENT', 'OTHER']),
});

export type FamilyPublic = z.infer<typeof familyPublicSchema>;
export type FamilyMemberPublic = z.infer<typeof familyMemberPublicSchema>;
export type CreateFamilyBody = z.infer<typeof createFamilyBodySchema>;
