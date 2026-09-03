import Taro from '@tarojs/taro';
import {
  enqueueMediaUpload,
  getDurableMediaMetadata,
  getMediaUploadQueueEntry,
  listMediaUploadQueue,
  readDurableLocalMedia,
  updateMediaUploadQueue,
  type DurableLocalMedia,
} from './mediaStorage';

const API_BASE =
  typeof process !== 'undefined' && process.env.TARO_APP_API_BASE
    ? process.env.TARO_APP_API_BASE
    : '/api/v1';

export interface UploadOptions {
  mediaType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'FILE';
  mimeType: string;
  originalFilename?: string;
  babyId?: string;
  authToken?: string;
  onProgress?: (percent: number) => void;
}

function isWeapp() {
  return Taro.getEnv() === Taro.ENV_TYPE.WEAPP;
}

function getCsrfToken() {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)runew_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function getAuthToken(explicit?: string) {
  if (explicit) return explicit;
  if (isWeapp())
    return (
      (Taro.getStorageSync('runew_session_token') as string | undefined) || undefined
    );
  return undefined;
}

function requestHeaders(
  token?: string,
  uploadToken?: string,
  contentType?: string,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {
    'x-client-platform': isWeapp() ? 'WEAPP' : 'H5',
  };
  if (contentType) headers['content-type'] = contentType;
  if (token) headers.authorization = `Bearer ${token}`;
  if (uploadToken) headers['x-upload-token'] = uploadToken;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const csrf = getCsrfToken();
  if (!isWeapp() && csrf) headers['x-csrf-token'] = csrf;
  return headers;
}

async function digestHex(data: ArrayBuffer) {
  if (typeof crypto === 'undefined' || !crypto.subtle) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function resolveSource(source: DurableLocalMedia | string) {
  if (typeof source !== 'string') return source;
  const localId = source.startsWith('idb://')
    ? source.split('/').pop()
    : source.startsWith('opfs://')
      ? source.split('/').pop()?.split('_')[0]
      : undefined;
  if (!localId) throw new Error('上传来源不是可恢复的本地媒体');
  const metadata = await getDurableMediaMetadata(localId);
  if (!metadata) throw new Error('上传来源的本地元数据不存在');
  return metadata;
}

async function requestWithRetry<T>(
  request: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1)
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('上传请求失败');
}

type UploadHttpResponse<T> = {
  statusCode: number;
  data?: { data?: T; error?: { message?: string } };
};

async function requestUploadWithRetry<T>(
  request: () => Promise<UploadHttpResponse<T>>,
) {
  return requestWithRetry(async () => {
    const response = await request();
    if (
      response.statusCode === 408 ||
      response.statusCode === 425 ||
      response.statusCode === 429 ||
      response.statusCode >= 500
    ) {
      throw new Error(response.data?.error?.message || '媒体上传服务暂时不可用');
    }
    return response;
  });
}

function responseData<T>(response: UploadHttpResponse<T>) {
  if (response.statusCode >= 400 || !response.data?.data) {
    throw new Error(response.data?.error?.message || '媒体上传请求失败');
  }
  return response.data.data;
}

type UploadInitData = {
  uploadId: string;
  mediaId: string;
  uploadToken: string;
  chunkSize: number;
  expiresAt: number;
};

type UploadStateData = {
  chunkSize: number;
  completedParts: number[];
  expiresAt: number;
};

