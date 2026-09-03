import type {
  KnowledgeDetail,
  KnowledgeLibraryCountsResponse,
  KnowledgeLibraryResponse,
  KnowledgeListResponse,
  KnowledgeRecommendationsResponse,
  KnowledgeUserState,
  PutKnowledgeStateBody,
} from '@runew/contracts';
import { apiRequest } from './client';

export function fetchKnowledgeList() {
  return apiRequest<KnowledgeListResponse>('/knowledge');
}

export function fetchKnowledgeDetail(id: string) {
  return apiRequest<KnowledgeDetail>(`/knowledge/${id}`);
}

export function searchKnowledgeApi(query: string) {
  const search = new URLSearchParams({ q: query });
  return apiRequest<KnowledgeListResponse>(`/knowledge/search?${search.toString()}`);
}

export function fetchKnowledgeRecommendations(babyId: string) {
  return apiRequest<KnowledgeRecommendationsResponse>(
    `/babies/${babyId}/knowledge/recommendations`,
  );
}

export function putKnowledgeState(
  babyId: string,
  knowledgeId: string,
  body: PutKnowledgeStateBody,
) {
  return apiRequest<KnowledgeUserState>(
    `/babies/${babyId}/knowledge/${knowledgeId}/state`,
    { method: 'PUT', body },
  );
}

export function fetchKnowledgeLibrary(babyId: string, state: string) {
  const search = new URLSearchParams({ state });
  return apiRequest<KnowledgeLibraryResponse>(
    `/babies/${babyId}/knowledge/library?${search.toString()}`,
  );
}

export function fetchKnowledgeLibraryCounts(babyId: string) {
  return apiRequest<KnowledgeLibraryCountsResponse>(
    `/babies/${babyId}/knowledge/library/counts`,
  );
}

export function fetchKnowledgeState(babyId: string, knowledgeId: string) {
  return apiRequest<KnowledgeUserState | null>(
    `/babies/${babyId}/knowledge/${knowledgeId}/state`,
  );
}

export function sendKnowledgeFeedback(
  knowledgeId: string,
  body: { type: 'REDUCE_CATEGORY' | 'CONTENT_ISSUE'; message?: string },
) {
  return apiRequest<{ ok: boolean }>(`/knowledge/${knowledgeId}/feedback`, {
    method: 'POST',
    body,
  });
}
