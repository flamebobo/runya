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
    'Content-Type': 'application/json',
    'X-Client-Platform': platform,
    'X-Client-Version': '0.1.0',
  };

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  if (options.ifMatch) {
    headers['If-Match'] = options.ifMatch;
  }

  if (platform === 'WEAPP' && options.auth !== false) {
    const token = Taro.getStorageSync('runew_session_token');
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

  const payload = response.data as {
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

export function persistWeappSession(token: string | null) {
  if (getClientPlatform() !== 'WEAPP') return;
  if (token) {
    Taro.setStorageSync('runew_session_token', token);
  } else {
    Taro.removeStorageSync('runew_session_token');
  }
}
