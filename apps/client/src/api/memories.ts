import type {
  AnnualReviewResponse,
  CreateAudioMemoryBody,
  CreateBabyQuoteBody,
  CreateFirstMomentBody,
  CreatePhotoMemoryBody,
  CreateTimeCapsuleBody,
  AudioMemoryPublic,
  BabyQuotePublic,
  FirstMomentPublic,
  MemoriesFavorites,
  MemoriesHomeSummary,
  OnThisDayResponse,
  PhotoMemoryPublic,
  TimeCapsulePublic,
  UpdateAudioMemoryBody,
  UpdateBabyQuoteBody,
  UpdateFirstMomentBody,
  UpdatePhotoMemoryBody,
  UpdateTimeCapsuleBody,
} from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { apiRequest } from './client';

export const API_BASE =
  typeof process !== 'undefined' && process.env.TARO_APP_API_BASE
    ? process.env.TARO_APP_API_BASE
    : '/api/v1';

function options(
  authToken?: string,
  method?: 'POST' | 'PATCH' | 'DELETE',
  idempotencyKey?: string,
) {
  return { method, authToken, idempotencyKey } as const;
}

export function getMediaContentUrl(mediaId: string) {
  return `${API_BASE}/media/${mediaId}/content`;
}

export function getMediaThumbnailUrl(mediaId: string) {
  return `${API_BASE}/media/${mediaId}/thumbnail`;
}

export function retryMediaProcessing(mediaId: string, token?: string) {
  return apiRequest<{ mediaId: string; status: 'READY' | 'PROCESSING' }>(
    `/media/${mediaId}/retry`,
    options(token, 'POST'),
  );
}

// --- Summary & Reviews ---
export function fetchMemoriesSummary(babyId: string, token?: string) {
  return apiRequest<MemoriesHomeSummary>(`/babies/${babyId}/memories/summary`, {
    authToken: token,
  });
}

export function fetchOnThisDay(babyId: string, token?: string) {
  return apiRequest<OnThisDayResponse>(`/babies/${babyId}/memories/on-this-day`, {
    authToken: token,
  });
}

export function fetchFavoriteMemories(babyId: string, token?: string) {
  return apiRequest<MemoriesFavorites>(`/babies/${babyId}/memories/favorites`, {
    authToken: token,
  });
}

export function fetchAnnualReview(babyId: string, year: number, token?: string) {
  return apiRequest<AnnualReviewResponse>(
    `/babies/${babyId}/memories/annual-review?year=${year}`,
    {
      authToken: token,
    },
  );
}

// --- Photo Memories ---
export function fetchPhotoMemories(babyId: string, token?: string) {
  return apiRequest<PhotoMemoryPublic[]>(`/babies/${babyId}/memories/photos`, {
    authToken: token,
  });
}

export function createPhotoMemory(
  babyId: string,
  body: CreatePhotoMemoryBody,
  token?: string,
) {
  return apiRequest<PhotoMemoryPublic>(`/babies/${babyId}/memories/photos`, {
    ...options(token, 'POST', createUlid()),
    body,
  });
}

export function updatePhotoMemory(
  id: string,
  body: UpdatePhotoMemoryBody,
  token?: string,
) {
  return apiRequest<PhotoMemoryPublic>(`/memories/photos/${id}`, {
    ...options(token, 'PATCH'),
    body,
  });
}

export function deletePhotoMemory(id: string, token?: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `/memories/photos/${id}`,
    options(token, 'DELETE'),
  );
}

export function restorePhotoMemory(id: string, token?: string) {
  return apiRequest<PhotoMemoryPublic>(
    `/memories/photos/${id}/restore`,
    options(token, 'POST'),
  );
}

// --- Baby Quotes ---
export function fetchBabyQuotes(babyId: string, token?: string) {
  return apiRequest<BabyQuotePublic[]>(`/babies/${babyId}/memories/quotes`, {
    authToken: token,
  });
}

export function createBabyQuote(
  babyId: string,
  body: CreateBabyQuoteBody,
  token?: string,
) {
  return apiRequest<BabyQuotePublic>(`/babies/${babyId}/memories/quotes`, {
    ...options(token, 'POST', createUlid()),
    body,
  });
}

export function updateBabyQuote(id: string, body: UpdateBabyQuoteBody, token?: string) {
  return apiRequest<BabyQuotePublic>(`/memories/quotes/${id}`, {
    ...options(token, 'PATCH'),
    body,
  });
}

