import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useState } from 'react';
import {
  AppDrawer,
  AppTopBar,
  DEFAULT_DRAWER_ITEMS,
  BottomNav,
  EmptyState,
  ErrorState,
  PageShell,
  Skeleton,
} from '@/components';
import {
  KnowledgeCard,
  KnowledgeQuickEntry,
  KnowledgeSearchBar,
  KnowledgeDetailView,
  KnowledgeLibraryView,
  KnowledgeSearchView,
  CategoryChips,
  LIBRARY_COPY,
  categoryLabel,
  formatAgeWindow,
  libraryStateFromParam,
} from '@/components/knowledge/KnowledgeViews';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
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
  const [libraryState, setLibraryState] = useState(libraryStateFromParam(router.params.state));
  const [activeCategory, setActiveCategory] = useState(router.params.category ?? 'RECOMMEND');
  const [searchDraft, setSearchDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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
          onOpenLibrary={(state) => navigate('library', { state })}
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
    return (
      <KnowledgeSearchView
        draft={searchDraft}
        query={searchQuery}
        loading={searchResult.isLoading}
        items={searchResult.data?.items}
        onDraftChange={setSearchDraft}
        onSearch={setSearchQuery}
        onOpen={(id) => navigate('detail', { id })}
      />
    );
  }

  function renderLibrary() {
    return (
      <KnowledgeLibraryView
        state={libraryState}
        items={library.data?.items ?? []}
        loading={library.isLoading}
        error={library.isError}
        onStateChange={setLibraryState}
        onRetry={() => void library.refetch()}
        onOpen={(id) => navigate('detail', { id })}
      />
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
    const learnedThisVersion =
      detailState.data?.learnedVersion != null &&
      detailState.data.learnedVersion >= article.contentVersion;
    return (
      <KnowledgeDetailView
        article={article}
        saved={detailSaved}
        readLater={detailState.data?.readLater ?? false}
        learnedThisVersion={learnedThisVersion}
        contentUpdated={detailState.data?.contentUpdated ?? false}
        pending={stateActions.pending}
        onLearned={() => {
          void stateActions.markLearned(article).then(() => showToast('已记下，这一版学到了'));
        }}
        onToggleSaved={() => {
          const next = !detailSaved;
          markSavedLocally(article.id, next);
          void stateActions
            .toggleSaved(article, next)
            .then(() => showToast(next ? '已放进收藏' : '已取消收藏'))
            .catch(() => markSavedLocally(article.id, !next));
        }}
        onToggleLater={() => {
          const next = !(detailState.data?.readLater ?? false);
          void stateActions
            .toggleLater(article, next)
            .then(() => showToast(next ? '已加入稍后看' : '已取消稍后看'));
        }}
        onDismiss={() => {
          void stateActions.dismiss(article).then(() => {
            showToast('好的，会减少这类推荐');
            returnToPrevious();
          });
        }}
        onFeedback={() => {
          void feedback
            .mutateAsync({ knowledgeId: article.id })
            .then(() => showToast('已收到，编辑部会看看这篇'))
            .catch(() => showToast('暂时没送出去，稍后再试试'));
        }}
      />
    );
  }

  function renderView() {
    if (view === 'home') return renderHome();
    if (view === 'category') return renderCategory();
    if (view === 'search') return renderSearch();
    if (view === 'library') return renderLibrary();
    return renderDetail();
  }

  const detailCopy = detail.data
    ? {
        title: categoryLabel(detail.data.category),
        subtitle: `${formatAgeWindow(detail.data.minAgeDays, detail.data.maxAgeDays)} · 慢慢读`,
      }
    : { title: '育儿知识', subtitle: '慢慢读，不着急' };

  const VIEW_COPY: Record<
    Exclude<KnowledgeView, 'home'>,
    { title: string; subtitle: string }
  > = {
    detail: detailCopy,
    search: { title: '搜索知识', subtitle: '此刻好奇的，都可以搜搜看' },
    library: {
      title: LIBRARY_COPY[libraryState].title,
      subtitle: LIBRARY_COPY[libraryState].subtitle,
    },
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
              } else if (item.id === 'baby') {
                setDrawerOpen(false);
                void Taro.navigateTo({ url: '/pages/baby/index' });
              } else {
                setDrawerOpen(false);
                showToast(`${item.title}正在布置，先看看知识`);
              }
            },
          }))}
          onClose={() => setDrawerOpen(false)}
          onSearchClick={() => {
            setDrawerOpen(false);
            void Taro.navigateTo({ url: '/pages/search/index' });
          }}
          onNotificationClick={() => showToast('通知正在布置')}
          onAdminClick={() => {
            setDrawerOpen(false);
            void Taro.navigateTo({ url: '/pages/admin/index' });
          }}
        />
      ) : null}
    </PageShell>
  );
}
