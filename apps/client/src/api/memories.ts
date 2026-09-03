import Taro from '@tarojs/taro';
import type {
  CreatePhotoMemoryBody,
  UpdatePhotoMemoryBody,
  CreateBabyQuoteBody,
  UpdateBabyQuoteBody,
  CreateAudioMemoryBody,
  UpdateAudioMemoryBody,
  CreateFirstMomentBody,
  UpdateFirstMomentBody,
  CreateTimeCapsuleBody,
  UpdateTimeCapsuleBody,
} from '@runew/contracts';

const API_BASE =
  typeof process !== 'undefined' && process.env.TARO_APP_API_BASE
    ? process.env.TARO_APP_API_BASE
    : '/api/v1';

function getHeaders(token?: string) {
  const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP;
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'x-client-platform': isWeapp ? 'WEAPP' : 'H5',
  };
}

// --- Summary & On-this-day ---
export async function fetchMemoriesSummary(babyId: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/summary`,
    method: 'GET',
    header: getHeaders(token),
  });
  return res.data?.data;
}

export async function fetchOnThisDay(babyId: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/on-this-day`,
    method: 'GET',
    header: getHeaders(token),
  });
  return res.data?.data;
}

// --- Photo Memories ---
export async function fetchPhotoMemories(babyId: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/photos`,
    method: 'GET',
    header: getHeaders(token),
  });
  return res.data?.data || [];
}

export async function createPhotoMemory(babyId: string, body: CreatePhotoMemoryBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/photos`,
    method: 'POST',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function updatePhotoMemory(id: string, body: UpdatePhotoMemoryBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/memories/photos/${id}`,
    method: 'PATCH',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function deletePhotoMemory(id: string, token?: string) {
  await Taro.request({
    url: `${API_BASE}/memories/photos/${id}`,
    method: 'DELETE',
    header: getHeaders(token),
  });
}

// --- Baby Quotes ---
export async function fetchBabyQuotes(babyId: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/quotes`,
    method: 'GET',
    header: getHeaders(token),
  });
  return res.data?.data || [];
}

export async function createBabyQuote(babyId: string, body: CreateBabyQuoteBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/quotes`,
    method: 'POST',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function updateBabyQuote(id: string, body: UpdateBabyQuoteBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/memories/quotes/${id}`,
    method: 'PATCH',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function deleteBabyQuote(id: string, token?: string) {
  await Taro.request({
    url: `${API_BASE}/memories/quotes/${id}`,
    method: 'DELETE',
    header: getHeaders(token),
  });
}

// --- Audio Memories ---
export async function fetchAudioMemories(babyId: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/audios`,
    method: 'GET',
    header: getHeaders(token),
  });
  return res.data?.data || [];
}

export async function createAudioMemory(babyId: string, body: CreateAudioMemoryBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/audios`,
    method: 'POST',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function updateAudioMemory(id: string, body: UpdateAudioMemoryBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/memories/audios/${id}`,
    method: 'PATCH',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function deleteAudioMemory(id: string, token?: string) {
  await Taro.request({
    url: `${API_BASE}/memories/audios/${id}`,
    method: 'DELETE',
    header: getHeaders(token),
  });
}

// --- First Moments ---
export async function fetchFirstMoments(babyId: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/firsts`,
    method: 'GET',
    header: getHeaders(token),
  });
  return res.data?.data || [];
}

export async function createFirstMoment(babyId: string, body: CreateFirstMomentBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/firsts`,
    method: 'POST',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function updateFirstMoment(id: string, body: UpdateFirstMomentBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/memories/firsts/${id}`,
    method: 'PATCH',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function deleteFirstMoment(id: string, token?: string) {
  await Taro.request({
    url: `${API_BASE}/memories/firsts/${id}`,
    method: 'DELETE',
    header: getHeaders(token),
  });
}

// --- Time Capsules ---
export async function fetchTimeCapsules(babyId: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/capsules`,
    method: 'GET',
    header: getHeaders(token),
  });
  return res.data?.data || [];
}

export async function createTimeCapsule(babyId: string, body: CreateTimeCapsuleBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/babies/${babyId}/memories/capsules`,
    method: 'POST',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function updateTimeCapsule(id: string, body: UpdateTimeCapsuleBody, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/memories/capsules/${id}`,
    method: 'PATCH',
    header: getHeaders(token),
    data: body,
  });
  return res.data?.data;
}

export async function sealTimeCapsule(id: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/memories/capsules/${id}/seal`,
    method: 'POST',
    header: getHeaders(token),
  });
  return res.data?.data;
}

export async function openTimeCapsule(id: string, token?: string) {
  const res = await Taro.request({
    url: `${API_BASE}/memories/capsules/${id}/open`,
    method: 'POST',
    header: getHeaders(token),
  });
  return res.data?.data;
}

export async function deleteTimeCapsule(id: string, token?: string) {
  await Taro.request({
    url: `${API_BASE}/memories/capsules/${id}`,
    method: 'DELETE',
    header: getHeaders(token),
  });
}
