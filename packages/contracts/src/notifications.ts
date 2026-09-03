import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const timestampSchema = z
  .number()
  .int('时间必须是完整数字')
  .positive('时间必须晚于 1970 年');

export const notificationCategorySchema = z.enum([
  'HEALTH',
  'FAMILY_TASKS',
  'REWARDS',
  'BACKUP',
  'CAPSULES',
  'ANNIVERSARIES',
  'SYSTEM',
]);

export const notificationPreferencesSchema = z.object({
  healthEnabled: z.boolean(),
  familyTasksEnabled: z.boolean(),
  rewardsEnabled: z.boolean(),
  backupEnabled: z.boolean(),
  capsulesEnabled: z.boolean(),
  anniversariesEnabled: z.boolean(),
  dndEnabled: z.boolean(),
  dndStartMinute: z.number().int().min(0).max(1439),
  dndEndMinute: z.number().int().min(0).max(1439),
  timezoneName: z.string(),
  updatedAt: timestampSchema,
});

export const updateNotificationPreferencesBodySchema = notificationPreferencesSchema
  .pick({
    healthEnabled: true,
    familyTasksEnabled: true,
    rewardsEnabled: true,
    backupEnabled: true,
    capsulesEnabled: true,
    anniversariesEnabled: true,
    dndEnabled: true,
    dndStartMinute: true,
    dndEndMinute: true,
    timezoneName: true,
  })
  .partial();

export const notificationPublicSchema = z.object({
  id: ulidSchema,
  category: notificationCategorySchema,
  title: z.string(),
  body: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  createdAt: timestampSchema,
  readAt: timestampSchema.nullable(),
});

export const notificationListResponseSchema = z.object({
  items: z.array(notificationPublicSchema),
  unreadCount: z.number().int().min(0),
});

export type NotificationCategory = z.infer<typeof notificationCategorySchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type UpdateNotificationPreferencesBody = z.infer<
  typeof updateNotificationPreferencesBodySchema
>;
export type NotificationPublic = z.infer<typeof notificationPublicSchema>;
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
