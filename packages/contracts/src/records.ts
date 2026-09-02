import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const noteSchema = z.string().trim().max(500).nullable().optional();

export const feedingTypeSchema = z.enum(['BOTTLE', 'BREAST']);
export const milkTypeSchema = z.enum(['FORMULA', 'BREAST_MILK', 'MIXED']);
export const feedingStatusSchema = z.enum(['COMPLETED', 'RUNNING', 'PAUSED']);
export const breastSideSchema = z.enum(['LEFT', 'RIGHT']);
export const sleepStatusSchema = z.enum(['RUNNING', 'COMPLETED']);
export const diaperTypeSchema = z.enum(['WET', 'DIRTY', 'BOTH', 'DRY']);
export const recordKindSchema = z.enum(['FEEDING', 'SLEEP', 'DIAPER', 'FOOD']);
export const timelineKindFilterSchema = z.enum([
  'all',
  'feeding',
  'sleep',
  'diaper',
  'food',
]);

export const feedingSegmentPublicSchema = z.object({
  id: ulidSchema,
  feedingRecordId: ulidSchema,
  side: breastSideSchema,
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  sequenceNo: z.number().int(),
});

export const feedingPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  feedingType: feedingTypeSchema,
  milkType: milkTypeSchema.nullable(),
  amountMl: z.number().nullable(),
  status: feedingStatusSchema,
  startedAt: z.number().int().nullable(),
  endedAt: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  recordedAt: z.number().int(),
  timezoneName: z.string(),
  note: z.string().nullable(),
  createdBy: ulidSchema,
  createdAt: z.number().int(),
  updatedBy: ulidSchema,
  updatedAt: z.number().int(),
  version: z.number().int(),
  segments: z.array(feedingSegmentPublicSchema),
});

export const sleepPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  status: sleepStatusSchema,
  startedAt: z.number().int(),
  endedAt: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  startTimezone: z.string(),
  endTimezone: z.string().nullable(),
  note: z.string().nullable(),
  createdBy: ulidSchema,
  createdAt: z.number().int(),
  updatedBy: ulidSchema,
  updatedAt: z.number().int(),
  version: z.number().int(),
});

export const diaperPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  diaperType: diaperTypeSchema,
  stoolColor: z.string().nullable(),
  stoolTexture: z.string().nullable(),
  recordedAt: z.number().int(),
  timezoneName: z.string(),
  note: z.string().nullable(),
  createdBy: ulidSchema,
  createdAt: z.number().int(),
  updatedBy: ulidSchema,
  updatedAt: z.number().int(),
  version: z.number().int(),
});

export const foodPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  foodName: z.string(),
  amountText: z.string().nullable(),
  reaction: z.string().nullable(),
  preference: z.string().nullable(),
  recordedAt: z.number().int(),
  timezoneName: z.string(),
  note: z.string().nullable(),
  createdBy: ulidSchema,
  createdAt: z.number().int(),
  updatedBy: ulidSchema,
  updatedAt: z.number().int(),
  version: z.number().int(),
});

export const runningTimersSchema = z.object({
  sleep: sleepPublicSchema.nullable(),
  feeding: feedingPublicSchema.nullable(),
});

export const timelineItemSchema = z.object({
  id: ulidSchema,
  kind: recordKindSchema,
  recordedAt: z.number().int(),
  title: z.string(),
  subtitle: z.string().nullable(),
  status: z.string().nullable(),
  version: z.number().int(),
  feedingType: feedingTypeSchema.optional(),
  diaperType: diaperTypeSchema.optional(),
  // M3：本机 pending 的记录在 UI 上有小标记；服务端不返回该字段。
  syncState: z.enum(['pending', 'syncing', 'synced']).optional(),
});

export const timelineSummarySchema = z.object({
  feedingCount: z.number().int(),
  sleepSeconds: z.number().int(),
  diaperCount: z.number().int(),
  foodCount: z.number().int(),
});

export const timelineResponseSchema = z.object({
  items: z.array(timelineItemSchema),
  nextCursor: z.string().nullable(),
  summary: timelineSummarySchema,
  running: runningTimersSchema,
});

export const timelineQuerySchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  kind: timelineKindFilterSchema.default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const statsRangeSchema = z.enum(['day', 'week', 'month']);

export const statsBucketSchema = z.object({
  label: z.string(),
  feedingCount: z.number().int(),
  sleepSeconds: z.number().int(),
  diaperCount: z.number().int(),
  foodCount: z.number().int(),
});

