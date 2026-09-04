import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDiaryBody,
  CreateMoodBody,
  DiaryPublic,
  UpdateDiaryBody,
  UpdateMoodBody,
} from '@runew/contracts';
import {
  createDiary,
  createMood,
  deleteDiary,
  deleteMood,
  fetchDiaries,
  fetchDiary,
  fetchMomSummary,
  fetchMoodCalendar,
  fetchMoods,
  updateDiary,
  updateMood,
} from '@/api/mom';

export const momSummaryQueryKey = ['mom', 'summary'] as const;
export const moodsQueryKey = ['mom', 'moods'] as const;
export const diariesQueryKey = ['mom', 'diaries'] as const;
export const moodCalendarQueryKey = ['mom', 'mood-calendar'] as const;

export function moodCalendarKey(year: number, month: number) {
  return [...moodCalendarQueryKey, `${year}-${String(month).padStart(2, '0')}`] as const;
}

export function diaryDetailKey(id: string) {
  return ['mom', 'diaries', id] as const;
}

// PRD 13：心情是个人回顾，所有查询都只取本人数据（服务端按 userId 过滤）。
export function useMomSummaryQuery() {
  return useQuery({
    queryKey: momSummaryQueryKey,
    staleTime: 30_000,
    queryFn: () => fetchMomSummary(),
  });
}

export function useMoodsQuery() {
  return useQuery({
    queryKey: moodsQueryKey,
    staleTime: 30_000,
    queryFn: () => fetchMoods(),
  });
}

export function useMoodCalendarQuery(year: number, month: number) {
  return useQuery({
    queryKey: moodCalendarKey(year, month),
    staleTime: 60_000,
    queryFn: () => fetchMoodCalendar(year, month),
  });
}

export function useDiariesQuery() {
  return useQuery({
    queryKey: diariesQueryKey,
    staleTime: 30_000,
    queryFn: () => fetchDiaries(),
  });
}

export function useDiaryQuery(id: string | undefined) {
  return useQuery({
    queryKey: diaryDetailKey(id ?? ''),
    enabled: Boolean(id),
    staleTime: 30_000,
    queryFn: () => fetchDiary(id!),
  });
}

function useInvalidateMom() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: momSummaryQueryKey });
    void queryClient.invalidateQueries({ queryKey: moodsQueryKey });
    void queryClient.invalidateQueries({ queryKey: diariesQueryKey });
    void queryClient.invalidateQueries({ queryKey: moodCalendarQueryKey });
  };
}

export function useCreateMood() {
  const invalidate = useInvalidateMom();
  return useMutation({
    mutationFn: (body: CreateMoodBody) => createMood(body),
    onSuccess: invalidate,
  });
}

export function useUpdateMood() {
  const invalidate = useInvalidateMom();
  return useMutation({
    mutationFn: ({
      id,
      body,
      version,
    }: {
      id: string;
      body: UpdateMoodBody;
      version: number;
    }) => updateMood(id, body, version),
    onSuccess: invalidate,
  });
}

export function useDeleteMood() {
  const invalidate = useInvalidateMom();
  return useMutation({
    mutationFn: (id: string) => deleteMood(id),
    onSuccess: invalidate,
  });
}

export function useCreateDiary() {
  const invalidate = useInvalidateMom();
  return useMutation({
    mutationFn: (body: CreateDiaryBody) => createDiary(body),
    onSuccess: invalidate,
  });
}

// Diary 编辑走 If-Match 乐观并发；ENTITY_VERSION_CONFLICT 由页面提示冲突。
export function useUpdateDiary() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMom();
  return useMutation({
    mutationFn: ({
      id,
      body,
      version,
    }: {
      id: string;
      body: UpdateDiaryBody;
      version: number;
    }) => updateDiary(id, body, version),
    onSuccess: (updated: DiaryPublic) => {
      queryClient.setQueryData(diaryDetailKey(updated.id), updated);
      invalidate();
    },
  });
}

export function useDeleteDiary() {
  const invalidate = useInvalidateMom();
  return useMutation({
    mutationFn: (id: string) => deleteDiary(id),
    onSuccess: invalidate,
  });
}
