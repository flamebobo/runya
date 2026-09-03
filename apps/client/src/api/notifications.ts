import type {
  NotificationListResponse,
  NotificationPreferences,
  UpdateNotificationPreferencesBody,
} from '@runew/contracts';
import { apiRequest } from './client';

export function fetchNotifications() {
  return apiRequest<NotificationListResponse>('/notifications');
}

export function markNotificationRead(id: string) {
  return apiRequest<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead() {
  return apiRequest<{ ok: boolean }>('/notifications/read-all', { method: 'POST' });
}

export function fetchNotificationPreferences() {
  return apiRequest<NotificationPreferences>('/notification-preferences');
}

export function updateNotificationPreferences(
  body: UpdateNotificationPreferencesBody,
) {
  return apiRequest<NotificationPreferences>('/notification-preferences', {
    method: 'PUT',
    body,
  });
}
