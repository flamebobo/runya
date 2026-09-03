import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const timestampSchema = z
  .number()
  .int('时间必须是完整数字')
  .positive('时间必须晚于 1970 年');
const timezoneSchema = z.string().trim().min(1, '缺少时区信息').max(64, '时区信息过长');
const noteSchema = z
  .string()
  .trim()
  .max(500, '备注不能超过 500 个字')
  .nullable()
  .optional();

// PRD 11.2：体检/儿保、疫苗、就诊、牙科、用药提醒、其他。
export const healthEventTypeSchema = z.enum([
  'CHECKUP',
  'VACCINE',
  'VISIT',
  'DENTAL',
  'MEDICATION',
  'OTHER',
]);

export const healthEventStatusSchema = z.enum([
  'UPCOMING',
  'COMPLETED',
  'EXPIRED',
  'CANCELED',
]);

export const healthReminderOffsetSchema = z.enum([
  'D7',
  'D3',
  'D1',
  'SAME_DAY',
  'CUSTOM',
]);

// 提醒设置：整体替换（PUT 语义）。offsets 为空数组 = 取消所有提醒。
// 注意：const 无提升，本 schema 必须先于 createHealthEventBodySchema 定义。
export const healthReminderBodySchema = z.object({
  offsets: z
    .array(
      z.object({
        kind: healthReminderOffsetSchema,
        customOffsetMinutes: z
          .number()
          .int()
          .min(0, '提前量不能是负数')
          .max(60 * 24 * 30, '提前量最多 30 天')
          .optional(),
        allowDndOverride: z.boolean().optional(),
      }),
    )
    .max(5, '提醒最多 5 个'),
});

export const createHealthEventBodySchema = z.object({
  eventType: healthEventTypeSchema,
  title: z
    .string()
    .trim()
    .min(1, '给这个事项取个名字吧')
    .max(100, '事项名称不能超过 100 个字'),
  scheduledAt: timestampSchema,
  timezoneName: timezoneSchema.optional(),
  locationName: z
    .string()
    .trim()
    .max(120, '地点名称不能超过 120 个字')
    .nullable()
    .optional(),
  locationAddress: z
    .string()
    .trim()
    .max(200, '地点地址不能超过 200 个字')
    .nullable()
    .optional(),
  doctorName: z
    .string()
    .trim()
    .max(60, '医生名字不能超过 60 个字')
    .nullable()
    .optional(),
  note: noteSchema,
  reminder: healthReminderBodySchema.optional(),
});

export const updateHealthEventBodySchema = z.object({
  eventType: healthEventTypeSchema.optional(),
  title: z.string().trim().min(1).max(100).optional(),
  scheduledAt: timestampSchema.optional(),
  timezoneName: timezoneSchema.optional(),
  locationName: z.string().trim().max(120).nullable().optional(),
  locationAddress: z.string().trim().max(200).nullable().optional(),
  doctorName: z.string().trim().max(60).nullable().optional(),
  note: noteSchema,
  status: z.enum(['UPCOMING', 'COMPLETED', 'CANCELED']).optional(),
  reminder: healthReminderBodySchema.nullable().optional(),
});

export const healthReminderPublicSchema = z.object({
  offsets: z.array(
    z.object({
      id: ulidSchema,
      kind: healthReminderOffsetSchema,
      customOffsetMinutes: z
        .number()
        .int()
        .min(0)
        .max(60 * 24 * 30)
        .nullable(),
      fireAt: timestampSchema,
      allowDndOverride: z.boolean(),
      status: z.enum(['SCHEDULED', 'SENT', 'CANCELED']),
    }),
  ),
});

export const healthEventPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  eventType: healthEventTypeSchema,
  title: z.string(),
  scheduledAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  status: healthEventStatusSchema,
  locationName: z.string().nullable(),
  locationAddress: z.string().nullable(),
  doctorName: z.string().nullable(),
  note: z.string().nullable(),
  timezoneName: z.string(),
  reminder: healthReminderPublicSchema.nullable().optional(),
  attachments: z
    .array(
      z.object({
        mediaId: ulidSchema,
        role: z.string(),
        status: z.enum(['PENDING', 'READY', 'FAILED']),
      }),
    )
    .optional(),
  createdBy: ulidSchema,
  createdAt: timestampSchema,
  updatedBy: ulidSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
  syncState: z.enum(['pending', 'syncing', 'synced']).optional(),
});

export const healthEventListResponseSchema = z.object({
  items: z.array(healthEventPublicSchema),
});

export type HealthEventType = z.infer<typeof healthEventTypeSchema>;
export type HealthEventStatus = z.infer<typeof healthEventStatusSchema>;
export type HealthReminderOffset = z.infer<typeof healthReminderOffsetSchema>;
export type HealthReminderBody = z.infer<typeof healthReminderBodySchema>;
export type HealthReminderPublic = z.infer<typeof healthReminderPublicSchema>;
export type CreateHealthEventBody = z.infer<typeof createHealthEventBodySchema>;
export type UpdateHealthEventBody = z.infer<typeof updateHealthEventBodySchema>;
export type HealthEventPublic = z.infer<typeof healthEventPublicSchema>;
export type HealthEventListResponse = z.infer<typeof healthEventListResponseSchema>;
