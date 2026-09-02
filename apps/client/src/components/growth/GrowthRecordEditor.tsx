import { Text, View } from '@tarojs/components';
import type { CreateGrowthBody, GrowthRecordPublic } from '@runew/contracts';
import { useMemo, useState } from 'react';
import {
  DangerButton,
  PrimaryActionButton,
  SecondaryGlassButton,
} from '@/components/buttons';
import {
  GlassDateField,
  GlassInput,
  GlassTextArea,
  GlassTimeField,
} from '@/components/forms';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph } from '@/components/icons/Glyph';
import { ConfirmDialog } from '@/components/overlay';
import { SyncBadge } from '@/components/sync/SyncBar';
import { dateFromMs, timeFromMs, combineLocalDateTime } from '@/utils/recordTime';
import { formatGrowthDate, formatGrowthValue } from './constants';
import styles from './Growth.module.scss';

function numberValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'issues' in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    const message = issues?.[0]?.message;
    if (message) return message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface GrowthRecordEditorProps {
  current?: GrowthRecordPublic;
  onSave: (values: CreateGrowthBody, current?: GrowthRecordPublic) => Promise<unknown>;
  onRemove: (item: GrowthRecordPublic) => Promise<unknown>;
  onRestore: (item: GrowthRecordPublic) => Promise<unknown>;
  onDone: (message: string) => void;
  onReturn: () => void;
}

export function GrowthRecordEditor({
  current,
  onSave,
  onRemove,
  onRestore,
  onDone,
  onReturn,
}: GrowthRecordEditorProps) {
  const timestamp = useMemo(() => current?.recordedAt ?? Date.now(), [current?.recordedAt]);
  const [height, setHeight] = useState(current?.heightCm?.toString() ?? '');
  const [weight, setWeight] = useState(current?.weightKg?.toString() ?? '');
  const [head, setHead] = useState(current?.headCircumferenceCm?.toString() ?? '');
  const [date, setDate] = useState(dateFromMs(timestamp));
  const [time, setTime] = useState(timeFromMs(timestamp));
  const [note, setNote] = useState(current?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function save() {
    const heightCm = numberValue(height);
    const weightKg = numberValue(weight);
    const headCircumferenceCm = numberValue(head);
    if ([heightCm, weightKg, headCircumferenceCm].some(Number.isNaN)) {
      setMessage('数字要大于 0，再看一眼');
      return;
    }
    if (heightCm == null && weightKg == null && headCircumferenceCm == null) {
      setMessage('身高、体重、头围至少记下一项');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await onSave(
        {
          heightCm,
          weightKg,
          headCircumferenceCm,
          recordedAt: combineLocalDateTime(date, time),
          timezoneName: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
          note: note.trim() || null,
        },
        current,
      );
      onDone(current ? '修改已安全收好，正在和家人同步' : '成长记录已安全收好 🌱');
    } catch (error) {
      setMessage(errorMessage(error, '这次还没收好，请再试一次'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!current) return;
    setSaving(true);
    setMessage('');
    try {
      await onRemove(current);
      setConfirmOpen(false);
      setDeleted(true);
    } catch (error) {
      setMessage(errorMessage(error, '这次还没放进最近删除，请再试一次'));
    } finally {
      setSaving(false);
    }
  }

  async function restore() {
    if (!current) return;
    setSaving(true);
    setMessage('');
    try {
      await onRestore(current);
      setDeleted(false);
      onDone('成长记录已经回来了');
    } catch (error) {
      setMessage(errorMessage(error, '这次还没恢复，请再试一次'));
    } finally {
      setSaving(false);
    }
  }

  if (deleted) {
    return (
      <GlassSurface level="tinted" tone="blush" radius="hero" className={styles.deletedState}>
        <View className={styles.deletedIcon} aria-hidden>
          <Glyph name="growth" size="lg" />
        </View>
        <Text className={`text-section-title ${styles.deletedTitle}`}>已经放进最近删除</Text>
        <Text className={styles.deletedCaption}>30 天内都能找回来，现在恢复也来得及。</Text>
        <PrimaryActionButton
          label="恢复这条记录"
          tone="sage"
          state={saving ? 'loading' : 'default'}
          onClick={() => void restore()}
        />
        <SecondaryGlassButton label="返回成长" onClick={onReturn} />
      </GlassSurface>
    );
  }

  return (
    <View className={styles.stack}>
      {current ? (
        <GlassSurface level="tinted" tone="sage" radius="hero" className={styles.detailHero}>
          <View className={styles.detailHeroTop}>
            <Text className={styles.detailKicker}>成长记录</Text>
            <SyncBadge state={current.syncState} />
          </View>
          <Text className={`text-page-title ${styles.detailDate}`}>
            {formatGrowthDate(current.recordedAt)}
          </Text>
          <Text className={styles.detailSummary}>
            {[
              current.heightCm == null ? null : `${formatGrowthValue(current.heightCm)}cm`,
              current.weightKg == null ? null : `${formatGrowthValue(current.weightKg)}kg`,
              current.headCircumferenceCm == null
                ? null
                : `${formatGrowthValue(current.headCircumferenceCm)}cm`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </GlassSurface>
      ) : (
        <GlassSurface level="tinted" tone="sage" radius="hero" className={styles.composeHero}>
          <View className={styles.composeHeroIcon} aria-hidden>
            <Glyph name="growth" size="lg" />
          </View>
          <View>
            <Text className={`text-section-title ${styles.heroTitle}`}>今天长到哪里啦</Text>
            <Text className={styles.heroCaption}>知道哪一项就记哪一项，不用一次填满。</Text>
          </View>
        </GlassSurface>
      )}

      <GlassSurface level="card" radius="card" className={styles.formCard}>
        <Text className={styles.formTitle}>这次测量</Text>
        <View className={styles.measureGrid}>
          <View className={styles.measureField}>
            <GlassInput
              label="身高"
              value={height}
              type="digit"
              placeholder="例如 72.5"
              onInput={setHeight}
            />
            <Text className={styles.inputUnit}>cm</Text>
          </View>
          <View className={styles.measureField}>
            <GlassInput
              label="体重"
              value={weight}
              type="digit"
              placeholder="例如 8.6"
              onInput={setWeight}
            />
            <Text className={styles.inputUnit}>kg</Text>
          </View>
          <View className={styles.measureField}>
            <GlassInput
              label="头围"
              value={head}
              type="digit"
              placeholder="例如 44.8"
              onInput={setHead}
            />
            <Text className={styles.inputUnit}>cm</Text>
          </View>
        </View>
      </GlassSurface>

      <GlassSurface level="card" radius="card" className={styles.formCard}>
        <Text className={styles.formTitle}>什么时候量的</Text>
        <GlassDateField label="日期" value={date} onChange={setDate} />
        <GlassTimeField label="时间" value={time} onChange={setTime} />
        <GlassTextArea
          label="备注"
          value={note}
          placeholder="例如 刚洗完澡，心情很好"
          onInput={setNote}
        />
      </GlassSurface>

      {message ? (
        <Text className={styles.formError} aria-live="polite">
          {message}
        </Text>
      ) : null}
      <PrimaryActionButton
        label={current ? '保存修改' : '收下这次成长'}
        tone="sage"
        state={saving ? 'loading' : 'default'}
        onClick={() => void save()}
      />
      {current ? (
        <DangerButton label="删除这条记录" onClick={() => setConfirmOpen(true)} />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="放进最近删除？"
        message="这条成长记录会先收起来，30 天内还可以找回来。"
        confirmLabel="删除"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void remove()}
      />
    </View>
  );
}
