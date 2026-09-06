import Taro from '@tarojs/taro';

const API_BASE =
  typeof process !== 'undefined' && process.env.TARO_APP_API_BASE
    ? process.env.TARO_APP_API_BASE
    : '/api/v1';

export type ClientPlatform = 'H5' | 'WEAPP';

export function getClientPlatform(): ClientPlatform {
  return Taro.getEnv() === Taro.ENV_TYPE.WEAPP ? 'WEAPP' : 'H5';
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: string;
  auth?: boolean;
  authToken?: string;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)runew_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const platform = getClientPlatform();
  const headers: Record<string, string> = {
    'X-Client-Platform': platform,
    'X-Client-Version': '0.1.0',
  };

  // Do not label body-less POST/DELETE requests as JSON. Fastify correctly
  // rejects an empty JSON body, while capsule seal/open and restore are
  // intentionally body-less mutations.
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  if (options.ifMatch) {
    headers['If-Match'] = options.ifMatch;
  }
  Object.assign(headers, options.headers);

  if (platform === 'WEAPP' && options.auth !== false) {
    const token = options.authToken ?? Taro.getStorageSync('runew_session_token');
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const csrf = getCsrfToken();
  if (platform === 'H5' && csrf && options.method && options.method !== 'GET') {
    headers['X-CSRF-Token'] = csrf;
  }

  const response = await Taro.request({
    url: `${API_BASE}${path}`,
    method: options.method ?? 'GET',
    data: options.body,
    header: headers,
    credentials: platform === 'H5' ? 'include' : undefined,
  });

  // Proxies and failed dev-server handshakes can return a null body. Keep the
  // error state renderable instead of throwing while inspecting the envelope.
  const payload = (response.data && typeof response.data === 'object' ? response.data : {}) as {
    data?: T;
    error?: { code: string; message: string; retryable?: boolean };
    meta?: { requestId: string };
  };

  if (response.statusCode >= 400 || payload.error) {
    throw new ApiError(
      payload.error?.code ?? 'INTERNAL_ERROR',
      payload.error?.message ?? '请求失败，请稍后再试',
      response.statusCode,
      payload.error?.retryable,
    );
  }

  return payload.data as T;
}

/** Download an authenticated file without assuming the JSON API envelope. */
export async function downloadApiFile(
  path: string,
  filename: string,
  mimeType: string,
): Promise<{ savedFilePath?: string }> {
  const platform = getClientPlatform();
  const headers: Record<string, string> = {
    'X-Client-Platform': platform,
    'X-Client-Version': '0.1.0',
  };
  if (platform === 'WEAPP') {
    const token = Taro.getStorageSync('runew_session_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  if (platform === 'WEAPP') {
    const response = await Taro.downloadFile({
      url: `${API_BASE}${path}`,
      header: headers,
    });
    if (response.statusCode >= 400 || !response.tempFilePath) {
      throw new ApiError('EXPORT_DOWNLOAD_FAILED', '导出文件暂时还没准备好', response.statusCode);
    }
    const saved = await Taro.saveFile({ tempFilePath: response.tempFilePath });
    if (!('savedFilePath' in saved)) {
      throw new ApiError('EXPORT_DOWNLOAD_FAILED', '导出文件暂时还没准备好', 500, true);
    }
    return { savedFilePath: saved.savedFilePath };
  }

  const response = await Taro.request<ArrayBuffer | Record<string, unknown>>({
    url: `${API_BASE}${path}`,
    method: 'GET',
    header: headers,
    responseType: 'arraybuffer',
    credentials: 'include',
  });
  if (response.statusCode >= 400) {
    throw new ApiError('EXPORT_DOWNLOAD_FAILED', '导出文件暂时还没准备好', response.statusCode);
  }
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new ApiError('EXPORT_DOWNLOAD_FAILED', '当前设备还不支持保存导出文件', 501);
  }
  const blob = new Blob([response.data as ArrayBuffer], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return {};
}

export function persistWeappSession(token: string | null) {
  if (getClientPlatform() !== 'WEAPP') return;
  if (token) {
    Taro.setStorageSync('runew_session_token', token);
  } else {
    Taro.removeStorageSync('runew_session_token');
  }
}