export function deleteBabyQuote(id: string, token?: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `/memories/quotes/${id}`,
    options(token, 'DELETE'),
  );
}

export function restoreBabyQuote(id: string, token?: string) {
  return apiRequest<BabyQuotePublic>(
    `/memories/quotes/${id}/restore`,
    options(token, 'POST'),
  );
}

// --- Audio Memories ---
export function fetchAudioMemories(babyId: string, token?: string) {
  return apiRequest<AudioMemoryPublic[]>(`/babies/${babyId}/memories/audios`, {
    authToken: token,
  });
}

export function createAudioMemory(
  babyId: string,
  body: CreateAudioMemoryBody,
  token?: string,
) {
  return apiRequest<AudioMemoryPublic>(`/babies/${babyId}/memories/audios`, {
    ...options(token, 'POST', createUlid()),
    body,
  });
}

export function updateAudioMemory(
  id: string,
  body: UpdateAudioMemoryBody,
  token?: string,
) {
  return apiRequest<AudioMemoryPublic>(`/memories/audios/${id}`, {
    ...options(token, 'PATCH'),
    body,
  });
}

export function deleteAudioMemory(id: string, token?: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `/memories/audios/${id}`,
    options(token, 'DELETE'),
  );
}

export function restoreAudioMemory(id: string, token?: string) {
  return apiRequest<AudioMemoryPublic>(
    `/memories/audios/${id}/restore`,
    options(token, 'POST'),
  );
}

// --- First Moments ---
export function fetchFirstMoments(babyId: string, token?: string) {
  return apiRequest<FirstMomentPublic[]>(`/babies/${babyId}/memories/firsts`, {
    authToken: token,
  });
}

export function createFirstMoment(
  babyId: string,
  body: CreateFirstMomentBody,
  token?: string,
) {
  return apiRequest<FirstMomentPublic>(`/babies/${babyId}/memories/firsts`, {
    ...options(token, 'POST', createUlid()),
    body,
  });
}

export function updateFirstMoment(
  id: string,
  body: UpdateFirstMomentBody,
  token?: string,
) {
  return apiRequest<FirstMomentPublic>(`/memories/firsts/${id}`, {
    ...options(token, 'PATCH'),
    body,
  });
}

export function deleteFirstMoment(id: string, token?: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `/memories/firsts/${id}`,
    options(token, 'DELETE'),
  );
}

export function restoreFirstMoment(id: string, token?: string) {
  return apiRequest<FirstMomentPublic>(
    `/memories/firsts/${id}/restore`,
    options(token, 'POST'),
  );
}

// --- Time Capsules ---
export function fetchTimeCapsules(babyId: string, token?: string) {
  return apiRequest<TimeCapsulePublic[]>(`/babies/${babyId}/memories/capsules`, {
    authToken: token,
  });
}

export function createTimeCapsule(
  babyId: string,
  body: CreateTimeCapsuleBody,
  token?: string,
) {
  return apiRequest<TimeCapsulePublic>(`/babies/${babyId}/memories/capsules`, {
    ...options(token, 'POST', createUlid()),
    body,
  });
}

export function updateTimeCapsule(
  id: string,
  body: UpdateTimeCapsuleBody,
  token?: string,
) {
  return apiRequest<TimeCapsulePublic>(`/memories/capsules/${id}`, {
    ...options(token, 'PATCH'),
    body,
  });
}

export function favoriteTimeCapsule(id: string, favorite: boolean, token?: string) {
  return apiRequest<TimeCapsulePublic>(`/memories/capsules/${id}/favorite`, {
    ...options(token, 'PATCH', createUlid()),
    body: { favorite },
  });
}

export function sealTimeCapsule(id: string, token?: string) {
  return apiRequest<TimeCapsulePublic>(
    `/memories/capsules/${id}/seal`,
    options(token, 'POST'),
  );
}

export function openTimeCapsule(id: string, token?: string) {
  return apiRequest<TimeCapsulePublic>(
    `/memories/capsules/${id}/open`,
    options(token, 'POST'),
  );
}

export function deleteTimeCapsule(id: string, token?: string) {
  return apiRequest<{ id: string; deleted: boolean }>(
    `/memories/capsules/${id}`,
    options(token, 'DELETE'),
  );
}

export function restoreTimeCapsule(id: string, token?: string) {
  return apiRequest<TimeCapsulePublic>(
    `/memories/capsules/${id}/restore`,
    options(token, 'POST'),
  );
}
