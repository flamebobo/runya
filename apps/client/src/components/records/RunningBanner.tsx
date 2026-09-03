import { Text, View } from '@tarojs/components';
import type { FeedingPublic, SleepPublic } from '@runew/contracts';
import {
  elapsedSecondsFromRange,
  feedingElapsedSeconds,
  formatDurationHms,
  formatDurationLabel,
} from '@runew/shared-utils';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph } from '@/components/icons/Glyph';
import { SecondaryGlassButton, PrimaryActionButton } from '@/components/buttons';
import { useNowMs } from '@/hooks/useNowMs';
import styles from './RunningBanner.module.scss';

function currentSide(feeding: FeedingPublic) {
  const open = [...feeding.segments].reverse().find((segment) => segment.endedAt == null);
  return open?.side ?? feeding.segments[feeding.segments.length - 1]?.side ?? 'LEFT';
}

export function SleepRunningBanner({
  sleep,
  onFinish,
}: {
  sleep: SleepPublic;
  onFinish?: () => void;
}) {
  const now = useNowMs(sleep.status === 'RUNNING');
  const seconds = elapsedSecondsFromRange(sleep.startedAt, sleep.endedAt, now);

  return (
    <GlassSurface level="tinted" tone="lavender" radius="hero" className={styles.banner}>
      <View className={styles.hit}>
        <View className={styles.head}>
          <View className={`${styles.iconChip} ${styles.iconLavender}`}>
            <Glyph name="moon" size="md" />
          </View>
          <Text className={styles.kicker}>睡眠进行中</Text>
        </View>
        <Text className={styles.clock}>{formatDurationHms(seconds)}</Text>
        <Text className={styles.side}>宝宝正在安睡，回来时时长还在。</Text>
        <View className={styles.actions}>
          <PrimaryActionButton label="结束这一觉" tone="lavender" onClick={onFinish} />
        </View>
      </View>
    </GlassSurface>
  );
}

export function FeedingRunningBanner({
  feeding,
  onPause,
  onResume,
  onSwitch,
  onFinish,
}: {
  feeding: FeedingPublic;
  onPause?: () => void;
  onResume?: () => void;
  onSwitch?: () => void;
  onFinish?: () => void;
}) {
  const running = feeding.status === 'RUNNING' || feeding.status === 'PAUSED';
  const now = useNowMs(running);
  const seconds = feedingElapsedSeconds(feeding.segments, now);
  const side = currentSide(feeding) === 'LEFT' ? '左侧' : '右侧';
  const paused = feeding.status === 'PAUSED';

  return (
    <GlassSurface level="tinted" tone="apricot" radius="hero" className={styles.banner}>
      <View className={styles.hit}>
        <View className={styles.head}>
          <View className={`${styles.iconChip} ${styles.iconApricot}`}>
            <Glyph name="heart" size="md" />
          </View>
          <Text className={styles.kicker}>{paused ? '喂奶暂停中' : '正在喂奶'}</Text>
        </View>
        <Text className={styles.clock}>{formatDurationHms(seconds)}</Text>
        <Text className={styles.side}>{paused ? `停在${side}` : `当前${side}`}</Text>
        <View className={styles.actions}>
          {paused ? (
            <PrimaryActionButton label="继续" className={styles.actionFlex} onClick={onResume} />
          ) : (
            <SecondaryGlassButton
              label="暂停"
              className={`${styles.actionFlex} ${styles.actionQuiet}`}
              onClick={onPause}
            />
          )}
          <SecondaryGlassButton
            label="换边"
            className={`${styles.actionFlex} ${styles.actionQuiet}`}
            onClick={onSwitch}
          />
          <PrimaryActionButton
            label="结束喂奶"
            className={`${styles.actionFlex} ${styles.actionFinish}`}
            onClick={onFinish}
          />
        </View>
      </View>
    </GlassSurface>
  );
}

export function FinishedNotice({
  title,
  durationSeconds,
}: {
  title: string;
  durationSeconds: number;
}) {
  return (
    <GlassSurface level="tinted" tone="sage" radius="card" className={styles.notice}>
      <View className={styles.noticeHit}>
        <Text className={styles.kicker}>{title}</Text>
        <Text className={styles.side}>{formatDurationLabel(durationSeconds)}</Text>
      </View>
    </GlassSurface>
  );
}
