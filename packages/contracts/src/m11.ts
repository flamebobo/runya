import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(128);
const timestampSchema = z.number().int().nonnegative();

export const babyPreferenceTypeSchema = z.enum(['LIKE', 'DISLIKE']);
export const babyPreferenceSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  babyId: idSchema,
  type: babyPreferenceTypeSchema,
  category: z.string().nullable(),
  label: z.string(),
  sourceType: z.enum(['MANUAL', 'FOOD', 'OTHER']),
  sourceId: idSchema.nullable(),
  createdBy: idSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

export const createBabyPreferenceBodySchema = z.object({
  type: babyPreferenceTypeSchema,
  category: z.string().trim().max(32).nullable().optional(),
  label: z.string().trim().min(1, '请写下喜欢或不喜欢的食物').max(80),
  sourceType: z.enum(['MANUAL', 'FOOD', 'OTHER']).default('MANUAL'),
  sourceId: idSchema.nullable().optional(),
});

export const updateBabyPreferenceBodySchema = createBabyPreferenceBodySchema
  .omit({ sourceType: true, sourceId: true })
  .partial();

export const babyChangeSchema = z.object({
  id: idSchema,
  familyId: idSchema,
  babyId: idSchema,
  actorUserId: idSchema,
  field: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  changedAt: timestampSchema,
});

export const userSettingsSchema = z.object({
  userId: idSchema,
  appearance: z.enum(['SYSTEM', 'LIGHT', 'NIGHT']),
  reduceMotion: z.boolean(),
  privacy: z.object({
    defaultDiaryVisibility: z.enum(['PRIVATE', 'FAMILY']),
    analyticsEnabled: z.boolean(),
  }),
  updatedAt: timestampSchema,
});

export const updateUserSettingsBodySchema = z.object({
  appearance: z.enum(['SYSTEM', 'LIGHT', 'NIGHT']).optional(),
  reduceMotion: z.boolean().optional(),
  privacy: z
    .object({
      defaultDiaryVisibility: z.enum(['PRIVATE', 'FAMILY']).optional(),
      analyticsEnabled: z.boolean().optional(),
    })
    .optional(),
});

export const searchResultSchema = z.object({
  id: idSchema,
  familyId: idSchema.nullable(),
  babyId: idSchema.nullable(),
  ownerUserId: idSchema.nullable(),
  visibility: z.string(),
  entityType: z.string(),
  entityId: idSchema,
  title: z.string(),
  snippet: z.string(),
  occurredAt: timestampSchema.nullable(),
});

export const searchResponseSchema = z.object({
  query: z.string(),
  items: z.array(searchResultSchema),
  hasMore: z.boolean(),
});

export const trashItemSchema = z.object({
  entityType: z.string(),
  entityId: idSchema,
  familyId: idSchema,
  babyId: idSchema.nullable(),
  title: z.string(),
  deletedAt: timestampSchema,
  deletedBy: idSchema.nullable(),
  expiresAt: timestampSchema,
  mediaGraceUntil: timestampSchema.nullable(),
});

export const trashResponseSchema = z.object({
  items: z.array(trashItemSchema),
  retentionDays: z.literal(30),
});

export const exportTypeSchema = z.enum([
  'CSV',
  'GROWTH_REPORT',
  'PHOTO_AUDIO_ARCHIVE',
  'MEMORY_ARCHIVE',
  'ANNUAL_REVIEW',
]);
export const exportStateSchema = z.enum(['QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED']);
export const exportJobSchema = z.object({
  id: idSchema,
  userId: idSchema,
  familyId: idSchema,
  babyId: idSchema.nullable(),
  type: exportTypeSchema,
  state: exportStateSchema,
  createdAt: timestampSchema,
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  expiresAt: timestampSchema,
  errorCode: z.string().nullable(),
});
export const createExportBodySchema = z.object({
  familyId: idSchema,
  type: exportTypeSchema,
  babyId: idSchema.optional(),
});

export const realtimeTicketSchema = z.object({
  ticket: z.string().min(16),
  expiresAt: timestampSchema,
  wsPath: z.literal('/ws'),
});
export const realtimeEventSchema = z.object({
  type: z.enum(['sync_hint', 'notification_hint', 'session_revoked', 'maintenance']),
  familyId: idSchema.nullable().optional(),
  cursor: z.number().int().nonnegative().optional(),
  reason: z.string().max(120).optional(),
});

export type BabyPreference = z.infer<typeof babyPreferenceSchema>;
export type CreateBabyPreferenceBody = z.infer<typeof createBabyPreferenceBodySchema>;
export type UpdateBabyPreferenceBody = z.infer<typeof updateBabyPreferenceBodySchema>;
export type BabyChange = z.infer<typeof babyChangeSchema>;
export type UserSettings = z.infer<typeof userSettingsSchema>;
export type UpdateUserSettingsBody = z.infer<typeof updateUserSettingsBodySchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export type TrashItem = z.infer<typeof trashItemSchema>;
export type TrashResponse = z.infer<typeof trashResponseSchema>;
export type ExportType = z.infer<typeof exportTypeSchema>;
export type ExportState = z.infer<typeof exportStateSchema>;
export type ExportJob = z.infer<typeof exportJobSchema>;
export type CreateExportBody = z.infer<typeof createExportBodySchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
