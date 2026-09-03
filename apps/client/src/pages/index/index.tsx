import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { stickerSmile, stickerStar } from '@/assets/figma';
import {
  AppDrawer,
  AppTopBar,
  BottomNav,
  BottomSheet,
  DEFAULT_DRAWER_ITEMS,
  EmptyState,
  GlassSurface,
  PageShell,
  SectionHeader,
} from '@/components';
import { AddMomentOverlay } from '@/components/overlay/AddMomentOverlay';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { BabyHeroCard } from '@/components/shell/BabyHeroCard';
import { ChoiceCard } from '@/components/shell/ChoiceCard';
import { QuickTile } from '@/components/shell/QuickTile';
import {
  FeedingRunningBanner,
  FinishedNotice,
  SleepRunningBanner,
} from '@/components/records/RunningBanner';
import { RecordsHome } from '@/components/records/RecordsHome';
import { TimelineList } from '@/components/records/TimelineList';
import { ErrorState, Skeleton } from '@/components/feedback';
import { ApiError } from '@/api/client';
import {
  finishBreast,
  finishSleep,
  pauseBreast,
  resumeBreast,
  switchBreast,
} from '@/api/records';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import { useGrowthQuery, useMilestonesQuery } from '@/hooks/useGrowth';
import { useInvalidateCare, useTimelineQuery } from '@/hooks/useRecords';
import { useUiOverlayStore } from '@/stores/runtime';
import { formatBabyAgeLabel, todayIsoDate } from '@/utils/babyAge';
import { localDayRange } from '@/utils/recordTime';
import styles from './index.module.scss';

const TAB_COPY: Record<
  'records' | 'memories' | 'family',
  { title: string; subtitle: string; emptyTitle: string; emptyDescription: string }
> = {
  records: {
    title: '日常记录',
    subtitle: '把今天的小事，慢慢收进时间线',
    emptyTitle: '今天的小事，会在这里排队',
    emptyDescription: '喂奶、睡眠和尿布来了，就会轻轻落进时间线。',
  },
  memories: {
    title: '宝宝回忆',
    subtitle: '照片、声音和第一次，都会被好好收藏',
    emptyTitle: '回忆馆的架子已经备好',
    emptyDescription: '照片和声音来了，就会被好好收藏，不会弄丢。',
  },
  family: {
    title: '我们的小家',
    subtitle: '一起陪伴，一起留下共同记忆',
    emptyTitle: '小家的灯还亮着',
    emptyDescription: '一起做的事会在这里轻轻排好，现在可以从今天开始逛逛。',
  },
};

function latestGrowthLabel(
  label: string,
  latest: { value: number } | null | undefined,
  unit: string,
) {
  if (!latest) return `${label}待记录`;
  const value = Number.isInteger(latest.value)
    ? latest.value
    : Number(latest.value.toFixed(2));
  return `${label}${value}${unit}`;
}

function homeGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) {
    return { title: '夜深了，妈妈', subtitle: '今天也要照顾好自己和润润' };
  }
  if (hour < 12) {
    return { title: '早上好，妈妈', subtitle: '今天也要照顾好自己和润润' };
  }
  if (hour < 18) {
    return { title: '下午好，妈妈', subtitle: '今天也要照顾好自己和润润' };
  }
  return { title: '晚上好，妈妈', subtitle: '今天也要照顾好自己和润润' };
}

export default function IndexPage() {
  return (
    <AppBootstrapGate>
      <TodayShell />
    </AppBootstrapGate>
  );
}

