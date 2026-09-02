import { Text, View } from '@tarojs/components';
import { useSyncRuntimeStore } from '@/stores/runtime';
import { useSyncNow } from '@/providers/SyncProvider';
import { Glyph } from '@/components/icons/Glyph';
import styles from './SyncBar.module.scss';

// 状态条只描述事实，不制造焦虑：离线 → 已在本机；pending → 还没飞过去；
// syncing → 正在同步；error → 稍后再试。禁止「保存失败」式文案。
export function SyncBar() {
  const phase = useSyncRuntimeStore((state) => state.phase);
  const pendingCount = useSyncRuntimeStore((state) => state.pendingCount);
  const syncNow = useSyncNow();

  if (phase !== 'offline' && pendingCount === 0) return null;

  if (phase === 'offline') {
    return (
      <View className={styles.offline} role="status" aria-live="polite">
        <Glyph name="sparkle" size="sm" />
        <Text className={styles.text}>当前离线，记录会先保存在本机，联网后自动同步。</Text>
        {pendingCount > 0 ? <Text className={styles.badge}>{pendingCount}</Text> : null}
      </View>
    );
  }

  return (
    <View
      className={styles.pending}
      role="button"
      aria-label={`还有 ${pendingCount} 条记录等待同步，点一下现在同步`}
      onClick={syncNow}
    >
      <Text className={styles.text}>
        {pendingCount} 条记录已保存在本机，等网络好了就飞过去
      </Text>
      <Text className={styles.action}>立即同步</Text>
    </View>
  );
}

export function SyncBadge({ state }: { state?: 'pending' | 'syncing' | 'synced' }) {
  if (!state || state === 'synced') return null;
  return (
    <View className={styles.badgeDot} role="img" aria-label={state === 'pending' ? '等待同步' : '同步中'}>
      <View className={state === 'syncing' ? styles.dotPulse : styles.dot} />
    </View>
  );
}
