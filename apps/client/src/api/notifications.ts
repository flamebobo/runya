import {
  apiOkResponseSchema,
  notificationListResponseSchema,
  notificationPreferencesSchema,
} from '@runew/contracts';
import type { UpdateNotificationPreferencesBody } from '@runew/contracts';
import { apiRequest } from './client';

export async function fetchNotifications() {
  const response = await apiRequest<unknown>('/notifications');
  return notificationListResponseSchema.parse(response);
}

export async function markNotificationRead(id: string) {
  const response = await apiRequest<unknown>(`/notifications/${id}/read`, {
    method: 'POST',
  });
  return apiOkResponseSchema.parse(response);
}

export async function markAllNotificationsRead() {
  const response = await apiRequest<unknown>('/notifications/read-all', {
    method: 'POST',
  });
  return apiOkResponseSchema.parse(response);
}

export async function fetchNotificationPreferences() {
  const response = await apiRequest<unknown>('/notification-preferences');
  return notificationPreferencesSchema.parse(response);
}

export async function updateNotificationPreferences(
  body: UpdateNotificationPreferencesBody,
) {
  const response = await apiRequest<unknown>('/notification-preferences', {
    method: 'PUT',
    body,
  });
  return notificationPreferencesSchema.parse(response);
}
