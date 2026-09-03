import { Text, View } from '@tarojs/components';
import type { NotificationCategory, NotificationPublic } from '@runew/contracts';
import type { SemanticTone } from '@runew/domain-types';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './Notification.module.scss';

const CATEGORY_META: Record<
  NotificationCategory,
  { label: string; glyph: GlyphName; tone: SemanticTone }
> = {
  HEALTH: { label: '健康提醒', glyph: 'heart', tone: 'sage' },
  FAMILY_TASKS: { label: '家庭协作', glyph: 'family', tone: 'sky' },
  REWARDS: { label: '宝石奖励', glyph: 'gem', tone: 'apricot' },
  BACKUP: { label: '备份', glyph: 'shield', tone: 'lavender' },
  CAPSULES: { label: '时光胶囊', glyph: 'sparkle', tone: 'blush' },
  ANNIVERSARIES: { label: '纪念日', glyph: 'sparkle', tone: 'apricot' },
  SYSTEM: { label: '系统消息', glyph: 'bell', tone: 'sky' },
};

export function notificationTargetUrl(item: NotificationPublic): string | null {
  if (!item.targetType || !item.targetId) return null;
  if (item.targetType === 'HEALTH_EVENT') {
    return `/pages/health/index?view=detail&id=${encodeURIComponent(item.targetId)}`;
  }
  return null;
}

function notificationTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

export function NotificationCard({
  item,
  onClick,
}: {
  item: NotificationPublic;
  onClick: () => void;
}) {
  const meta = CATEGORY_META[item.category] ?? CATEGORY_META.SYSTEM;
  const unread = item.readAt == null;
  return (
    <GlassSurface
      level={unread ? 'tinted' : 'card'}
      tone={unread ? meta.tone : undefined}
      radius="card"
      interactive
      className={classNames(styles.card, unread ? styles.cardUnread : undefined)}
    >
      <View
        className={styles.cardHit}
        role="button"
        aria-label={`${item.title}${unread ? '，未读' : ''}`}
        onClick={onClick}
      >
        <View
          className={classNames(styles.icon, styles[`tone-${meta.tone}`])}
          aria-hidden
        >
          <Glyph name={meta.glyph} size="md" />
        </View>
        <View className={styles.copy}>
          <View className={styles.topline}>
            <Text className={styles.category}>{meta.label}</Text>
            {unread ? <View className={styles.unreadDot} aria-label="未读" /> : null}
          </View>
          <Text className={styles.title}>{item.title}</Text>
          <Text className={styles.body}>{item.body}</Text>
          <Text className={styles.time}>{notificationTime(item.createdAt)}</Text>
        </View>
        <View className={styles.chevron} aria-hidden>
          <Glyph name="chevron" size="sm" />
        </View>
      </View>
    </GlassSurface>
  );
}

export function NotificationCenterView({
  items,
  unreadCount,
  onRead,
  onOpen,
}: {
  items: NotificationPublic[];
  unreadCount: number;
  onRead: (id: string) => void;
  onOpen: (item: NotificationPublic) => void;
}) {
  return (
    <View className={styles.stack}>
      <View className={styles.summary}>
        <View className={styles.summaryArt} aria-hidden>
          <Glyph name="bell" size="lg" />
          <View className={styles.summarySpark}>
            <Glyph name="sparkle" size="sm" />
          </View>
        </View>
        <View className={styles.summaryCopy}>
          <Text className={styles.summaryTitle}>
            {unreadCount > 0 ? `${unreadCount} 条新消息` : '今天的消息都看过啦'}
          </Text>
          <Text className={styles.summaryCaption}>
            重要的事会来找你，安静的时间也会被好好尊重。
          </Text>
        </View>
      </View>
      {items.length === 0 ? (
        <View className={styles.empty} role="status">
          <View className={styles.emptyMark} aria-hidden>
            <Glyph name="sparkle" size="lg" />
          </View>
          <Text className={styles.emptyTitle}>这里很安静</Text>
          <Text className={styles.emptyCaption}>
            有健康提醒或家庭消息时，它们会轻轻出现在这里。
          </Text>
        </View>
      ) : (
        <View className={styles.list}>
          {items.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              onClick={() => {
                if (item.readAt == null) onRead(item.id);
                onOpen(item);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
