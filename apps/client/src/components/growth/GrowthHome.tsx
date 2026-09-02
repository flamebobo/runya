import { Text, View } from '@tarojs/components';
import type {
  GrowthListResponse,
  GrowthMetric,
  GrowthRecordPublic,
  MilestonePublic,
} from '@runew/contracts';
import { PrimaryActionButton } from '@/components/buttons';
import { SegmentedControl } from '@/components/forms';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph } from '@/components/icons/Glyph';
import { SyncBadge } from '@/components/sync/SyncBar';
import { GrowthTrendChart } from './GrowthTrendChart';
import { GROWTH_METRICS, formatGrowthDate, formatGrowthValue } from './constants';
import styles from './Growth.module.scss';

const METRIC_OPTIONS: Array<{ value: GrowthMetric; label: string }> = [
  { value: 'height', label: '身高' },
  { value: 'weight', label: '体重' },
  { value: 'head', label: '头围' },
];

function trendSentence(metric: GrowthMetric, data: GrowthListResponse) {
  const points = data.trends[metric];
  const definition = GROWTH_METRICS[metric];
  if (points.length < 2)
    return `再多一次${definition.shortLabel}记录，就能看见真实变化。`;
  const delta = Number(
    (points[points.length - 1]!.value - points[0]!.value).toFixed(2),
  );
  if (delta === 0) return `${definition.shortLabel}目前保持平稳，每一次测量都已收好。`;
  return `从第一笔到最近一次，${definition.shortLabel}${delta > 0 ? '增加' : '变化'} ${Math.abs(delta)} ${definition.unit}。`;
}

function LatestRecordRow({
  item,
  onClick,
}: {
  item: GrowthRecordPublic;
  onClick: () => void;
}) {
  const readings = [
    item.heightCm == null ? null : `${formatGrowthValue(item.heightCm)} cm`,
    item.weightKg == null ? null : `${formatGrowthValue(item.weightKg)} kg`,
    item.headCircumferenceCm == null
      ? null
      : `${formatGrowthValue(item.headCircumferenceCm)} cm`,
  ].filter((value): value is string => value !== null);

  return (
    <GlassSurface
      level="card"
      radius="card"
      interactive
      className={styles.latestRecordCard}
    >
      <View
        className={styles.latestRecordHit}
        role="button"
        aria-label={`最近一次测量，${readings.join('，')}`}
        onClick={onClick}
      >
        <View className={styles.latestRecordIcon} aria-hidden>
          <Glyph name="growth" size="sm" />
        </View>
        <View className={styles.recordBody}>
          <View className={styles.recordTitleRow}>
            <Text className={styles.latestRecordLabel}>最近一次测量</Text>
            <SyncBadge state={item.syncState} />
          </View>
          <Text className={styles.latestRecordValue}>{readings.join(' · ')}</Text>
          <Text className={styles.metricDate}>
            {formatGrowthDate(item.recordedAt, true)}
          </Text>
        </View>
        <Glyph name="chevron" size="sm" />
      </View>
    </GlassSurface>
  );
}

function MilestonePreview({
  item,
  count,
  onClick,
}: {
  item?: MilestonePublic;
  count: number;
  onClick: () => void;
}) {
  return (
    <GlassSurface level="tinted" tone="lavender" radius="hero" interactive>
      <View
        className={styles.milestonePreviewCard}
        role="button"
        aria-label="查看成长里程碑"
        onClick={onClick}
      >
        <View className={styles.previewConstellation} aria-hidden>
          <View className={styles.previewOrbit} />
          <View className={styles.previewStarMain}>
            <Glyph name="sparkle" size="lg" />
          </View>
          <View className={styles.previewStarSmall}>
            <Glyph name="sparkle" size="sm" />
          </View>
        </View>
        <View className={styles.previewCopy}>
          <View className={styles.previewTopline}>
            <Text className={styles.previewKicker}>成长里程碑</Text>
            <Text className={styles.previewCount}>
              {count > 0 ? `${count} 颗星` : '等待第一颗星'}
            </Text>
          </View>
          <Text className={styles.previewTitle}>
            {item?.title ?? '收藏第一个「第一次」'}
          </Text>
          <Text className={styles.previewCaption}>
            {item
              ? `${formatGrowthDate(item.happenedAt)} · 点开重看那一天`
              : '翻身、坐稳、开口，每一个瞬间都值得留下。'}
          </Text>
        </View>
        <View className={styles.previewChevron} aria-hidden>
          <Glyph name="chevron" size="sm" />
        </View>
      </View>
    </GlassSurface>
  );
}

