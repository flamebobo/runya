import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);

export const registerBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, '账号至少 2 个字符')
    .max(32, '账号最多 32 个字符')
    .regex(/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/, '账号仅支持字母、数字、下划线和中文'),
  password: z.string().min(8, '密码至少 8 位').max(128, '密码最多 128 位'),
  nickname: z.string().trim().min(1).max(32).optional(),
});

export const loginBodySchema = z.object({
  username: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

export const userPublicSchema = z.object({
  id: ulidSchema,
  nickname: z.string(),
  status: z.enum(['ACTIVE', 'DISABLED']),
  locale: z.string(),
  timezoneName: z.string().nullable(),
  topicPreferences: z.array(z.string()).optional(),
});

export const authSessionSchema = z.object({
  sessionId: ulidSchema,
  expiresAt: z.number().int(),
  platform: z.enum(['H5', 'WEAPP']),
  token: z.string().optional(),
});

export const registerResponseSchema = z.object({
  user: userPublicSchema,
  session: authSessionSchema,
});

export const loginResponseSchema = registerResponseSchema;

export const meResponseSchema = z.object({
  user: userPublicSchema,
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type UserPublic = z.infer<typeof userPublicSchema>;
export type AuthSession = z.infer<typeof authSessionSchema>;
