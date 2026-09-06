import { z } from 'zod';
import type { DiaperType, RecordKind } from '@runew/domain-types';
import { diaperTypeSchema } from './records.js';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const noteSchema = z
  .string()
  .trim()
  .max(500, '备注不能超过 500 个字')
  .nullable()
  .optional();

export const syncOpSchema = z.enum(['CREATE', 'UPDATE', 'DELETE', 'RESTORE']);

export const entityTypeSchema = z.enum([
  'DIAPER_RECORD',
  'FOOD_RECORD',
  'GROWTH_RECORD',
  'MILESTONE',
  'HEALTH_EVENT',
]);

// Reward orders are server-owned mutations, not offline pending operations.
// They still appear in pull responses so a reward update cannot poison a
// family's sync cursor while the client refreshes its query-backed order view.
export const syncChangeEntityTypeSchema = z.enum([
  'DIAPER_RECORD',
  'FOOD_RECORD',
  'GROWTH_RECORD',
  'MILESTONE',
  'HEALTH_EVENT',
  'REWARD_ORDER',
]);

// CREATE 的 fullPayload 字段；UPDATE 的 patch / baseSnapshot 复用同一形状（全部可选）。
export const recordPayloadSchema = z
  .object({
    babyId: ulidSchema.optional(),
    diaperType: diaperTypeSchema.optional(),
    foodName: z.string().trim().min(1).max(64).optional(),
    amountText: z.string().trim().max(32).nullable().optional(),
    heightCm: z
      .number()
      .positive('身高必须大于 0')
      .max(300, '身高数字有点大，再看一眼')
      .nullable()
      .optional(),
    weightKg: z
      .number()
      .positive('体重必须大于 0')
      .max(500, '体重数字有点大，再看一眼')
      .nullable()
      .optional(),
    headCircumferenceCm: z
      .number()
      .positive('头围必须大于 0')
      .max(150, '头围数字有点大，再看一眼')
      .nullable()
      .optional(),
    title: z
      .string()
      .trim()
      .min(1, '里程碑需要一个名字')
      .max(100, '里程碑名称不能超过 100 个字')
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, '里程碑描述不能超过 2000 个字')
      .nullable()
      .optional(),
    happenedAt: z
      .number()
      .int('时间必须是完整数字')
      .positive('时间必须晚于 1970 年')
      .optional(),
    coverMediaId: ulidSchema.nullable().optional(),
    recordedAt: z
      .number()
      .int('时间必须是完整数字')
      .positive('时间必须晚于 1970 年')
      .optional(),
    timezoneName: z
      .string()
      .trim()
      .min(1, '缺少时区信息')
      .max(64, '时区信息过长')
      .optional(),
    note: noteSchema,
    // HEALTH_EVENT
    eventType: z
      .enum(['CHECKUP', 'VACCINE', 'VISIT', 'DENTAL', 'MEDICATION', 'OTHER'])
      .optional(),
    scheduledAt: z
      .number()
      .int('时间必须是完整数字')
      .positive('时间必须晚于 1970 年')
      .optional(),
    locationName: z.string().trim().max(120).nullable().optional(),
    locationAddress: z.string().trim().max(200).nullable().optional(),
    doctorName: z.string().trim().max(60).nullable().optional(),
    completedAt: z.number().int().positive().nullable().optional(),
    status: z.enum(['UPCOMING', 'COMPLETED', 'EXPIRED', 'CANCELED']).optional(),
    reminderOffsets: z
      .array(
        z.object({
          kind: z.enum(['D7', 'D3', 'D1', 'SAME_DAY', 'CUSTOM']),
          customOffsetMinutes: z.number().int().min(0).max(43200).nullable().optional(),
          allowDndOverride: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

export const pendingOperationSchema = z.object({
  operationId: ulidSchema,
  deviceId: z.string().min(1),
  familyId: ulidSchema,
  entityType: entityTypeSchema,
  entityId: ulidSchema,
  op: syncOpSchema,
  baseVersion: z.number().int().optional(),
  baseSnapshot: recordPayloadSchema.optional(),
  patch: recordPayloadSchema.optional(),
  fullPayload: recordPayloadSchema.optional(),
  changedFields: z.array(z.string()).optional(),
  dependsOn: z.array(ulidSchema).optional(),
  clientCreatedAt: z.number().int().positive(),
  retryCount: z.number().int().min(0).optional(),
  nextRetryAt: z.number().int().optional(),
  lastErrorCode: z.string().optional(),
});

export const syncPushRequestSchema = z.object({
  deviceId: z.string().min(1).max(128),
  familyId: ulidSchema,
  operations: z.array(pendingOperationSchema).min(1).max(100),
});

export const syncOperationResultSchema = z.object({
  operationId: ulidSchema,
  status: z.enum(['APPLIED', 'DUPLICATE_QUEUED', 'CONFLICT', 'ENTITY_DELETED']),
  entityId: ulidSchema.optional(),
  version: z.number().int().optional(),
  serverCursor: z.number().int().optional(),
  conflictFields: z.array(z.string()).optional(),
  serverSnapshot: recordPayloadSchema.optional(),
  duplicateCandidates: z
    .array(
      z.object({
        candidateId: ulidSchema,
        otherEntityId: ulidSchema,
        otherSummary: z.string(),
      }),
    )
    .optional(),
  errorCode: z.string().optional(),
  message: z.string().optional(),
});

export const syncPushResponseSchema = z.object({
  results: z.array(syncOperationResultSchema),
  serverCursor: z.number().int(),
  serverEpoch: z.number().int(),
});

export const syncPullResponseSchema = z.object({
  changes: z.array(
    z.object({
      seq: z.number().int(),
      entityType: syncChangeEntityTypeSchema,
      entityId: ulidSchema,
      op: syncOpSchema,
      version: z.number().int(),
      // A delete-only sync log intentionally has no payload; the server
      // serializes that absence as null rather than omitting the field.
      payload: recordPayloadSchema.nullable().optional(),
      deleted: z.boolean().optional(),
      actorUserId: ulidSchema.optional(),
      occurredAt: z.number().int(),
    }),
  ),
  nextCursor: z.number().int(),
  hasMore: z.boolean(),
  serverEpoch: z.number().int(),
});

export const syncSnapshotResponseSchema = z.object({
  serverEpoch: z.number().int(),
  serverCursor: z.number().int(),
  entities: z.array(
    z.object({
      entityType: entityTypeSchema,
      entityId: ulidSchema,
      version: z.number().int(),
      deleted: z.boolean(),
      payload: recordPayloadSchema,
    }),
  ),
});

export const syncConflictInfoSchema = z.object({
  operationId: ulidSchema,
  entityType: entityTypeSchema,
  entityId: ulidSchema,
  serverVersion: z.number().int().positive(),
  conflictFields: z.array(z.string()),
  serverSnapshot: recordPayloadSchema,
  clientPatch: recordPayloadSchema,
  baseSnapshot: recordPayloadSchema.optional(),
});

export const duplicateCandidateSchema = z.object({
  candidateId: ulidSchema,
  entityType: entityTypeSchema,
  entityAId: ulidSchema,
  entityBId: ulidSchema,
  summaryA: z.string(),
  summaryB: z.string(),
  detectedAt: z.number().int(),
});

export const duplicateResolveBodySchema = z.object({
  resolution: z.enum(['MERGE', 'KEEP_BOTH']),
  // MERGE 时用户选定的 canonical 侧（A = 本机，B = 对端）；KEEP_BOTH 不需要。
  canonical: z.enum(['A', 'B']).optional(),
  mergedFields: recordPayloadSchema.optional(),
});

export type SyncOp = z.infer<typeof syncOpSchema>;
export type SyncEntityType = z.infer<typeof entityTypeSchema>;
export type RecordPayload = z.infer<typeof recordPayloadSchema>;
export type PendingOperation = z.infer<typeof pendingOperationSchema>;
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;
export type SyncOperationResult = z.infer<typeof syncOperationResultSchema>;
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;
export type SyncSnapshotResponse = z.infer<typeof syncSnapshotResponseSchema>;
export type SyncConflictInfo = z.infer<typeof syncConflictInfoSchema>;
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;
export type DuplicateResolveBody = z.infer<typeof duplicateResolveBodySchema>;
export type { DiaperType, RecordKind };