export const recordStatsQuerySchema = z.object({
  range: statsRangeSchema.default('day'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式是 YYYY-MM-DD')
    .optional(),
  timezoneName: z.string().trim().min(1).optional(),
  // 客户端本地时区相对 UTC 的偏移（分钟，东八区为 480），分桶按用户本地日进行
  utcOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional(),
});

export const recordStatsResponseSchema = z.object({
  range: statsRangeSchema,
  buckets: z.array(statsBucketSchema),
});

export const createBottleBodySchema = z.object({
  amountMl: z
    .number({
      required_error: '先记下这一瓶喝了多少',
      invalid_type_error: '先记下这一瓶喝了多少',
    })
    .positive('先记下这一瓶喝了多少')
    .max(2000, '这一瓶有点太多了，再看一眼毫升数'),
  milkType: milkTypeSchema.optional(),
  recordedAt: z.number().int().positive().optional(),
  timezoneName: z.string().trim().min(1).optional(),
  note: noteSchema,
});

export const updateFeedingBodySchema = z.object({
  amountMl: z.number().positive().max(2000).nullable().optional(),
  milkType: milkTypeSchema.nullable().optional(),
  recordedAt: z.number().int().positive().optional(),
  note: noteSchema,
});

export const startBreastBodySchema = z.object({
  side: breastSideSchema.default('LEFT'),
  startedAt: z.number().int().positive().optional(),
  timezoneName: z.string().trim().min(1).optional(),
  note: noteSchema,
});

export const switchBreastBodySchema = z.object({
  side: breastSideSchema.optional(),
});

export const startSleepBodySchema = z.object({
  startedAt: z.number().int().positive().optional(),
  timezoneName: z.string().trim().min(1).optional(),
  note: noteSchema,
});

export const createSleepBodySchema = z.object({
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive(),
  timezoneName: z.string().trim().min(1).optional(),
  note: noteSchema,
});

export const finishSleepBodySchema = z.object({
  endedAt: z.number().int().positive().optional(),
  timezoneName: z.string().trim().min(1).optional(),
  note: noteSchema,
});

export const updateSleepBodySchema = z.object({
  startedAt: z.number().int().positive().optional(),
  endedAt: z.number().int().positive().nullable().optional(),
  note: noteSchema,
});

export const createDiaperBodySchema = z.object({
  diaperType: diaperTypeSchema,
  stoolColor: z.string().trim().max(32).nullable().optional(),
  stoolTexture: z.string().trim().max(32).nullable().optional(),
  recordedAt: z.number().int().positive().optional(),
  timezoneName: z.string().trim().min(1).optional(),
  note: noteSchema,
});

export const updateDiaperBodySchema = createDiaperBodySchema.partial();

export const createFoodBodySchema = z.object({
  foodName: z
    .string({ required_error: '先写一写今天吃了什么', invalid_type_error: '先写一写今天吃了什么' })
    .trim()
    .min(1, '先写一写今天吃了什么')
    .max(64, '名字有点长，缩短一点点就好'),
  amountText: z.string().trim().max(32).nullable().optional(),
  reaction: z.string().trim().max(64).nullable().optional(),
  preference: z.string().trim().max(32).nullable().optional(),
  recordedAt: z.number().int().positive().optional(),
  timezoneName: z.string().trim().min(1).optional(),
  note: noteSchema,
});

export const updateFoodBodySchema = createFoodBodySchema.partial();

export type FeedingSegmentPublic = z.infer<typeof feedingSegmentPublicSchema>;
export type FeedingPublic = z.infer<typeof feedingPublicSchema>;
export type SleepPublic = z.infer<typeof sleepPublicSchema>;
export type DiaperPublic = z.infer<typeof diaperPublicSchema>;
export type FoodPublic = z.infer<typeof foodPublicSchema>;
export type RunningTimers = z.infer<typeof runningTimersSchema>;
export type TimelineItem = z.infer<typeof timelineItemSchema>;
export type TimelineResponse = z.infer<typeof timelineResponseSchema>;
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
export type StatsRange = z.infer<typeof statsRangeSchema>;
export type StatsBucket = z.infer<typeof statsBucketSchema>;
export type RecordStatsQuery = z.infer<typeof recordStatsQuerySchema>;
export type RecordStatsResponse = z.infer<typeof recordStatsResponseSchema>;
export type CreateBottleBody = z.infer<typeof createBottleBodySchema>;
export type UpdateFeedingBody = z.infer<typeof updateFeedingBodySchema>;
export type StartBreastBody = z.infer<typeof startBreastBodySchema>;
export type SwitchBreastBody = z.infer<typeof switchBreastBodySchema>;
export type StartSleepBody = z.infer<typeof startSleepBodySchema>;
export type CreateSleepBody = z.infer<typeof createSleepBodySchema>;
export type FinishSleepBody = z.infer<typeof finishSleepBodySchema>;
export type UpdateSleepBody = z.infer<typeof updateSleepBodySchema>;
export type CreateDiaperBody = z.infer<typeof createDiaperBodySchema>;
export type UpdateDiaperBody = z.infer<typeof updateDiaperBodySchema>;
export type CreateFoodBody = z.infer<typeof createFoodBodySchema>;
export type UpdateFoodBody = z.infer<typeof updateFoodBodySchema>;
