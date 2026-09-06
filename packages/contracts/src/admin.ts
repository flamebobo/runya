import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

export const adminAuthBodySchema = z.object({
  password: z.string().min(1, '请输入管理员密码').max(128),
});

export const adminReauthBodySchema = z.object({
  password: z.string().min(1, '请输入管理员密码').max(128),
  actionScope: z.string().trim().min(1).max(120),
  resourceId: z.string().trim().min(1).max(160).optional().nullable(),
});

export const adminSessionPublicSchema = z.object({
  sessionId: ulidSchema,
  userId: ulidSchema,
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  lastActionAt: z.number().int(),
});

export const adminReauthGrantSchema = z.object({
  grant: z.string().min(16),
  token: z.string().min(16),
  actionScope: z.string(),
  resourceId: z.string().nullable(),
  expiresAt: z.number().int(),
});

export const auditLogSchema = z.object({
  id: ulidSchema,
  requestId: z.string(),
  actorUserId: ulidSchema.nullable(),
  adminSessionId: ulidSchema.nullable(),
  familyId: ulidSchema.nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  before: z.record(z.unknown()).nullable(),
  after: z.record(z.unknown()).nullable(),
  result: z.enum(['SUCCESS', 'FAILED']),
  errorCode: z.string().nullable(),
  createdAt: z.number().int(),
});

export type AdminAuthBody = z.infer<typeof adminAuthBodySchema>;
export type AdminReauthBody = z.infer<typeof adminReauthBodySchema>;
export type AdminSessionPublic = z.infer<typeof adminSessionPublicSchema>;
export type AdminReauthGrant = z.infer<typeof adminReauthGrantSchema>;
export type AuditLogPublic = z.infer<typeof auditLogSchema>;
