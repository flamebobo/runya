import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import type { HealthEventPublic, HealthEventType } from '@runew/contracts';
import { useEffect, useMemo, useState } from 'react';
import {
  AppDrawer,
  AppTopBar,
  BottomNav,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  GlassSurface,
  PageShell,
  PrimaryActionButton,
  SectionHeader,
  Skeleton,
  SyncBar,
  TextAction,
  DEFAULT_DRAWER_ITEMS,
} from '@/components';
import { Glyph } from '@/components/icons/Glyph';
import {
  HealthEventForm,
  HealthAttachmentPreview,
  HealthReminderSheet,
  reminderOffsetsFromEvent,
  reminderSummary,
  type HealthEventDraft,
  type HealthEventView,
  type ReminderOffsetValue,
} from '@/components/health/HealthForms';
import {
  HEALTH_TYPE_META,
  HealthCalendarStrip,
  HealthMonthCalendar,
  HealthEventCard,
  HealthNextUpCard,
  HealthStatusBadge,
  HealthTypeChips,
  formatEventDate,
  formatEventTime,
  formatReminderOffset,
} from '@/components/health/HealthViews';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import {
  useHealthActions,
  useHealthEventDetailQuery,
  useHealthEventsQuery,
  useHealthReminderActions,
} from '@/hooks/useHealth';
import { useFamilyRuntimeStore, useUiOverlayStore } from '@/stores/runtime';
import { formatBabyAgeLabel, todayIsoDate } from '@/utils/babyAge';
import { rootTabUrl } from '@/utils/rootNavigation';
import classNames from '@/utils/classNames';
import styles from './index.module.scss';

type HealthView = 'home' | 'detail' | 'edit' | 'timeline';
type HealthFilter = 'ALL' | HealthEventType;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const EMPTY_HEALTH_EVENTS: HealthEventPublic[] = [];

const VIEW_COPY: Record<
  Exclude<HealthView, 'home'>,
  { title: string; subtitle: string }
> = {
  detail: { title: '健康事项详情', subtitle: '需要时再打开，细节都在这里' },
  edit: { title: '记录健康事项', subtitle: '只留下时间、地点和想记住的细节' },
  timeline: { title: '健康时间线', subtitle: '每一个安排，都有自己的位置' },
};

