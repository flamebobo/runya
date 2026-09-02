import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import type { TimelineItem } from '@runew/contracts';
import { formatDurationLabel } from '@runew/shared-utils';
import { FilterChip, GlassDateField } from '@/components/forms';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { SectionHeader } from '@/components/foundation/SectionHeader';
import { TextAction } from '@/components/buttons';
import {
  FeedingRunningBanner,
  SleepRunningBanner,
} from '@/components/records/RunningBanner';
import { TimelineList } from '@/components/records/TimelineList';
import { useTimelineQuery } from '@/hooks/useRecords';
import { todayIsoDate } from '@/utils/babyAge';
import { localDayRange, shiftIsoDate } from '@/utils/recordTime';
import styles from './RecordsHome.module.scss';

const FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'feeding', label: '喂奶' },
  { value: 'sleep', label: '睡眠' },
  { value: 'diaper', label: '尿布' },
  { value: 'food', label: '辅食' },
] as const;

export function RecordsHome({
  babyId,
  onFinishSleep,
  onPauseFeeding,
  onResumeFeeding,
  onSwitchFeeding,
  onFinishFeeding,
}: {
  babyId: string;
  onFinishSleep?: () => void;
  onPauseFeeding?: () => void;
  onResumeFeeding?: () => void;
  onSwitchFeeding?: () => void;
  onFinishFeeding?: () => void;
}) {
  const [date, setDate] = useState(todayIsoDate);
  const [kind, setKind] = useState<(typeof FILTERS)[number]['value']>('all');
  const range = localDayRange(date);
  const timeline = useTimelineQuery(babyId, { ...range, kind });

  function openDetail(item: TimelineItem) {
    void Taro.navigateTo({
      url: `/pages/records/detail/index?kind=${item.kind}&id=${item.id}`,
    });
  }

  const summary = timeline.data?.summary;
  const running = timeline.data?.running;

  return (
    <View className={styles.home}>
      <View className={styles.dateRow}>
        <TextAction label="前一天" onClick={() => setDate((value) => shiftIsoDate(value, -1))} />
        <View className={styles.dateField}>
          <GlassDateField label="日期" value={date} onChange={setDate} />
        </View>
        <TextAction label="今天" onClick={() => setDate(todayIsoDate())} />
      </View>
      <View className={styles.filters}>
        {FILTERS.map((filter) => (
          <FilterChip
            key={filter.value}
            label={filter.label}
            selected={kind === filter.value}
            onClick={() => setKind(filter.value)}
          />
        ))}
      </View>
      {running?.sleep ? (
        <SleepRunningBanner sleep={running.sleep} onFinish={onFinishSleep} />
      ) : null}
      {running?.feeding ? (
        <FeedingRunningBanner
          feeding={running.feeding}
          onPause={onPauseFeeding}
          onResume={onResumeFeeding}
          onSwitch={onSwitchFeeding}
          onFinish={onFinishFeeding}
        />
      ) : null}
      {summary ? (
        <View className={styles.summary}>
          <GlassSurface level="tinted" tone="apricot" radius="quick" className={styles.stat}>
            <Text className={`text-section-title ${styles.statValue}`}>{summary.feedingCount}</Text>
            <Text className={styles.statLabel}>喂奶</Text>
          </GlassSurface>
          <GlassSurface level="tinted" tone="lavender" radius="quick" className={styles.stat}>
            <Text className={`text-section-title ${styles.statValue}`}>
              {formatDurationLabel(summary.sleepSeconds)}
            </Text>
            <Text className={styles.statLabel}>睡眠</Text>
          </GlassSurface>
          <GlassSurface level="tinted" tone="sage" radius="quick" className={styles.stat}>
            <Text className={`text-section-title ${styles.statValue}`}>{summary.diaperCount}</Text>
            <Text className={styles.statLabel}>尿布</Text>
          </GlassSurface>
          <GlassSurface level="tinted" tone="blush" radius="quick" className={styles.stat}>
            <Text className={`text-section-title ${styles.statValue}`}>{summary.foodCount}</Text>
            <Text className={styles.statLabel}>辅食</Text>
          </GlassSurface>
        </View>
      ) : null}
      <SectionHeader title="这一天的记录" />
      {timeline.isLoading ? <Skeleton lines={5} /> : null}
      {timeline.isError ? (
        <ErrorState onRetry={() => void timeline.refetch()} />
      ) : null}
      {timeline.data && timeline.data.items.length === 0 ? (
        <EmptyState
          title="这一天还很安静"
          description="喂奶、睡眠和尿布来了，就会轻轻落进时间线。"
        />
      ) : null}
      {timeline.data && timeline.data.items.length > 0 ? (
        <TimelineList items={timeline.data.items} onSelect={openDetail} />
      ) : null}
    </View>
  );
}
