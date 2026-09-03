import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useState } from 'react';
import type { KnowledgePublic } from '@runew/contracts';
import {
  AppDrawer,
  AppTopBar,
  DEFAULT_DRAWER_ITEMS,
  BottomNav,
  BottomSheet,
  EmptyState,
  ErrorState,
  PageShell,
  Skeleton,
} from '@/components';
import { PrimaryActionButton } from '@/components/buttons';
import {
  CATEGORY_META,
  KnowledgeCard,
  KnowledgeQuickEntry,
  KnowledgeSearchBar,
  CategoryChips,
  categoryLabel,
  formatAgeWindow,
  formatReviewDate,
} from '@/components/knowledge/KnowledgeViews';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { Glyph } from '@/components/icons/Glyph';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import {
  useKnowledgeCountsQuery,
  useKnowledgeDetailQuery,
  useKnowledgeFeedback,
  useKnowledgeLibraryQuery,
  useKnowledgeListQuery,
  useKnowledgeRecommendationsQuery,
  useKnowledgeSearchQuery,
  useKnowledgeStateActions,
  useKnowledgeStateQuery,
} from '@/hooks/useKnowledge';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import { useFamilyRuntimeStore, useUiOverlayStore } from '@/stores/runtime';
import { formatBabyAgeLabel } from '@/utils/babyAge';
import { rootTabUrl } from '@/utils/rootNavigation';
import styles from './index.module.scss';

type KnowledgeView =
  | 'home'
  | 'detail'
  | 'search'
  | 'library'
  | 'category';

function knowledgeView(value: string | undefined): KnowledgeView {
  if (value === 'detail' || value === 'search' || value === 'library' || value === 'category') {
    return value;
  }
  return 'home';
}

const LIBRARY_TITLES: Record<'saved' | 'later' | 'learned', { title: string; subtitle: string; empty: string }> = {
  saved: { title: '我的收藏', subtitle: '值得反复读的，都在这里', empty: '还没有收藏的知识' },
  later: { title: '稍后看', subtitle: '留一个安静的时刻慢慢读', empty: '稍后看还空着' },
  learned: { title: '已学', subtitle: '读过的每一版都被认真记下', empty: '学到的知识会出现在这里' },
};

export default function KnowledgePage() {
  return (
    <AppBootstrapGate>
      <KnowledgeBody />
    </AppBootstrapGate>
  );
}

