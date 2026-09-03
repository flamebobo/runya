import type {
  CreateHealthEventBody,
  HealthEventListResponse,
  HealthEventPublic,
  HealthReminderBody,
  UpdateHealthEventBody,
} from '@runew/contracts';
import { apiRequest } from './client';

export function fetchHealthEvents(babyId: string) {
  return apiRequest<HealthEventListResponse>(`/babies/${babyId}/health/events`);
}

export function fetchHealthEventDetail(id: string) {
  return apiRequest<HealthEventPublic>(`/health/events/${id}`);
}

export function createHealthEvent(babyId: string, body: CreateHealthEventBody) {
  return apiRequest<HealthEventPublic>(`/babies/${babyId}/health/events`, {
    method: 'POST',
    body,
  });
}

export function updateHealthEvent(
  id: string,
  body: UpdateHealthEventBody,
  options?: { ifMatch?: string },
) {
  return apiRequest<HealthEventPublic>(`/health/events/${id}`, {
    method: 'PATCH',
    body,
    ifMatch: options?.ifMatch,
  });
}

export function deleteHealthEvent(id: string) {
  return apiRequest<{ ok: boolean }>(`/health/events/${id}`, { method: 'DELETE' });
}

// PUT 语义整体替换：offsets 为空数组 = 取消全部提醒。
export function replaceHealthReminders(
  eventId: string,
  body: HealthReminderBody,
  options?: { ifMatch?: string },
) {
  return apiRequest<HealthEventPublic>(`/health/events/${eventId}/reminders`, {
    method: 'PUT',
    body,
    ifMatch: options?.ifMatch,
  });
}

export function deleteHealthReminder(id: string) {
  return apiRequest<{ ok: boolean }>(`/health/reminders/${id}`, { method: 'DELETE' });
}
