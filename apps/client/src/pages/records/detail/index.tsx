import { Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { useEffect, useState } from 'react';
import type { DiaperPublic, FeedingPublic, FoodPublic, SleepPublic } from '@runew/contracts';
import type { DiaperType, SemanticTone } from '@runew/domain-types';
import { formatDurationLabel } from '@runew/shared-utils';
import { DangerButton, PrimaryActionButton } from '@/components/buttons';
import {
  AmountStepper,
  FilterChip,
  GlassDateField,
  GlassInput,
  GlassTextArea,
  GlassTimeField,
} from '@/components/forms';
import { ErrorState, Skeleton } from '@/components/feedback';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { PageShell } from '@/components/foundation/PageShell';
import { AppTopBar } from '@/components/navigation/AppTopBar';
import { ConfirmDialog } from '@/components/overlay';
import { ChoiceCard } from '@/components/shell/ChoiceCard';
import { AppBootstrapGate } from '@/components/shell/AppBootstrapGate';
import { ApiError } from '@/api/client';
import {
  deleteDiaper,
  deleteFeeding,
  deleteFood,
  deleteSleep,
  getDiaper,
  getFeeding,
  getFood,
  getSleep,
  updateDiaper,
  updateFeeding,
  updateFood,
  updateSleep,
} from '@/api/records';
import { useInvalidateCare } from '@/hooks/useRecords';
import { useFamilyRuntimeStore } from '@/stores/runtime';
import { BOTTLE_DEFAULT_ML } from '@/utils/amountStep';
import { friendlyRecordError } from '@/utils/friendlyRecordError';
import { combineLocalDateTime, dateFromMs, formatClock, timeFromMs } from '@/utils/recordTime';
import styles from './index.module.scss';

type DetailKind = 'FEEDING' | 'SLEEP' | 'DIAPER' | 'FOOD';

const DIAPER_LABELS: Record<DiaperType, string> = {
  WET: '湿',
  DIRTY: '便',
  BOTH: '湿+便',
  DRY: '干',
};

const FOOD_AMOUNTS = ['一小口', '大约30g', '半碗', '一碗'] as const;

function heroTone(kind: DetailKind, feeding?: FeedingPublic | null): SemanticTone {
  if (kind === 'SLEEP') return 'lavender';
  if (kind === 'DIAPER') return 'sage';
  if (kind === 'FOOD') return 'blush';
  return feeding?.feedingType === 'BREAST' ? 'blush' : 'apricot';
}

export default function RecordDetailPage() {
  return (
    <AppBootstrapGate>
      <DetailBody />
    </AppBootstrapGate>
  );
}

function DetailBody() {
  const router = useRouter();
  const kind = (router.params.kind as DetailKind | undefined) ?? 'FEEDING';
  const id = router.params.id ?? '';
  const babyId = useFamilyRuntimeStore((state) => state.babyId);
  const invalidate = useInvalidateCare(babyId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [feeding, setFeeding] = useState<FeedingPublic | null>(null);
  const [sleep, setSleep] = useState<SleepPublic | null>(null);
  const [diaper, setDiaper] = useState<DiaperPublic | null>(null);
  const [food, setFood] = useState<FoodPublic | null>(null);
  const [amount, setAmount] = useState(BOTTLE_DEFAULT_ML);
  const [foodName, setFoodName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [diaperType, setDiaperType] = useState<DiaperPublic['diaperType']>('WET');
  const [foodError, setFoodError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        if (kind === 'FEEDING') {
          const data = await getFeeding(id);
          if (cancelled) return;
          setFeeding(data);
          setAmount(data.amountMl != null ? Math.round(data.amountMl) : BOTTLE_DEFAULT_ML);
          setNote(data.note ?? '');
          setDate(dateFromMs(data.recordedAt));
          setTime(timeFromMs(data.recordedAt));
        } else if (kind === 'SLEEP') {
          const data = await getSleep(id);
          if (cancelled) return;
          setSleep(data);
          setNote(data.note ?? '');
          setDate(dateFromMs(data.startedAt));
          setTime(timeFromMs(data.startedAt));
          if (data.endedAt) {
            setEndDate(dateFromMs(data.endedAt));
            setEndTime(timeFromMs(data.endedAt));
          }
        } else if (kind === 'DIAPER') {
          const data = await getDiaper(id);
          if (cancelled) return;
          setDiaper(data);
          setDiaperType(data.diaperType);
          setNote(data.note ?? '');
          setDate(dateFromMs(data.recordedAt));
          setTime(timeFromMs(data.recordedAt));
        } else {
          const data = await getFood(id);
          if (cancelled) return;
          setFood(data);
          setFoodName(data.foodName);
          setAmountText(data.amountText ?? '');
          setNote(data.note ?? '');
          setDate(dateFromMs(data.recordedAt));
          setTime(timeFromMs(data.recordedAt));
        }
      } catch (loadError) {
        setError(
          friendlyRecordError(loadError instanceof ApiError ? loadError.message : '暂时打不开这条记录'),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) void load();
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  async function save() {
    if (kind === 'FOOD' && !foodName.trim()) {
      setFoodError(true);
      setError('先写一写今天吃了什么');
      return;
    }
    if (kind === 'SLEEP' && sleep?.status === 'COMPLETED' && endDate && endTime) {
      const startedAt = combineLocalDateTime(date, time);
      const endedAt = combineLocalDateTime(endDate, endTime);
      if (endedAt <= startedAt) {
        setError('醒来要比睡着晚一点点');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      const recordedAt = combineLocalDateTime(date, time);
      if (kind === 'FEEDING' && feeding) {
        const updated = await updateFeeding(
          feeding.id,
          {
            amountMl: feeding.feedingType === 'BOTTLE' ? amount : undefined,
            recordedAt,
            note: note || null,
          },
          feeding.version,
        );
        setFeeding(updated);
      } else if (kind === 'SLEEP' && sleep) {
        const updated = await updateSleep(
          sleep.id,
          {
            startedAt: recordedAt,
            endedAt: endDate && endTime ? combineLocalDateTime(endDate, endTime) : sleep.endedAt,
            note: note || null,
          },
          sleep.version,
        );
        setSleep(updated);
      } else if (kind === 'DIAPER' && diaper) {
        const updated = await updateDiaper(
          diaper.id,
          { diaperType, recordedAt, note: note || null },
          diaper.version,
        );
        setDiaper(updated);
      } else if (kind === 'FOOD' && food) {
        const updated = await updateFood(
          food.id,
          { foodName: foodName.trim(), amountText: amountText || null, recordedAt, note: note || null },
          food.version,
        );
        setFood(updated);
      }
      invalidate();
    } catch (saveError) {
      setError(
        friendlyRecordError(saveError instanceof ApiError ? saveError.message : '还没保存成功，请再试一次'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      if (kind === 'FEEDING') await deleteFeeding(id);
      if (kind === 'SLEEP') await deleteSleep(id);
      if (kind === 'DIAPER') await deleteDiaper(id);
      if (kind === 'FOOD') await deleteFood(id);
      invalidate();
      setConfirmOpen(false);
      void Taro.navigateBack();
    } catch (deleteError) {
      setError(
        friendlyRecordError(deleteError instanceof ApiError ? deleteError.message : '还没删掉，请再试一次'),
      );
    } finally {
      setSaving(false);
    }
  }

  const title =
    kind === 'FEEDING'
      ? feeding?.feedingType === 'BREAST'
        ? '母乳'
        : '奶瓶'
      : kind === 'SLEEP'
        ? '睡眠'
        : kind === 'DIAPER'
          ? '尿布'
          : '辅食';

  const headline =
    kind === 'FEEDING' && feeding
      ? feeding.feedingType === 'BOTTLE'
        ? `${amount}ml`
        : formatDurationLabel(feeding.durationSeconds ?? 0)
      : kind === 'SLEEP' && sleep
        ? formatDurationLabel(sleep.durationSeconds ?? 0)
        : kind === 'DIAPER' && diaper
          ? DIAPER_LABELS[diaperType]
          : foodName || food?.foodName || '';

  const loadFailed = Boolean(error && !feeding && !sleep && !diaper && !food);

  return (
    <PageShell>
      <AppTopBar
        variant="standard"
        title="记录详情"
        subtitle="可以改一改，也可以轻轻放进最近删除"
        onBackClick={() => void Taro.navigateBack()}
      />
      <View className={`page-content ${styles.page}`}>
        {loading ? <Skeleton lines={6} /> : null}
        {!loading && loadFailed ? <ErrorState description={error} /> : null}
        {!loading && !loadFailed ? (
          <>
            <GlassSurface level="tinted" tone={heroTone(kind, feeding)} radius="hero" className={styles.hero}>
              <Text className={styles.kicker}>{title}</Text>
              <Text className={`text-page-title ${styles.title}`}>{headline}</Text>
              <Text className={styles.meta}>
                {date && time ? `${date.replace(/-/g, '.')} ${formatClock(combineLocalDateTime(date, time))}` : ''}
              </Text>
            </GlassSurface>
            <View className={styles.stack}>
              {kind === 'FEEDING' && feeding?.feedingType === 'BOTTLE' ? (
                <AmountStepper value={amount} onChange={setAmount} />
              ) : null}
              {kind === 'FOOD' ? (
                <GlassSurface level="card" radius="card" className={styles.panel}>
                  <GlassInput
                    label="食物"
                    value={foodName}
                    error={foodError}
                    onInput={(value) => {
                      setFoodName(value);
                      if (foodError && value.trim()) setFoodError(false);
                    }}
                  />
                  <View className={styles.chips}>
                    {FOOD_AMOUNTS.map((item) => (
                      <FilterChip
                        key={item}
                        label={item}
                        selected={amountText === item}
                        onClick={() => setAmountText(item === amountText ? '' : item)}
                      />
                    ))}
                  </View>
                </GlassSurface>
              ) : null}
              {kind === 'DIAPER' ? (
                <View className={styles.choiceGrid}>
                  {(Object.keys(DIAPER_LABELS) as DiaperType[]).map((value) => (
                    <ChoiceCard
                      key={value}
                      title={DIAPER_LABELS[value]}
                      glyph="diaper"
                      tone={value === 'DRY' ? 'sky' : 'sage'}
                      selected={diaperType === value}
                      onClick={() => setDiaperType(value)}
                    />
                  ))}
                </View>
              ) : null}
              <GlassSurface level="card" radius="card" className={styles.panel}>
                <GlassDateField label={kind === 'SLEEP' ? '睡着' : '日期'} value={date} onChange={setDate} />
                <GlassTimeField label={kind === 'SLEEP' ? '睡着时刻' : '时间'} value={time} onChange={setTime} />
                {kind === 'SLEEP' && sleep?.status === 'COMPLETED' ? (
                  <>
                    <GlassDateField label="醒来" value={endDate} onChange={setEndDate} />
                    <GlassTimeField label="醒来时刻" value={endTime} onChange={setEndTime} />
                  </>
                ) : null}
                <GlassTextArea label="备注" value={note} placeholder="可以不写" onInput={setNote} />
              </GlassSurface>
              {error ? (
                <Text className={styles.error} aria-live="polite">
                  {error}
                </Text>
              ) : null}
              <PrimaryActionButton
                label="保存修改"
                state={saving ? 'loading' : 'default'}
                onClick={() => void save()}
              />
              <DangerButton label="删除这条记录" onClick={() => setConfirmOpen(true)} />
            </View>
          </>
        ) : null}
      </View>
      <ConfirmDialog
        open={confirmOpen}
        title="放进最近删除？"
        message="这条记录会先收起来，30 天内还可以找回来。"
        confirmLabel="删除"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void remove()}
      />
    </PageShell>
  );
}
