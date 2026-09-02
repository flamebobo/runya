import { Text, View } from '@tarojs/components';
import type { TimelineItem } from '@runew/contracts';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { SyncBadge } from '@/components/sync/SyncBar';
import { formatClock } from '@/utils/recordTime';
import styles from './TimelineList.module.scss';

const MARKER_GLYPHS: Record<TimelineItem['kind'], GlyphName> = {
  FEEDING: 'bottle',
  SLEEP: 'moon',
  DIAPER: 'diaper',
  FOOD: 'bowl',
};

export function TimelineList({
  items,
  onSelect,
}: {
  items: TimelineItem[];
  onSelect?: (item: TimelineItem) => void;
}) {
  return (
    <View className={styles.list}>
      {items.map((item) => (
        <View
          key={`${item.kind}-${item.id}`}
          className={styles.row}
          role="button"
          aria-label={`${formatClock(item.recordedAt)} ${item.title}${item.syncState === 'pending' ? '，等待同步' : ''}`}
          onClick={() => onSelect?.(item)}
        >
          <Text className={styles.time}>{formatClock(item.recordedAt)}</Text>
          <View className={styles.marker} data-kind={item.kind} aria-hidden>
            <Glyph name={MARKER_GLYPHS[item.kind]} size="sm" />
          </View>
          <View className={styles.eventRow}>
            <Text className={styles.event}>{item.title}</Text>
            <SyncBadge state={item.syncState} />
          </View>
        </View>
      ))}
      <View className={styles.trailEnd} aria-hidden>
        <Glyph name="growth" size="sm" />
      </View>
    </View>
  );
}