function TodayShell() {
  const bootstrap = useBootstrapQuery(false);
  const baby = bootstrap.data?.currentBaby;
  const gemAmount = bootstrap.data?.gemBalance ?? 0;
  const babyId = baby?.id ?? null;
  const invalidate = useInvalidateCare(babyId);
  const todayRange = localDayRange(todayIsoDate());
  const timeline = useTimelineQuery(babyId, { ...todayRange, kind: 'all' });
  const growth = useGrowthQuery(babyId);
  const milestones = useMilestonesQuery(babyId);
  const running = timeline.data?.running ?? bootstrap.data?.running;
  const [finished, setFinished] = useState<{
    title: string;
    durationSeconds: number;
  } | null>(null);
  const [feedingChoiceOpen, setFeedingChoiceOpen] = useState(false);
  const {
    drawerOpen,
    bottomNavActive,
    sheetOpen,
    setDrawerOpen,
    setBottomNavActive,
    setSheetOpen,
    showToast,
  } = useUiOverlayStore();
  const greeting = homeGreeting();
  const babyName = baby?.nickname ?? baby?.name ?? '宝宝';
  const babyAgeLabel = baby ? formatBabyAgeLabel(baby.birthday) : '成长中';

  const comingSoon = (label: string) => {
    showToast(`${label}正在布置，先把今天收好`);
  };

  function openCompose(type: string) {
    setSheetOpen(false);
    setFeedingChoiceOpen(false);
    void Taro.navigateTo({ url: `/pages/records/compose/index?type=${type}` });
  }

  async function runCare(
    action: () => Promise<{ durationSeconds?: number | null }>,
    notice?: string,
  ) {
    try {
      const result = await action();
      invalidate();
      if (notice && result.durationSeconds != null) {
        setFinished({ title: notice, durationSeconds: result.durationSeconds });
      }
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : '还没记下，请再试一次');
    }
  }

  function onSelectMoment(actionId: string) {
    if (actionId === 'feeding') {
      setSheetOpen(false);
      setFeedingChoiceOpen(true);
      return;
    }
    if (actionId === 'sleep') {
      openCompose('sleep');
      return;
    }
    if (actionId === 'diaper') {
      openCompose('diaper');
      return;
    }
    if (actionId === 'food') {
      openCompose('food');
      return;
    }
    if (actionId === 'growth') {
      setSheetOpen(false);
      void Taro.navigateTo({ url: '/pages/growth/index?view=record' });
      return;
    }
    setSheetOpen(false);
    comingSoon(
      { photo: '照片', audio: '声音', quote: '宝宝语录', mood: '心情', diary: '日记' }[
        actionId
      ] ?? '这一刻',
    );
  }

  return (
    <PageShell bottomNav={!sheetOpen}>
      {bottomNavActive === 'today' || bottomNavActive === null ? (
        <>
          <AppTopBar
            title={greeting.title}
            subtitle={greeting.subtitle}
            gemAmount={gemAmount}
            onMenuClick={() => setDrawerOpen(true)}
          />
          <View className={`page-content ${styles.today}`}>
            <BabyHeroCard
              name={babyName}
              ageLabel={babyAgeLabel}
              heightLabel={latestGrowthLabel('身高', growth.data?.latest.height, 'cm')}
              weightLabel={latestGrowthLabel('体重', growth.data?.latest.weight, 'kg')}
              headLabel={latestGrowthLabel('头围', growth.data?.latest.head, 'cm')}
              onClick={() => void Taro.navigateTo({ url: '/pages/growth/index' })}
            />
            {running?.sleep ? (
              <SleepRunningBanner
                sleep={running.sleep}
                onFinish={() =>
                  void runCare(() => finishSleep(running.sleep!.id), '这一觉结束了')
                }
              />
            ) : null}
            {running?.feeding ? (
              <FeedingRunningBanner
                feeding={running.feeding}
                onPause={() => void runCare(() => pauseBreast(running.feeding!.id))}
                onResume={() => void runCare(() => resumeBreast(running.feeding!.id))}
                onSwitch={() => void runCare(() => switchBreast(running.feeding!.id))}
                onFinish={() =>
                  void runCare(() => finishBreast(running.feeding!.id), '喂奶结束了')
                }
              />
            ) : null}
            {finished ? (
              <FinishedNotice
                title={finished.title}
                durationSeconds={finished.durationSeconds}
              />
            ) : null}
            <SectionHeader
              title="快捷入口"
              variant="guide"
              glyph="grid"
              tone="apricot"
            />
            <View className={styles.quickRow}>
              <QuickTile
                label="日常记录"
                glyph="list"
                tone="apricot"
                onClick={() => setBottomNavActive('records')}
              />
              <QuickTile
                label="成长"
                glyph="growth"
                tone="sage"
                onClick={() => void Taro.navigateTo({ url: '/pages/growth/index' })}
              />
              <QuickTile
                label="健康"
                glyph="heart"
                tone="sage"
                onClick={() => comingSoon('健康')}
              />
              <QuickTile
                label="宝宝回忆"
                glyph="photo"
                tone="sky"
                onClick={() => void Taro.navigateTo({ url: '/pages/memories/index' })}
              />
            </View>
            <SectionHeader
              title="今天记忆"
              variant="guide"
              glyph="sparkle"
              tone="blush"
            />
            <View className={styles.memoryRow}>
              <GlassSurface
                level="tinted"
                tone="apricot"
                radius="card"
                interactive
                className={styles.memoryCard}
              >
                <View
                  className={styles.memoryHit}
                  role="button"
                  aria-label={milestones.data?.items[0]?.title ?? '收藏一个成长里程碑'}
                  onClick={() => {
                    const recent = milestones.data?.items[0];
                    void Taro.navigateTo({
                      url: recent
                        ? `/pages/growth/index?view=milestone-detail&id=${recent.id}`
                        : '/pages/growth/index?view=milestone-new',
                    });
                  }}
                >
                  <Image
                    className={`${styles.sticker} ${styles.starSticker}`}
                    src={stickerStar}
                    mode="aspectFit"
                  />
                  <Text className={styles.memoryTitle}>
                    {milestones.data?.items[0]?.title ?? '收藏一个第一次'}
                  </Text>
                  <Text className={styles.memoryCaption}>
                    {milestones.data?.items[0]
                      ? '最近的成长里程碑'
                      : '只发生一次的瞬间'}
                  </Text>
                </View>
              </GlassSurface>
              <GlassSurface
                level="tinted"
                tone="blush"
                radius="card"
                interactive
                className={styles.memoryCard}
              >
                <View
                  className={styles.memoryHit}
                  role="button"
                  aria-label="心情打卡"
                  onClick={() => comingSoon('心情')}
                >
                  <Image
                    className={`${styles.sticker} ${styles.smileSticker}`}
                    src={stickerSmile}
                    mode="aspectFit"
                  />
                  <Text className={styles.memoryTitle}>心情打卡</Text>
                  <Text className={styles.memoryCaption}>今天也照顾妈妈</Text>
                </View>
              </GlassSurface>
            </View>
            <SectionHeader
              title="接下来事项"
              caption="健康提醒会在之后轻轻出现"
              variant="guide"
              glyph="bell"
              tone="sage"
            />
            <GlassSurface level="tinted" tone="sage" radius="card">
              <View className={styles.memoryHit}>
                <Text className={styles.memoryCaption}>
                  今天没有需要提前准备的事，先好好过这一天。
                </Text>
              </View>
            </GlassSurface>
            <SectionHeader
              title="今日时间线"
              actionLabel="全部"
              onAction={() => setBottomNavActive('records')}
              variant="guide"
              glyph="list"
              tone="sky"
            />
            {timeline.isLoading ? <Skeleton lines={4} /> : null}
            {timeline.isError ? (
              <ErrorState onRetry={() => void timeline.refetch()} />
            ) : null}
            {timeline.data && timeline.data.items.length === 0 ? (
              <EmptyState
                title="今天还很安静"
                description="点中间的 +，把喂奶、睡眠或尿布轻轻留下。"
              />
            ) : null}
            {timeline.data && timeline.data.items.length > 0 ? (
              <TimelineList
                items={timeline.data.items}
                onSelect={(item) =>
                  void Taro.navigateTo({
                    url: `/pages/records/detail/index?kind=${item.kind}&id=${item.id}`,
                  })
                }
              />
            ) : null}
          </View>
        </>
      ) : bottomNavActive === 'records' && babyId ? (
        <>
          <AppTopBar
            title={TAB_COPY.records.title}
            subtitle={TAB_COPY.records.subtitle}
            gemAmount={gemAmount}
            onMenuClick={() => setDrawerOpen(true)}
          />
          <View className="page-content">
            <RecordsHome
              babyId={babyId}
              onFinishSleep={() =>
                running?.sleep
                  ? void runCare(() => finishSleep(running.sleep!.id), '这一觉结束了')
                  : undefined
              }
              onPauseFeeding={() =>
                running?.feeding
                  ? void runCare(() => pauseBreast(running.feeding!.id))
                  : undefined
              }
              onResumeFeeding={() =>
                running?.feeding
                  ? void runCare(() => resumeBreast(running.feeding!.id))
                  : undefined
              }
              onSwitchFeeding={() =>
                running?.feeding
                  ? void runCare(() => switchBreast(running.feeding!.id))
                  : undefined
              }
              onFinishFeeding={() =>
                running?.feeding
                  ? void runCare(() => finishBreast(running.feeding!.id), '喂奶结束了')
                  : undefined
              }
            />
          </View>
        </>
      ) : (
        <>
          <AppTopBar
            title={TAB_COPY[bottomNavActive].title}
            subtitle={TAB_COPY[bottomNavActive].subtitle}
            gemAmount={gemAmount}
            onMenuClick={() => setDrawerOpen(true)}
          />
          <View className="page-content">
            <EmptyState
              title={TAB_COPY[bottomNavActive].emptyTitle}
              description={TAB_COPY[bottomNavActive].emptyDescription}
              actionLabel="回到今天"
              onAction={() => setBottomNavActive('today')}
            />
          </View>
        </>
      )}
      {!sheetOpen ? (
        <BottomNav
          active={bottomNavActive}
          onSelect={(key) => {
            if (key === 'memories') {
              void Taro.navigateTo({ url: '/pages/memories/index' });
            } else {
              setBottomNavActive(key);
            }
          }}
          onAddClick={() => setSheetOpen(true)}
        />
      ) : null}
      <AppDrawer
        open={drawerOpen}
        babyName={babyName}
        babyAgeLabel={babyAgeLabel}
        gemAmount={gemAmount}
        items={DEFAULT_DRAWER_ITEMS.map((item) => ({
          ...item,
          active:
            item.id === 'today'
              ? bottomNavActive === 'today' || bottomNavActive === null
              : item.id === bottomNavActive,
          onClick: () => {
            setDrawerOpen(false);
            if (item.id === 'today') setBottomNavActive('today');
            else if (item.id === 'records') setBottomNavActive('records');
            else if (item.id === 'memories') {
              void Taro.navigateTo({ url: '/pages/memories/index' });
            } else if (item.id === 'family') setBottomNavActive('family');
            else if (item.id === 'growth') {
              void Taro.navigateTo({ url: '/pages/growth/index' });
            } else if (item.id === 'knowledge') {
              void Taro.navigateTo({ url: '/pages/knowledge/index' });
            } else comingSoon(item.title);
          },
        }))}
        onClose={() => setDrawerOpen(false)}
        onSearchClick={() => comingSoon('搜索')}
        onNotificationClick={() => comingSoon('通知')}
        onAdminClick={() => comingSoon('管理模式')}
      />
      <AddMomentOverlay
        open={sheetOpen}
        gemAmount={gemAmount}
        onClose={() => setSheetOpen(false)}
        onSelect={onSelectMoment}
      />
      <BottomSheet
        open={feedingChoiceOpen}
        title="怎么记这次喂奶"
        onClose={() => setFeedingChoiceOpen(false)}
      >
        <View className={styles.memoryRow}>
          <ChoiceCard
            title="奶瓶"
            caption="记下毫升数"
            glyph="bottle"
            tone="apricot"
            onClick={() => openCompose('bottle')}
          />
          <ChoiceCard
            title="母乳"
            caption="开始计时"
            glyph="heart"
            tone="blush"
            onClick={() => openCompose('breast')}
          />
        </View>
      </BottomSheet>
    </PageShell>
  );
}