export async function uploadDurableMedia(
  source: DurableLocalMedia | string,
  options: UploadOptions,
): Promise<string> {
  const media = await resolveSource(source);
  const token = getAuthToken(options.authToken);
  const queue = await getMediaUploadQueueEntry(media.localId);
  if (queue?.status === 'COMPLETE' && queue.mediaId) return queue.mediaId;

  let uploadId = queue?.uploadId;
  let mediaId = queue?.mediaId;
  let uploadToken = queue?.uploadToken;
  let chunkSize = 4 * 1024 * 1024;
  let expectedSha256: string | undefined;

  if (!uploadId || !mediaId || !uploadToken) {
    const fullData =
      media.sizeBytes <= 64 * 1024 * 1024
        ? await readDurableLocalMedia(media)
        : undefined;
    expectedSha256 = fullData ? await digestHex(fullData) : undefined;
    const initRes = await requestUploadWithRetry(() =>
      Taro.request<{ data: UploadInitData; error?: { message?: string } }>({
        url: `${API_BASE}/media/uploads`,
        method: 'POST',
        header: requestHeaders(token, undefined, 'application/json', media.localId),
        credentials: isWeapp() ? undefined : 'include',
        data: {
          mediaType: options.mediaType,
          mimeType: options.mimeType || media.mimeType,
          originalFilename: options.originalFilename || media.originalFilename,
          expectedSize: media.sizeBytes,
          expectedSha256,
          babyId: options.babyId,
        },
      }),
    );
    const data = responseData<UploadInitData>(initRes);
    uploadId = data.uploadId;
    mediaId = data.mediaId;
    uploadToken = data.uploadToken;
    chunkSize = data.chunkSize;
    await enqueueMediaUpload(media, {
      mediaType: options.mediaType,
      babyId: options.babyId,
      uploadId,
      mediaId,
      uploadToken,
    });
  } else {
    const stateRes = await requestUploadWithRetry(() =>
      Taro.request<{ data: UploadStateData; error?: { message?: string } }>({
        url: `${API_BASE}/media/uploads/${uploadId}`,
        method: 'GET',
        header: requestHeaders(token, uploadToken),
        credentials: isWeapp() ? undefined : 'include',
      }),
    );
    if (stateRes.statusCode === 410 || stateRes.statusCode === 404) {
      await updateMediaUploadQueue(media.localId, {
        uploadId: undefined,
        mediaId: undefined,
        uploadToken: undefined,
        status: 'PENDING',
        lastError: '上传会话已过期，将重新开始',
      });
      return uploadDurableMedia(media, options);
    }
    const state = responseData<UploadStateData>(stateRes);
    chunkSize = state.chunkSize;
  }

  const stateRes = await requestUploadWithRetry(() =>
    Taro.request<{ data: UploadStateData; error?: { message?: string } }>({
      url: `${API_BASE}/media/uploads/${uploadId}`,
      method: 'GET',
      header: requestHeaders(token, uploadToken),
      credentials: isWeapp() ? undefined : 'include',
    }),
  );
  const state = responseData<UploadStateData>(stateRes);
  const completedParts = new Set(state.completedParts as number[]);
  const totalParts = Math.max(1, Math.ceil(media.sizeBytes / chunkSize));
  await updateMediaUploadQueue(media.localId, {
    status: 'UPLOADING',
    attempts: (queue?.attempts ?? 0) + 1,
  });

  try {
    for (let partNo = 1; partNo <= totalParts; partNo += 1) {
      if (completedParts.has(partNo)) {
        options.onProgress?.(Math.round((partNo / totalParts) * 100));
        continue;
      }
      const offset = (partNo - 1) * chunkSize;
      const length = Math.min(chunkSize, media.sizeBytes - offset);
      if (length <= 0) throw new Error(`分块 ${partNo} 没有有效数据`);
      const partData = await readDurableLocalMedia(media, offset, length);
      if (partData.byteLength !== length)
        throw new Error(`分块 ${partNo} 大小校验失败`);
      const partSha256 = await digestHex(partData);
      const partRes = await requestUploadWithRetry(() =>
        Taro.request({
          url: `${API_BASE}/media/uploads/${uploadId}/parts/${partNo}`,
          method: 'PUT',
          header: {
            ...requestHeaders(token, uploadToken, 'application/octet-stream'),
            ...(partSha256 ? { 'x-part-sha256': partSha256 } : {}),
          },
          credentials: isWeapp() ? undefined : 'include',
          data: partData,
        }),
      );
      responseData(partRes);
      options.onProgress?.(Math.round((partNo / totalParts) * 100));
    }

    if (!expectedSha256 && media.sizeBytes <= 64 * 1024 * 1024) {
      expectedSha256 = await digestHex(await readDurableLocalMedia(media));
    }
    const completeRes = await requestUploadWithRetry(() =>
      Taro.request({
        url: `${API_BASE}/media/uploads/${uploadId}/complete`,
        method: 'POST',
        header: requestHeaders(
          token,
          undefined,
          'application/json',
          `${media.localId}:complete`,
        ),
        credentials: isWeapp() ? undefined : 'include',
        data: expectedSha256 ? { finalSha256: expectedSha256 } : {},
      }),
    );
    responseData(completeRes);
    await updateMediaUploadQueue(media.localId, {
      status: 'COMPLETE',
      lastError: undefined,
    });
    options.onProgress?.(100);
    return mediaId!;
  } catch (error) {
    await updateMediaUploadQueue(media.localId, {
      status: 'FAILED',
      lastError: error instanceof Error ? error.message : '上传失败',
    });
    throw error;
  }
}

export async function resumePendingMediaUploads(authToken?: string) {
  const entries = await listMediaUploadQueue();
  const results: string[] = [];
  for (const entry of entries) {
    if (entry.status === 'COMPLETE') continue;
    try {
      const mediaId = await uploadDurableMedia(entry.durablePath, {
        mediaType: entry.mediaType,
        mimeType: entry.mimeType,
        originalFilename: entry.originalFilename,
        babyId: entry.babyId,
        authToken,
      });
      results.push(mediaId);
    } catch {
      // Keep the durable queue entry for the next online retry.
    }
  }
  return results;
}
