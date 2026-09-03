import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import type { UpdateNotificationPreferencesBody } from '@runew/contracts';
import { AppTopBar, ErrorState, GlassSurface, PageShell, Skeleton } from '@/components';
import {
  DndSettingsView,
  NotificationSettingsView,
  type NotificationPreferenceKey,
} from '@/components/settings/SettingsViews';
import { Glyph } from '@/components/icons/Glyph';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferences,
} from '@/hooks/useNotifications';
import { useUiOverlayStore } from '@/stores/runtime';
import styles from './index.module.scss';

type SettingsView = 'home' | 'notifications' | 'dnd';

function settingsView(value: string | undefined): SettingsView {
  return value === 'notifications' || value === 'dnd' ? value : 'home';
}

export default function SettingsPage() {
  return (
    <AppBootstrapGate>
      <SettingsBody />
    </AppBootstrapGate>
  );
}

function SettingsBody() {
  const router = useRouter();
  const view = settingsView(router.params.view);
  const query = useNotificationPreferencesQuery();
  const update = useUpdateNotificationPreferences();
  const { showToast } = useUiOverlayStore();

  function returnToPrevious() {
    void Promise.resolve(Taro.navigateBack({ delta: 1 })).catch(() =>
      Taro.reLaunch({ url: '/pages/index/index' }),
    );
  }

  function open(nextView: Exclude<SettingsView, 'home'>) {
    void Taro.navigateTo({ url: `/pages/settings/index?view=${nextView}` });
  }

  async function togglePreference(key: NotificationPreferenceKey, value: boolean) {
    const body = { [key]: value } as UpdateNotificationPreferencesBody;
    try {
      await update.mutateAsync(body);
      showToast('通知偏好已保存。');
    } catch {
      showToast('设置还没保存好，请再试一次。');
    }
  }

  async function saveDnd(body: UpdateNotificationPreferencesBody) {
    try {
      await update.mutateAsync(body);
      showToast('免打扰时间已保存。');
    } catch {
      showToast('免打扰设置还没保存好，请再试一次。');
    }
  }

  function homeView() {
    return (
      <View className={styles.homeStack}>
        <GlassSurface
          level="tinted"
          tone="apricot"
          radius="hero"
          className={styles.homeHero}
        >
          <View className={styles.homeArt} aria-hidden>
            <Glyph name="settings" size="lg" />
          </View>
          <View className={styles.homeCopy}>
            <Text className={styles.homeTitle}>把润芽调成你的样子</Text>
            <Text className={styles.homeCaption}>
              通知、夜间安静时间，都可以慢慢调整。
            </Text>
          </View>
        </GlassSurface>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.homeCard}
        >
          <View
            className={styles.homeCardHit}
            role="button"
            aria-label="通知设置"
            onClick={() => open('notifications')}
          >
            <View className={styles.homeCardIcon}>
              <Glyph name="bell" size="md" />
            </View>
            <View className={styles.homeCardCopy}>
              <Text className={styles.homeCardTitle}>通知设置</Text>
              <Text className={styles.homeCardCaption}>选择哪些消息来找你</Text>
            </View>
            <Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.homeCard}
        >
          <View
            className={styles.homeCardHit}
            role="button"
            aria-label="免打扰设置"
            onClick={() => open('dnd')}
          >
            <View className={styles.homeCardIconLavender}>
              <Glyph name="moon" size="md" />
            </View>
            <View className={styles.homeCardCopy}>
              <Text className={styles.homeCardTitle}>免打扰时间</Text>
              <Text className={styles.homeCardCaption}>让夜里的家保持安静</Text>
            </View>
            <Glyph name="chevron" size="sm" />
          </View>
        </GlassSurface>
      </View>
    );
  }

  const title =
    view === 'notifications' ? '通知设置' : view === 'dnd' ? '免打扰时间' : '设置';
  const subtitle =
    view === 'notifications'
      ? '只接收你想听见的'
      : view === 'dnd'
        ? '夜里先好好休息'
        : '把润芽调成你的样子';

  return (
    <PageShell className={styles.page}>
      <AppTopBar
        variant="standard"
        title={title}
        subtitle={subtitle}
        onBackClick={returnToPrevious}
      />
      <View className={`page-content ${styles.content}`}>
        {query.isLoading ? <Skeleton lines={7} /> : null}
        {query.isError ? (
          <ErrorState
            title="设置还没打开"
            description="稍后再试，已有偏好不会被改掉。"
            onRetry={() => void query.refetch()}
          />
        ) : null}
        {query.data && view === 'home' ? <>{homeView()}</> : null}
        {query.data && view === 'notifications' ? (
          <NotificationSettingsView
            preferences={query.data}
            onToggle={(key, value) => void togglePreference(key, value)}
            onDnd={() => open('dnd')}
            updating={update.isPending}
          />
        ) : null}
        {query.data && view === 'dnd' ? (
          <DndSettingsView
            preferences={query.data}
            onSave={saveDnd}
            saving={update.isPending}
          />
        ) : null}
      </View>
    </PageShell>
  );
}
