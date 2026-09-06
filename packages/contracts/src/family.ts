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

export const familyTaskSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  title: z.string(),
  note: z.string().nullable(),
  dueAt: z.number().nullable(),
  repeatRule: z.string().nullable(),
  assignedTo: ulidSchema.nullable(),
  experienceReward: z.number().int(),
  status: z.enum(['OPEN', 'COMPLETED', 'DELETED']),
  completedAt: z.number().nullable(),
  completedBy: ulidSchema.nullable(),
  deletedAt: z.number().nullable(),
  version: z.number().int(),
});
export const createFamilyTaskBodySchema = z.object({
  id: ulidSchema.optional(),
  title: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).nullable().optional(),
  dueAt: z.number().int().nullable().optional(),
  repeatRule: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).nullable().optional(),
  assignedTo: ulidSchema.nullable().optional(),
  experienceReward: z.number().int().min(0).max(100).optional(),
});
export const familyAnniversarySchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  title: z.string(),
  date: z.string(),
  note: z.string().nullable(),
});
export const createFamilyAnniversaryBodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const [yearText, monthText, dayText] = value.split('-');
      if (!yearText || !monthText || !dayText) return false;
      const year = Number(yearText);
      const month = Number(monthText);
      const day = Number(dayText);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
      );
    }, '请输入真实的纪念日日期'),
  note: z.string().trim().max(500).nullable().optional(),
});
export const achievementSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  title: z.string(),
  description: z.string().nullable(),
  emoji: z.string(),
  unlockedAt: z.number().nullable(),
});
export const createAchievementBodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  emoji: z.string().trim().min(1).max(8).default('🌱'),
});
export type CreateFamilyTaskBody = z.infer<typeof createFamilyTaskBodySchema>;
export const familyPermissionSchema = z.object({
  resource: z.string().min(1).max(40),
  action: z.string().min(1).max(40),
  effect: z.enum(['ALLOW', 'DENY']),
});
export const updateFamilyPermissionsBodySchema = z.object({
  permissions: z.array(familyPermissionSchema).max(80),
});
