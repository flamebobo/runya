import { View, Text } from '@tarojs/components';
import { TextAction } from '@/components/buttons';
import { Glyph } from '@/components/icons/Glyph';
import { useUiOverlayStore } from '@/stores/runtime';
import styles from './Toast.module.scss';

export function Toast() {
  const message = useUiOverlayStore((state) => state.toastMessage);

  if (!message) return null;

  return (
    <View className={styles.root} role="status" aria-live="polite">
      <Text>{message}</Text>
    </View>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View className={styles.skeletonWrap} aria-hidden>
      {Array.from({ length: lines }).map((_, index) => (
        <View key={index} className={styles.skeletonLine} />
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View className={styles.state} role="status">
      <View className={styles.stateMark} aria-hidden>
        <Glyph name="sparkle" size="lg" />
      </View>
      <Text className={styles.stateTitle}>{title}</Text>
      {description ? <Text className={styles.stateDescription}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <TextAction label={actionLabel} onClick={onAction} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = '暂时无法加载',
  description = '请稍后再试，你的记录仍然安全。',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <View className={styles.state} role="alert">
      <View className={styles.stateMark} aria-hidden>
        <Glyph name="sparkle" size="lg" />
      </View>
      <Text className={styles.stateTitle}>{title}</Text>
      <Text className={styles.stateDescription}>{description}</Text>
      {onRetry ? (
        <Text className={styles.retry} onClick={onRetry}>
          重试
        </Text>
      ) : null}
    </View>
  );
}

export function OfflineBanner() {
  return (
    <View className={styles.offline} role="status" aria-live="polite">
      <Text>当前离线，记录会先保存在本机，联网后会自动同步。</Text>
    </View>
  );
}
