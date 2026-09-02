import type {
  GrowthListResponse,
  GrowthRecordPublic,
  MilestoneListResponse,
  MilestonePublic,
  MonthlyStoryResponse,
} from '@runew/contracts';
import { apiRequest } from './client';

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const value = search.toString();
  return value ? `?${value}` : '';
}

export function fetchGrowth(babyId: string) {
  return apiRequest<GrowthListResponse>(`/babies/${babyId}/growth`);
}

export function fetchGrowthDetail(id: string) {
  return apiRequest<GrowthRecordPublic>(`/growth/${id}`);
}

export function fetchMilestones(babyId: string) {
  return apiRequest<MilestoneListResponse>(`/babies/${babyId}/milestones`);
}

export function fetchMilestoneDetail(id: string) {
  return apiRequest<MilestonePublic>(`/milestones/${id}`);
}

export function fetchMonthlyStory(
  babyId: string,
  month: string,
  utcOffsetMinutes = -new Date().getTimezoneOffset(),
) {
  return apiRequest<MonthlyStoryResponse>(
    `/babies/${babyId}/growth/monthly-story${queryString({ month, utcOffsetMinutes })}`,
  );
}
