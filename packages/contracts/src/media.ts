import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const timestampSchema = z.number().int().positive();

export const mediaTypeSchema = z.enum(['IMAGE', 'AUDIO', 'VIDEO', 'FILE']);
export const mediaStatusSchema = z.enum([
  'PENDING',
  'UPLOADING',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETED',
]);
export const uploadStatusSchema = z.enum(['INIT', 'UPLOADING', 'COMPLETE', 'EXPIRED']);

export const initUploadBodySchema = z.object({
  mediaType: mediaTypeSchema,
  mimeType: z.string().trim().min(1, '缺少 MIME 类型'),
  originalFilename: z.string().trim().max(255).optional(),
  expectedSize: z
    .number()
    .int()
    .positive('文件大小必须大于 0')
    .max(500 * 1024 * 1024, '单文件不能超过 500 MB'),
  expectedSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'SHA256 格式不正确')
    .optional(),
  babyId: ulidSchema.optional(),
});

export const initUploadResponseSchema = z.object({
  uploadId: ulidSchema,
  mediaId: ulidSchema,
  uploadToken: z.string(),
  chunkSize: z.number().int().positive(),
  expiresAt: timestampSchema,
});

export const uploadPartResponseSchema = z.object({
  uploadId: ulidSchema,
  partNo: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  receivedBytes: z.number().int().nonnegative(),
});

export const uploadStateResponseSchema = z.object({
  uploadId: ulidSchema,
  mediaId: ulidSchema,
  expectedSize: z.number().int().positive(),
  receivedBytes: z.number().int().nonnegative(),
  chunkSize: z.number().int().positive(),
  completedParts: z.array(z.number().int().positive()),
  status: uploadStatusSchema,
  expiresAt: timestampSchema,
});

export const completeUploadBodySchema = z.object({
  finalSha256: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, 'SHA256 格式不正确')
    .optional(),
});

export const mediaPublicSchema = z.object({
  id: ulidSchema,
  familyId: ulidSchema,
  babyId: ulidSchema.nullable().optional(),
  ownerUserId: ulidSchema,
  mediaType: mediaTypeSchema,
  status: mediaStatusSchema,
  mimeType: z.string(),
  originalFilename: z.string().nullable().optional(),
  sizeBytes: z.number().int().nullable().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  waveformJson: z.string().nullable().optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type MediaType = z.infer<typeof mediaTypeSchema>;
export type MediaStatus = z.infer<typeof mediaStatusSchema>;
export type UploadStatus = z.infer<typeof uploadStatusSchema>;
export type InitUploadBody = z.infer<typeof initUploadBodySchema>;
export type InitUploadResponse = z.infer<typeof initUploadResponseSchema>;
export type UploadPartResponse = z.infer<typeof uploadPartResponseSchema>;
export type UploadStateResponse = z.infer<typeof uploadStateResponseSchema>;
export type CompleteUploadBody = z.infer<typeof completeUploadBodySchema>;
export type MediaPublic = z.infer<typeof mediaPublicSchema>;
