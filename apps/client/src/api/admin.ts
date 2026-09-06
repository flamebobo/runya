import type {
  AdminReauthGrant,
  AdminSessionPublic,
  AuditLogPublic,
} from '@runew/contracts';
import Taro from '@tarojs/taro';
import { createUlid } from '@runew/shared-utils';
import { apiRequest, getClientPlatform } from './client';

const ADMIN_TOKEN_KEY = 'runew_admin_session_token';

function adminToken() {
  if (getClientPlatform() !== 'WEAPP') return undefined;
  try {
    const value = Taro.getStorageSync(ADMIN_TOKEN_KEY);
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
}

function persistAdminToken(token?: string) {
  if (getClientPlatform() !== 'WEAPP') return;
  if (token) Taro.setStorageSync(ADMIN_TOKEN_KEY, token);
  else Taro.removeStorageSync(ADMIN_TOKEN_KEY);
}

function adminSessionHeaders() {
  const headers: Record<string, string> = {};
  const token = adminToken();
  if (token) headers['X-Admin-Session'] = token;
  return headers;
}

type AdminRequestOptions = Parameters<typeof apiRequest>[1];

function adminRequest<T>(path: string, options: AdminRequestOptions = {}) {
  return apiRequest<T>(path, { ...options, headers: { ...adminSessionHeaders(), ...(options.headers ?? {}) } });
}

export async function adminLogin(password: string) {
  const data = await apiRequest<AdminSessionPublic & { token?: string }>('/admin/auth', {
    method: 'POST',
    body: { password },
  });
  persistAdminToken(data.token);
  return data;
}

export async function adminLogout() {
  await apiRequest<{ ok: boolean }>('/admin/auth', {
    method: 'DELETE',
    headers: adminSessionHeaders(),
  });
  persistAdminToken();
}

export function fetchAdminSession() {
  return apiRequest<AdminSessionPublic>('/admin/session', { headers: adminSessionHeaders() });
}

export function adminReauth(password: string, actionScope: string, resourceId?: string) {
  return apiRequest<AdminReauthGrant>('/admin/reauth', {
    method: 'POST',
    body: { password, actionScope, resourceId },
    headers: adminSessionHeaders(),
  });
}

export function fetchAdminDataStatus() {
  return adminRequest<{ status: string; counts: Record<string, number> }>('/admin/data/status');
}

export function fetchAdminAuditLogs(limit = 30) {
  return adminRequest<{ items: AuditLogPublic[] }>(`/admin/audit-logs?limit=${limit}`);
}

export interface AdminGemBalance {
  familyId: string;
  balance: number;
  ledgerBalance: number;
  drifted: boolean;
}

export interface AdminGemTransaction {
  id: string;
  familyId: string;
  amount: number;
  balanceAfter: number;
  reasonCode: string;
  reasonText: string | null;
  sourceType: string;
  createdAt: number;
}

export interface AdminGemRule {
  id: string;
  familyId: string | null;
  actionType: string;
  amount: number;
  dailyLimit: number | null;
  enabled: boolean;
  updatedAt: number;
}

export interface AdminReward {
  id: string;
  familyId: string;
  name: string;
  description: string | null;
  priceGems: number;
  stock: number | null;
  status: string;
  sortOrder: number;
  updatedAt: number;
}

export interface AdminMember {
  id: string;
  familyId: string;
  userId: string;
  role: string;
  status: string;
  nickname: string;
  createdAt: number;
  updatedAt: number;
}

export interface AdminBackup {
  id: string;
  status: string;
  startedAt: number;
  finishedAt: number | null;
  bytes: number | null;
  checksum: string | null;
  errorCode: string | null;
  createdAt: number;
}

export function fetchAdminGemBalance(familyId: string) {
  return adminRequest<AdminGemBalance>(`/admin/families/${encodeURIComponent(familyId)}/gems`);
}

export function fetchAdminGemTransactions(familyId: string, limit = 30) {
  return adminRequest<{ items: AdminGemTransaction[] }>(
    `/admin/families/${encodeURIComponent(familyId)}/gem-transactions?limit=${limit}`,
  );
}

export function fetchAdminGemRules(familyId?: string) {
  const query = familyId ? `?familyId=${encodeURIComponent(familyId)}` : '';
  return adminRequest<{ items: AdminGemRule[] }>(`/admin/gem-rules${query}`);
}

export function fetchAdminRewards(familyId?: string) {
  const query = familyId ? `?familyId=${encodeURIComponent(familyId)}` : '';
  return adminRequest<{ items: AdminReward[] }>(`/admin/rewards${query}`);
}

export function fetchAdminKnowledge(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<{ items: Array<Record<string, unknown> & { id: string; title: string; status: string; category: string; contentVersion: number }> }>(`/admin/knowledge${query}`);
}

export function fetchAdminMembers(familyId: string) {
  return adminRequest<{ items: AdminMember[] }>(`/admin/families/${encodeURIComponent(familyId)}/members`);
}

export function fetchAdminBackups() {
  return adminRequest<{ items: AdminBackup[] }>('/admin/backups');
}

export function createAdminBackup() {
  return adminRequest<{ id: string; status: string }>('/admin/backups', {
    method: 'POST',
    idempotencyKey: createUlid(),
  });
}

export function verifyAdminBackup(id: string) {
  return adminRequest<{ valid: boolean; backup: AdminBackup }>(`/admin/backups/${encodeURIComponent(id)}/verify`, {
    method: 'POST',
  });
}

export function restoreAdminBackup(id: string, grantToken: string) {
  return adminRequest<{ backupId: string; status: string; restartRequired: boolean }>(
    `/admin/backups/${encodeURIComponent(id)}/restore`,
    {
      method: 'POST',
      body: { confirm: true },
      headers: { 'X-Admin-Reauth-Grant': grantToken },
    },
  );
}

export function disableAdminBackups(grantToken: string) {
  return adminRequest<{ key: string; enabled: boolean }>('/admin/backups/disable', {
    method: 'POST',
    body: { confirm: true },
    headers: { 'X-Admin-Reauth-Grant': grantToken },
  });
}

export function fetchAdminSystemApp() {
  return adminRequest<{ nodeEnv: string; version: string }>('/admin/system/app');
}

export function fetchAdminSystemDatabase() {
  return adminRequest<{ status: string; journalMode: string; foreignKeys: boolean }>('/admin/system/database');
}

export function fetchAdminSystemMedia() {
  return adminRequest<{ configured: boolean; status: string }>('/admin/system/media');
}

export function fetchAdminSystemTunnel() {
  return adminRequest<{ configured: boolean }>('/admin/system/tunnel');
}

export function adjustAdminGems(
  familyId: string,
  amount: number,
  grantToken: string,
  reasonText: string,
) {
  const idempotencyKey = createUlid();
  return adminRequest(`/admin/families/${familyId}/gems/adjust`, {
    method: 'POST',
    body: {
      amount,
      reasonText,
      confirm: true,
    },
    idempotencyKey,
    // The scoped grant is intentionally sent per dangerous mutation.
    headers: { 'X-Admin-Reauth-Grant': grantToken },
  });
}

export function fetchAdminSystemSettings() {
  return adminRequest<{ items: Array<{ key: string; value: unknown; updatedAt: number }> }>('/admin/system/settings');
}
