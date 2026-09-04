import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useEffect, useMemo, useState } from 'react';
import type {
  DiaryPublic,
  MoodKind,
  MoodPublic,
} from '@runew/contracts';
import {
  AppDrawer,
  AppTopBar,
  BottomNav,
  DEFAULT_DRAWER_ITEMS,
  BottomSheet,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageShell,
  Skeleton,
} from '@/components';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { SectionHeader } from '@/components/foundation/SectionHeader';
import {
  PrimaryActionButton,
  SecondaryGlassButton,
} from '@/components/buttons';
import { GlassTextArea, SegmentedControl } from '@/components/forms';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import {
  useCreateDiary,
  useCreateMood,
  useDeleteDiary,
  useDiariesQuery,
  useDiaryQuery,
  useMomSummaryQuery,
  useMoodCalendarQuery,
  useMoodsQuery,
  useUpdateDiary,
} from '@/hooks/useMom';
import { useAutoDraft } from '@/hooks/useAutoDraft';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import { useUiOverlayStore } from '@/stores/runtime';
import { ApiError } from '@/api/client';
import { formatBabyAgeLabel } from '@/utils/babyAge';
import { rootTabUrl } from '@/utils/rootNavigation';
import styles from './index.module.scss';

// AGENTS §24：业务真相用设备时区名，展示时再转本地。
function deviceTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  } catch {
    return 'Asia/Shanghai';
  }
}

// ============================================================
// Figma 07 妈妈空间：home / mood-compose / mood-done / diary-compose
// / diary-list / diary-detail / visibility / mood-calendar / note
// 单页多视图，状态与弹层不新开 Route（AGENTS §5）。
// ============================================================

type MomView =
  | 'home'
  | 'mood-compose'
  | 'mood-done'
  | 'diary-compose'
  | 'diary-list'
  | 'diary-detail'
  | 'visibility'
  | 'mood-calendar'
  | 'note';

function momView(value: string | undefined): MomView {
  const allowed: MomView[] = [
    'home',
    'mood-compose',
    'mood-done',
    'diary-compose',
    'diary-list',
    'diary-detail',
    'visibility',
    'mood-calendar',
    'note',
  ];
  return allowed.includes(value as MomView) ? (value as MomView) : 'home';
}

// PRD 13.2：五种心情平等，全部是照顾妈妈的时刻，不打分不排序。
const MOOD_OPTIONS: Array<{
  value: MoodKind;
  label: string;
  glyph: GlyphName;
  tone: 'apricot' | 'sage' | 'sky' | 'lavender' | 'blush';
}> = [
  { value: 'GREAT', label: '特别开心', glyph: 'smile', tone: 'apricot' },
  { value: 'GOOD', label: '还不错', glyph: 'smile', tone: 'sage' },
  { value: 'OK', label: '普通', glyph: 'dash', tone: 'sky' },
  { value: 'TIRED', label: '有点累', glyph: 'moon', tone: 'lavender' },
  { value: 'NEED_HUG', label: '需要抱抱', glyph: 'heart', tone: 'blush' },
];

const MOOD_LABEL: Record<MoodKind, string> = {
  GREAT: '特别开心',
  GOOD: '还不错',
  OK: '普通',
  TIRED: '有点累',
  NEED_HUG: '需要抱抱',
};

function moodMeta(kind: string) {
  return MOOD_OPTIONS.find((option) => option.value === kind) ?? MOOD_OPTIONS[2]!;
}

