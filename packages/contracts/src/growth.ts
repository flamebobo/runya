import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const timestampSchema = z
  .number()
  .int('时间必须是完整数字')
  .positive('时间必须晚于 1970 年');
const nullableNoteSchema = z
  .string()
  .trim()
  .max(500, '备注不能超过 500 个字')
  .nullable()
  .optional();

const heightSchema = z
  .number()
  .positive('身高必须大于 0')
  .max(300, '身高数字有点大，再看一眼');
const weightSchema = z
  .number()
  .positive('体重必须大于 0')
  .max(500, '体重数字有点大，再看一眼');
const headSchema = z
  .number()
  .positive('头围必须大于 0')
  .max(150, '头围数字有点大，再看一眼');
const timezoneSchema = z
  .string()
  .trim()
  .min(1, '缺少时区信息')
  .max(64, '时区信息过长');

export const growthMetricSchema = z.enum(['height', 'weight', 'head']);

export const growthMetricsSchema = z.object({
  heightCm: heightSchema.nullable(),
  weightKg: weightSchema.nullable(),
  headCircumferenceCm: headSchema.nullable(),
});

export const createGrowthBodySchema = z
  .object({
    heightCm: heightSchema.nullable().optional(),
    weightKg: weightSchema.nullable().optional(),
    headCircumferenceCm: headSchema.nullable().optional(),
    recordedAt: timestampSchema.optional(),
    timezoneName: timezoneSchema.optional(),
    note: nullableNoteSchema,
  })
  .refine(
    (value) =>
      value.heightCm != null || value.weightKg != null || value.headCircumferenceCm != null,
    { message: '身高、体重、头围至少记下一项' },
  );

export const updateGrowthBodySchema = z.object({
  heightCm: heightSchema.nullable().optional(),
  weightKg: weightSchema.nullable().optional(),
  headCircumferenceCm: headSchema.nullable().optional(),
  recordedAt: timestampSchema.optional(),
  timezoneName: z.string().trim().min(1).max(64).optional(),
  note: nullableNoteSchema,
});

export const growthRecordPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  heightCm: heightSchema.nullable(),
  weightKg: weightSchema.nullable(),
  headCircumferenceCm: headSchema.nullable(),
  recordedAt: timestampSchema,
  timezoneName: z.string(),
  note: z.string().nullable(),
  createdBy: ulidSchema,
  createdAt: timestampSchema,
  updatedBy: ulidSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
  syncState: z.enum(['pending', 'syncing', 'synced']).optional(),
});

export const latestMetricSchema = z.object({
  recordId: ulidSchema,
  value: z.number(),
  recordedAt: timestampSchema,
});

export const growthLatestSchema = z.object({
  height: latestMetricSchema.nullable(),
  weight: latestMetricSchema.nullable(),
  head: latestMetricSchema.nullable(),
});

export const growthTrendPointSchema = z.object({
  recordId: ulidSchema,
  recordedAt: timestampSchema,
  value: z.number(),
});

export const growthListResponseSchema = z.object({
  items: z.array(growthRecordPublicSchema),
  latest: growthLatestSchema,
  trends: z.object({
    height: z.array(growthTrendPointSchema),
    weight: z.array(growthTrendPointSchema),
    head: z.array(growthTrendPointSchema),
  }),
});

export const createMilestoneBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '给这个第一次取个名字吧')
    .max(100, '里程碑名称不能超过 100 个字'),
  description: z
    .string()
    .trim()
    .max(2000, '里程碑描述不能超过 2000 个字')
    .nullable()
    .optional(),
  happenedAt: timestampSchema.optional(),
  timezoneName: z.string().trim().min(1).max(64).optional(),
  coverMediaId: ulidSchema.nullable().optional(),
});

export const updateMilestoneBodySchema = createMilestoneBodySchema.partial();

export const milestonePublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  title: z.string(),
  description: z.string().nullable(),
  happenedAt: timestampSchema,
  timezoneName: z.string(),
  coverMediaId: ulidSchema.nullable(),
  createdBy: ulidSchema,
  createdAt: timestampSchema,
  updatedBy: ulidSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
  syncState: z.enum(['pending', 'syncing', 'synced']).optional(),
});

export const milestoneListResponseSchema = z.object({
  items: z.array(milestonePublicSchema),
});

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '月份格式是 YYYY-MM'),
  utcOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(480),
});

export const monthlyMetricChangeSchema = z.object({
  metric: growthMetricSchema,
  first: z.number(),
  latest: z.number(),
  delta: z.number(),
  unit: z.enum(['cm', 'kg']),
});

export const monthlyStoryResponseSchema = z.object({
  month: z.string(),
  title: z.string(),
  summary: z.string(),
  growthRecordCount: z.number().int().min(0),
  milestoneCount: z.number().int().min(0),
  changes: z.array(monthlyMetricChangeSchema),
  milestones: z.array(milestonePublicSchema),
});

export type GrowthMetric = z.infer<typeof growthMetricSchema>;
export type CreateGrowthBody = z.infer<typeof createGrowthBodySchema>;
export type UpdateGrowthBody = z.infer<typeof updateGrowthBodySchema>;
export type GrowthRecordPublic = z.infer<typeof growthRecordPublicSchema>;
export type GrowthLatest = z.infer<typeof growthLatestSchema>;
export type GrowthTrendPoint = z.infer<typeof growthTrendPointSchema>;
export type GrowthListResponse = z.infer<typeof growthListResponseSchema>;
export type CreateMilestoneBody = z.infer<typeof createMilestoneBodySchema>;
export type UpdateMilestoneBody = z.infer<typeof updateMilestoneBodySchema>;
export type MilestonePublic = z.infer<typeof milestonePublicSchema>;
export type MilestoneListResponse = z.infer<typeof milestoneListResponseSchema>;
export type MonthQuery = z.infer<typeof monthQuerySchema>;
export type MonthlyMetricChange = z.infer<typeof monthlyMetricChangeSchema>;
export type MonthlyStoryResponse = z.infer<typeof monthlyStoryResponseSchema>;
