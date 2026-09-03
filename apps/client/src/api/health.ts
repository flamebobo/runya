import {
  apiOkResponseSchema,
  healthEventListResponseSchema,
  healthEventPublicSchema,
} from '@runew/contracts';
import type {
  CreateHealthEventBody,
  HealthReminderBody,
  UpdateHealthEventBody,
} from '@runew/contracts';
import { apiRequest } from './client';

export async function fetchHealthEvents(babyId: string) {
  const response = await apiRequest<unknown>(`/babies/${babyId}/health/events`);
  return healthEventListResponseSchema.parse(response);
}

export async function fetchHealthEventDetail(id: string) {
  const response = await apiRequest<unknown>(`/health/events/${id}`);
  return healthEventPublicSchema.parse(response);
}

export async function createHealthEvent(babyId: string, body: CreateHealthEventBody) {
  const response = await apiRequest<unknown>(`/babies/${babyId}/health/events`, {
    method: 'POST',
    body,
  });
  return healthEventPublicSchema.parse(response);
}

export async function updateHealthEvent(
  id: string,
  body: UpdateHealthEventBody,
  options?: { ifMatch?: string },
) {
  const response = await apiRequest<unknown>(`/health/events/${id}`, {
    method: 'PATCH',
    body,
    ifMatch: options?.ifMatch,
  });
  return healthEventPublicSchema.parse(response);
}

export async function deleteHealthEvent(id: string) {
  const response = await apiRequest<unknown>(`/health/events/${id}`, {
    method: 'DELETE',
  });
  return apiOkResponseSchema.parse(response);
}

// PUT 语义整体替换：offsets 为空数组 = 取消全部提醒。
export async function replaceHealthReminders(
  eventId: string,
  body: HealthReminderBody,
  options?: { ifMatch?: string },
) {
  const response = await apiRequest<unknown>(`/health/events/${eventId}/reminders`, {
    method: 'PUT',
    body,
    ifMatch: options?.ifMatch,
  });
  return healthEventPublicSchema.parse(response);
}

export async function deleteHealthReminder(id: string) {
  const response = await apiRequest<unknown>(`/health/reminders/${id}`, {
    method: 'DELETE',
  });
  return apiOkResponseSchema.parse(response);
}
