import { Image, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import type { DiaperType, MilkType, SemanticTone } from '@runew/domain-types';
import { stickerSmile, stickerStar } from '@/assets/figma';
import { PrimaryActionButton } from '@/components/buttons';
import {
  AmountStepper,
  FilterChip,
  GlassDateField,
  GlassInput,
  GlassTextArea,
  GlassTimeField,
} from '@/components/forms';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { PageShell } from '@/components/foundation/PageShell';
import { AppTopBar } from '@/components/navigation/AppTopBar';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { ChoiceCard } from '@/components/shell/ChoiceCard';
import { QuickTile } from '@/components/shell/QuickTile';
import {
  FeedingRunningBanner,
  SleepRunningBanner,
} from '@/components/records/RunningBanner';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { ApiError } from '@/api/client';
import {
  createBottle,
  createSleep,
  finishBreast,
  finishSleep,
  pauseBreast,
  resumeBreast,
  startBreast,
  startSleep,
  switchBreast,
} from '@/api/records';
import { useBootstrapQuery } from '@/hooks/useBootstrap';
import { useInvalidateCare, useTimelineQuery } from '@/hooks/useRecords';
import { useFamilyRuntimeStore, useSyncRuntimeStore } from '@/stores/runtime';
import { createRecordLocally } from '@/local/repository';
import { platformAdapters } from '@/adapters/platform';
import { BOTTLE_DEFAULT_ML } from '@/utils/amountStep';
import { friendlyRecordError } from '@/utils/friendlyRecordError';
import { combineLocalDateTime, dateFromMs, timeFromMs } from '@/utils/recordTime';
import styles from './index.module.scss';

type ComposeType = 'bottle' | 'breast' | 'sleep' | 'diaper' | 'food';

const TITLES: Record<ComposeType, { title: string; subtitle: string }> = {
  bottle: { title: '记一瓶奶', subtitle: '毫升数先记下，别的以后也能补' },
  breast: { title: '母乳计时', subtitle: '时长跟着时间走，锁屏也不怕丢' },
  sleep: { title: '睡眠', subtitle: '现在开始，或轻轻补上一觉' },
  diaper: { title: '换尿布', subtitle: '湿、便或都有，点一下就好' },
  food: { title: '辅食', subtitle: '今天吃了什么，慢慢收进来' },
};

const FOOD_AMOUNTS = ['一小口', '大约30g', '半碗', '一碗'] as const;

const DIAPER_OPTIONS: Array<{
  value: DiaperType;
  title: string;
  caption: string;
  tone: SemanticTone;
}> = [
  { value: 'WET', title: '湿', caption: '小小一泡', tone: 'sky' },
  { value: 'DIRTY', title: '便', caption: '换上干净的', tone: 'sage' },
  { value: 'BOTH', title: '湿+便', caption: '一次都收进来', tone: 'apricot' },
  { value: 'DRY', title: '干', caption: '看看就好', tone: 'lavender' },
];

function DateTimeFields({
  date,
  time,
  onDate,
  onTime,
  dateLabel = '日期',
  timeLabel = '时间',
}: {
  date: string;
  time: string;
  onDate: (value: string) => void;
  onTime: (value: string) => void;
  dateLabel?: string;
  timeLabel?: string;
}) {
  return (
    <View className={styles.timeFields}>
      <GlassDateField label={dateLabel} value={date} onChange={onDate} />
      <GlassTimeField label={timeLabel} value={time} onChange={onTime} />
    </View>
  );
}

function ComposeHero({
  tone,
  glyph,
  title,
  caption,
  highlight,
}: {
  tone: SemanticTone;
  glyph: GlyphName;
  title: string;
  caption: string;
  highlight?: string;
}) {
  return (
    <GlassSurface level="tinted" tone={tone} radius="heroLg" className={styles.hero}>
      <Image className={styles.heroStar} src={stickerStar} mode="aspectFit" />
      <Image className={styles.heroSmile} src={stickerSmile} mode="aspectFit" />
      <View className={styles.heroHit}>
        <View className={`${styles.heroIcon} ${styles[`heroIcon-${tone}`]}`}>
          <Glyph name={glyph} size="lg" />
        </View>
        {highlight ? <Text className={`text-page-title ${styles.heroHighlight}`}>{highlight}</Text> : null}
        <Text className={`text-section-title ${styles.heroTitle}`}>{title}</Text>
        <Text className={styles.heroCaption}>{caption}</Text>
      </View>
    </GlassSurface>
  );
}

export default function RecordComposePage() {
  return (
    <AppBootstrapGate>
      <ComposeBody />
    </AppBootstrapGate>
  );
}

function ComposeBody() {
  const router = useRouter();
  const type = (router.params.type as ComposeType | undefined) ?? 'bottle';
  const copy = TITLES[type] ?? TITLES.bottle;
  const babyId = useFamilyRuntimeStore((state) => state.babyId);
  const bootstrap = useBootstrapQuery(false);
  const invalidate = useInvalidateCare(babyId);
  const runningQuery = useTimelineQuery(babyId, { limit: 1 });
  const running = runningQuery.data?.running ?? bootstrap.data?.running;
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const now = useMemo(() => Date.now(), []);
  const [date, setDate] = useState(dateFromMs(now));
  const [time, setTime] = useState(timeFromMs(now));
  const [endDate, setEndDate] = useState(dateFromMs(now));
  const [endTime, setEndTime] = useState(timeFromMs(now));
  const [amount, setAmount] = useState(BOTTLE_DEFAULT_ML);
  const [milkType, setMilkType] = useState<MilkType>('FORMULA');
  const [diaperType, setDiaperType] = useState<DiaperType>('WET');
  const [foodName, setFoodName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [sleepMode, setSleepMode] = useState<'start' | 'manual'>('start');
  const [foodError, setFoodError] = useState(false);

  function goBack() {
    void Taro.navigateBack();
  }

  async function run(action: () => Promise<unknown>, stay = false) {
    if (!babyId) return;
    setLoading(true);
    setMessage('');
    try {
      const wasOffline = !(await platformAdapters.network.isOnline());
      await action();
      invalidate();
      if (wasOffline) {
        useSyncRuntimeStore.getState().setPhase('offline');
        setOfflineSaved(true);
      }
      if (!stay) goBack();
    } catch (error) {
      setMessage(
        friendlyRecordError(error instanceof ApiError ? error.message : '还没保存成功，请再试一次'),
      );
    } finally {
      setLoading(false);
    }
  }

  const saving = loading ? 'loading' : 'default';

  return (
    <PageShell>
      <AppTopBar
        variant="standard"
        title={copy.title}
        subtitle={copy.subtitle}
        onBackClick={goBack}
      />
      <View className={`page-content ${styles.page}`}>
        {type === 'bottle' ? (
          <View className={styles.stack}>
            <ComposeHero
              tone="apricot"
              glyph="bottle"
              title="记一瓶奶"
              caption="每次加减 30 毫升，轻轻点就好"
              highlight={`${amount} ml`}
            />
            <AmountStepper value={amount} onChange={setAmount} />
            <View className={styles.section}>
              <Text className={styles.sectionLabel}>奶的种类</Text>
              <View className={styles.milkRow}>
                <QuickTile
                  label="配方"
                  glyph="bottle"
                  tone="apricot"
                  compact
                  selected={milkType === 'FORMULA'}
                  onClick={() => setMilkType('FORMULA')}
                />
                <QuickTile
                  label="母乳"
                  glyph="heart"
                  tone="blush"
                  compact
                  selected={milkType === 'BREAST_MILK'}
                  onClick={() => setMilkType('BREAST_MILK')}
                />
                <QuickTile
                  label="混合"
                  glyph="sparkle"
                  tone="sage"
                  compact
                  selected={milkType === 'MIXED'}
                  onClick={() => setMilkType('MIXED')}
                />
              </View>
            </View>
            <GlassSurface level="card" radius="card" className={styles.panel}>
              <Text className={styles.panelTitle}>什么时候喝的</Text>
              <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} />
              <GlassTextArea label="备注" value={note} placeholder="可以不写" onInput={setNote} />
            </GlassSurface>
            <PrimaryActionButton
              label="收下这一瓶"
              state={saving}
              onClick={() =>
                run(() =>
                  createBottle(babyId!, {
                    amountMl: amount,
                    milkType,
                    recordedAt: combineLocalDateTime(date, time),
                    note: note || null,
                  }),
                )
              }
            />
          </View>
        ) : null}

        {type === 'breast' ? (
          running?.feeding ? (
            <FeedingRunningBanner
              feeding={running.feeding}
              onPause={() => run(() => pauseBreast(running.feeding!.id), true)}
              onResume={() => run(() => resumeBreast(running.feeding!.id), true)}
              onSwitch={() => run(() => switchBreast(running.feeding!.id), true)}
              onFinish={() => run(() => finishBreast(running.feeding!.id))}
            />
          ) : (
            <View className={styles.stack}>
              <ComposeHero
                tone="blush"
                glyph="heart"
                title="从哪一边开始"
                caption="点一张卡片，计时会跟着时间走"
              />
              <View className={styles.choiceGrid}>
                <ChoiceCard
                  title="左侧"
                  caption="轻轻开始计时"
                  glyph="heart"
                  tone="blush"
                  onClick={() => run(() => startBreast(babyId!, { side: 'LEFT' }), true)}
                />
                <ChoiceCard
                  title="右侧"
                  caption="轻轻开始计时"
                  glyph="heart"
                  tone="apricot"
                  onClick={() => run(() => startBreast(babyId!, { side: 'RIGHT' }), true)}
                />
              </View>
            </View>
          )
        ) : null}

        {type === 'sleep' ? (
          running?.sleep ? (
            <SleepRunningBanner
              sleep={running.sleep}
              onFinish={() => run(() => finishSleep(running.sleep!.id))}
            />
          ) : (
            <View className={styles.stack}>
              <ComposeHero
                tone="lavender"
                glyph="moon"
                title="宝宝睡着了吗"
                caption="现在开始，或把刚刚那一觉轻轻收进来"
              />
              <View className={styles.modeStack}>
                <ChoiceCard
                  title="现在开始"
                  caption="点一下，计时会跟着时间走"
                  glyph="moon"
                  tone="lavender"
                  selected={sleepMode === 'start'}
                  onClick={() => setSleepMode('start')}
                />
                <ChoiceCard
                  title="补录一觉"
                  caption="已经睡醒了，把这一觉收进来"
                  glyph="list"
                  tone="sage"
                  selected={sleepMode === 'manual'}
                  onClick={() => setSleepMode('manual')}
                />
              </View>
              {sleepMode === 'start' ? (
                <GlassSurface level="tinted" tone="lavender" radius="hero" className={styles.stage}>
                  <Text className={styles.stageClock}>00:00:00</Text>
                  <Text className={styles.stageHint}>睡着以后，时长会自己走。</Text>
                  <PrimaryActionButton
                    label="宝宝睡着了"
                    tone="lavender"
                    state={saving}
                    onClick={() => run(() => startSleep(babyId!), true)}
                  />
                </GlassSurface>
              ) : (
                <GlassSurface level="card" radius="card" className={styles.panel}>
                  <Text className={styles.panelTitle}>这一觉从何时到何时</Text>
                  <DateTimeFields
                    date={date}
                    time={time}
                    onDate={setDate}
                    onTime={setTime}
                    dateLabel="睡着"
                    timeLabel="睡着时刻"
                  />
                  <DateTimeFields
                    date={endDate}
                    time={endTime}
                    onDate={setEndDate}
                    onTime={setEndTime}
                    dateLabel="醒来"
                    timeLabel="醒来时刻"
                  />
                  <GlassTextArea label="备注" value={note} placeholder="可以不写" onInput={setNote} />
                  <PrimaryActionButton
                    label="收下这一觉"
                    tone="lavender"
                    state={saving}
                    onClick={() => {
                      const startedAt = combineLocalDateTime(date, time);
                      const endedAt = combineLocalDateTime(endDate, endTime);
                      if (endedAt <= startedAt) {
                        setMessage('醒来要比睡着晚一点点');
                        return;
                      }
                      void run(() =>
                        createSleep(babyId!, {
                          startedAt,
                          endedAt,
                          note: note || null,
                        }),
                      );
                    }}
                  />
                </GlassSurface>
              )}
            </View>
          )
        ) : null}

        {type === 'diaper' ? (
          <View className={styles.stack}>
            <ComposeHero
              tone="sage"
              glyph="diaper"
              title="换尿布"
              caption="湿、便或都有，点一张卡片就好"
            />
            <View className={styles.choiceGrid}>
              {DIAPER_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  title={option.title}
                  caption={option.caption}
                  glyph="diaper"
                  tone={option.tone}
                  selected={diaperType === option.value}
                  onClick={() => setDiaperType(option.value)}
                />
              ))}
            </View>
            <GlassSurface level="card" radius="card" className={styles.panel}>
              <Text className={styles.panelTitle}>什么时候换的</Text>
              <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} />
              <GlassTextArea label="备注" value={note} placeholder="可以不写" onInput={setNote} />
            </GlassSurface>
            <PrimaryActionButton
              label="收下这一次"
              tone="sage"
              state={saving}
              onClick={() =>
                run(async () => {
                  // Local-first：先落本地 + pending，恢复网络后自动同步（M3 核心）。
                  await createRecordLocally('DIAPER_RECORD', {
                    babyId: babyId!,
                    diaperType,
                    recordedAt: combineLocalDateTime(date, time),
                    timezoneName: 'Asia/Shanghai',
                    note: note || null,
                  });
                })
              }
            />
          </View>
        ) : null}

        {type === 'food' ? (
          <View className={styles.stack}>
            <ComposeHero
              tone="blush"
              glyph="bowl"
              title="今天吃了什么"
              caption="先写下名字，分量可以慢慢补"
            />
            <GlassSurface level="card" radius="card" className={styles.panel}>
              <Text className={styles.panelTitle}>吃了什么</Text>
              <GlassInput
                label="食物"
                value={foodName}
                placeholder="例如 香蕉泥"
                error={foodError}
                onInput={(value) => {
                  setFoodName(value);
                  if (foodError && value.trim()) setFoodError(false);
                }}
              />
              <View className={styles.section}>
                <Text className={styles.sectionLabel}>大约分量</Text>
                <View className={styles.presetsGrid}>
                  {FOOD_AMOUNTS.map((item) => (
                    <FilterChip
                      key={item}
                      label={item}
                      selected={amountText === item}
                      onClick={() => setAmountText(item === amountText ? '' : item)}
                    />
                  ))}
                </View>
              </View>
            </GlassSurface>
            <GlassSurface level="card" radius="card" className={styles.panel}>
              <Text className={styles.panelTitle}>什么时候吃的</Text>
              <DateTimeFields date={date} time={time} onDate={setDate} onTime={setTime} />
              <GlassTextArea label="备注" value={note} placeholder="可以不写" onInput={setNote} />
            </GlassSurface>
            <PrimaryActionButton
              label="收下这一口"
              tone="blush"
              state={saving}
              onClick={() => {
                if (!foodName.trim()) {
                  setFoodError(true);
                  setMessage('先写一写今天吃了什么');
                  return;
                }
                void run(async () => {
                  if (!foodName.trim()) {
                    setFoodError(true);
                    setMessage('先写一写今天吃了什么');
                    return;
                  }
                  // Local-first：辅食与尿布同路径，先本地后同步。
                  await createRecordLocally('FOOD_RECORD', {
                    babyId: babyId!,
                    foodName: foodName.trim(),
                    amountText: amountText || null,
                    recordedAt: combineLocalDateTime(date, time),
                    timezoneName: 'Asia/Shanghai',
                    note: note || null,
                  });
                });
              }}
            />
          </View>
        ) : null}

        {message ? (
          <Text className={styles.error} aria-live="polite">
            {message}
          </Text>
        ) : null}
        {offlineSaved && !message ? (
          <Text className={styles.offlineSaved} aria-live="polite">
            已保存在本机，联网后会自动同步 🌱
          </Text>
        ) : null}
      </View>
    </PageShell>
  );
}
