import { Text, View } from '@tarojs/components';
import { useEffect, useState } from 'react';
import type { StatsBucket, StatsRange } from '@runew/contracts';
import { formatDurationLabel } from '@runew/shared-utils';
import { FilterChip, SegmentedControl } from '@/components/forms';
import { ErrorState, Skeleton } from '@/components/feedback';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { useRecordStatsQuery } from '@/hooks/useRecords';
import classNames from '@/utils/classNames';
import { todayIsoDate } from '@/utils/babyAge';
import styles from './StatsChart.module.scss';

type MetricKey = 'feeding' | 'sleep' | 'diaper' | 'food';
export type RecordScope = 'all' | MetricKey;

interface MetricConfig {
  key: MetricKey;
  label: string;
  glyph: GlyphName;
  value: (bucket: StatsBucket) => number;
  format: (value: number) => string;
  readoutClass?: string;
  barClass?: string;
}

const METRICS: MetricConfig[] = [
  {
    key: 'feeding',
    label: '喂奶',
    glyph: 'bottle',
    value: (bucket) => bucket.feedingAmountMl,
    format: (value) => `${value} ml`,
    readoutClass: styles.toneFeeding,
    barClass: styles.barFeeding,
  },
  {
    key: 'sleep',
    label: '睡眠',
    glyph: 'moon',
    value: (bucket) => bucket.sleepSeconds,
    format: (value) => formatDurationLabel(value),
    readoutClass: styles.toneSleep,
    barClass: styles.barSleep,
  },
  {
    key: 'diaper',
    label: '尿布',
    glyph: 'diaper',
    value: (bucket) => bucket.diaperCount,
    format: (value) => `${value} 次`,
    readoutClass: styles.toneDiaper,
    barClass: styles.barDiaper,
  },
  {
    key: 'food',
    label: '辅食',
    glyph: 'bowl',
    value: (bucket) => bucket.foodCount,
    format: (value) => `${value} 次`,
    readoutClass: styles.toneFood,
    barClass: styles.barFood,
  },
];

const SCOPE_OPTIONS: Array<{ key: RecordScope; label: string }> = [
  { key: 'all', label: '全部' },
  ...METRICS.map(({ key, label }) => ({ key, label })),
];

const RANGE_OPTIONS = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
] as const;

function periodCaption(range: StatsRange) {
  const [, month, day] = todayIsoDate().split('-') as [string, string, string];
  if (range === 'week') return '最近 7 天';
  if (range === 'month') return '最近 30 天';
  if (range === 'year') return '最近 12 个月';
  return `${Number(month)}月${Number(day)}日`;
}

function bucketLabel(range: StatsRange, label: string) {
  if (range === 'day') return `${label}时`;
  if (range === 'week') return `周${label}`;
  if (range === 'year') return label;
  const [month, day] = label.split('/');
  return `${Number(month)}月${Number(day)}日`;
}

function showTick(range: StatsRange, index: number, label: string) {
  if (range === 'week') return true;
  if (range === 'day') return Number(label) % 3 === 0;
  if (range === 'year') return index % 2 === 1;
  return index === 0 || (index + 1) % 5 === 0;
}

function metricTotal(metric: MetricConfig, buckets: StatsBucket[]) {
  return buckets.reduce((sum, bucket) => sum + metric.value(bucket), 0);
}

function overviewValue(metric: MetricConfig, value: number) {
  if (metric.key === 'feeding') return `${value}ml`;
  return metric.key === 'sleep' ? formatDurationLabel(value) : `${value}次`;
}

