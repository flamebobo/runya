import { Text, View } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import type { HealthEventPublic, HealthEventType } from '@runew/contracts';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './Health.module.scss';

// 事件类型元信息：文案来自 PRD 11.2，语气温暖不恐吓。
// 图标只从现有 Glyph 系统取（圆润 outline），不新画。
export const HEALTH_TYPE_META: Record<
  HealthEventType,
  { label: string; glyph: GlyphName; tone: SemanticTone }
> = {
  CHECKUP: { label: '体检', glyph: 'heart', tone: 'blush' },
  VACCINE: { label: '疫苗', glyph: 'shield', tone: 'sage' },
  VISIT: { label: '就诊', glyph: 'stethoscope', tone: 'sky' },
  DENTAL: { label: '牙科', glyph: 'tooth', tone: 'lavender' },
  MEDICATION: { label: '用药提醒', glyph: 'pill', tone: 'apricot' },
  OTHER: { label: '健康事项', glyph: 'bell', tone: 'apricot' },
};

const STATUS_LABEL: Record<
  HealthEventPublic['status'],
  { label: string; className: string | undefined }
> = {
  UPCOMING: { label: '待进行', className: styles.statusUpcoming },
  COMPLETED: { label: '已完成', className: styles.statusCompleted },
  EXPIRED: { label: '已过期', className: styles.statusExpired },
  CANCELED: { label: '已取消', className: styles.statusCanceled },
};

export function healthTypeLabel(type: string): string {
  return HEALTH_TYPE_META[type as HealthEventType]?.label ?? '健康事项';
}

