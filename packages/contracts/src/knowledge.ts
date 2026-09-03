import { z } from 'zod';

const ulidSchema = z.string().regex(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
const timestampSchema = z
  .number()
  .int('时间必须是完整数字')
  .positive('时间必须晚于 1970 年');

export const knowledgeCategorySchema = z.enum([
  'RECOMMEND',
  'FOOD',
  'SLEEP',
  'TEETHING',
  'MOTOR',
  'LANGUAGE',
  'COGNITION',
  'PARENTING',
  'SAFETY',
]);

export type KnowledgeCategory = z.infer<typeof knowledgeCategorySchema>;

export const knowledgeStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'OFFLINE']);

// 普通用户可见的知识公共字段。body 只在 detail 返回，列表只带 summary。
export const knowledgePublicSchema = z.object({
  id: ulidSchema,
  title: z.string(),
  summary: z.string(),
  category: knowledgeCategorySchema,
  minAgeDays: z.number().int().min(0).nullable(),
  maxAgeDays: z.number().int().min(0).nullable(),
  sourceName: z.string(),
  sourceUrl: z.string().nullable(),
  reviewedAt: timestampSchema,
  contentVersion: z.number().int().positive(),
  priority: z.number().int(),
  publishedAt: timestampSchema.nullable(),
  updatedAt: timestampSchema,
  version: z.number().int().positive(),
});

export const knowledgeDetailSchema = knowledgePublicSchema.extend({
  body: z.string(),
});

// 用户针对某个宝宝对某篇知识的状态。learnedVersion 是版本闭环的核心：
// learnedVersion >= contentVersion → 当前版本已学，不再普通推荐；
// learnedVersion < contentVersion → 显示“内容有更新”，可重新推荐。
export const knowledgeUserStateSchema = z.object({
  knowledgeId: ulidSchema,
  saved: z.boolean(),
  readLater: z.boolean(),
  dismissed: z.boolean(),
  learnedVersion: z.number().int().positive().nullable(),
  learnedAt: timestampSchema.nullable(),
  contentVersion: z.number().int().positive(),
  contentUpdated: z.boolean(),
  version: z.number().int().positive(),
});

export const putKnowledgeStateBodySchema = z
  .object({
    saved: z.boolean().optional(),
    readLater: z.boolean().optional(),
    dismissed: z.boolean().optional(),
    markLearned: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: '至少要更新一项状态',
  });

export type KnowledgePublic = z.infer<typeof knowledgePublicSchema>;
export type KnowledgeDetail = z.infer<typeof knowledgeDetailSchema>;
export type KnowledgeUserState = z.infer<typeof knowledgeUserStateSchema>;
export type PutKnowledgeStateBody = z.infer<typeof putKnowledgeStateBodySchema>;

export const knowledgeListResponseSchema = z.object({
  items: z.array(knowledgePublicSchema),
});

export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;

export const knowledgeSearchResponseSchema = z.object({
  items: z.array(knowledgePublicSchema),
});

export type KnowledgeSearchResponse = z.infer<
  typeof knowledgeSearchResponseSchema
>;

export const knowledgeRecommendationsResponseSchema = z.object({
  items: z.array(
    knowledgePublicSchema.extend({
      // 透明推荐理由：为什么这条出现在这里。
      reason: z.string(),
    }),
  ),
  babyAgeDays: z.number().int().min(0).nullable(),
});

export type KnowledgeRecommendation = z.infer<
  typeof knowledgeRecommendationsResponseSchema
>['items'][number];
export type KnowledgeRecommendationsResponse = z.infer<
  typeof knowledgeRecommendationsResponseSchema
>;

export const knowledgeLibraryResponseSchema = z.object({
  items: z.array(
    knowledgeUserStateSchema.extend({
      title: z.string(),
      summary: z.string(),
      category: knowledgeCategorySchema,
    }),
  ),
});

export type KnowledgeLibraryResponse = z.infer<
  typeof knowledgeLibraryResponseSchema
>;

export const knowledgeLibraryStateSchema = z.enum([
  'saved',
  'later',
  'learned',
]);

export type KnowledgeLibraryState = z.infer<
  typeof knowledgeLibraryStateSchema
>;

// 首页快捷入口的真实计数（收藏 / 稍后看 / 已学）。
export const knowledgeLibraryCountsResponseSchema = z.object({
  saved: z.number().int().min(0),
  later: z.number().int().min(0),
  learned: z.number().int().min(0),
});

export type KnowledgeLibraryCountsResponse = z.infer<
  typeof knowledgeLibraryCountsResponseSchema
>;

export const knowledgeFeedbackBodySchema = z.object({
  type: z.enum(['REDUCE_CATEGORY', 'CONTENT_ISSUE']),
  message: z.string().trim().max(500, '反馈内容不能超过 500 个字').optional(),
});

export type KnowledgeFeedbackBody = z.infer<typeof knowledgeFeedbackBodySchema>;
