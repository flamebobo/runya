import type {
  CreateDiaryBody,
  CreateMoodBody,
  DiaryPublic,
  MomHomeSummary,
  MoodCalendarResponse,
  MoodPublic,
  UpdateDiaryBody,
  UpdateMoodBody,
} from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { apiRequest } from './client';

// M8 妈妈空间：moods / diaries。PRIVATE 边界由服务端强制，客户端只透传。
export function fetchMomSummary(token?: string) {
  return apiRequest<MomHomeSummary>('/mom/summary', { authToken: token });
}

export function fetchMoodCalendar(
  year: number,
  month: number,
  token?: string,
) {
  return apiRequest<MoodCalendarResponse>(
    `/mom/mood-calendar?month=${year}-${String(month).padStart(2, '0')}`,
    { authToken: token },
  );
}

export function fetchMoods(token?: string) {
  return apiRequest<MoodPublic[]>('/mom/moods', { authToken: token });
}

export function createMood(body: CreateMoodBody, token?: string) {
  return apiRequest<MoodPublic>('/mom/moods', {
    method: 'POST',
    body,
    authToken: token,
    idempotencyKey: createUlid(),
  });
}

export function updateMood(
  id: string,
  body: UpdateMoodBody,
  version: number,
  token?: string,
) {
  return apiRequest<MoodPublic>(`/mom/moods/${id}`, {
    method: 'PATCH',
    body,
    authToken: token,
    // ETag 与服务端 buildEtag 对齐："v{n}"。
    ifMatch: `"v${version}"`,
  });
}

export function deleteMood(id: string, token?: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`/mom/moods/${id}`, {
    method: 'DELETE',
    authToken: token,
  });
}

export function fetchDiaries(token?: string) {
  return apiRequest<DiaryPublic[]>('/mom/diaries', { authToken: token });
}

export function fetchDiary(id: string, token?: string) {
  return apiRequest<DiaryPublic>(`/mom/diaries/${id}`, { authToken: token });
}

export function createDiary(body: CreateDiaryBody, token?: string) {
  return apiRequest<DiaryPublic>('/mom/diaries', {
    method: 'POST',
    body,
    authToken: token,
    idempotencyKey: createUlid(),
  });
}

export function updateDiary(
  id: string,
  body: UpdateDiaryBody,
  version: number,
  token?: string,
) {
  return apiRequest<DiaryPublic>(`/mom/diaries/${id}`, {
    method: 'PATCH',
    body,
    authToken: token,
    // ETag 与服务端 buildEtag 对齐："v{n}"。
    ifMatch: `"v${version}"`,
  });
}

export function deleteDiary(id: string, token?: string) {
  return apiRequest<{ id: string; deleted: boolean }>(`/mom/diaries/${id}`, {
    method: 'DELETE',
    authToken: token,
  });
}
