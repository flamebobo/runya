import { Input as TaroInput, Text, View } from '@tarojs/components';
import { useState } from 'react';
import type {
  KnowledgeDetail,
  KnowledgeLibraryResponse,
  KnowledgeLibraryState,
  KnowledgePublic,
  KnowledgeRecommendation,
} from '@runew/contracts';
import type { SemanticTone } from '@runew/domain-types';
import { PrimaryActionButton } from '@/components/buttons';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { FilterChip, SegmentedControl } from '@/components/forms';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { BottomSheet } from '@/components/overlay';
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

export const LIBRARY_COPY: Record<
  KnowledgeLibraryState,
  { title: string; subtitle: string; empty: string; tab: string }
> = {
  saved: {
    title: '我的收藏',
    subtitle: '值得反复读的，都在这里',
    empty: '还没有收藏的知识',
    tab: '收藏',
  },
  later: {
    title: '稍后看',
    subtitle: '留一个安静的时刻慢慢读',
    empty: '稍后看还空着',
    tab: '稍后看',
  },
  learned: {
    title: '已学',
    subtitle: '读过的每一版都被认真记下',
    empty: '学到的知识会出现在这里',
    tab: '已学',
  },
};

export const SEARCH_HINTS = ['辅食', '睡眠', '出牙', '发育'] as const;

export function libraryStateFromParam(value?: string): KnowledgeLibraryState {
  if (value === 'later' || value === 'learned' || value === 'saved') return value;
  return 'saved';
}

export function libraryItemToPublic(
  item: KnowledgeLibraryResponse['items'][number],
): KnowledgePublic {
  return {
    id: item.knowledgeId,
    title: item.title,
    summary: item.summary,
    category: item.category,
    minAgeDays: item.minAgeDays,
    maxAgeDays: item.maxAgeDays,
    sourceName: item.sourceName,
    sourceUrl: null,
    reviewedAt: 1,
    contentVersion: item.contentVersion,
    priority: 0,
    publishedAt: null,
    updatedAt: 1,
    version: item.version,
  };
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

function DetailActionTile({
  tone,
  glyph,
  label,
  caption,
  active = false,
  disabled = false,
  onClick,
}: {
  tone: SemanticTone;
  glyph: GlyphName;
  label: string;
  caption: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <GlassSurface
      level="tinted"
      tone={tone}
      radius="card"
      interactive={!disabled}
      className={active ? `${styles.actionTile} ${styles.actionTileActive}` : styles.actionTile}
    >
      <View
        className={styles.actionHit}
        role="button"
        aria-label={label}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onClick();
        }}
      >
        <View className={`${styles.actionGlyph} ${styles[`chip-${tone}`]}`}>
          <Glyph name={glyph} size="md" />
        </View>
        <Text className={styles.actionLabel}>{label}</Text>
        <Text className={styles.actionCaption}>{caption}</Text>
      </View>
    </GlassSurface>
  );
}

