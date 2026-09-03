import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NotificationListResponse,
  NotificationPreferences,
  UpdateNotificationPreferencesBody,
} from '@runew/contracts';
import {
  fetchNotificationPreferences,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from '@/api/notifications';

export const notificationsQueryKey = ['notifications'] as const;
export const notificationPreferencesQueryKey = ['notification-preferences'] as const;

export function useNotificationsQuery() {
  return useQuery({
    queryKey: notificationsQueryKey,
    staleTime: 30_000,
    queryFn: () => fetchNotifications(),
  });
}

// 未读数给 AppTopBar 抽屉角标等处使用；失败静默（角标不是关键路径）。
export function useUnreadNotificationCount() {
  const query = useQuery({
    queryKey: notificationsQueryKey,
    staleTime: 30_000,
    queryFn: () => fetchNotifications(),
    retry: false,
  });
  return query.data?.unreadCount ?? 0;
}

function applyListUpdate(
  old: NotificationListResponse | undefined,
  updater: (
    items: NotificationListResponse['items'],
  ) => NotificationListResponse['items'],
): NotificationListResponse | undefined {
  if (!old) return old;
  const items = updater(old.items);
  return {
    items,
    unreadCount: items.filter((item) => item.readAt == null).length,
  };
}

export function useNotificationReadActions() {
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });
      const previous =
        queryClient.getQueryData<NotificationListResponse>(notificationsQueryKey);
      queryClient.setQueryData<NotificationListResponse>(notificationsQueryKey, (old) =>
        applyListUpdate(old, (items) =>
          items.map((item) =>
            item.id === id && item.readAt == null
              ? { ...item, readAt: Date.now() }
              : item,
          ),
        ),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });
      const previous =
        queryClient.getQueryData<NotificationListResponse>(notificationsQueryKey);
      queryClient.setQueryData<NotificationListResponse>(notificationsQueryKey, (old) =>
        applyListUpdate(old, (items) =>
          items.map((item) =>
            item.readAt == null ? { ...item, readAt: Date.now() } : item,
          ),
        ),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsQueryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });

  return { markRead, markAllRead };
}

export function useNotificationPreferencesQuery() {
  return useQuery({
    queryKey: notificationPreferencesQueryKey,
    staleTime: 60_000,
    queryFn: () => fetchNotificationPreferences(),
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotificationPreferencesBody) =>
      updateNotificationPreferences(body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: notificationPreferencesQueryKey });
      const previous = queryClient.getQueryData<NotificationPreferences>(
        notificationPreferencesQueryKey,
      );
      if (previous) {
        queryClient.setQueryData<NotificationPreferences>(
          notificationPreferencesQueryKey,
          { ...previous, ...body },
        );
      }
      return { previous };
    },
    onError: (_error, _body, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationPreferencesQueryKey, context.previous);
      }
    },
    onSettled: (data) => {
      if (data) {
        queryClient.setQueryData(notificationPreferencesQueryKey, data);
      }
      void queryClient.invalidateQueries({ queryKey: notificationPreferencesQueryKey });
    },
  });
}
