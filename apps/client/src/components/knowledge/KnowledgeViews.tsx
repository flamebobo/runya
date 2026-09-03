import { Input as TaroInput, Text, View } from '@tarojs/components';
import { useState } from 'react';
import type { KnowledgePublic, KnowledgeRecommendation } from '@runew/contracts';
import type { SemanticTone } from '@runew/domain-types';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { FilterChip } from '@/components/forms';
import { SyncBadge } from '@/components/sync/SyncBar';
import styles from './Knowledge.module.scss';

// PRD 10.3 分类 taxonomy。RECOMMEND 只是首页推荐流入口，不是内容分类。
export const KNOWLEDGE_CATEGORIES: Array<{
  value: string;
  label: string;
  tone: SemanticTone;
  glyph: GlyphName;
}> = [
  { value: 'RECOMMEND', label: '推荐', tone: 'apricot', glyph: 'sparkle' },
  { value: 'FOOD', label: '辅食', tone: 'apricot', glyph: 'bowl' },
  { value: 'SLEEP', label: '睡眠', tone: 'sky', glyph: 'moon' },
  { value: 'TEETHING', label: '出牙', tone: 'blush', glyph: 'smile' },
  { value: 'MOTOR', label: '发育', tone: 'sage', glyph: 'growth' },
  { value: 'LANGUAGE', label: '语言', tone: 'lavender', glyph: 'quote' },
  { value: 'COGNITION', label: '认知', tone: 'sky', glyph: 'grid' },
  { value: 'PARENTING', label: '亲子', tone: 'blush', glyph: 'family' },
  { value: 'SAFETY', label: '安全', tone: 'apricot', glyph: 'heart' },
];

export const CATEGORY_META = new Map(KNOWLEDGE_CATEGORIES.map((item) => [item.value, item]));

export function categoryLabel(value: string): string {
  return CATEGORY_META.get(value)?.label ?? '知识';
}

export function formatAgeWindow(
  minAgeDays: number | null,
  maxAgeDays: number | null,
): string {
  if (minAgeDays == null && maxAgeDays == null) return '各阶段通用';
  const toMonths = (days: number) => Math.round(days / 30.4);
  if (minAgeDays != null && maxAgeDays != null) {
    return `${toMonths(minAgeDays)}–${toMonths(maxAgeDays)} 个月`;
  }
  if (minAgeDays != null) return `${toMonths(minAgeDays)} 个月起`;
  return `${toMonths(maxAgeDays!)} 个月以内`;
}

