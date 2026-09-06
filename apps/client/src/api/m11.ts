import type {
  BabyChange,
  BabyPreference,
  CreateBabyPreferenceBody,
  ExportJob,
  ExportType,
  SearchResponse,
  TrashResponse,
  UpdateUserSettingsBody,
  UserSettings,
} from '@runew/contracts';
import type { BabyPublic, CreateBabyBody, UpdateBabyBody } from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
import { apiRequest, downloadApiFile } from './client';

export function addBaby(familyId: string, body: CreateBabyBody) {
  return apiRequest<BabyPublic>(`/families/${familyId}/babies`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function updateBaby(babyId: string, body: UpdateBabyBody, version?: number) {
  return apiRequest<BabyPublic>(`/babies/${babyId}`, {
    method: 'PATCH',
    body,
    ifMatch: version ? `"v${version}"` : undefined,
  });
}

export function fetchBabyPreferences(babyId: string) {
  return apiRequest<{ items: BabyPreference[] }>(`/babies/${babyId}/preferences`);
}

export function createBabyPreference(babyId: string, body: CreateBabyPreferenceBody) {
  return apiRequest<BabyPreference>(`/babies/${babyId}/preferences`, {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
}

export function fetchBabyChanges(babyId: string) {
  return apiRequest<{ items: BabyChange[] }>(`/babies/${babyId}/changes`);
}

export function switchBaby(familyId: string, babyId: string) {
  return apiRequest<{ familyId: string; babyId: string }>('/context', {
    method: 'POST',
    body: { familyId, babyId },
    idempotencyKey: createUlid(),
  });
}

export function fetchUserSettings() {
  // The aggregate settings endpoint has a different response shape. This
  // helper is used by the runtime theme bootstrap and must return the focused
  // appearance contract.
  return apiRequest<UserSettings>('/settings/appearance');
}

export function updateUserSettings(body: UpdateUserSettingsBody) {
  return apiRequest<UserSettings>('/settings/appearance', { method: 'PUT', body });
}

export function updateAccount(body: { nickname?: string; locale?: string; timezoneName?: string }) {
  return apiRequest<{ id: string; nickname: string; locale: string; timezoneName: string | null }>(
    '/settings/account',
    { method: 'PATCH', body },
  );
}

export function fetchAccount() {
  return apiRequest<{ id: string; nickname: string; locale: string; timezoneName: string | null }>('/settings/account');
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ changedAt: number }>('/settings/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export function fetchDevices() {
  return apiRequest<{ items: Array<{ id: string; platform: string; deviceName: string | null; appVersion: string | null; currentFamilyId: string | null; currentBabyId: string | null; lastSeenAt: number }> }>('/settings/devices');
}

export function revokeDevice(deviceId: string) {
  return apiRequest<{ deviceId: string; revokedSessions: number }>(`/settings/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
}

export function fetchPrivacy() {
  return apiRequest<UserSettings['privacy']>('/settings/privacy');
}

export function updatePrivacy(body: UserSettings['privacy']) {
  return apiRequest<UserSettings['privacy']>('/settings/privacy', { method: 'PUT', body });
}

export function fetchBackupStatus() {
  return apiRequest<{ status: string; lastRun: { id: string; status: string; startedAt: number; finishedAt: number | null; bytes: number | null; errorCode: string | null } | null }>('/settings/backup-status');
}

export function fetchBackupHistory() {
  return apiRequest<{ items: Array<{ id: string; status: string; startedAt: number; finishedAt: number | null; bytes: number | null; errorCode: string | null }> }>('/settings/backup-history');
}

export function fetchStorage() {
  return apiRequest<{ mediaBytes: number; mediaCount: number }>('/settings/storage');
}

export function fetchAbout() {
  return apiRequest<{ name: string; version: string; apiVersion: string }>('/settings/about');
}

export function fetchTrash(familyId?: string) {
  const query = familyId ? `?familyId=${encodeURIComponent(familyId)}` : '';
  return apiRequest<TrashResponse>(`/trash${query}`);
}

export function restoreTrash(entityType: string, id: string) {
  return apiRequest<{ entityType: string; entityId: string }>(
    `/trash/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/restore`,
    { method: 'POST' },
  );
}

export function searchDocuments(query: string, familyId?: string) {
  const params = new URLSearchParams({ q: query });
  if (familyId) params.set('familyId', familyId);
  return apiRequest<SearchResponse>(`/search?${params.toString()}`);
}

export function createExport(familyId: string, type: ExportType, babyId?: string) {
  return apiRequest<ExportJob>('/exports', {
    method: 'POST',
    body: { familyId, type, babyId },
    idempotencyKey: createUlid(),
  });
}

export function fetchExports(familyId?: string) {
  const query = familyId ? `?familyId=${encodeURIComponent(familyId)}` : '';
  return apiRequest<{ items: ExportJob[] }>(`/exports${query}`);
}

export function fetchExport(id: string) {
  return apiRequest<ExportJob>(`/exports/${id}`);
}

export function downloadExport(job: Pick<ExportJob, 'id' | 'type'>) {
  const extension =
    job.type === 'CSV' ? 'csv' : job.type === 'PHOTO_AUDIO_ARCHIVE' ? 'zip' : 'json';
  const mimeType =
    job.type === 'CSV'
      ? 'text/csv;charset=utf-8'
      : job.type === 'PHOTO_AUDIO_ARCHIVE'
        ? 'application/zip'
        : 'application/json';
  return downloadApiFile(
    `/exports/${encodeURIComponent(job.id)}/download`,
    `runew-${job.type.toLowerCase()}-${job.id}.${extension}`,
    mimeType,
  );
}

export function issueRealtimeTicket(familyId?: string | null) {
  return apiRequest<{ ticket: string; expiresAt: number; wsPath: '/ws' }>('/realtime/ticket', {
    method: 'POST',
    body: { familyId: familyId ?? null },
  });
}