export function KnowledgeDetailView({
  article,
  saved,
  readLater,
  learnedThisVersion,
  contentUpdated,
  pending = false,
  onLearned,
  onToggleSaved,
  onToggleLater,
  onDismiss,
  onFeedback,
}: {
  article: KnowledgeDetail;
  saved: boolean;
  readLater: boolean;
  learnedThisVersion: boolean;
  contentUpdated: boolean;
  pending?: boolean;
  onLearned: () => void;
  onToggleSaved: () => void;
  onToggleLater: () => void;
  onDismiss: () => void;
  onFeedback: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const tone = categoryTone(article.category);
  const glyph = CATEGORY_META.get(article.category)?.glyph ?? 'book';
  const age = formatAgeWindow(article.minAgeDays, article.maxAgeDays);

  return (
    <View className={styles.stack}>
      {contentUpdated ? (
        <GlassSurface level="tinted" tone="sky" radius="quick" className={styles.updatedBanner}>
          <Glyph name="bell" size="sm" className={styles.updatedBannerGlyph} />
          <Text className={styles.updatedBannerText}>
            这篇内容更新到了第 {article.contentVersion} 版，重新读一遍吧
          </Text>
        </GlassSurface>
      ) : null}

      <GlassSurface level="hero" radius="hero" className={styles.detailHeroCard}>
        <View className={styles.detailKicker}>
          <View className={`${styles[`chip-${tone}`]} ${styles.detailGlyph}`}>
            <Glyph name={glyph} size="lg" />
          </View>
          <View className={styles.detailKickerCopy}>
            <Text className={styles.detailCategory}>{categoryLabel(article.category)}</Text>
            <Text className={styles.detailAge}>{age}</Text>
          </View>
        </View>
        <Text className={`text-section-title ${styles.detailTitle}`}>{article.title}</Text>
        <Text className={styles.detailSummary}>{article.summary}</Text>
      </GlassSurface>

      <GlassSurface level="card" radius="card">
        <View className={styles.detailBody}>
          {article.body
            .split('\n')
            .filter(Boolean)
            .map((paragraph, index) => (
              <Text key={index} className={styles.detailParagraph}>
                {paragraph}
              </Text>
            ))}
        </View>
      </GlassSurface>

      <View className={styles.metaRow}>
        <GlassSurface level="tinted" tone="apricot" radius="chip" className={styles.metaChip}>
          <Glyph name="book" size="sm" />
          <Text className={styles.metaText}>来源 · {article.sourceName}</Text>
        </GlassSurface>
        <GlassSurface level="tinted" tone="sky" radius="chip" className={styles.metaChip}>
          <Glyph name="baby" size="sm" />
          <Text className={styles.metaText}>{age}</Text>
        </GlassSurface>
        <GlassSurface level="tinted" tone="sage" radius="chip" className={styles.metaChip}>
          <Glyph name="sparkle" size="sm" />
          <Text className={styles.metaText}>第 {article.contentVersion} 版</Text>
        </GlassSurface>
        <GlassSurface level="tinted" tone="lavender" radius="chip" className={styles.metaChip}>
          <Glyph name="calendar" size="sm" />
          <Text className={styles.metaText}>{formatReviewDate(article.reviewedAt)}</Text>
        </GlassSurface>
      </View>

      <View className={styles.detailActions} role="toolbar" aria-label="知识操作">
        <DetailActionTile
          tone="sage"
          glyph="smile"
          label={learnedThisVersion ? '已学这一版' : '学到了'}
          caption={learnedThisVersion ? '这一版已经记下' : '记下这一版'}
          active={learnedThisVersion}
          disabled={learnedThisVersion || pending}
          onClick={onLearned}
        />
        <DetailActionTile
          tone="blush"
          glyph="heart"
          label={saved ? '已收藏' : '收藏'}
          caption={saved ? '已在小口袋里' : '放进小口袋'}
          active={saved}
          onClick={onToggleSaved}
        />
        <DetailActionTile
          tone="sky"
          glyph="diary"
          label={readLater ? '已加入' : '稍后看'}
          caption={readLater ? '等你空下来' : '等会儿再读'}
          active={readLater}
          onClick={onToggleLater}
        />
        <DetailActionTile
          tone="lavender"
          glyph="grid"
          label="更多"
          caption="反馈与偏好"
          onClick={() => setMoreOpen(true)}
        />
      </View>

      <BottomSheet open={moreOpen} title="还可以这样" onClose={() => setMoreOpen(false)}>
        <View
          className={styles.moreRow}
          role="button"
          aria-label="标记为已学"
          onClick={() => {
            setMoreOpen(false);
            onLearned();
          }}
        >
          <Glyph name="smile" size="md" className={styles.moreGlyph} />
          <Text className={styles.moreLabel}>学到了（当前版本）</Text>
        </View>
        <View
          className={styles.moreRow}
          role="button"
          aria-label={saved ? '取消收藏' : '收藏这篇'}
          onClick={() => {
            setMoreOpen(false);
            onToggleSaved();
          }}
        >
          <Glyph name="heart" size="md" className={styles.moreGlyph} />
          <Text className={styles.moreLabel}>{saved ? '取消收藏' : '收藏这篇'}</Text>
        </View>
        <View
          className={styles.moreRow}
          role="button"
          aria-label="减少此类推荐"
          onClick={() => {
            setMoreOpen(false);
            onDismiss();
          }}
        >
          <Glyph name="close" size="md" className={styles.moreGlyph} />
          <Text className={styles.moreLabel}>减少此类推荐</Text>
        </View>
        <View
          className={styles.moreRow}
          role="button"
          aria-label="反馈内容问题"
          onClick={() => {
            setMoreOpen(false);
            onFeedback();
          }}
        >
          <Glyph name="bell" size="md" className={styles.moreGlyph} />
          <Text className={styles.moreLabel}>内容有问题？告诉我们</Text>
        </View>
      </BottomSheet>
    </View>
  );
}

export function KnowledgeSearchView({
  draft,
  query,
  loading = false,
  items,
  onDraftChange,
  onSearch,
  onOpen,
}: {
  draft: string;
  query: string;
  loading?: boolean;
  items?: KnowledgePublic[];
  onDraftChange: (value: string) => void;
  onSearch: (value: string) => void;
  onOpen: (id: string) => void;
}) {
  const searching = query.trim().length > 0;
  const keyword = draft.trim();

  function runSearch(value = keyword) {
    const next = value.trim();
    if (!next) return;
    onDraftChange(next);
    onSearch(next);
  }

  return (
    <View className={styles.stack}>
      <KnowledgeSearchBar
        editable
        value={draft}
        onChange={onDraftChange}
        onFocusSearch={() => runSearch()}
      />
      <PrimaryActionButton
        label="搜一搜"
        icon={<Glyph name="search" size="sm" />}
        state={keyword ? 'default' : 'disabled'}
        onClick={() => runSearch()}
      />
      <View className={styles.hintRow}>
        {SEARCH_HINTS.map((hint) => (
          <FilterChip
            key={hint}
            label={hint}
            selected={query === hint}
            onClick={() => runSearch(hint)}
          />
        ))}
      </View>
      {searching && loading ? <Skeleton lines={6} /> : null}
      {searching && items ? (
        items.length === 0 ? (
          <EmptyState
            title="没有找到相关的知识"
            description="换个词试试，比如辅食、睡眠、出牙。"
          />
        ) : (
          <>
            <Text className={styles.searchIntro}>找到 {items.length} 篇相关内容</Text>
            {items.map((item) => (
              <KnowledgeCard key={item.id} item={item} onClick={() => onOpen(item.id)} />
            ))}
          </>
        )
      ) : null}
      {!searching ? (
        <EmptyState
          title="想了解点什么？"
          description="点上面的小词，或搜搜此刻好奇的事。"
        />
      ) : null}
    </View>
  );
}

export function KnowledgeLibraryView({
  state,
  items,
  loading = false,
  error = false,
  onStateChange,
  onRetry,
  onOpen,
}: {
  state: KnowledgeLibraryState;
  items: KnowledgeLibraryResponse['items'];
  loading?: boolean;
  error?: boolean;
  onStateChange: (state: KnowledgeLibraryState) => void;
  onRetry?: () => void;
  onOpen: (id: string) => void;
}) {
  const copy = LIBRARY_COPY[state];

  return (
    <View className={styles.stack}>
      <SegmentedControl
        ariaLabel="切换收藏、稍后看和已学"
        className={styles.libraryTabs}
        value={state}
        onChange={onStateChange}
        options={(Object.keys(LIBRARY_COPY) as KnowledgeLibraryState[]).map((key) => ({
          value: key,
          label: LIBRARY_COPY[key].tab,
        }))}
      />
      {error ? <ErrorState onRetry={onRetry} /> : null}
      {!error && loading ? <Skeleton lines={6} /> : null}
      {!error && !loading && items.length === 0 ? (
        <EmptyState title={copy.empty} description={copy.subtitle} />
      ) : null}
      {!error && !loading
        ? items.map((item) => (
            <KnowledgeCard
              key={item.knowledgeId}
              item={libraryItemToPublic(item)}
              contentUpdated={item.contentUpdated}
              saved={item.saved}
              readLater={item.readLater}
              onClick={() => onOpen(item.knowledgeId)}
            />
          ))
        : null}
    </View>
  );
}