function formatRecordDate(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function MomPage() {
  return (
    <AppBootstrapGate>
      <MomBody />
    </AppBootstrapGate>
  );
}

function MomBody() {
  const router = useRouter();
  const view = momView(router.params.view);
  const diaryId = router.params.id ?? '';

  function navigate(next: MomView, params: Record<string, string> = {}) {
    const search = new URLSearchParams({ view: next, ...params });
    void Taro.navigateTo({ url: `/pages/mom/index?${search.toString()}` });
  }

  function goHome() {
    void Taro.reLaunch({ url: '/pages/mom/index' });
  }

  function returnBack() {
    void Taro.navigateBack({ delta: 1 }).catch(goHome);
  }

  return (
    <PageShell bottomNav={view === 'home'}>
      <MomRouter view={view} diaryId={diaryId} navigate={navigate} returnBack={returnBack} goHome={goHome} />
    </PageShell>
  );
}

interface MomChrome {
  navigate: (next: MomView, params?: Record<string, string>) => void;
  returnBack: () => void;
  goHome: () => void;
}

function MomRouter({
  view,
  diaryId,
  navigate,
  returnBack,
  goHome,
}: MomChrome & { view: MomView; diaryId: string }) {
  const bootstrap = useBootstrapQuery(false);
  const summary = useMomSummaryQuery();
  const gemAmount = bootstrap.data?.gemBalance ?? 0;
  const baby = bootstrap.data?.currentBaby;
  const babyName = baby?.nickname ?? baby?.name ?? '宝宝';
  const ageLabel = baby ? formatBabyAgeLabel(baby.birthday) : '成长中';
  const { drawerOpen, setDrawerOpen, setBottomNavActive, showToast } = useUiOverlayStore();

  function openRootTab(tab: 'today' | 'records' | 'memories' | 'family') {
    setDrawerOpen(false);
    setBottomNavActive(tab);
    void Taro.reLaunch({ url: rootTabUrl(tab) });
  }

  const titles: Record<MomView, { title: string; subtitle: string }> = {
    home: { title: '妈妈的小角落', subtitle: '给妈妈留一点时间，写给自己' },
    'mood-compose': { title: '今天的心情', subtitle: '此刻的感觉，都值得记下' },
    'mood-done': { title: '已经替你记下来了', subtitle: '今天也好好照顾了自己' },
    'diary-compose': { title: '写给今天的自己', subtitle: '写给未来的自己看' },
    'diary-list': { title: '我的日记', subtitle: '每一篇都收在只有你的地方' },
    'diary-detail': { title: '这篇日记', subtitle: '' },
    visibility: { title: '可见范围', subtitle: '默认只给自己看，随时可以改' },
    'mood-calendar': { title: '心情日历', subtitle: '只是回顾，不是成绩' },
    note: { title: '一句话心得', subtitle: '看完这篇，想对自己说' },
  };

  return (
    <>
      <AppTopBar
        variant={view === 'home' ? 'home' : 'standard'}
        title={titles[view].title}
        subtitle={view === 'diary-detail' ? undefined : titles[view].subtitle}
        gemAmount={gemAmount}
        onMenuClick={() => setDrawerOpen(true)}
        onBackClick={view === 'home' ? undefined : returnBack}
      />
      <View className={`page-content ${styles.page}`}>
        {view === 'home' ? <MomHome summary={summary.data} navigate={navigate} /> : null}
        {view === 'mood-compose' ? <MoodCompose navigate={navigate} /> : null}
        {view === 'mood-done' ? <MoodDone navigate={navigate} /> : null}
        {view === 'diary-compose' ? (
          <DiaryCompose
            onSaved={goHome}
            navigate={navigate}
          />
        ) : null}
        {view === 'diary-list' ? <DiaryList navigate={navigate} /> : null}
        {view === 'diary-detail' ? <DiaryDetail id={diaryId} navigate={navigate} /> : null}
        {view === 'visibility' ? <VisibilityPicker /> : null}
        {view === 'mood-calendar' ? <MoodCalendar /> : null}
        {view === 'note' ? <OneLineNote /> : null}
      </View>
      {view === 'home' ? (
        <BottomNav
          active={null}
          onSelect={openRootTab}
          onAddClick={() =>
            Taro.switchTab({ url: '/pages/index/index' }).catch(() => undefined)
          }
        />
      ) : null}
      <AppDrawer
        open={drawerOpen}
        babyName={babyName}
        babyAgeLabel={ageLabel}
        gemAmount={gemAmount}
        items={DEFAULT_DRAWER_ITEMS.map((item) => ({
          ...item,
          active: item.id === 'mom',
          onClick: () => {
            if (item.id === 'mom') {
              setDrawerOpen(false);
              goHome();
            } else if (item.id === 'today') openRootTab('today');
            else if (item.id === 'records') openRootTab('records');
            else if (item.id === 'memories') openRootTab('memories');
            else if (item.id === 'family') openRootTab('family');
            else if (item.id === 'growth') {
              setDrawerOpen(false);
              void Taro.navigateTo({ url: '/pages/growth/index' });
            } else {
              setDrawerOpen(false);
              showToast(`${item.title}正在布置，先看看妈妈空间`);
            }
          },
        }))}
        onClose={() => setDrawerOpen(false)}
        onSearchClick={() => {
          setDrawerOpen(false);
          showToast('搜索正在布置');
        }}
        onNotificationClick={() => showToast('通知正在布置')}
        onAdminClick={() => showToast('管理模式正在布置')}
      />
    </>
  );
}

// --- 07.01 妈妈的小角落 ---

function MomHome({
  summary,
  navigate,
}: {
  summary:
    | { latestMood?: MoodPublic | null; moodCount: number; diaryCount: number }
    | undefined;
  navigate: MomChrome['navigate'];
}) {
  const diaries = useDiariesQuery();
  const latestDiary = diaries.data?.[0];
  const latestMood = summary?.latestMood ?? null;
  const mood = latestMood ? moodMeta(latestMood.mood) : null;

  if (diaries.isLoading) return <Skeleton lines={8} />;
  if (diaries.isError) {
    return <ErrorState onRetry={() => void diaries.refetch()} />;
  }

  return (
    <View className={styles.stack}>
      <GlassSurface level="tinted" tone="blush" radius="heroLg" className={styles.heroCard}>
        <View className={styles.heroFlower} aria-hidden>
          <Glyph name="sparkle" size="lg" />
        </View>
        <Text className={styles.heroTitle}>今天不用完成什么。</Text>
        <Text className={styles.heroCaption}>留一小段时刻给自己</Text>
      </GlassSurface>

      <SectionHeader title="今天感觉怎么样？" glyph="smile" tone="blush" />

      <View className={styles.moodRow}>
        {MOOD_OPTIONS.map((option) => (
          <View
            key={option.value}
            className={`${styles.moodChip} ${styles[`moodChip-${option.tone}`]}`}
            role="button"
            aria-label={`记一条：${option.label}`}
            onClick={() => navigate('mood-compose', { mood: option.value })}
          >
            <Glyph name={option.glyph} size="md" />
            <Text>{option.label}</Text>
          </View>
        ))}
      </View>

      <View className={styles.entryList}>
        <EntryRow
          glyph="smile"
          tone="apricot"
          title="今天的我记录什么？"
          caption={latestMood ? `最近一条：${MOOD_LABEL[latestMood.mood]}` : '心情、累不累，都可以'}
          onClick={() => navigate('mood-compose')}
        />
        <EntryRow
          glyph="diary"
          tone="lavender"
          title="写一日记"
          caption="心里的话、烦恼、轻松的，都可以"
          onClick={() => navigate('diary-compose')}
        />
        <EntryRow
          glyph="calendar"
          tone="sage"
          title="心情日历"
          caption="只是回顾，不比较"
          onClick={() => navigate('mood-calendar')}
        />
      </View>

      {mood ? (
        <GlassSurface level="card" radius="card" className={styles.latestMoodCard}>
          <View className={`${styles.latestMoodIcon} ${styles[`moodChip-${mood.tone}`]}`}>
            <Glyph name={mood.glyph} size="md" />
          </View>
          <View className={styles.latestMoodText}>
            <Text className={styles.latestMoodTitle}>最近的心情 · {MOOD_LABEL[latestMood!.mood]}</Text>
            <Text className={styles.latestMoodCaption}>
              {formatRecordDate(latestMood!.recordedAt)}记下
            </Text>
          </View>
        </GlassSurface>
      ) : null}

      {latestDiary ? (
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.diaryTeaserCard}
        >
          <View
            role="button"
            aria-label="打开最近的日记"
            onClick={() => navigate('diary-detail', { id: latestDiary.id })}
            className={styles.diaryTeaserHit}
          >
            <Text className={styles.diaryTeaserTitle}>
              {latestDiary.title ?? '今天想对自己说的话'}
            </Text>
            <Text className={styles.diaryTeaserCaption} numberOfLines={2}>
              {latestDiary.body}
            </Text>
            <View className={styles.diaryTeaserChevron}>
              <Glyph name="chevron" size="sm" />
            </View>
          </View>
        </GlassSurface>
      ) : null}
    </View>
  );
}