export function buildHealthCalendarDays(anchorIso: string) {
  const anchor = new Date(`${anchorIso}T12:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() + index - 3);
    const iso = isoDateOf(date.getTime());
    return {
      iso,
      label: String(date.getDate()),
      weekday: WEEKDAYS[date.getDay()]!,
    };
  });
}

export function isoDateOf(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

export function monthAnchorIso(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(1);
  return isoDateOf(date.getTime());
}

export function shiftHealthMonth(iso: string, delta: number): string {
  const date = new Date(`${monthAnchorIso(iso)}T12:00:00`);
  date.setMonth(date.getMonth() + delta, 1);
  return isoDateOf(date.getTime());
}

export function buildHealthMonthDays(anchorIso: string) {
  const anchor = new Date(`${monthAnchorIso(anchorIso)}T12:00:00`);
  const firstDay = new Date(anchor);
  firstDay.setDate(1);
  const gridStart = new Date(firstDay);
  gridStart.setDate(1 - firstDay.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      iso: isoDateOf(date.getTime()),
      label: String(date.getDate()),
      currentMonth:
        date.getFullYear() === anchor.getFullYear() &&
        date.getMonth() === anchor.getMonth(),
    };
  });
}

export function nextHealthEvent(items: HealthEventPublic[]): HealthEventPublic | null {
  return (
    items
      .filter((item) => item.status === 'UPCOMING')
      .sort((a, b) => a.scheduledAt - b.scheduledAt || a.id.localeCompare(b.id))[0] ??
    null
  );
}

export function healthEventsForDate(
  items: HealthEventPublic[],
  iso: string,
  filter: HealthFilter = 'ALL',
) {
  return items.filter(
    (item) =>
      isoDateOf(item.scheduledAt) === iso &&
      (filter === 'ALL' || item.eventType === filter),
  );
}

function healthView(value: string | undefined): HealthView {
  return value === 'detail' || value === 'edit' || value === 'timeline'
    ? value
    : 'home';
}

function healthFilter(value: string | undefined): HealthFilter {
  return value && value in HEALTH_TYPE_META ? (value as HealthEventType) : 'ALL';
}

function healthUrl(view: HealthView, params: Record<string, string> = {}) {
  return `/pages/health/index?${new URLSearchParams({ view, ...params }).toString()}`;
}

function eventDetailRows(item: HealthEventPublic) {
  const rows: Array<{
    glyph: 'bell' | 'diary' | 'house' | 'stethoscope';
    label: string;
    value: string;
  }> = [
    {
      glyph: 'bell',
      label: '时间',
      value: `${formatEventDate(item.scheduledAt)} ${formatEventTime(item.scheduledAt)}`,
    },
  ];
  if (item.locationName)
    rows.push({ glyph: 'house', label: '地点', value: item.locationName });
  if (item.locationAddress)
    rows.push({ glyph: 'house', label: '地址', value: item.locationAddress });
  if (item.doctorName)
    rows.push({ glyph: 'stethoscope', label: '医生', value: item.doctorName });
  if (item.note) rows.push({ glyph: 'diary', label: '备注', value: item.note });
  return rows;
}

export default function HealthPage() {
  return (
    <AppBootstrapGate>
      <HealthBody />
    </AppBootstrapGate>
  );
}

function HealthBody() {
  const router = useRouter();
  const view = healthView(router.params.view);
  const id = router.params.id ?? '';
  const babyId = useFamilyRuntimeStore((state) => state.babyId);
  const bootstrap = useBootstrapQuery(false);
  const baby = bootstrap.data?.currentBaby;
  const babyName = baby?.nickname ?? baby?.name ?? '宝宝';
  const babyAgeLabel = baby ? formatBabyAgeLabel(baby.birthday) : '成长中';
  const gemAmount = bootstrap.data?.gemBalance ?? 0;
  const health = useHealthEventsQuery(babyId);
  const detail = useHealthEventDetailQuery(
    view === 'detail' || view === 'edit' ? id : null,
  );
  const actions = useHealthActions(babyId);
  const reminderActions = useHealthReminderActions();
  const { drawerOpen, setDrawerOpen, setBottomNavActive, showToast } =
    useUiOverlayStore();
  const [selectedDate, setSelectedDate] = useState(
    router.params.date ?? todayIsoDate(),
  );
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');
  const [monthAnchor, setMonthAnchor] = useState(() =>
    monthAnchorIso(router.params.date ?? todayIsoDate()),
  );
  const [activeFilter, setActiveFilter] = useState<HealthFilter>(
    healthFilter(router.params.type),
  );

  const items = health.data?.items ?? EMPTY_HEALTH_EVENTS;
  const calendarDays = useMemo(
    () => buildHealthCalendarDays(selectedDate),
    [selectedDate],
  );
  const monthDays = useMemo(() => buildHealthMonthDays(monthAnchor), [monthAnchor]);
  const markedDates = useMemo(
    () => new Set(items.map((item) => isoDateOf(item.scheduledAt))),
    [items],
  );
  const next = useMemo(() => nextHealthEvent(items), [items]);

  function open(nextView: HealthView, params: Record<string, string> = {}) {
    void Taro.navigateTo({ url: healthUrl(nextView, params) });
  }

  function selectCalendarDate(iso: string) {
    setSelectedDate(iso);
    setMonthAnchor(monthAnchorIso(iso));
  }

  function returnToPrevious() {
    void Promise.resolve(Taro.navigateBack({ delta: 1 })).catch(() =>
      Taro.reLaunch({ url: '/pages/health/index' }),
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

  function drawerItems() {
    return DEFAULT_DRAWER_ITEMS.map((item) => ({
      ...item,
      active: item.id === 'health',
      onClick: () => {
        setDrawerOpen(false);
        if (item.id === 'health') return;
        if (
          item.id === 'today' ||
          item.id === 'records' ||
          item.id === 'memories' ||
          item.id === 'family'
        ) {
          openRootTab(item.id);
          return;
        }
        if (item.id === 'growth') {
          void Taro.navigateTo({ url: '/pages/growth/index' });
          return;
        }
        if (item.id === 'knowledge') {
          void Taro.navigateTo({ url: '/pages/knowledge/index' });
          return;
        }
        if (item.id === 'settings') {
          void Taro.navigateTo({ url: '/pages/settings/index' });
          return;
        }
        showToast(`${item.title}正在布置，先把今天收好`);
      },
    }));
  }

  function renderHome() {
    if (health.isLoading) return <Skeleton lines={8} />;
    if (health.isError) {
      return (
        <ErrorState
          title="健康小日历还没打开"
          description="你的本机记录仍然在，联网后再试一次。"
          onRetry={() => void health.refetch()}
        />
      );
    }
    const dayItems = healthEventsForDate(items, selectedDate, activeFilter);
    const counts: Partial<Record<HealthFilter, number>> = { ALL: items.length };
    for (const item of items)
      counts[item.eventType] = (counts[item.eventType] ?? 0) + 1;
    return (
      <View className={styles.pageStack}>
        <SyncBar />
        <View className={styles.intro}>
          <Text className={styles.introTitle}>{babyName}的健康小日历</Text>
          <Text className={styles.introCaption}>
            只记下时间、地点和细节，把安心留给今天。
          </Text>
        </View>
        <GlassSurface level="card" radius="card" className={styles.calendarPanel}>
          <View className={styles.calendarPanelHeader}>
            <Text className={styles.calendarPanelTitle}>健康日历</Text>
            <View className={styles.calendarModes} role="tablist" aria-label="日历视图">
              <View
                className={classNames(
                  styles.calendarMode,
                  calendarMode === 'week' ? styles.calendarModeActive : undefined,
                )}
                role="tab"
                aria-selected={calendarMode === 'week'}
                onClick={() => setCalendarMode('week')}
              >
                <Text>周</Text>
              </View>
              <View
                className={classNames(
                  styles.calendarMode,
                  calendarMode === 'month' ? styles.calendarModeActive : undefined,
                )}
                role="tab"
                aria-selected={calendarMode === 'month'}
                onClick={() => setCalendarMode('month')}
              >
                <Text>月</Text>
              </View>
            </View>
          </View>
          {calendarMode === 'week' ? (
            <HealthCalendarStrip
              days={calendarDays}
              activeIso={selectedDate}
              markedIso={markedDates}
              onSelect={selectCalendarDate}
            />
          ) : (
            <HealthMonthCalendar
              monthLabel={(() => {
                const date = new Date(`${monthAnchor}T12:00:00`);
                return `${date.getFullYear()}年${date.getMonth() + 1}月`;
              })()}
              days={monthDays}
              activeIso={selectedDate}
              markedIso={markedDates}
              onSelect={selectCalendarDate}
              onPrevious={() => {
                const next = shiftHealthMonth(monthAnchor, -1);
                setMonthAnchor(next);
                setSelectedDate(next);
              }}
              onNext={() => {
                const next = shiftHealthMonth(monthAnchor, 1);
                setMonthAnchor(next);
                setSelectedDate(next);
              }}
            />
          )}
        </GlassSurface>
        <HealthNextUpCard
          event={next}
          onClick={() => (next ? open('detail', { id: next.id }) : open('edit'))}
        />
        <SectionHeader
          title="健康时间线"
          caption={`${selectedDate === todayIsoDate() ? '今天' : selectedDate} · 轻轻安排，不用赶`}
          actionLabel="看全部"
          onAction={() => open('timeline')}
          variant="guide"
          glyph="heart"
          tone="sage"
        />
        <HealthTypeChips
          active={activeFilter}
          counts={counts}
          onSelect={setActiveFilter}
        />
        {dayItems.length > 0 ? (
          <View className={styles.eventStack}>
            {dayItems.map((item) => (
              <HealthEventCard
                key={item.id}
                event={item}
                onClick={() => open('detail', { id: item.id })}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            title="这一天还留着空位"
            description="有体检、疫苗、就诊或用药安排时，再把它放进来就好。"
            actionLabel="新增健康事项"
            onAction={() => open('edit')}
          />
        )}
        <PrimaryActionButton
          label="新增健康事项"
          icon={<Glyph name="plus" size="sm" />}
          onClick={() => open('edit')}
        />
      </View>
    );
  }

  function renderTimeline() {
    if (health.isLoading) return <Skeleton lines={8} />;
    if (health.isError) return <ErrorState onRetry={() => void health.refetch()} />;
    return (
      <View className={styles.pageStack}>
        <SyncBar />
        {items.length === 0 ? (
          <EmptyState
            title="健康时间线还没有内容"
            description="把下一次要记住的安排放进来，日子会自己排好。"
            actionLabel="新增健康事项"
            onAction={() => open('edit')}
          />
        ) : (
          <View className={styles.eventStack}>
            {items.map((item) => (
              <HealthEventCard
                key={item.id}
                event={item}
                onClick={() => open('detail', { id: item.id })}
              />
            ))}
          </View>
        )}
        <PrimaryActionButton
          label="新增健康事项"
          icon={<Glyph name="plus" size="sm" />}
          onClick={() => open('edit')}
        />
      </View>
    );
  }

  function renderDetail() {
    if (detail.isLoading) return <Skeleton lines={8} />;
    if (detail.isError || !detail.data) {
      return (
        <ErrorState
          title="这个健康事项还没打开"
          description={detail.error instanceof Error ? detail.error.message : undefined}
          onRetry={() => void detail.refetch()}
        />
      );
    }
    return (
      <HealthDetailPanel
        item={detail.data}
        onEdit={() => open('edit', { id: detail.data!.id })}
        onBack={returnToPrevious}
        onComplete={async () => {
          try {
            await actions.complete(detail.data!);
            showToast('已把这件事收好。');
          } catch (error) {
            showToast(
              error instanceof Error ? error.message : '状态还没更新好，请再试一次。',
            );
          }
        }}
        onDelete={async () => {
          try {
            await actions.remove(detail.data!);
            showToast('已移到最近删除。');
            returnToPrevious();
          } catch (error) {
            showToast(
              error instanceof Error ? error.message : '还没删除好，请再试一次。',
            );
          }
        }}
        reminderActions={reminderActions}
      />
    );
  }

  function renderEdit() {
    if (id && (detail.isLoading || !detail.data)) {
      if (detail.isError) return <ErrorState onRetry={() => void detail.refetch()} />;
      return <Skeleton lines={8} />;
    }
    return (
      <HealthEventForm
        current={id ? (detail.data ?? undefined) : undefined}
        onSave={(values: HealthEventDraft) => actions.save(values)}
        onDone={finish}
        onReturn={returnToPrevious}
      />
    );
  }

  const pageBody =
    view === 'home'
      ? renderHome()
      : view === 'timeline'
        ? renderTimeline()
        : view === 'detail'
          ? renderDetail()
          : renderEdit();
  const topCopy = view === 'home' ? null : VIEW_COPY[view];

  return (
    <PageShell bottomNav={view === 'home'}>
      {view === 'home' ? (
        <AppTopBar
          title="健康事项"
          subtitle={`${babyName} · 记录与提醒`}
          gemAmount={gemAmount}
          onMenuClick={() => setDrawerOpen(true)}
        />
      ) : (
        <AppTopBar
          variant="standard"
          title={topCopy!.title}
          subtitle={topCopy!.subtitle}
          onBackClick={returnToPrevious}
        />
      )}
      <View className={`page-content ${styles.page}`}>{pageBody}</View>
      {view === 'home' ? (
        <BottomNav
          active={null}
          onSelect={(tab) => {
            openRootTab(tab);
          }}
          onAddClick={() => open('edit')}
        />
      ) : null}
      {view === 'home' ? (
        <AppDrawer
          open={drawerOpen}
          babyName={babyName}
          babyAgeLabel={babyAgeLabel}
          gemAmount={gemAmount}
          items={drawerItems()}
          onClose={() => setDrawerOpen(false)}
          onSearchClick={() => showToast('搜索正在布置')}
          onNotificationClick={() => {
            setDrawerOpen(false);
            void Taro.navigateTo({ url: '/pages/notifications/index' });
          }}
          onAdminClick={() => showToast('管理模式正在布置')}
        />
      ) : null}
    </PageShell>
  );
}

function HealthDetailPanel({
  item,
  onEdit,
  onBack,
  onComplete,
  onDelete,
  reminderActions,
}: {
  item: HealthEventView;
  onEdit: () => void;
  onBack: () => void;
  onComplete: () => Promise<void>;
  onDelete: () => Promise<void>;
  reminderActions: ReturnType<typeof useHealthReminderActions>;
}) {
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminders, setReminders] = useState<ReminderOffsetValue[]>(() =>
    reminderOffsetsFromEvent(item),
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const { showToast } = useUiOverlayStore();

  useEffect(() => {
    setReminders(reminderOffsetsFromEvent(item));
  }, [item]);

  async function saveReminders() {
    setWorking(true);
    try {
      await reminderActions.replace.mutateAsync({
        eventId: item.id,
        offsets: reminders,
        ifMatch: `"v${item.version}"`,
      });
      setReminderOpen(false);
      showToast('提醒安排已更新。');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : '提醒还没更新好，请联网后再试。',
      );
    } finally {
      setWorking(false);
    }
  }

  async function complete() {
    setWorking(true);
    try {
      await onComplete();
    } finally {
      setWorking(false);
    }
  }

  async function remove() {
    setWorking(true);
    try {
      await onDelete();
    } finally {
      setWorking(false);
      setDeleteOpen(false);
    }
  }

  const meta = HEALTH_TYPE_META[item.eventType] ?? HEALTH_TYPE_META.OTHER;
  const rows = eventDetailRows(item);
  const activeReminders = item.reminder?.offsets ?? [];
  const localReminderOnly = item.localReminderOnly === true;

  return (
    <View className={styles.pageStack}>
      <GlassSurface
        level="hero"
        tone={meta.tone}
        radius="hero"
        className={styles.detailHero}
      >
        <View className={styles.detailHeroTop}>
          <View className={styles.detailHeroIcon}>
            <Glyph name={meta.glyph} size="lg" />
          </View>
          <View className={styles.detailHeroCopy}>
            <Text className={styles.detailType}>{meta.label}</Text>
            <Text className={styles.detailTitle}>{item.title}</Text>
          </View>
          <HealthStatusBadge status={item.status} />
        </View>
        <Text className={styles.detailLead}>把下一步记清楚，就已经很棒了。</Text>
      </GlassSurface>

      <GlassSurface level="card" radius="card" className={styles.infoCard}>
        {rows.map((row) => (
          <View className={styles.infoRow} key={row.label}>
            <View className={styles.infoGlyph}>
              <Glyph name={row.glyph} size="sm" />
            </View>
            <Text className={styles.infoLabel}>{row.label}</Text>
            <Text className={styles.infoValue}>{row.value}</Text>
          </View>
        ))}
      </GlassSurface>

      <GlassSurface level="card" radius="card" className={styles.reminderCard}>
        <View className={styles.reminderHeading}>
          <Text className={`text-section-title ${styles.reminderHeadingTitle}`}>
            提醒安排
          </Text>
          <Text className={styles.reminderHeadingCaption}>
            {activeReminders.length > 0
              ? reminderSummary(activeReminders)
              : '想起时再加，不急'}
          </Text>
        </View>
        {activeReminders.length > 0 ? (
          activeReminders.map((reminder) => (
            <View className={styles.reminderRow} key={reminder.id}>
              <View className={styles.reminderGlyph}>
                <Glyph name="bell" size="sm" />
              </View>
              <Text className={styles.reminderText}>
                {formatReminderOffset(reminder.kind, reminder.customOffsetMinutes)}
              </Text>
              {reminder.allowDndOverride ? (
                <Text className={styles.reminderFlag}>重要提醒</Text>
              ) : null}
              {localReminderOnly ? (
                <Text className={styles.reminderFlag}>等待同步</Text>
              ) : (
                <View
                  className={styles.reminderRemove}
                  role="button"
                  aria-label="取消这条提醒"
                  onClick={() =>
                    void reminderActions.removeOne
                      .mutateAsync({ reminderId: reminder.id, eventId: item.id })
                      .then(() => showToast('这条提醒已取消。'))
                      .catch((error: unknown) =>
                        showToast(
                          error instanceof Error
                            ? error.message
                            : '提醒还没取消好，请再试一次。',
                        ),
                      )
                  }
                >
                  <Glyph name="close" size="sm" />
                </View>
              )}
            </View>
          ))
        ) : (
          <Text className={styles.reminderEmpty}>
            还没有提醒，润芽不会替你制造紧迫感。
          </Text>
        )}
      </GlassSurface>

      {item.pendingAttachment || item.attachments?.length ? (
        <GlassSurface level="card" radius="card" className={styles.attachmentCard}>
          <Text className={`text-section-title ${styles.reminderHeadingTitle}`}>
            附件
          </Text>
          {item.pendingAttachment ? (
            <HealthAttachmentPreview value={item.pendingAttachment} />
          ) : null}
          {(item.attachments ?? []).map((attachment) =>
            attachment.mediaId === item.pendingAttachment?.mediaId ? null : (
              <View className={styles.attachmentStatus} key={attachment.mediaId}>
                <Glyph name="photo" size="sm" />
                <Text>{attachment.status === 'READY' ? '已准备好' : '本机待上传'}</Text>
              </View>
            ),
          )}
        </GlassSurface>
      ) : null}

      <View className={styles.detailActions}>
        {item.status === 'UPCOMING' ? (
          <GlassSurface
            level="card"
            radius="card"
            interactive
            className={styles.detailActionCard}
          >
            <View
              className={`${styles.detailAction} ${styles.detailActionComplete}`}
              role="button"
              onClick={() => void complete()}
            >
              <Glyph name="heart" size="sm" />
              <Text>标记完成</Text>
            </View>
          </GlassSurface>
        ) : null}
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.detailActionCard}
        >
          <View
            className={`${styles.detailAction} ${styles.detailActionReminder}`}
            role="button"
            onClick={() => (localReminderOnly ? onEdit() : setReminderOpen(true))}
          >
            <Glyph name="bell" size="sm" />
            <Text>{localReminderOnly ? '编辑提醒' : '调整提醒'}</Text>
          </View>
        </GlassSurface>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.detailActionCard}
        >
          <View
            className={`${styles.detailAction} ${styles.detailActionEdit}`}
            role="button"
            onClick={onEdit}
          >
            <Glyph name="diary" size="sm" />
            <Text>编辑事项</Text>
          </View>
        </GlassSurface>
        <GlassSurface
          level="card"
          radius="card"
          interactive
          className={styles.detailActionCard}
        >
          <View
            className={`${styles.detailAction} ${styles.detailActionDanger}`}
            role="button"
            onClick={() => setDeleteOpen(true)}
          >
            <Glyph name="close" size="sm" />
            <Text>移到最近删除</Text>
          </View>
        </GlassSurface>
      </View>
      <TextAction label="返回健康时间线" onClick={onBack} />

      <HealthReminderSheet
        open={reminderOpen}
        value={reminders}
        onChange={setReminders}
        onClose={() => setReminderOpen(false)}
        onSave={() => void saveReminders()}
        saving={working && reminderOpen}
      />
      <ConfirmDialog
        open={deleteOpen}
        title="把这件事放进最近删除？"
        message="健康事项会先软删除，之后仍可从恢复入口找回。"
        confirmLabel="移到最近删除"
        danger
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void remove()}
      />
    </View>
  );
}
