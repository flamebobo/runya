import { apiRequest } from './client';
import type { CreateFamilyBody, FamilyPublic } from '@runew/contracts';
import { createUlid } from '@runew/shared-utils';
export const createFamily = (body: CreateFamilyBody) =>
  apiRequest<FamilyPublic>('/families', {
    method: 'POST',
    body,
    idempotencyKey: createUlid(),
  });
export const createFamilyInvite = (familyId: string, expiresInHours = 72) =>
  apiRequest<{ id: string; familyId: string; token: string; expiresAt: number }>(
    `/families/${familyId}/invites`,
    { method: 'POST', body: { expiresInHours }, idempotencyKey: createUlid() },
  );
export const acceptFamilyInvite = (
  token: string,
  relationship: 'MOM' | 'DAD' | 'GRANDPARENT' | 'OTHER',
) =>
  apiRequest(`/family-invites/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    body: { relationship },
  });
export const fetchFamilyMembers = (familyId: string) =>
  apiRequest<{
    items: Array<{
      id: string;
      familyId: string;
      userId: string;
      relationship: string;
      role: string;
      status: string;
      nickname?: string;
    }>;
  }>(`/families/${familyId}/members`);
export const fetchFamilyMember = (familyId: string, memberId: string) =>
  apiRequest<{
    id: string;
    nickname?: string;
    relationship: string;
    role: string;
    status: string;
    permissions: Array<{ resource: string; action: string; effect: 'ALLOW' | 'DENY' }>;
  }>(`/families/${familyId}/members/${memberId}`);
export const updateFamilyPermissions = (
  familyId: string,
  memberId: string,
  permissions: Array<{ resource: string; action: string; effect: 'ALLOW' | 'DENY' }>,
) =>
  apiRequest(`/families/${familyId}/members/${memberId}/permissions`, {
    method: 'PATCH',
    body: { permissions },
  });
export const disableFamilyMember = (familyId: string, memberId: string) =>
  apiRequest(`/families/${familyId}/members/${memberId}/disable`, { method: 'POST' });
export const restoreFamilyMember = (familyId: string, memberId: string) =>
  apiRequest(`/families/${familyId}/members/${memberId}/restore`, { method: 'POST' });
export const fetchFamilyAchievements = (familyId: string) =>
  apiRequest<{ items: unknown[] }>(`/families/${familyId}/achievements`);
export const fetchFamilyAchievement = (familyId: string, achievementId: string) =>
  apiRequest<{
    id: string;
    title: string;
    emoji?: string | null;
    description?: string | null;
  }>(`/families/${familyId}/achievements/${achievementId}`);
export const createFamilyAchievement = (familyId: string, body: { title: string; description?: string; emoji?: string }) =>
  apiRequest(`/families/${familyId}/achievements`, { method: 'POST', body });
export const grantFamilyAchievement = (familyId: string, achievementId: string) =>
  apiRequest(`/families/${familyId}/achievements/${achievementId}/grant`, { method: 'POST' });
export const fetchFamilyAnniversaries = (familyId: string) =>
  apiRequest<{ items: unknown[] }>(`/families/${familyId}/anniversaries`);
export const createFamilyAnniversary = (
  familyId: string,
  body: { title: string; date: string; note?: string | null },
) => apiRequest(`/families/${familyId}/anniversaries`, { method: 'POST', body });
export const updateFamilyAnniversary = (
  familyId: string,
  anniversaryId: string,
  body: { title?: string; date?: string; note?: string | null },
) =>
  apiRequest(`/families/${familyId}/anniversaries/${anniversaryId}`, {
    method: 'PATCH',
    body,
  });
export const deleteFamilyAnniversary = (familyId: string, anniversaryId: string) =>
  apiRequest(`/families/${familyId}/anniversaries/${anniversaryId}`, {
    method: 'DELETE',
  });
export const updateFamilyTask = (
  familyId: string,
  taskId: string,
  body: {
    title?: string;
    note?: string | null;
    dueAt?: number | null;
    repeatRule?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null;
    assignedTo?: string | null;
    experienceReward?: number;
  },
  version: number,
) =>
  apiRequest(`/families/${familyId}/tasks/${taskId}`, {
    method: 'PATCH',
    body,
    ifMatch: `"v${version}"`,
  });
