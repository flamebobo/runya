import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchKnowledgeDetail,
  fetchKnowledgeLibrary,
  fetchKnowledgeLibraryCounts,
  fetchKnowledgeList,
  fetchKnowledgeRecommendations,
  fetchKnowledgeState,
  putKnowledgeState,
  searchKnowledgeApi,
  sendKnowledgeFeedback,
} from '@/api/knowledge';

export const knowledgeListQueryKey = ['knowledge-list'] as const;
export const knowledgeDetailQueryKey = (id: string) =>
  ['knowledge-detail', id] as const;
export const knowledgeSearchQueryKey = (query: string) =>
  ['knowledge-search', query] as const;
export const knowledgeRecommendationsQueryKey = (babyId: string) =>
  ['knowledge-recommendations', babyId] as const;
export const knowledgeLibraryQueryKey = (babyId: string, state: string) =>
  ['knowledge-library', babyId, state] as const;
export const knowledgeCountsQueryKey = (babyId: string) =>
  ['knowledge-counts', babyId] as const;
export const knowledgeStateQueryKey = (babyId: string, id: string) =>
  ['knowledge-state', babyId, id] as const;

export function useKnowledgeListQuery(enabled = true) {
  return useQuery({
    queryKey: knowledgeListQueryKey,
    staleTime: 60_000,
    enabled,
    queryFn: () => fetchKnowledgeList(),
  });
}

export function useKnowledgeDetailQuery(id: string | null) {
  return useQuery({
    queryKey: knowledgeDetailQueryKey(id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchKnowledgeDetail(id!),
  });
}

export function useKnowledgeSearchQuery(query: string) {
  const keyword = query.trim();
  return useQuery({
    queryKey: knowledgeSearchQueryKey(keyword),
    enabled: keyword.length > 0,
    queryFn: () => searchKnowledgeApi(keyword),
  });
}

export function useKnowledgeRecommendationsQuery(babyId: string | null) {
  return useQuery({
    queryKey: knowledgeRecommendationsQueryKey(babyId ?? ''),
    enabled: Boolean(babyId),
    staleTime: 60_000,
    queryFn: () => fetchKnowledgeRecommendations(babyId!),
  });
}

export function useKnowledgeLibraryQuery(
  babyId: string | null,
  state: 'saved' | 'later' | 'learned',
) {
  return useQuery({
    queryKey: knowledgeLibraryQueryKey(babyId ?? '', state),
    enabled: Boolean(babyId),
    staleTime: 30_000,
    queryFn: () => fetchKnowledgeLibrary(babyId!, state),
  });
}

export function useKnowledgeCountsQuery(babyId: string | null) {
  return useQuery({
    queryKey: knowledgeCountsQueryKey(babyId ?? ''),
    enabled: Boolean(babyId),
    staleTime: 30_000,
    queryFn: () => fetchKnowledgeLibraryCounts(babyId!),
  });
}

// 详情页需要当前用户状态：收藏/稍后看/已学/内容有更新都以服务端为准。
export function useKnowledgeStateQuery(babyId: string | null, knowledgeId: string | null) {
  return useQuery({
    queryKey: knowledgeStateQueryKey(babyId ?? '', knowledgeId ?? ''),
    enabled: Boolean(babyId) && Boolean(knowledgeId),
    queryFn: () => fetchKnowledgeState(babyId!, knowledgeId!),
  });
}

// 状态变更是轻量 PUT，成功后精准失效对应宝宝的状态/库/计数与推荐流。
export function useKnowledgeStateActions(babyId: string | null) {
  const queryClient = useQueryClient();

  async function refresh(knowledgeId?: string) {
    if (babyId) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: knowledgeRecommendationsQueryKey(babyId),
        }),
        queryClient.invalidateQueries({
          queryKey: ['knowledge-library', babyId],
        }),
        queryClient.invalidateQueries({
          queryKey: knowledgeCountsQueryKey(babyId),
        }),
      ]);
    }
    if (knowledgeId && babyId) {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: knowledgeStateQueryKey(babyId, knowledgeId),
        }),
        queryClient.invalidateQueries({
          queryKey: knowledgeDetailQueryKey(knowledgeId),
        }),
      ]);
    }
  }

  const put = useMutation({
    mutationFn: async (input: {
      knowledgeId: string;
      body: Parameters<typeof putKnowledgeState>[2];
    }) => {
      if (!babyId) throw new Error('还没有选好宝宝');
      return putKnowledgeState(babyId, input.knowledgeId, input.body);
    },
    onSuccess: (_data, variables) => refresh(variables.knowledgeId),
  });

  return {
    toggleSaved: (item: { id: string }, saved: boolean) =>
      put.mutateAsync({ knowledgeId: item.id, body: { saved } }),
    toggleLater: (item: { id: string }, readLater: boolean) =>
      put.mutateAsync({ knowledgeId: item.id, body: { readLater } }),
    dismiss: (item: { id: string }) =>
      put.mutateAsync({ knowledgeId: item.id, body: { dismissed: true } }),
    markLearned: (item: { id: string }) =>
      put.mutateAsync({ knowledgeId: item.id, body: { markLearned: true } }),
    pending: put.isPending,
  };
}

// 详情页「内容有问题」反馈。轻量 POST，成功即提示，不做阻塞。
export function useKnowledgeFeedback() {
  return useMutation({
    mutationFn: (input: { knowledgeId: string; message?: string }) =>
      sendKnowledgeFeedback(input.knowledgeId, { type: 'CONTENT_ISSUE', message: input.message }),
  });
}
