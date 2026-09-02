import type {
  BootstrapResponse,
  LoginBody,
  OnboardingCompleteBody,
  RegisterBody,
} from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { apiRequest, persistWeappSession } from './client';

export async function registerUser(body: RegisterBody) {
  const data = await apiRequest<{
    user: BootstrapResponse['user'];
    session: { sessionId: string; expiresAt: number; platform: 'H5' | 'WEAPP'; token?: string };
  }>('/auth/register', {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
    auth: false,
  });
  persistWeappSession(data.session.token ?? null);
  return data;
}

export async function loginUser(body: LoginBody) {
  const data = await apiRequest<{
    user: BootstrapResponse['user'];
    session: { sessionId: string; expiresAt: number; platform: 'H5' | 'WEAPP'; token?: string };
  }>('/auth/login', {
    method: 'POST',
    body,
    auth: false,
  });
  persistWeappSession(data.session.token ?? null);
  return data;
}

export async function logoutUser() {
  await apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  persistWeappSession(null);
}

export async function fetchBootstrap() {
  return apiRequest<BootstrapResponse>('/bootstrap');
}

export async function completeOnboarding(body: OnboardingCompleteBody, idempotencyKey: string) {
  return apiRequest<{ family: BootstrapResponse['currentFamily']; baby: BootstrapResponse['currentBaby'] }>(
    '/onboarding/complete',
    {
      method: 'POST',
      body,
      idempotencyKey,
    },
  );
}