export function StatsChart({
  babyId,
  scope,
  onScopeChange,
}: {
  babyId: string;
  scope: RecordScope;
  onScopeChange: (scope: RecordScope) => void;
}) {
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
        scope={scope}
        onScopeChange={onScopeChange}
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
  scope: RecordScope;
  onScopeChange: (scope: RecordScope) => void;
  buckets?: StatsBucket[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
}

export function StatsChartView({
  range,
  onRange,
  scope,
  onScopeChange,
  buckets,
  loading = false,
  error = false,
  onRetry,
}: StatsChartViewProps) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => setActive(null), [range, scope]);

  const metric = scope === 'all' ? null : METRICS.find((entry) => entry.key === scope)!;
  const values = metric ? (buckets ?? []).map((bucket) => metric.value(bucket)) : [];
  const total = values.reduce((sum, value) => sum + value, 0);
  const max = Math.max(...values, 0);
  const showBucket = active != null && values[active] != null;
  const readoutValue = metric?.format(showBucket ? values[active!]! : total);
  const readoutCaption = metric
    ? showBucket
      ? `${bucketLabel(range, buckets![active!]!.label)} · ${metric.label}`
      : `${periodCaption(range)} · ${metric.label}`
    : null;
  const scopeLabel = metric?.label ?? '全部记录';

  return (
    <View className={styles.inner}>
      <View className={styles.header}>
        <View className={styles.headerCopy}>
          <Text className={styles.title}>小小的规律</Text>
          <Text
            className={styles.subtitle}
          >{`${periodCaption(range)} · ${scopeLabel}`}</Text>
        </View>
        <View className={styles.growingTag} aria-label="小日子发芽中">
          <View className={styles.sproutFriend} aria-hidden>
            <Glyph name="baby" size="md" />
            <View className={styles.friendLeaf}>
              <Glyph name="growth" size="sm" />
            </View>
          </View>
          <Text className={styles.growingText}>小日子发芽中</Text>
          <View className={styles.growingSpark} aria-hidden>
            <Glyph name="sparkle" size="sm" />
          </View>
        </View>
      </View>

      <View className={styles.controlGroup}>
        <Text className={styles.controlLabel}>时间范围</Text>
        <SegmentedControl
          options={[...RANGE_OPTIONS]}
          value={range}
          onChange={onRange}
          className={styles.rangeSwitch}
          ariaLabel="统计时间范围"
        />
      </View>

      <View className={styles.divider} aria-hidden />

      <View className={styles.controlGroup}>
        <View className={styles.controlHeading}>
          <Text className={styles.controlLabel}>想看哪一类</Text>
          <Text className={styles.controlHint}>统计与时间线同步</Text>
        </View>
        <View className={styles.metrics}>
          {SCOPE_OPTIONS.map((entry) => (
            <FilterChip
              key={entry.key}
              label={entry.label}
              selected={entry.key === scope}
              className={styles.metricChip}
              onClick={() => onScopeChange(entry.key)}
            />
          ))}
        </View>
      </View>

      <View className={styles.dataArea}>
        {loading ? <Skeleton lines={4} /> : null}
        {error && !loading ? <ErrorState onRetry={onRetry} /> : null}
        {!loading && !error && buckets && scope === 'all' ? (
          <View
            className={styles.overview}
            role="list"
            aria-label={`${periodCaption(range)}记录概览`}
          >
            {METRICS.map((entry) => (
              <View key={entry.key} className={styles.overviewItem} role="listitem">
                <View className={styles.overviewLabelRow}>
                  <View
                    className={classNames(
                      styles.overviewIcon,
                      styles[`icon${entry.key}`],
                    )}
                    aria-hidden
                  >
                    <Glyph name={entry.glyph} size="sm" />
                  </View>
                  <Text className={styles.overviewLabel}>{entry.label}</Text>
                </View>
                <Text className={classNames(styles.overviewValue, entry.readoutClass)}>
                  {overviewValue(entry, metricTotal(entry, buckets))}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        {!loading && !error && buckets && metric ? (
          <>
            <View className={styles.readout}>
              <View
                className={classNames(styles.readoutIcon, styles[`icon${metric.key}`])}
                aria-hidden
              >
                <Glyph name={metric.glyph} size="sm" />
              </View>
              <Text className={classNames(styles.readoutValue, metric.readoutClass)}>
                {readoutValue}
              </Text>
              <Text className={styles.readoutCaption}>{readoutCaption}</Text>
            </View>
            {max > 0 ? (
              <View className={styles.chart}>
                {buckets.map((bucket, index) => {
                  const height = Math.round((metric.value(bucket) / max) * 100);
                  return (
                    <View
                      key={`${range}-${index}`}
                      className={classNames(
                        styles.column,
                        active === index && styles.columnActive,
                      )}
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
            ) : (
              <View className={styles.quiet}>
                <View className={styles.quietMark} aria-hidden>
                  <Glyph name={metric.glyph} size="md" />
                  <View className={styles.quietSpark}>
                    <Glyph name="sparkle" size="sm" />
                  </View>
                </View>
                <Text className={styles.quietText}>
                  这段时间还很安静，记录会慢慢长出节奏。
                </Text>
              </View>
            )}
          </>
        ) : null}
      </View>
    </View>
  );
}