function MonthlyStoryCard({
  babyName,
  onClick,
}: {
  babyName: string;
  onClick: () => void;
}) {
  return (
    <GlassSurface level="tinted" tone="apricot" radius="hero" interactive>
      <View
        className={styles.monthEntry}
        role="button"
        aria-label={`查看这个月的${babyName}`}
        onClick={onClick}
      >
        <View className={styles.monthEntryArt} aria-hidden>
          <View className={styles.monthEntrySun} />
          <View className={styles.monthEntrySprout}>
            <Glyph name="growth" size="lg" />
          </View>
        </View>
        <View className={styles.monthEntryCopy}>
          <Text className={styles.previewKicker}>这个月的{babyName}</Text>
          <Text className={styles.monthEntryTitle}>一页正在长大的故事</Text>
          <Text className={styles.previewCaption}>
            真实测量与第一次，会在这里慢慢连成回忆。
          </Text>
        </View>
        <View className={styles.previewChevron} aria-hidden>
          <Glyph name="chevron" size="sm" />
        </View>
      </View>
    </GlassSurface>
  );
}

export interface GrowthHomeProps {
  babyName: string;
  data: GrowthListResponse;
  milestones: MilestonePublic[];
  metric: GrowthMetric;
  onMetricChange: (metric: GrowthMetric) => void;
  onRecord: () => void;
  onRecordDetail: (id: string) => void;
  onMilestones: () => void;
  onMonthlyStory: () => void;
}

export function GrowthHome({
  babyName,
  data,
  milestones,
  metric,
  onMetricChange,
  onRecord,
  onRecordDetail,
  onMilestones,
  onMonthlyStory,
}: GrowthHomeProps) {
  const definition = GROWTH_METRICS[metric];
  const latest = data.latest[metric];
  const recentMilestone = milestones[0];
  const recentRecord = data.items[0];

  return (
    <View className={styles.growthPageStack}>
      <SegmentedControl
        options={METRIC_OPTIONS}
        value={metric}
        onChange={onMetricChange}
        className={styles.metricTabs}
        ariaLabel="选择成长指标"
      />

      <GlassSurface
        level="tinted"
        tone={definition.tone}
        radius="heroLg"
        className={styles.metricFocus}
      >
        <View className={styles.metricFocusContent} data-metric={metric}>
          <View className={styles.metricFocusArt} aria-hidden>
            <View className={styles.metricFocusHalo} />
            <View className={styles.metricFocusSprout}>
              <Glyph name="growth" size="lg" />
            </View>
            <View className={styles.metricFocusSpark}>
              <Glyph name="sparkle" size="sm" />
            </View>
          </View>
          <Text className={styles.metricFocusLabel}>现在的{definition.shortLabel}</Text>
          <View className={styles.metricFocusReading}>
            <Text className={styles.metricFocusValue}>
              {latest ? formatGrowthValue(latest.value) : '—'}
            </Text>
            <Text className={styles.metricFocusUnit}>{definition.unit}</Text>
          </View>
          <Text className={styles.metricFocusDate}>
            {latest
              ? `${formatGrowthDate(latest.recordedAt, true)}记录`
              : '等第一次真实测量'}
          </Text>
          <View className={styles.metricRuler} aria-hidden>
            {[0, 1, 2, 3, 4, 5].map((tick) => (
              <View key={tick} className={styles.metricRulerTick} />
            ))}
          </View>
        </View>
      </GlassSurface>

      <GrowthTrendChart
        metric={metric}
        points={data.trends[metric]}
        onSelectRecord={(id) => (id ? onRecordDetail(id) : onRecord())}
      />

      <GlassSurface
        level="tinted"
        tone="sage"
        radius="quick"
        className={styles.trendNote}
      >
        <View className={styles.trendNoteIcon} aria-hidden>
          <Glyph name="growth" size="sm" />
        </View>
        <Text className={styles.trendNoteText}>{trendSentence(metric, data)}</Text>
      </GlassSurface>

      <PrimaryActionButton
        label="记录成长"
        tone="apricot"
        icon={<Glyph name="plus" size="sm" />}
        onClick={onRecord}
      />

      <View className={styles.collectionSection}>
        <View className={styles.collectionHeading}>
          <Text className={`text-section-title ${styles.collectionHeadingTitle}`}>
            长大的收藏
          </Text>
          <Text className={styles.collectionHeadingCaption}>
            不只数字，也收藏第一次
          </Text>
        </View>
        <MilestonePreview
          item={recentMilestone}
          count={milestones.length}
          onClick={onMilestones}
        />
        <MonthlyStoryCard babyName={babyName} onClick={onMonthlyStory} />
      </View>

      {recentRecord ? (
        <LatestRecordRow
          item={recentRecord}
          onClick={() => onRecordDetail(recentRecord.id)}
        />
      ) : null}
    </View>
  );
}
