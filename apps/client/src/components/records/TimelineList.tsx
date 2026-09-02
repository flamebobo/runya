import { Image, Text, View } from '@tarojs/components';
import type { TimelineItem } from '@runew/contracts';
import {
  dotApricot,
  dotBlush,
  dotLavender,
  dotSage,
} from '@/assets/figma';
import { formatClock } from '@/utils/recordTime';
import styles from './TimelineList.module.scss';

const DOTS = {
  FEEDING: dotApricot,
  SLEEP: dotLavender,
  DIAPER: dotSage,
  FOOD: dotBlush,
} as const;

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
          aria-label={`${formatClock(item.recordedAt)} ${item.title}`}
          onClick={() => onSelect?.(item)}
        >
          <Text className={styles.time}>{formatClock(item.recordedAt)}</Text>
          <Image className={styles.dot} src={DOTS[item.kind]} mode="aspectFit" />
          <Text className={styles.event}>{item.title}</Text>
        </View>
      ))}
    </View>
  );
}
