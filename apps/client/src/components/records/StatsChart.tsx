import { Text, View } from '@tarojs/components';
import { useEffect, useState } from 'react';
import type { StatsBucket, StatsRange } from '@runew/contracts';
import { formatDurationLabel } from '@runew/shared-utils';
import { FilterChip, SegmentedControl } from '@/components/forms';
import { ErrorState, Skeleton } from '@/components/feedback';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { useRecordStatsQuery } from '@/hooks/useRecords';
import classNames from '@/utils/classNames';
import { todayIsoDate } from '@/utils/babyAge';
import styles from './StatsChart.module.scss';

type MetricKey = 'feeding' | 'sleep' | 'diaper' | 'food';

interface MetricConfig {
  key: MetricKey;
  label: string;
  value: (bucket: StatsBucket) => number;
  format: (value: number) => string;
  readoutClass?: string;
  barClass?: string;
}

const METRICS: MetricConfig[] = [
  {
    key: 'feeding',
    label: '喂奶',
    value: (bucket) => bucket.feedingCount,
    format: (value) => `${value} 次`,
    readoutClass: styles.toneFeeding,
    barClass: styles.barFeeding,
  },
  {
    key: 'sleep',
    label: '睡眠',
    value: (bucket) => bucket.sleepSeconds,
    format: (value) => formatDurationLabel(value),
    readoutClass: styles.toneSleep,
    barClass: styles.barSleep,
  },
  {
    key: 'diaper',
    label: '尿布',
    value: (bucket) => bucket.diaperCount,
    format: (value) => `${value} 次`,
    readoutClass: styles.toneDiaper,
    barClass: styles.barDiaper,
  },
  {
    key: 'food',
    label: '辅食',
    value: (bucket) => bucket.foodCount,
    format: (value) => `${value} 次`,
    readoutClass: styles.toneFood,
    barClass: styles.barFood,
  },
];

const RANGE_OPTIONS = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
] as const;

function periodCaption(range: StatsRange) {
  const [year, month, day] = todayIsoDate().split('-') as [string, string, string];
  if (range === 'week') return '最近 7 天';
  if (range === 'month') return `${year}年${Number(month)}月`;
  return `${Number(month)}月${Number(day)}日`;
}

function bucketLabel(range: StatsRange, label: string) {
  if (range === 'day') return `${label}时`;
  if (range === 'week') return `周${label}`;
  return `${Number(label)}日`;
}

function showTick(range: StatsRange, index: number, label: string) {
  if (range === 'week') return true;
  if (range === 'day') return Number(label) % 3 === 0;
  return index === 0 || (index + 1) % 5 === 0;
}

export function StatsChart({ babyId }: { babyId: string }) {
  const [range, setRange] = useState<StatsRange>('day');
  const stats = useRecordStatsQuery(babyId, {
    range,
    utcOffsetMinutes: -new Date().getTimezoneOffset(),
  });

  return (
    <GlassSurface level="card" radius="card" className={styles.card}>
      <StatsChartView
        range={range}
        onRange={setRange}
        buckets={stats.data?.buckets}
        loading={stats.isLoading}
        error={stats.isError}
        onRetry={() => void stats.refetch()}
      />
    </GlassSurface>
  );
}

export interface StatsChartViewProps {
  range: StatsRange;
  onRange: (range: StatsRange) => void;
  buckets?: StatsBucket[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}

export function StatsChartView({
  range,
  onRange,
  buckets,
  loading = false,
  error = false,
  onRetry,
}: StatsChartViewProps) {
  const [metricKey, setMetricKey] = useState<MetricKey>('feeding');
  const [active, setActive] = useState<number | null>(null);
  // 维度或指标切换后，选中的柱子不再有意义
  useEffect(() => setActive(null), [range, metricKey]);

  const metric = METRICS.find((entry) => entry.key === metricKey) ?? METRICS[0]!;
  const values = (buckets ?? []).map((bucket) => metric.value(bucket));
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 0);

  const showBucket = active != null && values[active] != null;
  const readoutValue = metric.format(showBucket ? values[active!]! : total);
  const readoutCaption = showBucket
    ? `${bucketLabel(range, buckets![active!]!.label)} · ${metric.label}`
    : `${periodCaption(range)} · ${metric.label}`;

  return (
    <View className={styles.inner}>
      <View className={styles.header}>
        <Text className={styles.title}>小小的规律</Text>
        <SegmentedControl options={[...RANGE_OPTIONS]} value={range} onChange={onRange} />
      </View>
      <View className={styles.metrics}>
        {METRICS.map((entry) => (
          <FilterChip
            key={entry.key}
            label={entry.label}
            selected={entry.key === metricKey}
            onClick={() => setMetricKey(entry.key)}
          />
        ))}
      </View>
      <View className={styles.readout}>
        <Text className={classNames(styles.readoutValue, metric.readoutClass)}>{readoutValue}</Text>
        <Text className={styles.readoutCaption}>{readoutCaption}</Text>
      </View>
      {loading ? <Skeleton lines={4} /> : null}
      {error && !loading ? <ErrorState onRetry={onRetry} /> : null}
      {!loading && !error && buckets && max > 0 ? (
        <View className={styles.chart}>
          {buckets.map((bucket, index) => {
            const height = Math.round((metric.value(bucket) / max) * 100);
            return (
              <View
                key={`${range}-${index}`}
                className={classNames(styles.column, active === index && styles.columnActive)}
                style={{ '--i': index } as React.CSSProperties}
                role="button"
                aria-label={bucketLabel(range, bucket.label)}
                aria-pressed={active === index}
                onClick={() => setActive(active === index ? null : index)}
              >
                <View className={styles.track}>
                  <View
                    className={classNames(styles.bar, metric.barClass)}
                    style={{ height: `${height}%` }}
                  />
                </View>
                <Text
                  className={classNames(
                    styles.tick,
                    !showTick(range, index, bucket.label) && styles.tickHidden,
                  )}
                >
                  {bucket.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
      {!loading && !error && buckets && max === 0 ? (
        <View className={styles.quiet}>
          <Text className={styles.quietText}>这段时间还很安静，记录会慢慢长出节奏。</Text>
        </View>
      ) : null}
    </View>
  );
}