function KnowledgeBody() {
  const router = useRouter();
  const view = knowledgeView(router.params.view);
  const articleId = router.params.id ?? '';
  const [libraryState, setLibraryState] = useState<'saved' | 'later' | 'learned'>('saved');
  const [activeCategory, setActiveCategory] = useState(router.params.category ?? 'RECOMMEND');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  // 乐观收藏态：点击即刻反馈，真值随服务端失效结果回到详情页状态。
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // 04.07 学到了过渡：标记正在播放“轻折叠移出”动画的卡片。
  const [learnedOutId, setLearnedOutId] = useState<string | null>(null);

  function markSavedLocally(knowledgeId: string, saved: boolean) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (saved) next.add(knowledgeId);
      else next.delete(knowledgeId);
      return next;
    });
  }

  const babyId = useFamilyRuntimeStore((state) => state.babyId);
  const bootstrap = useBootstrapQuery(false);
  const baby = bootstrap.data?.currentBaby;
  const babyName = baby?.nickname ?? baby?.name ?? '宝宝';
  const ageLabel = baby ? formatBabyAgeLabel(baby.birthday) : '成长中';

  const recommendations = useKnowledgeRecommendationsQuery(babyId);
  const counts = useKnowledgeCountsQuery(babyId);
  const allKnowledge = useKnowledgeListQuery(view === 'category');
  const searchResult = useKnowledgeSearchQuery(view === 'search' ? searchQuery : '');
  const library = useKnowledgeLibraryQuery(
    view === 'library' ? babyId : null,
    libraryState,
  );
  const detail = useKnowledgeDetailQuery(view === 'detail' ? articleId : null);
  const detailState = useKnowledgeStateQuery(
    view === 'detail' ? babyId : null,
    view === 'detail' ? articleId : null,
  );
  const stateActions = useKnowledgeStateActions(babyId);
  const feedback = useKnowledgeFeedback();
  const { drawerOpen, setDrawerOpen, setBottomNavActive, showToast } = useUiOverlayStore();

  const gemAmount = bootstrap.data?.gemBalance ?? 0;
  // 详情页可从收藏/稍后看进入，此时 savedIds 尚未填充，须以服务端状态优先。
  const detailSaved = detailState.data?.saved ?? savedIds.has(articleId);

  function navigate(next: KnowledgeView, params: Record<string, string> = {}) {
    const search = new URLSearchParams({ view: next, ...params });
    void Taro.navigateTo({ url: `/pages/knowledge/index?${search.toString()}` });
  }

  function returnToPrevious() {
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({ url: '/pages/knowledge/index' }),
    );
  }

  function openRootTab(tab: 'today' | 'records' | 'memories' | 'family') {
    setDrawerOpen(false);
    setBottomNavActive(tab);
    void Taro.reLaunch({ url: rootTabUrl(tab) });
  }

  function renderHome() {
    if (recommendations.isLoading) return <Skeleton lines={9} />;
    if (recommendations.isError || !recommendations.data) {
      return (
        <ErrorState
          title="知识小屋还没开门"
          description="联网后再来看看，这里为你留了适合现在阶段的知识。"
          onRetry={() => void recommendations.refetch()}
        />
      );
    }
    const items = recommendations.data.items;
    return (
      <View className={styles.stack}>
        <KnowledgeSearchBar
          value={searchQuery}
          onChange={(value) => {
            setSearchQuery(value);
            setSearchDraft(value);
          }}
          onFocusSearch={() => navigate('search')}
        />
        <KnowledgeQuickEntry
          savedCount={counts.data?.saved ?? 0}
          laterCount={counts.data?.later ?? 0}
          learnedCount={counts.data?.learned ?? 0}
          onOpenLibrary={(state) => {
            setLibraryState(state);
            navigate('library', { state });
          }}
        />
        <View className={styles.sectionRow}>
          <Text className={styles.sectionTitle}>适合 {babyName} 现在的</Text>
          <Text className={styles.sectionCaption}>
            {items.length > 0
              ? `按 ${babyName} 的月龄和你的关注挑出来的`
              : '这一个阶段的都读过啦，去分类里逛逛别的'}
          </Text>
        </View>
        {items.length === 0 ? (
          <EmptyState
            title="这一阶段都读过了"
            description="去分类看看其他主题，或等下一次内容更新。"
            actionLabel="浏览全部分类"
            onAction={() => navigate('category', { category: 'FOOD' })}
          />
        ) : (
          items.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              reason={item.reason}
              justLearned={learnedOutId === item.id}
              onClick={() => navigate('detail', { id: item.id })}
              onSave={() =>
                void stateActions
                  .toggleSaved(item, true)
                  .then(() => showToast('已放进收藏'))
              }
              onLater={() =>
                void stateActions
                  .toggleLater(item, true)
                  .then(() => showToast('已加入稍后看'))
              }
              onLearned={() => {
                // 04.07 Inline Transition：先播 ✓ 与轻折叠，动画结束后由服务端
                // 数据（推荐流失效）自然移出并补位。动画失败不影响已保存状态。
                setLearnedOutId(item.id);
                void stateActions
                  .markLearned(item)
                  .then(() => showToast('已记下，这一版学到了'))
                  .finally(() => window.setTimeout(() => setLearnedOutId(null), 480));
              }}
              onDismiss={() =>
                void stateActions.dismiss(item).then(() => showToast('好的，少推荐这类'))
              }
            />
          ))
        )}
      </View>
    );
  }

  function renderCategory() {
    if (allKnowledge.isLoading) return <Skeleton lines={9} />;
    if (allKnowledge.isError || !allKnowledge.data) {
      return <ErrorState onRetry={() => void allKnowledge.refetch()} />;
    }
    const filtered =
      activeCategory === 'RECOMMEND'
        ? allKnowledge.data.items
        : allKnowledge.data.items.filter((item) => item.category === activeCategory);
    return (
      <View className={styles.stack}>
        <CategoryChips
          active={activeCategory}
          onSelect={(value) => {
            setActiveCategory(value);
            Taro.redirectTo({
              url: `/pages/knowledge/index?view=category&category=${value}`,
            });
          }}
        />
        {filtered.length === 0 ? (
          <EmptyState
            title="这个分类还没内容"
            description="编辑部正在整理，先看看别的分类吧。"
          />
        ) : (
          filtered.map((item) => (
            <KnowledgeCard
              key={item.id}
              item={item}
              onClick={() => navigate('detail', { id: item.id })}
              onSave={() =>
                void stateActions
                  .toggleSaved(item, true)
                  .then(() => showToast('已放进收藏'))
              }
              onLater={() =>
                void stateActions
                  .toggleLater(item, true)
                  .then(() => showToast('已加入稍后看'))
              }
            />
          ))
        )}
      </View>
    );
  }

  function renderSearch() {
    const searching = searchQuery.trim().length > 0;
    return (
      <View className={styles.stack}>
        <KnowledgeSearchBar
          editable
          value={searchDraft}
          onChange={(value) => setSearchDraft(value)}
          onFocusSearch={() => setSearchQuery(searchDraft.trim())}
        />
        <PrimaryActionButton
          label="搜一搜"
          state={searchDraft.trim() ? 'default' : 'disabled'}
          onClick={() => setSearchQuery(searchDraft.trim())}
        />
        {searching && searchResult.isLoading ? <Skeleton lines={6} /> : null}
        {searching && searchResult.data ? (
          searchResult.data.items.length === 0 ? (
            <EmptyState
              title="没有找到相关的知识"
              description="换个词试试，比如辅食、睡眠、出牙。"
            />
          ) : (
            <>
              <Text className={styles.searchIntro}>
                找到 {searchResult.data.items.length} 篇相关内容
              </Text>
              {searchResult.data.items.map((item) => (
                <KnowledgeCard
                  key={item.id}
                  item={item}
                  onClick={() => navigate('detail', { id: item.id })}
                />
              ))}
            </>
          )
        ) : null}
        {!searching ? (
          <EmptyState
            title="想了解点什么？"
            description="搜搜辅食、睡眠、出牙，或任何此刻好奇的事。"
          />
        ) : null}
      </View>
    );
  }

  function renderLibrary() {
    const copy = LIBRARY_TITLES[libraryState];
    if (library.isLoading) return <Skeleton lines={7} />;
    if (library.isError || !library.data) {
      return <ErrorState onRetry={() => void library.refetch()} />;
    }
    const items = library.data.items;
    return (
      <View className={styles.stack}>
        <View className={styles.segmentRow}>
          {(['saved', 'later', 'learned'] as const).map((state) => (
            <View
              key={state}
              className={
                libraryState === state ? styles.segmentActive : styles.segment
              }
              role="tab"
              aria-selected={libraryState === state}
              aria-label={LIBRARY_TITLES[state].title}
              onClick={() => {
                setLibraryState(state);
                Taro.redirectTo({
                  url: `/pages/knowledge/index?view=library&state=${state}`,
                });
              }}
            >
              <Text>{LIBRARY_TITLES[state].title}</Text>
            </View>
          ))}
        </View>
        {items.length === 0 ? (
          <EmptyState title={copy.empty} description={copy.subtitle} />
        ) : (
          items.map((item) => (
            <KnowledgeCard
              key={item.knowledgeId}
              item={
                {
                  id: item.knowledgeId,
                  title: item.title,
                  summary: item.summary,
                  category: item.category,
                  minAgeDays: null,
                  maxAgeDays: null,
                  sourceName: '',
                  sourceUrl: null,
                  reviewedAt: 0,
                  contentVersion: item.contentVersion,
                  priority: 0,
                  publishedAt: null,
                  updatedAt: 0,
                  version: item.version,
                } satisfies KnowledgePublic
              }
              contentUpdated={item.contentUpdated}
              saved={item.saved}
              readLater={item.readLater}
              onClick={() => navigate('detail', { id: item.knowledgeId })}
            />
          ))
        )}
      </View>
    );
  }

  function renderDetail() {
    if (detail.isLoading) return <Skeleton lines={10} />;
    if (detail.isError || !detail.data) {
      return (
        <ErrorState
          title="这篇知识还没打开"
          description={detail.error instanceof Error ? detail.error.message : undefined}
          onRetry={() => void detail.refetch()}
        />
      );
    }
    const article = detail.data;
    const pendingSaved = detailSaved;
    const pendingLater = detailState.data?.readLater ?? false;
    const learnedThisVersion =
      detailState.data?.learnedVersion != null &&
      detailState.data.learnedVersion >= article.contentVersion;
    const contentUpdated = detailState.data?.contentUpdated ?? false;
    const tone = CATEGORY_META.get(article.category)?.tone ?? 'apricot';
    const glyph = CATEGORY_META.get(article.category)?.glyph ?? 'book';
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
          <View className={styles.detailTop}>
            <View className={styles[`chip-${tone}`]}>
              <Glyph name={glyph} size="md" />
            </View>
            <Text className={styles.cardCategory}>{categoryLabel(article.category)}</Text>
            <View className={styles.cardMetaSpacer} />
            <Text className={styles.cardAge}>
              {formatAgeWindow(article.minAgeDays, article.maxAgeDays)}
            </Text>
          </View>
          <Text className={styles.detailTitle}>{article.title}</Text>
          <Text className={styles.detailSummary}>{article.summary}</Text>
        </GlassSurface>

        <GlassSurface level="card" radius="card">
          <View className={styles.detailBody}>
            {article.body.split('\n').filter(Boolean).map((paragraph, index) => (
              <Text key={index} className={styles.detailParagraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        </GlassSurface>

        <GlassSurface level="card" radius="card" className={styles.trustCard}>
          <View className={styles.trustRow}>
            <Glyph name="book" size="sm" className={styles.trustGlyph} />
            <Text className={styles.trustLabel}>来源</Text>
            <Text className={styles.trustValue}>{article.sourceName}</Text>
          </View>
          {article.sourceUrl ? (
            <View className={styles.trustRow}>
              <Glyph name="search" size="sm" className={styles.trustGlyph} />
              <Text className={styles.trustLabel}>原文链接</Text>
              <Text className={styles.trustValueLink}>{article.sourceUrl}</Text>
            </View>
          ) : null}
          <View className={styles.trustRow}>
            <Glyph name="smile" size="sm" className={styles.trustGlyph} />
            <Text className={styles.trustLabel}>适用月龄</Text>
            <Text className={styles.trustValue}>
              {formatAgeWindow(article.minAgeDays, article.maxAgeDays)}
            </Text>
          </View>
          <View className={styles.trustRow}>
            <Glyph name="bell" size="sm" className={styles.trustGlyph} />
            <Text className={styles.trustLabel}>审核时间</Text>
            <Text className={styles.trustValue}>{formatReviewDate(article.reviewedAt)}</Text>
          </View>
          <View className={styles.trustRow}>
            <Glyph name="grid" size="sm" className={styles.trustGlyph} />
            <Text className={styles.trustLabel}>内容版本</Text>
            <Text className={styles.trustValue}>
              第 <Text className={styles.trustVersion}>{article.contentVersion}</Text> 版
            </Text>
          </View>
        </GlassSurface>

        <View
          className={styles.detailActions}
          role="toolbar"
          aria-label="知识操作"
        >
          <GlassSurface level="tinted" tone="sage" radius="quick" className={styles.learnedActionCard}>
            <View
              className={
                learnedThisVersion
                  ? `${styles.detailAction} ${styles.detailActionLearned}`
                  : styles.detailAction
              }
              role="button"
              aria-label={learnedThisVersion ? '当前版本已学' : '标记为已学'}
              aria-disabled={learnedThisVersion || stateActions.pending}
              onClick={() => {
                if (learnedThisVersion || stateActions.pending) return;
                void stateActions
                  .markLearned(article)
                  .then(() => showToast('已记下，这一版学到了'));
              }}
            >
              <Glyph name="smile" size="sm" />
              <Text>{learnedThisVersion ? '已学这一版' : '学到了'}</Text>
            </View>
          </GlassSurface>
          <GlassSurface level="tinted" tone="blush" radius="quick" className={styles.learnedActionCard}>
            <View
              className={
                pendingSaved
                  ? `${styles.detailAction} ${styles.detailActionSaved}`
                  : styles.detailAction
              }
              role="button"
              aria-label={pendingSaved ? '取消收藏' : '收藏这篇'}
              onClick={() => {
                const next = !pendingSaved;
                markSavedLocally(article.id, next);
                void stateActions
                  .toggleSaved(article, next)
                  .then(() => showToast(next ? '已放进收藏' : '已取消收藏'))
                  .catch(() => markSavedLocally(article.id, !next));
              }}
            >
              <Glyph name="heart" size="sm" />
              <Text>{pendingSaved ? '已收藏' : '收藏'}</Text>
            </View>
          </GlassSurface>
          <GlassSurface level="tinted" tone="sky" radius="quick" className={styles.learnedActionCard}>
            <View
              className={
                pendingLater
                  ? `${styles.detailAction} ${styles.detailActionLater}`
                  : styles.detailAction
              }
              role="button"
              aria-label={pendingLater ? '取消稍后看' : '稍后看'}
              onClick={() => {
                const next = !pendingLater;
                void stateActions
                  .toggleLater(article, next)
                  .then(() => showToast(next ? '已加入稍后看' : '已取消稍后看'));
              }}
            >
              <Glyph name="diary" size="sm" />
              <Text>{pendingLater ? '已加入' : '稍后看'}</Text>
            </View>
          </GlassSurface>
          <View
            className={styles.detailAction}
            role="button"
            aria-label="更多操作"
            onClick={() => setMoreOpen(true)}
          >
            <Glyph name="grid" size="sm" />
            <Text>更多</Text>
          </View>
        </View>

        <BottomSheet open={moreOpen} title="更多" onClose={() => setMoreOpen(false)}>
          <View
            className={styles.moreRow}
            role="button"
            aria-label="标记为已学"
            onClick={() => {
              setMoreOpen(false);
              void stateActions
                .markLearned(article)
                .then(() => showToast('已记下，这一版学到了'));
            }}
          >
            <Glyph name="smile" size="md" className={styles.moreGlyph} />
            <Text className={styles.moreLabel}>学到了（当前版本）</Text>
          </View>
          <View
            className={styles.moreRow}
            role="button"
            aria-label={pendingSaved ? '取消收藏' : '收藏这篇'}
            onClick={() => {
              setMoreOpen(false);
              const next = !pendingSaved;
              markSavedLocally(article.id, next);
              void stateActions
                .toggleSaved(article, next)
                .then(() => showToast(next ? '已放进收藏' : '已取消收藏'));
            }}
          >
            <Glyph name="heart" size="md" className={styles.moreGlyph} />
            <Text className={styles.moreLabel}>
              {pendingSaved ? '取消收藏' : '收藏这篇'}
            </Text>
          </View>
          <View
            className={styles.moreRow}
            role="button"
            aria-label="减少此类推荐"
            onClick={() => {
              setMoreOpen(false);
              void stateActions.dismiss(article).then(() => {
                showToast('好的，会减少这类推荐');
                returnToPrevious();
              });
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
              void feedback
                .mutateAsync({ knowledgeId: article.id })
                .then(() => showToast('已收到，编辑部会看看这篇'))
                .catch(() => showToast('暂时没送出去，稍后再试试'));
            }}
          >
            <Glyph name="bell" size="md" className={styles.moreGlyph} />
            <Text className={styles.moreLabel}>内容有问题？告诉我们</Text>
          </View>
        </BottomSheet>
      </View>
    );
  }

  function renderView() {
    if (view === 'home') return renderHome();
    if (view === 'category') return renderCategory();
    if (view === 'search') return renderSearch();
    if (view === 'library') return renderLibrary();
    return renderDetail();
  }

  const VIEW_COPY: Record<
    Exclude<KnowledgeView, 'home'>,
    { title: string; subtitle: string }
  > = {
    detail: { title: '育儿知识', subtitle: '慢慢读，不着急' },
    search: { title: '搜索知识', subtitle: '此刻好奇的，都可以搜搜看' },
    library: { title: LIBRARY_TITLES[libraryState].title, subtitle: LIBRARY_TITLES[libraryState].subtitle },
    category: { title: '知识分类', subtitle: '按主题慢慢逛' },
  };

  return (
    <PageShell bottomNav={view === 'home'}>
      {view === 'home' ? (
        <AppTopBar
          title="育儿知识"
          subtitle={`${babyName} · ${ageLabel}`}
          gemAmount={gemAmount}
          onMenuClick={() => setDrawerOpen(true)}
        />
      ) : (
        <AppTopBar
          variant="standard"
          title={VIEW_COPY[view].title}
          subtitle={VIEW_COPY[view].subtitle}
          onBackClick={returnToPrevious}
        />
      )}
      <View className={`page-content ${styles.page}`}>{renderView()}</View>
      {view === 'home' ? (
        <BottomNav
          active={null}
          onSelect={openRootTab}
          onAddClick={() => Taro.switchTab({ url: '/pages/index/index' }).catch(() => undefined)}
        />
      ) : null}
      {view === 'home' ? (
        <AppDrawer
          open={drawerOpen}
          babyName={babyName}
          babyAgeLabel={ageLabel}
          gemAmount={gemAmount}
          items={DEFAULT_DRAWER_ITEMS.map((item) => ({
            ...item,
            active: item.id === 'knowledge',
            onClick: () => {
              if (item.id === 'knowledge') setDrawerOpen(false);
              else if (item.id === 'today') openRootTab('today');
              else if (item.id === 'records') openRootTab('records');
              else if (item.id === 'memories') openRootTab('memories');
              else if (item.id === 'family') openRootTab('family');
              else if (item.id === 'growth') {
                setDrawerOpen(false);
                void Taro.navigateTo({ url: '/pages/growth/index' });
              } else {
                setDrawerOpen(false);
                showToast(`${item.title}正在布置，先看看知识`);
              }
            },
          }))}
          onClose={() => setDrawerOpen(false)}
          onSearchClick={() => {
            setDrawerOpen(false);
            navigate('search');
          }}
          onNotificationClick={() => showToast('通知正在布置')}
          onAdminClick={() => showToast('管理模式正在布置')}
        />
      ) : null}
    </PageShell>
  );
}