function EntryRow({
  glyph,
  tone,
  title,
  caption,
  onClick,
}: {
  glyph: GlyphName;
  tone: 'apricot' | 'sage' | 'lavender';
  title: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <GlassSurface level="card" radius="card" interactive className={styles.entryRow}>
      <View role="button" aria-label={title} onClick={onClick} className={styles.entryHit}>
        <View className={`${styles.entryIcon} ${styles[`entryIcon-${tone}`]}`}>
          <Glyph name={glyph} size="md" />
        </View>
        <View className={styles.entryText}>
          <Text className={styles.entryTitle}>{title}</Text>
          <Text className={styles.entryCaption}>{caption}</Text>
        </View>
        <View className={styles.entryChevron}>
          <Glyph name="chevron" size="sm" />
        </View>
      </View>
    </GlassSurface>
  );
}

// --- 07.02 记录心情 / 07.03 心情已记录 ---

function MoodCompose({ navigate }: Pick<MomChrome, 'navigate'>) {
  const router = useRouter();
  const preselect = router.params.mood;
  const [selected, setSelected] = useState<MoodKind | null>(
    (preselect as MoodKind) || null,
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const createMood = useCreateMood();
  const { showToast } = useUiOverlayStore();

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await createMood.mutateAsync({
        mood: selected,
        note: note.trim() || null,
        recordedAt: Date.now(),
        timezoneName: deviceTimezone(),
        visibility: 'PRIVATE',
      });
      navigate('mood-done', { mood: selected });
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '还没记下来，再试一次');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className={styles.stack}>
      <View className={styles.moodOptionList}>
        {MOOD_OPTIONS.map((option) => (
          <GlassSurface
            key={option.value}
            level="card"
            radius="card"
            interactive
            className={
              selected === option.value
                ? `${styles.moodOption} ${styles.moodOptionSelected}`
                : styles.moodOption
            }
          >
            <View
              role="button"
              aria-label={option.label}
              aria-pressed={selected === option.value}
              className={styles.moodOptionHit}
              onClick={() => {
                setSelected(option.value);
                setError(false);
              }}
            >
              <View className={`${styles.moodOptionIcon} ${styles[`moodChip-${option.tone}`]}`}>
                <Glyph name={option.glyph} size="md" />
              </View>
              <Text className={styles.moodOptionLabel}>{option.label}</Text>
            </View>
          </GlassSurface>
        ))}
      </View>

      <GlassTextArea
        label="想多说一句？"
        value={note}
        placeholder="今天有点累，也没关系"
        error={error}
        onInput={setNote}
      />

      <PrimaryActionButton
        label="替我记下来"
        state={!selected || saving ? 'disabled' : 'default'}
        onClick={() => void save()}
      />
    </View>
  );
}

