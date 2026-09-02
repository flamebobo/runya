import { Image, Text, View } from '@tarojs/components';
import {
  dotApricot,
  dotBlush,
  dotLavender,
  dotSage,
  stickerSmile,
  stickerStar,
} from '@/assets/figma';
import {
  AppDrawer,
  AppTopBar,
  BottomNav,
  DEFAULT_DRAWER_ITEMS,
  EmptyState,
  GlassSurface,
  PageShell,
  SectionHeader,
} from '@/components';
import { AddMomentOverlay } from '@/components/overlay/AddMomentOverlay';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { BabyHeroCard } from '@/components/shell/BabyHeroCard';
import { QuickTile } from '@/components/shell/QuickTile';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import { useUiOverlayStore } from '@/stores/runtime';
import { formatBabyAgeLabel } from '@/utils/babyAge';
import styles from './index.module.scss';

const TIMELINE = [
  { time: '07:30', title: '喂奶 · 150ml', dot: dotApricot },
  { time: '10:12', title: '尿布 · 湿', dot: dotSage },
  { time: '12:16', title: '睡着了', dot: dotLavender },
  { time: '15:10', title: '辅食 · 香蕉泥', dot: dotBlush },
] as const;

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
              heightLabel="身高72.5cm ↑"
              weightLabel="体重8.6kg"
              headLabel="头围44.8cm"
              onClick={() => comingSoon('宝宝档案')}
            />
            <SectionHeader title="快捷入口" />
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
                onClick={() => comingSoon('成长')}
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
                onClick={() => setBottomNavActive('memories')}
              />
            </View>
            <SectionHeader title="今天记忆" />
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
                  aria-label="今天第一次坐稳啦"
                  onClick={() => comingSoon('成长小成就')}
                >
                  <Image className={styles.sticker} src={stickerStar} mode="aspectFit" />
                  <Text className={styles.memoryTitle}>今天第一次坐稳啦</Text>
                  <Text className={styles.memoryCaption}>解锁新的小成就</Text>
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
                  <Image className={styles.sticker} src={stickerSmile} mode="aspectFit" />
                  <Text className={styles.memoryTitle}>心情打卡</Text>
                  <Text className={styles.memoryCaption}>今天也照顾妈妈</Text>
                </View>
              </GlassSurface>
            </View>
            <SectionHeader
              title="今日时间线"
              actionLabel="全部"
              onAction={() => setBottomNavActive('records')}
            />
            <View className={styles.timeline}>
              {TIMELINE.map((item) => (
                <View
                  key={item.time}
                  className={styles.timelineRow}
                  role="button"
                  aria-label={`${item.time} ${item.title}`}
                  onClick={() => comingSoon(item.title)}
                >
                  <Text className={styles.time}>{item.time}</Text>
                  <Image className={styles.dot} src={item.dot} mode="aspectFit" />
                  <Text className={styles.event}>{item.title}</Text>
                </View>
              ))}
            </View>
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
          onSelect={setBottomNavActive}
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
            else if (item.id === 'memories') setBottomNavActive('memories');
            else if (item.id === 'family') setBottomNavActive('family');
            else comingSoon(item.title);
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
        onSelect={(label) => comingSoon(label)}
      />
    </PageShell>
  );
}
