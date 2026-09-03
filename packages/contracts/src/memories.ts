import { z } from 'zod';
import { mediaPublicSchema } from './media.js';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const timestampSchema = z.number().int().positive();
const timezoneSchema = z.string().trim().min(1).max(64);

export const audioCategorySchema = z.enum([
  'FIRST_MOM',
  'FIRST_DAD',
  'LAUGH',
  'BABBLING',
  'DAD_STORY',
  'MOM_LULLABY',
  'FIRST_WORDS',
  'SINGING',
  'SLEEP_TALK',
  'OTHER',
]);

export const capsuleStateSchema = z.enum(['DRAFT', 'SEALED', 'OPENED']);

// --- Photo Memories ---
export const createPhotoMemoryBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '照片回忆需要一个标题')
    .max(100, '标题不能超过 100 字'),
  story: z.string().trim().max(2000, '故事不能超过 2000 字').optional(),
  happenedAt: timestampSchema,
  timezoneName: timezoneSchema.optional(),
  mediaIds: z.array(ulidSchema).max(20).optional(),
  favorite: z.boolean().optional(),
});

export const updatePhotoMemoryBodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  story: z.string().trim().max(2000).nullable().optional(),
  happenedAt: timestampSchema.optional(),
  timezoneName: timezoneSchema.optional(),
  mediaIds: z.array(ulidSchema).min(1).max(20).optional(),
  favorite: z.boolean().optional(),
});

export const photoMemoryPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  title: z.string(),
  story: z.string().nullable(),
  happenedAt: timestampSchema,
  timezoneName: z.string(),
  favorite: z.boolean(),
  media: z.array(mediaPublicSchema),
  createdBy: ulidSchema,
  createdAt: timestampSchema,
  updatedBy: ulidSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

// --- Baby Quotes ---
export const createBabyQuoteBodySchema = z.object({
  quoteText: z
    .string()
    .trim()
    .min(1, '写下宝宝说的这句话吧')
    .max(500, '语录不能超过 500 字'),
  audioMediaId: ulidSchema.optional(),
  happenedAt: timestampSchema,
  timezoneName: timezoneSchema.optional(),
  favorite: z.boolean().optional(),
});

export const updateBabyQuoteBodySchema = z.object({
  quoteText: z.string().trim().min(1).max(500).optional(),
  audioMediaId: ulidSchema.nullable().optional(),
  happenedAt: timestampSchema.optional(),
  timezoneName: timezoneSchema.optional(),
  favorite: z.boolean().optional(),
});

export const babyQuotePublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  quoteText: z.string(),
  audioMedia: mediaPublicSchema.nullable().optional(),
  happenedAt: timestampSchema,
  timezoneName: z.string(),
  favorite: z.boolean(),
  createdBy: ulidSchema,
  createdAt: timestampSchema,
  updatedBy: ulidSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

// --- Audio Memories ---
export const createAudioMemoryBodySchema = z.object({
  mediaId: ulidSchema,
  title: z.string().trim().min(1, '录音需要一个标题').max(100, '标题不能超过 100 字'),
  category: audioCategorySchema.default('OTHER'),
  happenedAt: timestampSchema,
  timezoneName: timezoneSchema.optional(),
  favorite: z.boolean().optional(),
});

export const updateAudioMemoryBodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  category: audioCategorySchema.optional(),
  happenedAt: timestampSchema.optional(),
  timezoneName: timezoneSchema.optional(),
  favorite: z.boolean().optional(),
});

export const audioMemoryPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  title: z.string(),
  category: audioCategorySchema,
  happenedAt: timestampSchema,
  timezoneName: z.string(),
  favorite: z.boolean(),
  media: mediaPublicSchema.nullable(),
  createdBy: ulidSchema,
  createdAt: timestampSchema,
  updatedBy: ulidSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

// --- First Moments ---
export const createFirstMomentBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '第一次发生的事是什么呢')
    .max(100, '标题不能超过 100 字'),
  description: z.string().trim().max(2000).optional(),
  happenedAt: timestampSchema,
  timezoneName: timezoneSchema.optional(),
  mediaIds: z.array(ulidSchema).max(10).optional(),
  favorite: z.boolean().optional(),
});

export const updateFirstMomentBodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  happenedAt: timestampSchema.optional(),
  timezoneName: timezoneSchema.optional(),
  mediaIds: z.array(ulidSchema).max(10).optional(),
  favorite: z.boolean().optional(),
});

export const firstMomentPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema,
  title: z.string(),
  description: z.string().nullable(),
  happenedAt: timestampSchema,
  timezoneName: z.string(),
  favorite: z.boolean(),
  media: z.array(mediaPublicSchema),
  createdBy: ulidSchema,
  createdAt: timestampSchema,
  updatedBy: ulidSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

// --- Time Capsules ---
export const createTimeCapsuleBodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '给时光胶囊起个名字吧')
    .max(100, '名字不能超过 100 字'),
  body: z
    .string()
    .trim()
    .min(1, '写下想给未来的话吧')
    .max(10000, '胶囊内容不能超过 10000 字'),
  openAt: timestampSchema,
  recipientText: z.string().trim().max(100, '收件人不能超过 100 字').optional(),
  mediaIds: z.array(ulidSchema).max(20).optional(),
  favorite: z.boolean().optional(),
  sealNow: z.boolean().optional(),
});