export function formatReviewDate(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function categoryTone(value: string): SemanticTone {
  return CATEGORY_META.get(value)?.tone ?? 'apricot';
}

export function KnowledgeCard({
  item,
  reason,
  contentUpdated,
  saved,
  readLater,
  justLearned = false,
  onClick,
  onSave,
  onLater,
  onLearned,
  onDismiss,
}: {
  item: KnowledgePublic | KnowledgeRecommendation;
  reason?: string;
  contentUpdated?: boolean;
  saved?: boolean;
  readLater?: boolean;
  // 04.07 学到了 Inline Transition：✓ 短暂展示后卡片轻折叠并移出推荐流。
  justLearned?: boolean;
  onClick: () => void;
  onSave?: () => void;
  onLater?: () => void;
  onLearned?: () => void;
  onDismiss?: () => void;
}) {
  const tone = categoryTone(item.category);
  const glyph = CATEGORY_META.get(item.category)?.glyph ?? 'book';
  return (
    <GlassSurface
      level="card"
      radius="card"
      interactive
      className={justLearned ? `${styles.card} ${styles.cardLearnedOut}` : styles.card}
    >
      <View
        className={styles.cardHit}
        role="button"
        aria-label={`阅读${item.title}`}
        onClick={onClick}
      >
        <View className={styles.cardTop}>
          <View className={styles[`chip-${tone}`]}>
            <Glyph name={glyph} size="sm" />
          </View>
          <Text className={styles.cardCategory}>{categoryLabel(item.category)}</Text>
          <View className={styles.cardMetaSpacer} />
          <Text className={styles.cardAge}>{formatAgeWindow(item.minAgeDays, item.maxAgeDays)}</Text>
        </View>
        <Text className={styles.cardTitle}>{item.title}</Text>
        <Text className={styles.cardSummary}>{item.summary}</Text>
        {reason ? (
          <View className={styles.reasonRow}>
            <Glyph name="sparkle" size="sm" className={styles.reasonGlyph} />
            <Text className={styles.reasonText}>{reason}</Text>
          </View>
        ) : null}
        {contentUpdated ? (
          <View className={styles.updatedRow}>
            <Glyph name="bell" size="sm" className={styles.updatedGlyph} />
            <Text className={styles.updatedText}>内容有更新，点击看看新版本</Text>
          </View>
        ) : null}
        {justLearned ? (
          <View className={styles.learnedFlash}>
            <Glyph name="smile" size="sm" className={styles.learnedFlashGlyph} />
            <Text className={styles.learnedFlashText}>已记下，下一篇继续</Text>
          </View>
        ) : null}
        <View className={styles.cardFooter}>
          <Text className={styles.cardSource}>来源：{item.sourceName}</Text>
          {saved || readLater ? (
            <View className={styles.cardFlags}>
              {saved ? (
                <Glyph name="heart" size="sm" className={styles.flagSaved} />
              ) : null}
              {readLater ? (
                <Glyph name="diary" size="sm" className={styles.flagLater} />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {onSave || onLater || onLearned || onDismiss ? (
        <View className={styles.cardActions}>
          {onLearned ? (
            <View
              className={styles.cardAction}
              role="button"
              aria-label="学到了"
              onClick={(event) => {
                event.stopPropagation();
                onLearned();
              }}
            >
              <Glyph name="smile" size="sm" className={styles.flagLearned} />
              <Text>学到了</Text>
            </View>
          ) : null}
          {onSave ? (
            <View
              className={styles.cardAction}
              role="button"
              aria-label={saved ? '取消收藏' : '收藏'}
              onClick={(event) => {
                event.stopPropagation();
                onSave();
              }}
            >
              <Glyph name="heart" size="sm" className={saved ? styles.flagSaved : undefined} />
              <Text>{saved ? '已收藏' : '收藏'}</Text>
            </View>
          ) : null}
          {onLater ? (
            <View
              className={styles.cardAction}
              role="button"
              aria-label={readLater ? '取消稍后看' : '稍后看'}
              onClick={(event) => {
                event.stopPropagation();
                onLater();
              }}
            >
              <Glyph name="diary" size="sm" className={readLater ? styles.flagLater : undefined} />
              <Text>{readLater ? '已加入' : '稍后看'}</Text>
            </View>
          ) : null}
          {onDismiss ? (
            <View
              className={styles.cardAction}
              role="button"
              aria-label="不感兴趣"
              onClick={(event) => {
                event.stopPropagation();
                onDismiss();
              }}
            >
              <Glyph name="close" size="sm" />
              <Text>不感兴趣</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </GlassSurface>
  );
}

export function KnowledgeQuickEntry({
  savedCount,
  laterCount,
  learnedCount,
  onOpenLibrary,
}: {
  savedCount: number;
  laterCount: number;
  learnedCount: number;
  onOpenLibrary: (state: 'saved' | 'later' | 'learned') => void;
}) {
  const entries: Array<{
    state: 'saved' | 'later' | 'learned';
    label: string;
    glyph: GlyphName;
    count: number;
    tone: SemanticTone;
  }> = [
    { state: 'saved', label: '收藏', glyph: 'heart', count: savedCount, tone: 'blush' },
    { state: 'later', label: '稍后看', glyph: 'diary', count: laterCount, tone: 'sky' },
    { state: 'learned', label: '已学', glyph: 'smile', count: learnedCount, tone: 'sage' },
  ];
  return (
    <View className={styles.quickRow}>
      {entries.map((entry) => (
        <GlassSurface
          key={entry.state}
          level="tinted"
          tone={entry.tone}
          radius="quick"
          interactive
          className={styles.quickCard}
        >
          <View
            className={styles.quickHit}
            role="button"
            aria-label={`打开${entry.label}`}
            onClick={() => onOpenLibrary(entry.state)}
          >
            <Glyph name={entry.glyph} size="md" className={styles.quickGlyph} />
            <Text className={styles.quickCount}>{entry.count}</Text>
            <Text className={styles.quickLabel}>{entry.label}</Text>
          </View>
        </GlassSurface>
      ))}
    </View>
  );
}

export function KnowledgeSearchBar({
  value,
  onChange,
  onFocusSearch,
  editable = false,
  placeholder = '搜搜辅食、睡眠、出牙…',
}: {
  value: string;
  onChange: (value: string) => void;
  onFocusSearch: () => void;
  // false：首页入口样式（点击跳搜索页）；true：搜索页内可输入。
  editable?: boolean;
  placeholder?: string;
}) {
  return (
    <GlassSurface level="control" radius="quick" className={styles.searchBar}>
      <View
        className={styles.searchHit}
        role={editable ? undefined : 'button'}
        aria-label={editable ? undefined : '搜索育儿知识'}
        onClick={editable ? undefined : onFocusSearch}
      >
        <Glyph name="search" size="sm" className={styles.searchGlyph} />
        {editable ? (
          <TaroInput
            className={styles.searchInput}
            value={value}
            placeholder={placeholder}
            placeholderStyle="color: var(--color-text-tertiary)"
            aria-label="输入搜索关键词"
            aria-role="searchbox"
            onInput={(event) => onChange(event.detail.value)}
          />
        ) : (
          <Text className={value ? styles.searchText : styles.searchPlaceholder}>
            {value || placeholder}
          </Text>
        )}
        {value ? (
          <View
            className={styles.searchClear}
            role="button"
            aria-label="清空搜索"
            onClick={(event) => {
              event.stopPropagation();
              onChange('');
            }}
          >
            <Glyph name="close" size="sm" />
          </View>
        ) : null}
      </View>
    </GlassSurface>
  );
}

export function CategoryChips({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View className={styles.chipRow}>
      {KNOWLEDGE_CATEGORIES.map((category) => (
        <FilterChip
          key={category.value}
          label={category.label}
          selected={active === category.value}
          onClick={() => onSelect(category.value)}
        />
      ))}
    </View>
  );
}

export function useKnowledgeView(initialView = 'home') {
  const [view, setView] = useState(initialView);
  return { view, setView };
}

export function SyncStateBadge({ state }: { state?: 'pending' | 'syncing' | 'synced' }) {
  if (!state) return null;
  return <SyncBadge state={state} />;
}