function MoodDone({ navigate }: Pick<MomChrome, 'navigate'>) {
  const router = useRouter();
  const kind = (router.params.mood as MoodKind) || 'OK';
  const meta = moodMeta(kind);
  const moods = useMoodsQuery();
  const latest = moods.data?.[0];

  return (
    <View className={styles.stack}>
      <GlassSurface level="tinted" tone={meta.tone} radius="heroLg" className={styles.doneHero}>
        <View className={`${styles.doneIcon} ${styles[`moodChip-${meta.tone}`]}`}>
          <Glyph name={meta.glyph} size="lg" />
        </View>
        <Text className={styles.doneTitle}>今天{MOOD_LABEL[kind]}</Text>
        <Text className={styles.doneCaption}>已经替你记下来了，安心去做自己的事</Text>
        {latest?.note ? (
          <Text className={styles.doneNote}>「{latest.note}」</Text>
        ) : null}
      </GlassSurface>
      <GlassSurface level="card" radius="card" className={styles.doneLinks}>
        <View
          className={styles.doneLink}
          role="button"
          aria-label="写一篇日记"
          onClick={() => navigate('diary-compose')}
        >
          <Glyph name="diary" size="md" className={styles.doneLinkGlyph} />
          <Text>写点什么吧</Text>
          <Text className={styles.doneLinkCaption}>把此刻的心情写成日记</Text>
          <View className={styles.doneLinkChevron}>
            <Glyph name="chevron" size="sm" />
          </View>
        </View>
      </GlassSurface>
      <PrimaryActionButton label="好的" onClick={() => navigate('home')} />
    </View>
  );
}

// --- 07.09 心情日历 ---

function MoodCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const calendar = useMoodCalendarQuery(year, month);
  const moodsByDay = useMoodsQuery();

  const dayMoodMap = useMemo(() => {
    const map = new Map<string, MoodKind>();
    for (const day of calendar.data?.days ?? []) {
      const first = day.moods[0];
      if (first) map.set(day.date, first.mood);
    }
    return map;
  }, [calendar.data]);

  const monthDays = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const startWeekday = (firstDay.getDay() + 6) % 7; // 周一为起点
    const total = new Date(year, month, 0).getDate();
    const cells: Array<{ key: string; day: number | null; dateKey: string | null }> = [];
    for (let i = 0; i < startWeekday; i += 1) {
      cells.push({ key: `blank-${i}`, day: null, dateKey: null });
    }
    for (let day = 1; day <= total; day += 1) {
      cells.push({
        key: `day-${day}`,
        day,
        dateKey: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      });
    }
    return cells;
  }, [month, year]);

  function shiftMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
  }

  const latestDays = (moodsByDay.data ?? []).slice(0, 4);

  return (
    <View className={styles.stack}>
      <GlassSurface level="card" radius="card" className={styles.calendarCard}>
        <View className={styles.calendarNav}>
          <View
            className={styles.calendarNavButton}
            role="button"
            aria-label="上一个月"
            onClick={() => shiftMonth(-1)}
          >
            <Glyph name="chevron" size="sm" className={styles.calendarNavFlip} />
          </View>
          <Text className={styles.calendarTitle}>{year}年{month}月</Text>
          <View
            className={styles.calendarNavButton}
            role="button"
            aria-label="下一个月"
            onClick={() => shiftMonth(1)}
          >
            <Glyph name="chevron" size="sm" />
          </View>
        </View>
        <View className={styles.calendarWeek}>
          {['一', '二', '三', '四', '五', '六', '日'].map((label) => (
            <Text key={label} className={styles.calendarWeekLabel}>{label}</Text>
          ))}
        </View>
        <View className={styles.calendarGrid}>
          {monthDays.map((cell) => {
            const mood = cell.dateKey ? dayMoodMap.get(cell.dateKey) : undefined;
            const meta = mood ? moodMeta(mood) : null;
            const isToday = cell.dateKey === todayKey();
            return (
              <View
                key={cell.key}
                className={classNamesCalendarCell(
                  isToday,
                  Boolean(meta),
                )}
                aria-label={
                  cell.day
                    ? meta
                      ? `${cell.day}日 ${MOOD_LABEL[meta.value]}`
                      : `${cell.day}日`
                    : undefined
                }
              >
                {meta ? (
                  <Glyph name={meta.glyph} size="sm" />
                ) : (
                  <Text className={styles.calendarDayText}>{cell.day ?? ''}</Text>
                )}
              </View>
            );
          })}
        </View>
        {calendar.isLoading ? <Skeleton lines={3} /> : null}
        {calendar.isError ? (
          <ErrorState onRetry={() => void calendar.refetch()} />
        ) : null}
      </GlassSurface>

      {latestDays.length > 0 ? (
        <View className={styles.stack}>
          {latestDays.map((item) => {
            const meta = moodMeta(item.mood);
            return (
              <GlassSurface key={item.id} level="card" radius="card" className={styles.latestMoodCard}>
                <View className={`${styles.latestMoodIcon} ${styles[`moodChip-${meta.tone}`]}`}>
                  <Glyph name={meta.glyph} size="md" />
                </View>
                <View className={styles.latestMoodText}>
                  <Text className={styles.latestMoodTitle}>
                    {formatRecordDate(item.recordedAt)} · {MOOD_LABEL[item.mood]}
                  </Text>
                  {item.note ? (
                    <Text className={styles.latestMoodCaption} numberOfLines={1}>
                      {item.note}
                    </Text>
                  ) : (
                    <Text className={styles.latestMoodCaption}>写了一条心情</Text>
                  )}
                </View>
              </GlassSurface>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function classNamesCalendarCell(hasMood: boolean, filled: boolean) {
  const base = styles.calendarCell;
  if (filled) return `${base} ${styles.calendarCellFilled}`;
  if (hasMood) return `${base} ${styles.calendarCellToday}`;
  return base;
}

// --- 07.05 日记列表 ---

function DiaryList({ navigate }: Pick<MomChrome, 'navigate'>) {
  const diaries = useDiariesQuery();
  const [filter, setFilter] = useState<'all' | 'diary'>('all');
  const { showToast } = useUiOverlayStore();

  if (diaries.isLoading) return <Skeleton lines={8} />;
  if (diaries.isError) {
    return <ErrorState onRetry={() => void diaries.refetch()} />;
  }

  const items = diaries.data ?? [];

  return (
    <View className={styles.stack}>
      <SegmentedControl
        options={[
          { value: 'all', label: '全部' },
          { value: 'diary', label: '日记' },
        ]}
        value={filter}
        onChange={setFilter}
        ariaLabel="日记筛选"
      />
      {items.length === 0 ? (
        <EmptyState
          title="日记本还空着"
          description="写下第一篇，只给你自己看。"
        />
      ) : (
        items.map((diary) => (
          <GlassSurface
            key={diary.id}
            level="card"
            radius="card"
            interactive
            className={styles.diaryListCard}
          >
            <View
              role="button"
              aria-label={`打开日记：${diary.title ?? '无标题'}`}
              className={styles.diaryListHit}
              onClick={() => navigate('diary-detail', { id: diary.id })}
            >
              <View className={styles.diaryListIcon}>
                <Glyph name="diary" size="md" />
              </View>
              <View className={styles.diaryListText}>
                <Text className={styles.diaryListTitle}>
                  {diary.title ?? '无标题的一天'}
                </Text>
                <Text className={styles.diaryListCaption} numberOfLines={1}>
                  {firstLine(diary.body)}
                </Text>
                <Text className={styles.diaryListDate}>
                  {formatRecordDate(diary.recordedAt)}
                  {diary.visibility === 'PRIVATE' ? ' · 仅自己' : ' · 家庭'}
                </Text>
              </View>
              <View className={styles.diaryListChevron}>
                <Glyph name="chevron" size="sm" />
              </View>
            </View>
          </GlassSurface>
        ))
      )}
      <PrimaryActionButton
        label="写日记"
        onClick={() => {
          showToast('从今天的心情写起');
          navigate('diary-compose');
        }}
      />
    </View>
  );
}

function firstLine(body: string) {
  return body.split('\n').find((line) => line.trim()) ?? '';
}

// --- 07.06 写日记（Auto Draft 主场景）---

interface DiaryDraftValues extends Record<string, unknown> {
  title: string;
  body: string;
}

function DiaryCompose({
  onSaved,
}: {
  onSaved: () => void;
} & Pick<MomChrome, 'navigate'>) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const createDiary = useCreateDiary();
  const { showToast } = useUiOverlayStore();

  const draft = useAutoDraft<DiaryDraftValues>({
    key: 'mom_diary_compose',
    values: { title, body },
  });

  // 草稿只恢复一次：restored 从 null 变为对象时同步进表单。
  const [draftApplied, setDraftApplied] = useState(false);
  useEffect(() => {
    if (draftApplied || !draft.restored) return;
    setTitle(typeof draft.restored.title === 'string' ? draft.restored.title : '');
    setBody(typeof draft.restored.body === 'string' ? draft.restored.body : '');
    setDraftApplied(true);
  }, [draft.restored, draftApplied]);

  async function save() {
    if (!body.trim()) {
      setMessage('写下想对自己说的话吧');
      return;
    }
    if (saving) return;
    setSaving(true);
    setMessage('');
    try {
      await createDiary.mutateAsync({
        title: title.trim() || null,
        body: body.trim(),
        // 新日记一律 PRIVATE（PRD 13.6）；改为家庭可见走 07.08 可见范围。
        visibility: 'PRIVATE',
        recordedAt: Date.now(),
        timezoneName: deviceTimezone(),
      });
      await draft.clear();
      showToast('日记收好了 🌱');
      onSaved();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : '还没保存成功，请再试一次');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className={styles.stack}>
      {draft.restored && (draft.restored.title || draft.restored.body) ? (
        <GlassSurface level="tinted" tone="sky" radius="quick" className={styles.draftBanner}>
          <Glyph name="sparkle" size="sm" className={styles.draftBannerGlyph} />
          <Text className={styles.draftBannerText}>已恢复上次没写完的草稿</Text>
          <SecondaryGlassButton
            label="丢弃草稿"
            fullWidth={false}
            className={styles.draftBannerAction}
            onClick={() => void draft.discard()}
          />
        </GlassSurface>
      ) : null}
      <GlassSurface level="card" radius="card" className={styles.composePanel}>
        <Text className={styles.composeLabel}>标题</Text>
        <GlassTextArea
          label="今天想写的话"
          value={title}
          placeholder="给今天一个名字（可不填）"
          onInput={setTitle}
        />
      </GlassSurface>
      <GlassSurface level="card" radius="card" className={styles.composePanel}>
        <Text className={styles.composeLabel}>今天……</Text>
        <GlassTextArea
          label="正文"
          value={body}
          placeholder="此刻想说的，慢慢写"
          onInput={setBody}
        />
        <Text className={styles.composeHint}>写一半也会自动保存，放心去忙 🌙</Text>
      </GlassSurface>
      <PrimaryActionButton
        label="保存日记"
        state={saving ? 'loading' : body.trim() ? 'default' : 'disabled'}
        onClick={() => void save()}
      />
      {message ? (
        <Text className={styles.errorText} aria-live="polite">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

// --- 07.07 日记详情 + 07.08 可见范围 + 编辑冲突 ---

function DiaryDetail({ id, navigate }: { id: string } & Pick<MomChrome, 'navigate'>) {
  const diary = useDiaryQuery(id || undefined);
  const deleteDiary = useDeleteDiary();
  const { showToast } = useUiOverlayStore();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (diary.isLoading) return <Skeleton lines={8} />;
  if (diary.isError || !diary.data) {
    const notFound =
      diary.error instanceof ApiError && diary.error.status === 404;
    return (
      <ErrorState
        title={notFound ? '这篇日记不在这里' : '日记没有打开'}
        description={
          notFound
            ? '它可能属于别人，或者已经被删除。'
            : '请稍后再试，你的日记仍然安全。'
        }
        onRetry={() => void diary.refetch()}
      />
    );
  }

  const item = diary.data;

  async function remove() {
    if (!item) return;
    try {
      await deleteDiary.mutateAsync(item.id);
      showToast('已放回最近删除，30 天内可恢复');
      void Taro.navigateBack();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : '没有删除成功');
    }
  }

  return (
    <View className={styles.stack}>
      <GlassSurface level="hero" radius="heroLg" className={styles.detailHero}>
        <Text className={styles.detailHeroTitle}>
          {item!.title ?? '今天想对自己说的话'}
        </Text>
      </GlassSurface>

      <GlassSurface level="card" radius="card" className={styles.detailBodyCard}>
        {item!.body.split('\n').filter(Boolean).map((paragraph, index) => (
          <Text key={index} className={styles.detailParagraph}>
            {paragraph}
          </Text>
        ))}
      </GlassSurface>

      <View className={styles.tagRow}>
        <View className={styles.tagChip}>
          <Glyph name="sparkle" size="sm" />
          <Text>写给自己</Text>
        </View>
        <View className={styles.tagChip}>
          <Glyph name="heart" size="sm" />
          <Text>#心情</Text>
        </View>
      </View>

      <View className={styles.detailActions}>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.detailActionCard}
        >
          <View
            role="button"
            aria-label="编辑日记"
            className={styles.detailActionHit}
            onClick={() => setSheetOpen(true)}
          >
            <View className={`${styles.detailActionIcon} ${styles.entryIconLavender}`}>
              <Glyph name="diary" size="md" />
            </View>
            <View className={styles.detailActionText}>
              <Text className={styles.detailActionTitle}>编辑日记</Text>
              <Text className={styles.detailActionCaption}>内容会自动保存草稿</Text>
            </View>
            <View className={styles.entryChevron}>
              <Glyph name="chevron" size="sm" />
            </View>
          </View>
        </GlassSurface>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.detailActionCard}
        >
          <View
            role="button"
            aria-label="删除日记"
            className={styles.detailActionHit}
            onClick={() => setDeleteOpen(true)}
          >
            <View className={`${styles.detailActionIcon} ${styles.entryIconBlush}`}>
              <Glyph name="close" size="md" />
            </View>
            <View className={styles.detailActionText}>
              <Text className={styles.detailActionTitle}>删除日记</Text>
              <Text className={styles.detailActionCaption}>30天内可恢复</Text>
            </View>
            <View className={styles.entryChevron}>
              <Glyph name="chevron" size="sm" />
            </View>
          </View>
        </GlassSurface>
      </View>

      <PrimaryActionButton
        label={item!.visibility === 'PRIVATE' ? '仅自己可见' : '家庭可见'}
        tone={item!.visibility === 'PRIVATE' ? 'blush' : 'sage'}
        onClick={() => navigate('visibility', { id: item!.id })}
      />

      <BottomSheet open={sheetOpen} title="编辑日记" onClose={() => setSheetOpen(false)}>
        <DiaryEditForm diary={item!} onDone={() => setSheetOpen(false)} />
      </BottomSheet>

      <ConfirmDialog
        open={deleteOpen}
        title="删掉这篇日记？"
        message="删除后 30 天内可以在最近删除里找回。"
        confirmLabel="删除"
        danger
        onConfirm={() => {
          setDeleteOpen(false);
          void remove();
        }}
        onCancel={() => setDeleteOpen(false)}
      />
    </View>
  );
}

// 编辑表单：Auto Draft + baseVersion；服务端版本变了不允许静默覆盖。
// 草稿带 baseVersion 落盘：编辑中途 kill App，重开后若日记版本已前进，
// useAutoDraft 会报 conflict 而不是拿旧草稿覆盖新内容（AGENTS §53）。
function DiaryEditForm({ diary, onDone }: { diary: DiaryPublic; onDone: () => void }) {
  const [title, setTitle] = useState(diary.title ?? '');
  const [body, setBody] = useState(diary.body);
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const updateDiary = useUpdateDiary();

  const draft = useAutoDraft<DiaryDraftValues>({
    key: `mom_diary_edit_${diary.id}`,
    values: { title, body },
    serverVersion: diary.version,
  });

  // 已有内容不为空时不恢复草稿：表单初值就是服务端真值。
  // serverVersion 随 diary.version 变化，draft.flush 每次都会带上最新 baseVersion。
  const [draftApplied, setDraftApplied] = useState(diary.body.length === 0 && !diary.title);
  useEffect(() => {
    if (draftApplied || !draft.restored) return;
    const draftTitle = draft.restored.title;
    const draftBody = draft.restored.body;
    if (typeof draftBody === 'string' && draftBody.trim()) {
      setTitle(typeof draftTitle === 'string' ? draftTitle : '');
      setBody(draftBody);
    }
    setDraftApplied(true);
  }, [draft.restored, draftApplied]);

  async function save() {
    if (!body.trim()) {
      setMessage('正文不能是空的');
      return;
    }
    try {
      await updateDiary.mutateAsync({
        id: diary.id,
        body: { title: title.trim() || null, body: body.trim() },
        version: diary.version,
      });
      await draft.clear();
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ENTITY_VERSION_CONFLICT') {
        setConflict(true);
        return;
      }
      setMessage(err instanceof ApiError ? err.message : '还没保存成功，请再试一次');
    }
  }

  return (
    <View className={styles.editForm}>
      {draft.conflict ? (
        <Text className={styles.errorText} aria-live="polite">
          这篇日记刚在别处更新过，这份草稿基于旧版本，已停止自动恢复。
        </Text>
      ) : null}
      <GlassTextArea label="标题" value={title} placeholder="给今天一个名字（可不填）" onInput={setTitle} />
      <GlassTextArea label="正文" value={body} placeholder="此刻想说的" onInput={setBody} />
      {message ? <Text className={styles.errorText}>{message}</Text> : null}
      <PrimaryActionButton
        label="保存修改"
        state={updateDiary.isPending ? 'loading' : 'default'}
        onClick={() => void save()}
      />
      <ConfirmDialog
        open={conflict}
        title="日记有更新"
        message="这篇日记刚在别处被修改过，为避免覆盖，没有保存这次修改。"
        confirmLabel="好的"
        onConfirm={() => {
          setConflict(false);
          onDone();
        }}
        onCancel={() => setConflict(false)}
      />
    </View>
  );
}

// --- 07.08 可见范围 ---

function VisibilityPicker() {
  const router = useRouter();
  const id = router.params.id ?? '';
  const diary = useDiaryQuery(id || undefined);
  const updateDiary = useUpdateDiary();
  const { showToast } = useUiOverlayStore();
  const [conflictOpen, setConflictOpen] = useState(false);

  if (diary.isLoading) return <Skeleton lines={5} />;
  if (diary.isError || !diary.data) {
    return <ErrorState onRetry={() => void diary.refetch()} />;
  }

  const item = diary.data;

  async function choose(next: 'PRIVATE' | 'FAMILY') {
    if (!item || item.visibility === next) return;
    try {
      await updateDiary.mutateAsync({
        id: item.id,
        body: { visibility: next },
        version: item.version,
      });
      showToast(next === 'PRIVATE' ? '还是只有自己看' : '家人也可以看了');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ENTITY_VERSION_CONFLICT') {
        setConflictOpen(true);
        return;
      }
      showToast(err instanceof ApiError ? err.message : '没有改成功，请再试一次');
    }
  }

  return (
    <View className={styles.stack}>
      <VisibilityOption
        selected={item!.visibility === 'PRIVATE'}
        glyph="lock"
        tone="blush"
        title="仅自己"
        caption="默认选择，只有自己"
        onClick={() => void choose('PRIVATE')}
      />
      <VisibilityOption
        selected={item!.visibility === 'FAMILY'}
        glyph="family"
        tone="sage"
        title="我和伴侣"
        caption="和家庭可以看"
        onClick={() => void choose('FAMILY')}
      />
      <VisibilityOption
        selected={false}
        glyph="family"
        tone="sky"
        title="家庭成员"
        caption="家小成员以后都能看"
        disabled
        onClick={() => showToast('等小家成员齐了再开放')}
      />
      <PrimaryActionButton label="完成" onClick={() => void Taro.navigateBack()} />
      <ConfirmDialog
        open={conflictOpen}
        title="日记有更新"
        message="这篇日记刚在别处被修改过。刷新后再改可见范围。"
        confirmLabel="刷新看看"
        onConfirm={() => {
          setConflictOpen(false);
          void diary.refetch();
        }}
        onCancel={() => setConflictOpen(false)}
      />
    </View>
  );
}

function VisibilityOption({
  selected,
  glyph,
  tone,
  title,
  caption,
  disabled,
  onClick,
}: {
  selected: boolean;
  glyph: GlyphName;
  tone: 'blush' | 'sage' | 'sky';
  title: string;
  caption: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <GlassSurface
      level="card"
      radius="card"
      interactive={!disabled}
      className={
        selected
          ? `${styles.visibilityOption} ${styles.visibilityOptionSelected}`
          : styles.visibilityOption
      }
    >
      <View
        role="button"
        aria-label={title}
        aria-pressed={selected}
        aria-disabled={disabled}
        className={styles.visibilityHit}
        onClick={disabled ? undefined : onClick}
      >
        <View className={`${styles.visibilityIcon} ${styles[`entryIcon-${tone === 'sky' ? 'apricot' : tone}`]}`}>
          <Glyph name={glyph} size="md" />
        </View>
        <View className={styles.visibilityText}>
          <Text className={styles.visibilityTitle}>{title}</Text>
          <Text className={styles.visibilityCaption}>{caption}</Text>
        </View>
        {selected ? (
          <View className={styles.visibilityCheck}>
            <Glyph name="smile" size="sm" />
          </View>
        ) : null}
      </View>
    </GlassSurface>
  );
}

// --- 13.07 一句话心得（看完知识后写给自己的便签，Auto Draft）---

function OneLineNote() {
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  const draft = useAutoDraft<Record<string, unknown>>({
    key: 'mom_knowledge_note',
    values: { text },
  });

  const [draftApplied, setDraftApplied] = useState(false);
  useEffect(() => {
    if (draftApplied || !draft.restored) return;
    setText(typeof draft.restored.text === 'string' ? draft.restored.text : '');
    setDraftApplied(true);
  }, [draft.restored, draftApplied]);

  async function save() {
    if (!text.trim()) return;
    await draft.flush();
    setSaved(true);
  }

  return (
    <View className={styles.stack}>
      <GlassSurface level="card" radius="card" className={styles.composePanel}>
        <Text className={styles.composeHint}>
          看完这篇，有什么想对自己说的？写下来，只给自己看。
        </Text>
        <GlassTextArea
          label="可以记这里"
          value={text}
          placeholder="留一句话给以后的日子"
          onInput={setText}
        />
      </GlassSurface>
      {saved ? (
        <GlassSurface level="tinted" tone="sage" radius="quick" className={styles.draftBanner}>
          <Glyph name="smile" size="sm" className={styles.draftBannerGlyph} />
          <Text className={styles.draftBannerText}>已记下，随时回来看看</Text>
        </GlassSurface>
      ) : null}
      <PrimaryActionButton
        label="保存"
        state={text.trim() ? 'default' : 'disabled'}
        onClick={() => void save()}
      />
    </View>
  );
}
