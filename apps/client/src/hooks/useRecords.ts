import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimelineQuery } from '@runew/contracts';
import { fetchTimeline } from '@/api/records';
import { bootstrapQueryKey } from '@/hooks/useBootstrap';

export function recordsQueryKey(babyId: string, query: Partial<TimelineQuery>) {
  return ['records', babyId, query] as const;
}

export function useTimelineQuery(babyId: string | null, query: Partial<TimelineQuery>) {
  return useQuery({
    queryKey: recordsQueryKey(babyId ?? '', query),
    enabled: Boolean(babyId),
    staleTime: 5_000,
    queryFn: () => fetchTimeline(babyId!, query),
  });
}

export function useInvalidateCare(babyId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['records'] });
    void queryClient.invalidateQueries({ queryKey: bootstrapQueryKey });
    if (babyId) {
      void queryClient.invalidateQueries({ queryKey: ['records', babyId] });
    }
  };
}
