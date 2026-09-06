import { View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import type { GrowthMetric } from '@runew/contracts';
import { useState } from 'react';
import {
  AppDrawer,
  AppTopBar,
  DEFAULT_DRAWER_ITEMS,
  BottomNav,
  ErrorState,
  PageShell,
  Skeleton,
} from '@/components';
import { GrowthHome } from '@/components/growth/GrowthHome';
import { GrowthRecordEditor } from '@/components/growth/GrowthRecordEditor';
import {
  MilestoneDetailView,
  MilestoneEditor,
  MilestoneListView,
  MonthlyStoryView,
} from '@/components/growth/MilestoneViews';
import { currentMonthKey } from '@/components/growth/constants';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import {
  useGrowthActions,
  useGrowthDetailQuery,
  useGrowthQuery,
  useMilestoneActions,
  useMilestoneDetailQuery,
  useMilestonesQuery,
  useMonthlyStoryQuery,
} from '@/hooks/useGrowth';
import { useFamilyRuntimeStore, useUiOverlayStore } from '@/stores/runtime';
import { formatBabyAgeLabel } from '@/utils/babyAge';
import { rootTabUrl } from '@/utils/rootNavigation';
import styles from './index.module.scss';

type GrowthView =
  | 'home'
  | 'record'
  | 'detail'
  | 'milestones'
  | 'milestone-new'
  | 'milestone-detail'
  | 'milestone-edit'
  | 'story';

const VIEW_TITLES: Record<
  Exclude<GrowthView, 'home'>,
  { title: string; subtitle: string }
> = {
  record: { title: '记录成长', subtitle: '知道哪一项，就先留下哪一项' },
  detail: { title: '成长记录详情', subtitle: '可以修改，也可以放进最近删除' },
  milestones: { title: '成长里程碑', subtitle: '把只发生一次的瞬间认真收藏' },
  'milestone-new': { title: '新增里程碑', subtitle: '把这个第一次好好记下来' },
  'milestone-detail': { title: '里程碑详情', subtitle: '回到那个只发生一次的瞬间' },
  'milestone-edit': { title: '编辑里程碑', subtitle: '补上想一直记得的细节' },
  story: { title: '月度成长故事', subtitle: '只用真实记录，写一页成长故事' },
};

function growthView(value: string | undefined): GrowthView {
  if (
    value === 'record' ||
    value === 'detail' ||
    value === 'milestones' ||
    value === 'milestone-new' ||
    value === 'milestone-detail' ||
    value === 'milestone-edit' ||
    value === 'story'
  ) {
    return value;
  }
  return 'home';
}

function growthMetric(value: string | undefined): GrowthMetric {
  return value === 'weight' || value === 'head' ? value : 'height';
}

function growthUrl(view: GrowthView, params: Record<string, string> = {}) {
  const search = new URLSearchParams({ view, ...params });
  return `/pages/growth/index?${search.toString()}`;
}

export default function GrowthPage() {
  return (
    <AppBootstrapGate>
      <GrowthBody />
    </AppBootstrapGate>
  );
}

function GrowthBody() {
  const router = useRouter();
  const view = growthView(router.params.view);
  const id = router.params.id ?? '';
  const month = router.params.month ?? currentMonthKey();
  const [metric, setMetric] = useState<GrowthMetric>(() =>
    growthMetric(router.params.metric),
  );
  const babyId = useFamilyRuntimeStore((state) => state.babyId);
  const bootstrap = useBootstrapQuery(false);
  const baby = bootstrap.data?.currentBaby;
  const babyName = baby?.nickname ?? baby?.name ?? '宝宝';
  const ageLabel = baby ? formatBabyAgeLabel(baby.birthday) : '成长中';
  const growth = useGrowthQuery(babyId);
  const milestones = useMilestonesQuery(babyId);
  const growthDetail = useGrowthDetailQuery(view === 'detail' ? id : null);
  const milestoneDetail = useMilestoneDetailQuery(
    view === 'milestone-detail' || view === 'milestone-edit' ? id : null,
  );
  const monthlyStory = useMonthlyStoryQuery(
    view === 'story' ? babyId : null,
    month,
    babyName,
  );
  const growthActions = useGrowthActions(babyId);
  const milestoneActions = useMilestoneActions(babyId);
  const { drawerOpen, setDrawerOpen, setBottomNavActive, showToast } =
    useUiOverlayStore();

  const gemAmount = bootstrap.data?.gemBalance ?? 0;

  function open(nextView: GrowthView, params?: Record<string, string>) {
    void Taro.navigateTo({ url: growthUrl(nextView, params) });
  }

  function returnToPrevious() {
    void Taro.navigateBack({ delta: 1 }).catch(() =>
      Taro.reLaunch({ url: '/pages/growth/index' }),
    );
  }

  function returnToMilestoneList() {
    void Taro.navigateBack({ delta: 2 }).catch(() =>
      Taro.reLaunch({ url: growthUrl('milestones') }),
    );
  }

  function finish(message: string) {
    showToast(message);
    returnToPrevious();
  }

  function openRootTab(tab: 'today' | 'records' | 'memories' | 'family') {
    setDrawerOpen(false);
    setBottomNavActive(tab);
    void Taro.reLaunch({ url: rootTabUrl(tab) });
  }

  function renderView() {
    if (view === 'home') {
      if (growth.isLoading || milestones.isLoading) return <Skeleton lines={8} />;
      if (growth.isError) {
        return (
          <ErrorState
            title="成长页还没展开"
            description="你的记录仍在本机，稍后再打开看看。"
            onRetry={() => void growth.refetch()}
          />
        );
      }
      return (
        <GrowthHome
          babyName={babyName}
          data={growth.data!}
          milestones={milestones.data?.items ?? []}
          metric={metric}
          onMetricChange={setMetric}
          onRecord={() => open('record')}
          onRecordDetail={(recordId) => open('detail', { id: recordId })}
          onMilestones={() => open('milestones')}
          onMonthlyStory={() => open('story', { month: currentMonthKey() })}
        />
      );
    }

    if (view === 'record') {
      return (
        <GrowthRecordEditor
          onSave={growthActions.save}
          onRemove={growthActions.remove}
          onRestore={growthActions.restore}
          onDone={finish}
          onReturn={returnToPrevious}
        />
      );
    }

    if (view === 'detail') {
      if (growthDetail.isLoading) return <Skeleton lines={7} />;
      if (growthDetail.isError || !growthDetail.data) {
        return (
          <ErrorState
            title="这笔记录还没打开"
            description={
              growthDetail.error instanceof Error
                ? growthDetail.error.message
                : undefined
            }
            onRetry={() => void growthDetail.refetch()}
          />
        );
      }
      return (
        <GrowthRecordEditor
          key={growthDetail.data.id}
          current={growthDetail.data}
          onSave={growthActions.save}
          onRemove={growthActions.remove}
          onRestore={growthActions.restore}
          onDone={finish}
          onReturn={returnToPrevious}
        />
      );
    }

    if (view === 'milestones') {
      if (milestones.isLoading) return <Skeleton lines={7} />;
      if (milestones.isError) {
        return <ErrorState onRetry={() => void milestones.refetch()} />;
      }
      return (
        <MilestoneListView
          babyName={babyName}
          items={milestones.data?.items ?? []}
          onCreate={() => open('milestone-new')}
          onSelect={(milestoneId) => open('milestone-detail', { id: milestoneId })}
        />
      );
    }

    if (view === 'milestone-new') {
      return (
        <MilestoneEditor
          onSave={milestoneActions.save}
          onRemove={milestoneActions.remove}
          onRestore={milestoneActions.restore}
          onDone={finish}
          onReturn={returnToPrevious}
        />
      );
    }

    if (view === 'milestone-detail' || view === 'milestone-edit') {
      if (milestoneDetail.isLoading) return <Skeleton lines={7} />;
      if (milestoneDetail.isError || !milestoneDetail.data) {
        return (
          <ErrorState
            title="这个第一次还没打开"
            description={
              milestoneDetail.error instanceof Error
                ? milestoneDetail.error.message
                : undefined
            }
            onRetry={() => void milestoneDetail.refetch()}
          />
        );
      }
      if (view === 'milestone-detail') {
        return (
          <MilestoneDetailView
            item={milestoneDetail.data}
            onEdit={() => open('milestone-edit', { id: milestoneDetail.data.id })}
          />
        );
      }
      return (
        <MilestoneEditor
          key={milestoneDetail.data.id}
          current={milestoneDetail.data}
          onSave={milestoneActions.save}
          onRemove={milestoneActions.remove}
          onRestore={milestoneActions.restore}
          onDone={finish}
          onReturn={returnToMilestoneList}
        />
      );
    }

    if (monthlyStory.isLoading) return <Skeleton lines={8} />;
    if (monthlyStory.isError || !monthlyStory.data) {
      return (
        <ErrorState
          title="这个月的故事还没翻开"
          description="联网后再来看看，原始成长记录不会受影响。"
          onRetry={() => void monthlyStory.refetch()}
        />
      );
    }
    return (
      <MonthlyStoryView
        story={monthlyStory.data}
        onSelectMilestone={(milestoneId) =>
          open('milestone-detail', { id: milestoneId })
        }
      />
    );
  }

  const copy = view === 'home' ? null : VIEW_TITLES[view];

  return (
    <PageShell bottomNav={view === 'home'}>
      {view === 'home' ? (
        <AppTopBar
          title={`${babyName}在长大`}
          subtitle={`${ageLabel} · 成长记录`}
          gemAmount={gemAmount}
          onMenuClick={() => setDrawerOpen(true)}
        />
      ) : (
        <AppTopBar
          variant="standard"
          title={copy!.title}
          subtitle={copy!.subtitle}
          onBackClick={returnToPrevious}
        />
      )}
      <View className={`page-content ${styles.page}`}>{renderView()}</View>
      {view === 'home' ? (
        <BottomNav
          active={null}
          onSelect={openRootTab}
          onAddClick={() => open('record')}
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
            active: item.id === 'growth',
            onClick: () => {
              if (item.id === 'growth') setDrawerOpen(false);
              else if (item.id === 'knowledge') {
                setDrawerOpen(false);
                void Taro.navigateTo({ url: '/pages/knowledge/index' });
              }
              else if (item.id === 'today') openRootTab('today');
              else if (item.id === 'records') openRootTab('records');
              else if (item.id === 'memories') openRootTab('memories');
              else if (item.id === 'family') openRootTab('family');
              else if (item.id === 'baby') {
                setDrawerOpen(false);
                void Taro.navigateTo({ url: '/pages/baby/index' });
              }
              else {
                setDrawerOpen(false);
                showToast(`${item.title}正在布置，先看看成长`);
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