export function formatEventDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatEventTime(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatReminderOffset(kind: string, customMinutes: number | null): string {
  if (kind === 'D7') return '提前 7 天';
  if (kind === 'D3') return '提前 3 天';
  if (kind === 'D1') return '提前 1 天';
  if (kind === 'SAME_DAY') return '当天提前 2 小时';
  if (kind === 'CUSTOM') {
    if (customMinutes == null) return '自定义';
    if (customMinutes % (24 * 60) === 0) return `提前 ${customMinutes / (24 * 60)} 天`;
    if (customMinutes >= 60) return `提前 ${Math.round(customMinutes / 60)} 小时`;
    return `提前 ${customMinutes} 分钟`;
  }
  return kind;
}

/** 05.01 日历带：7 天横滑，今天 + 有事项的日子有小圆点。 */
export function HealthCalendarStrip({
  days,
  activeIso,
  markedIso,
  onSelect,
}: {
  days: Array<{ iso: string; label: string; weekday: string }>;
  activeIso: string;
  markedIso: Set<string>;
  onSelect: (iso: string) => void;
}) {
  return (
    <View className={styles.calendarStrip} aria-label="健康日历">
      {days.map((day) => {
        const active = day.iso === activeIso;
        return (
          <View
            key={day.iso}
            className={classNames(
              styles.calendarDay,
              active ? styles.calendarDayActive : undefined,
            )}
            role="button"
            aria-label={`${day.weekday} ${day.label}`}
            aria-pressed={active}
            onClick={() => onSelect(day.iso)}
          >
            <Text className={styles.calendarWeekday}>{day.weekday}</Text>
            <Text
              className={classNames(
                styles.calendarDate,
                active ? styles.calendarDateActive : undefined,
              )}
            >
              {day.label}
            </Text>
            <View
              className={classNames(
                styles.calendarDot,
                markedIso.has(day.iso) ? styles.calendarDotVisible : undefined,
              )}
              aria-hidden
            />
          </View>
        );
      })}
    </View>
  );
}

/** 下一事项卡：放在日历下，一眼看到最近要准备什么。 */
export function HealthNextUpCard({
  event,
  onClick,
}: {
  event: HealthEventPublic | null;
  onClick: () => void;
}) {
  if (!event) {
    return (
      <GlassSurface level="tinted" tone="sage" radius="card">
        <View className={styles.nextUpEmpty}>
          <Glyph name="sparkle" size="md" />
          <Text className={styles.nextUpEmptyText}>
            最近没有安排好的事项，先好好过今天。
          </Text>
        </View>
      </GlassSurface>
    );
  }
  const meta = HEALTH_TYPE_META[event.eventType] ?? HEALTH_TYPE_META.OTHER;
  return (
    <GlassSurface level="hero" radius="hero" tone={meta.tone} className={styles.nextUp}>
      <View
        className={styles.nextUpHit}
        role="button"
        aria-label={`查看${event.title}`}
        onClick={onClick}
      >
        <View className={classNames(styles.nextUpIcon, styles[`chip-${meta.tone}`])}>
          <Glyph name={meta.glyph} size="lg" />
        </View>
        <View className={styles.nextUpBody}>
          <Text className={styles.nextUpCaption}>下一件事</Text>
          <Text className={`text-section-title ${styles.nextUpTitle}`}>{event.title}</Text>
          <Text className={styles.nextUpTime}>
            {formatEventDate(event.scheduledAt)} · {formatEventTime(event.scheduledAt)} ·{' '}
            {meta.label}
          </Text>
        </View>
        <View className={styles.nextUpChevron} aria-hidden>
          <Glyph name="chevron" size="sm" />
        </View>
      </View>
    </GlassSurface>
  );
}

/** 类型筛选 chips（全部 + 六类）。 */
export function HealthTypeChips({
  active,
  counts,
  onSelect,
}: {
  active: 'ALL' | HealthEventType;
  counts: Partial<Record<'ALL' | HealthEventType, number>>;
  onSelect: (value: 'ALL' | HealthEventType) => void;
}) {
  const chips: Array<{ value: 'ALL' | HealthEventType; label: string }> = [
    { value: 'ALL', label: '全部' },
    ...Object.entries(HEALTH_TYPE_META).map(([value, meta]) => ({
      value: value as HealthEventType,
      label: meta.label,
    })),
  ];
  return (
    <View className={styles.typeChips} role="tablist" aria-label="健康事项类型筛选">
      {chips.map((chip) => {
        const count = counts[chip.value] ?? 0;
        const selected = active === chip.value;
        return (
          <View
            key={chip.value}
            className={classNames(styles.typeChip, selected ? styles.typeChipSelected : undefined)}
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(chip.value)}
          >
            <Text>{chip.label}</Text>
            {count > 0 ? <Text className={styles.typeChipCount}>{count}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

/** 时间轴卡片：类型徽标 + 标题 + 时间 + 状态。 */
export function HealthEventCard({
  event,
  onClick,
  onLongPressDelete,
}: {
  event: HealthEventPublic;
  onClick: () => void;
  onLongPressDelete?: () => void;
}) {
  const meta = HEALTH_TYPE_META[event.eventType] ?? HEALTH_TYPE_META.OTHER;
  const status = STATUS_LABEL[event.status] ?? STATUS_LABEL.UPCOMING;
  const done = event.status === 'COMPLETED' || event.status === 'CANCELED';
  return (
    <GlassSurface level="card" radius="card" interactive className={styles.eventCard}>
      <View
        className={styles.eventHit}
        role="button"
        aria-label={`查看${event.title}`}
        onClick={onClick}
        onLongPress={onLongPressDelete}
      >
        <View className={classNames(styles.eventIcon, styles[`chip-${meta.tone}`])}>
          <Glyph name={meta.glyph} size="md" />
        </View>
        <View className={styles.eventBody}>
          <View className={styles.eventTopRow}>
            <Text className={styles.eventType}>{meta.label}</Text>
            <Text className={classNames(styles.eventStatus, status.className)}>
              {status.label}
            </Text>
          </View>
          <Text className={classNames(styles.eventTitle, done ? styles.eventTitleDone : undefined)}>
            {event.title}
          </Text>
          <Text className={styles.eventTime}>
            {formatEventDate(event.scheduledAt)} · {formatEventTime(event.scheduledAt)}
            {event.locationName ? ` · ${event.locationName}` : ''}
          </Text>
        </View>
        <View className={styles.eventChevron} aria-hidden>
          <Glyph name="chevron" size="sm" />
        </View>
      </View>
    </GlassSurface>
  );
}

/** 状态徽标（详情页复用）。 */
export function HealthStatusBadge({ status }: { status: HealthEventPublic['status'] }) {
  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.UPCOMING;
  return (
    <Text className={classNames(styles.eventStatus, meta.className)} aria-label={meta.label}>
      {meta.label}
    </Text>
  );
}
