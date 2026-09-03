import { View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { AppTopBar, ErrorState, PageShell, Skeleton } from '@/components';
import {
  NotificationCenterView,
  notificationTargetUrl,
} from '@/components/notifications/NotificationViews';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import {
  useNotificationsQuery,
  useNotificationReadActions,
} from '@/hooks/useNotifications';
import { useUiOverlayStore } from '@/stores/runtime';
import styles from './index.module.scss';

export default function NotificationsPage() {
  return (
    <AppBootstrapGate>
      <NotificationsBody />
    </AppBootstrapGate>
  );
}

function NotificationsBody() {
  const query = useNotificationsQuery();
  const actions = useNotificationReadActions();
  const { showToast } = useUiOverlayStore();

  function returnToPrevious() {
    void Promise.resolve(Taro.navigateBack({ delta: 1 })).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' }),
    );
  }

  async function markAll() {
    try {
      await actions.markAllRead.mutateAsync();
      showToast('消息都看过啦。');
    } catch {
      showToast('消息还没更新好，请再试一次。');
    }
  }

  function openNotification(item: Parameters<typeof notificationTargetUrl>[0]) {
    const url = notificationTargetUrl(item);
    if (url) {
      void Taro.navigateTo({ url });
      return;
    }
    showToast('这条消息已经收好。');
  }

  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <PageShell className={styles.page}>
      <AppTopBar
        variant="standard"
        title="通知中心"
        subtitle="重要的事会来找你"
        actionLabel={unreadCount > 0 ? '全部已读' : undefined}
        onActionClick={() => void markAll()}
        onBackClick={returnToPrevious}
      />
      <View className={`page-content ${styles.content}`}>
        {query.isLoading ? <Skeleton lines={8} /> : null}
        {query.isError ? (
          <ErrorState
            title="通知还没打开"
            description="稍后再来看看，消息不会凭空消失。"
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {query.data ? (
          <NotificationCenterView
            items={query.data.items}
            unreadCount={query.data.unreadCount}
            onRead={(id) => actions.markRead.mutate(id)}
            onOpen={openNotification}
          />
        ) : null}
      </View>
    </PageShell>
  );
}
