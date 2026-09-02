import type {
  CreateBottleBody,
  CreateDiaperBody,
  CreateFoodBody,
  CreateSleepBody,
  DiaperPublic,
  FeedingPublic,
  FinishSleepBody,
  FoodPublic,
  RecordStatsQuery,
  RecordStatsResponse,
  SleepPublic,
  TimelineQuery,
  TimelineResponse,
  UpdateDiaperBody,
  UpdateFeedingBody,
  UpdateFoodBody,
  UpdateSleepBody,
} from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { apiRequest } from './client';

function queryString(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

export function fetchTimeline(babyId: string, query: Partial<TimelineQuery> = {}) {
  return apiRequest<TimelineResponse>(
    `/babies/${babyId}/records${queryString({
      from: query.from,
      to: query.to,
      kind: query.kind,
      cursor: query.cursor,
      limit: query.limit,
    })}`,
  );
}

export function fetchRecordStats(babyId: string, query: RecordStatsQuery) {
  return apiRequest<RecordStatsResponse>(
    `/babies/${babyId}/records/stats${queryString({
      range: query.range,
      date: query.date,
      timezoneName: query.timezoneName,
    })}`,
  );
}

export function createBottle(babyId: string, body: CreateBottleBody) {
  return apiRequest<FeedingPublic>(`/babies/${babyId}/feeding`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function startBreast(
  babyId: string,
  body: { side?: 'LEFT' | 'RIGHT'; startedAt?: number; note?: string | null } = {},
) {
  return apiRequest<FeedingPublic>(`/babies/${babyId}/feeding/breast/start`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function getFeeding(id: string) {
  return apiRequest<FeedingPublic>(`/feeding/${id}`);
}

export function updateFeeding(id: string, body: UpdateFeedingBody, version: number) {
  return apiRequest<FeedingPublic>(`/feeding/${id}`, {
    method: 'PATCH',
    body,
    ifMatch: `"v${version}"`,
  });
}

export function deleteFeeding(id: string) {
  return apiRequest<{ ok: boolean }>(`/feeding/${id}`, { method: 'DELETE' });
}

export function switchBreast(id: string, side?: 'LEFT' | 'RIGHT') {
  return apiRequest<FeedingPublic>(`/feeding/${id}/breast/switch`, {
    method: 'POST',
    body: side ? { side } : {},
  });
}

export function pauseBreast(id: string) {
  return apiRequest<FeedingPublic>(`/feeding/${id}/breast/pause`, { method: 'POST', body: {} });
}

export function resumeBreast(id: string) {
  return apiRequest<FeedingPublic>(`/feeding/${id}/breast/resume`, { method: 'POST', body: {} });
}

export function finishBreast(id: string) {
  return apiRequest<FeedingPublic>(`/feeding/${id}/breast/finish`, { method: 'POST', body: {} });
}

export function startSleep(
  babyId: string,
  body: { startedAt?: number; note?: string | null } = {},
) {
  return apiRequest<SleepPublic>(`/babies/${babyId}/sleep/start`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function createSleep(babyId: string, body: CreateSleepBody) {
  return apiRequest<SleepPublic>(`/babies/${babyId}/sleep`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function finishSleep(id: string, body: FinishSleepBody = {}) {
  return apiRequest<SleepPublic>(`/sleep/${id}/finish`, { method: 'POST', body });
}

export function getSleep(id: string) {
  return apiRequest<SleepPublic>(`/sleep/${id}`);
}

export function updateSleep(id: string, body: UpdateSleepBody, version: number) {
  return apiRequest<SleepPublic>(`/sleep/${id}`, {
    method: 'PATCH',
    body,
    ifMatch: `"v${version}"`,
  });
}

export function deleteSleep(id: string) {
  return apiRequest<{ ok: boolean }>(`/sleep/${id}`, { method: 'DELETE' });
}

export function createDiaper(babyId: string, body: CreateDiaperBody) {
  return apiRequest<DiaperPublic>(`/babies/${babyId}/diapers`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function getDiaper(id: string) {
  return apiRequest<DiaperPublic>(`/diapers/${id}`);
}

export function updateDiaper(id: string, body: UpdateDiaperBody, version: number) {
  return apiRequest<DiaperPublic>(`/diapers/${id}`, {
    method: 'PATCH',
    body,
    ifMatch: `"v${version}"`,
  });
}

export function deleteDiaper(id: string) {
  return apiRequest<{ ok: boolean }>(`/diapers/${id}`, { method: 'DELETE' });
}

export function createFood(babyId: string, body: CreateFoodBody) {
  return apiRequest<FoodPublic>(`/babies/${babyId}/foods`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function getFood(id: string) {
  return apiRequest<FoodPublic>(`/foods/${id}`);
}

export function updateFood(id: string, body: UpdateFoodBody, version: number) {
  return apiRequest<FoodPublic>(`/foods/${id}`, {
    method: 'PATCH',
    body,
    ifMatch: `"v${version}"`,
  });
}

export function deleteFood(id: string) {
  return apiRequest<{ ok: boolean }>(`/foods/${id}`, { method: 'DELETE' });
}
