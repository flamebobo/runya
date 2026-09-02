import { View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import type { TimelineItem } from '@runew/contracts';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { SectionHeader } from '@/components/foundation/SectionHeader';
import {
  FeedingRunningBanner,
  SleepRunningBanner,
} from '@/components/records/RunningBanner';
import { StatsChart, type RecordScope } from '@/components/records/StatsChart';
import { TimelineList } from '@/components/records/TimelineList';
import { useTimelineQuery } from '@/hooks/useRecords';
import { todayIsoDate } from '@/utils/babyAge';
import { localDayRange } from '@/utils/recordTime';
import styles from './RecordsHome.module.scss';

const SCOPE_LABELS: Record<RecordScope, string> = {
  all: '记录',
  feeding: '喂奶',
  sleep: '睡眠',
  diaper: '尿布',
  food: '辅食',
};

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
  const [scope, setScope] = useState<RecordScope>('all');
  const range = localDayRange(todayIsoDate());
  const timeline = useTimelineQuery(babyId, { ...range, kind: scope });

  function openDetail(item: TimelineItem) {
    void Taro.navigateTo({
      url: `/pages/records/detail/index?kind=${item.kind}&id=${item.id}`,
    });
  }

  const running = timeline.data?.running;

  return (
    <View className={styles.home}>
      <StatsChart babyId={babyId} scope={scope} onScopeChange={setScope} />
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
      <View className={styles.timelineSection}>
        <SectionHeader
          title={`这一天的${SCOPE_LABELS[scope]}`}
          caption="每一笔，都是今天的小脚印"
        />
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
    </View>
  );
}