export const updateTimeCapsuleBodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  body: z.string().trim().min(1).max(10000).optional(),
  openAt: timestampSchema.optional(),
  recipientText: z.string().trim().max(100).nullable().optional(),
  mediaIds: z.array(ulidSchema).max(20).optional(),
  favorite: z.boolean().optional(),
});

export const updateTimeCapsuleFavoriteBodySchema = z.object({
  favorite: z.boolean(),
});

export const timeCapsulePublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema.nullable().optional(),
  creatorUserId: ulidSchema,
  recipientText: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  openAt: timestampSchema,
  favorite: z.boolean(),
  state: capsuleStateSchema,
  sealedAt: timestampSchema.nullable(),
  openedAt: timestampSchema.nullable(),
  media: z.array(mediaPublicSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

// --- Summaries & Reviews ---
export const memoriesHomeSummarySchema = z.object({
  photosCount: z.number().int().nonnegative(),
  quotesCount: z.number().int().nonnegative(),
  audiosCount: z.number().int().nonnegative(),
  firstsCount: z.number().int().nonnegative(),
  capsulesCount: z.number().int().nonnegative(),
  favoritesCount: z.number().int().nonnegative(),
  onThisDayCount: z.number().int().nonnegative(),
  recentPhotos: z.array(photoMemoryPublicSchema),
  recentQuote: babyQuotePublicSchema.nullable().optional(),
  recentAudio: audioMemoryPublicSchema.nullable().optional(),
  sealedCapsules: z.array(timeCapsulePublicSchema),
});

export const onThisDayResponseSchema = z.object({
  yearsAgo: z.number().int().positive(),
  photos: z.array(photoMemoryPublicSchema),
  quotes: z.array(babyQuotePublicSchema),
  audios: z.array(audioMemoryPublicSchema),
  firsts: z.array(firstMomentPublicSchema),
  capsules: z.array(timeCapsulePublicSchema),
});

export const memoriesFavoritesSchema = z.object({
  photos: z.array(photoMemoryPublicSchema),
  quotes: z.array(babyQuotePublicSchema),
  audios: z.array(audioMemoryPublicSchema),
  firsts: z.array(firstMomentPublicSchema),
  capsules: z.array(timeCapsulePublicSchema),
  totalCount: z.number().int().nonnegative(),
});

export const annualReviewResponseSchema = z.object({
  year: z.number().int(),
  photos: z.array(photoMemoryPublicSchema),
  quotes: z.array(babyQuotePublicSchema),
  audios: z.array(audioMemoryPublicSchema),
  firsts: z.array(firstMomentPublicSchema),
  capsules: z.array(timeCapsulePublicSchema),
  photosCount: z.number().int().nonnegative(),
  quotesCount: z.number().int().nonnegative(),
  audiosCount: z.number().int().nonnegative(),
  firstsCount: z.number().int().nonnegative(),
  capsulesCount: z.number().int().nonnegative(),
  favoritesCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});

export type AudioCategory = z.infer<typeof audioCategorySchema>;
export type CapsuleState = z.infer<typeof capsuleStateSchema>;
export type CreatePhotoMemoryBody = z.infer<typeof createPhotoMemoryBodySchema>;
export type UpdatePhotoMemoryBody = z.infer<typeof updatePhotoMemoryBodySchema>;
export type PhotoMemoryPublic = z.infer<typeof photoMemoryPublicSchema>;
export type CreateBabyQuoteBody = z.infer<typeof createBabyQuoteBodySchema>;
export type UpdateBabyQuoteBody = z.infer<typeof updateBabyQuoteBodySchema>;
export type BabyQuotePublic = z.infer<typeof babyQuotePublicSchema>;
export type CreateAudioMemoryBody = z.infer<typeof createAudioMemoryBodySchema>;
export type UpdateAudioMemoryBody = z.infer<typeof updateAudioMemoryBodySchema>;
export type AudioMemoryPublic = z.infer<typeof audioMemoryPublicSchema>;
export type CreateFirstMomentBody = z.infer<typeof createFirstMomentBodySchema>;
export type UpdateFirstMomentBody = z.infer<typeof updateFirstMomentBodySchema>;
export type FirstMomentPublic = z.infer<typeof firstMomentPublicSchema>;
export type CreateTimeCapsuleBody = z.infer<typeof createTimeCapsuleBodySchema>;
export type UpdateTimeCapsuleBody = z.infer<typeof updateTimeCapsuleBodySchema>;
export type UpdateTimeCapsuleFavoriteBody = z.infer<
  typeof updateTimeCapsuleFavoriteBodySchema
>;
export type TimeCapsulePublic = z.infer<typeof timeCapsulePublicSchema>;
export type MemoriesHomeSummary = z.infer<typeof memoriesHomeSummarySchema>;
export type OnThisDayResponse = z.infer<typeof onThisDayResponseSchema>;
export type MemoriesFavorites = z.infer<typeof memoriesFavoritesSchema>;
export type AnnualReviewResponse = z.infer<typeof annualReviewResponseSchema>;
