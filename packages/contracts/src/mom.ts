import { z } from 'zod';
import { mediaPublicSchema } from './media.js';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const timestampSchema = z
  .number()
  .int('时间必须是完整数字')
  .positive('时间必须晚于 1970 年');
const timezoneSchema = z.string().trim().min(1, '缺少时区信息').max(64, '时区信息过长');

// PRD 13.2：特别开心 / 还不错 / 普通 / 有点累 / 需要抱抱。所有心情平等，不打分。
export const moodKindSchema = z.enum(['GREAT', 'GOOD', 'OK', 'TIRED', 'NEED_HUG']);

// PRD 13.6 / UI Spec §16.4：默认仅本人可见，服务端是最终边界。
export const visibilitySchema = z.enum(['PRIVATE', 'FAMILY']);

const diaryBodySchema = z
  .string()
  .trim()
  .min(1, '写下想对自己说的话吧')
  .max(20000, '日记有点太长了，分成两篇慢慢写');

const diaryTitleSchema = z
  .string()
  .trim()
  .max(60, '标题不能超过 60 个字')
  .nullable()
  .optional();

const moodNoteSchema = z
  .string()
  .trim()
  .max(200, '一句话就好，慢慢来')
  .nullable()
  .optional();

// --- Moods ---
export const createMoodBodySchema = z.object({
  mood: moodKindSchema,
  note: moodNoteSchema,
  recordedAt: timestampSchema,
  timezoneName: timezoneSchema.optional(),
  visibility: visibilitySchema.optional(),
});

export const updateMoodBodySchema = z.object({
  mood: moodKindSchema.optional(),
  note: moodNoteSchema,
  visibility: visibilitySchema.optional(),
});

export const moodPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  userId: ulidSchema,
  mood: moodKindSchema,
  note: z.string().nullable(),
  visibility: visibilitySchema,
  recordedAt: timestampSchema,
  timezoneName: z.string(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

// --- Diaries ---
export const createDiaryBodySchema = z.object({
  title: diaryTitleSchema,
  body: diaryBodySchema,
  visibility: visibilitySchema.optional(),
  recordedAt: timestampSchema,
  timezoneName: timezoneSchema.optional(),
  mediaIds: z.array(ulidSchema).max(9, '图片最多 9 张').optional(),
});

export const updateDiaryBodySchema = z.object({
  title: diaryTitleSchema,
  body: diaryBodySchema.optional(),
  visibility: visibilitySchema.optional(),
  mediaIds: z.array(ulidSchema).max(9, '图片最多 9 张').optional(),
});

export const diaryPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  ownerUserId: ulidSchema,
  title: z.string().nullable(),
  body: z.string(),
  visibility: visibilitySchema,
  recordedAt: timestampSchema,
  timezoneName: z.string(),
  media: z.array(mediaPublicSchema).optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

export const momHomeSummarySchema = z.object({
  latestMood: moodPublicSchema.nullable().optional(),
  moodCount: z.number().int().nonnegative(),
  diaryCount: z.number().int().nonnegative(),
});

//心情日历（个人回顾，非 KPI）：仅返回有记录的日子与心情。
export const moodCalendarResponseSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  days: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      moods: z.array(moodPublicSchema),
    }),
  ),
});

export type MoodKind = z.infer<typeof moodKindSchema>;
export type Visibility = z.infer<typeof visibilitySchema>;
export type CreateMoodBody = z.infer<typeof createMoodBodySchema>;
export type UpdateMoodBody = z.infer<typeof updateMoodBodySchema>;
export type MoodPublic = z.infer<typeof moodPublicSchema>;
export type CreateDiaryBody = z.infer<typeof createDiaryBodySchema>;
export type UpdateDiaryBody = z.infer<typeof updateDiaryBodySchema>;
export type DiaryPublic = z.infer<typeof diaryPublicSchema>;
export type MomHomeSummary = z.infer<typeof momHomeSummarySchema>;
export type MoodCalendarResponse = z.infer<typeof moodCalendarResponseSchema>;
