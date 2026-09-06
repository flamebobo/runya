import { Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type {
  CreateHealthEventBody,
  HealthEventPublic,
  HealthEventType,
  HealthReminderOffset,
} from '@runew/contracts';
import { useEffect, useState } from 'react';
import {
  BottomSheet,
  GlassDateField,
  GlassInput,
  GlassSurface,
  GlassTextArea,
  GlassTimeField,
  PrimaryActionButton,
  SecondaryGlassButton,
} from '@/components';
import { Glyph } from '@/components/icons/Glyph';
import { platformAdapters } from '@/adapters/platform';
import { useAutoDraft } from '@/hooks/useAutoDraft';
import { useAuthRuntimeStore, useFamilyRuntimeStore } from '@/stores/runtime';
import {
  createEphemeralPreviewUrl,
  getDurableMediaMetadata,
  saveDurableLocalMedia,
} from '@/local/mediaStorage';
import classNames from '@/utils/classNames';
import { formatReminderOffset, HEALTH_TYPE_META } from './HealthViews';
import styles from './Health.module.scss';

export type ReminderOffsetValue = {
  kind: HealthReminderOffset;
  customOffsetMinutes?: number;
  allowDndOverride?: boolean;
};

export interface PendingHealthAttachment {
  mediaId: string;
  localPath: string;
  role: 'HEALTH_ATTACHMENT';
  status: 'PENDING';
  originalFilename?: string;
  mimeType?: string;
}

export type HealthEventView = HealthEventPublic & {
  pendingAttachment?: PendingHealthAttachment;
  localReminderOnly?: boolean;
};

export type HealthEventDraft = CreateHealthEventBody & {
  id?: string;
  pendingAttachment?: PendingHealthAttachment | null;
};

const REMINDER_OPTIONS: Array<{ kind: HealthReminderOffset; label: string }> = [
  { kind: 'D7', label: '提前 7 天' },
  { kind: 'D3', label: '提前 3 天' },
  { kind: 'D1', label: '提前 1 天' },
  { kind: 'SAME_DAY', label: '当天提前 2 小时' },
  { kind: 'CUSTOM', label: '自定义提前时间' },
];

const EVENT_TYPES = Object.entries(HEALTH_TYPE_META) as Array<
  [HealthEventType, (typeof HEALTH_TYPE_META)[HealthEventType]]
>;

function isoDateOf(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function timeOf(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function initialDateTime(current?: HealthEventPublic) {
  const timestamp = current?.scheduledAt ?? Date.now() + 24 * 60 * 60 * 1000;
  return { date: isoDateOf(timestamp), time: timeOf(timestamp) };
}

function combineDateTime(date: string, time: string): number | null {
  const [year = NaN, month = NaN, day = NaN] = date.split('-').map(Number);
  const [hour = NaN, minute = NaN] = time.split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const value = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  return Number.isFinite(value) ? value : null;
}

export function reminderOffsetsFromEvent(
  current?: HealthEventPublic,
): ReminderOffsetValue[] {
  return (
    current?.reminder?.offsets.map((offset) => ({
      kind: offset.kind,
      customOffsetMinutes:
        offset.customOffsetMinutes == null ? undefined : offset.customOffsetMinutes,
      allowDndOverride: offset.allowDndOverride,
    })) ?? []
  );
}

export function reminderSummary(
  offsets: ReadonlyArray<{
    kind: HealthReminderOffset;
    customOffsetMinutes?: number | null;
  }>,
): string {
  if (offsets.length === 0) return '还没有设置提醒';
  return offsets
    .map((offset) =>
      formatReminderOffset(offset.kind, offset.customOffsetMinutes ?? null),
    )
    .join('、');
}

function updateReminder(
  offsets: ReminderOffsetValue[],
  kind: HealthReminderOffset,
  updater: (offset: ReminderOffsetValue) => ReminderOffsetValue,
) {
  return offsets.map((offset) => (offset.kind === kind ? updater(offset) : offset));
}

export function ReminderOptions({
  value,
  onChange,
}: {
  value: ReminderOffsetValue[];
  onChange: (value: ReminderOffsetValue[]) => void;
}) {
  function toggle(kind: HealthReminderOffset) {
    const existing = value.some((offset) => offset.kind === kind);
    if (existing) {
      onChange(value.filter((offset) => offset.kind !== kind));
      return;
    }
    onChange([
      ...value,
      {
        kind,
        ...(kind === 'CUSTOM' ? { customOffsetMinutes: 60 } : {}),
        allowDndOverride: false,
      },
    ]);
  }

  return (
    <View className={styles.offsetRow}>
      {REMINDER_OPTIONS.map((option) => {
        const selected = value.some((offset) => offset.kind === option.kind);
        return (
          <View
            key={option.kind}
            className={classNames(
              styles.offsetChip,
              selected ? styles.offsetChipSelected : undefined,
            )}
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(option.kind)}
          >
            <Text>{option.label}</Text>
            <View className={styles.offsetCheck} aria-hidden>
              {selected ? <Glyph name="heart" size="sm" /> : null}
            </View>
          </View>
        );
      })}
      {value
        .filter((offset) => offset.kind === 'CUSTOM')
        .map((offset) => (
          <GlassInput
            key="custom-minutes"
            label="自定义提前分钟数"
            value={String(offset.customOffsetMinutes ?? 60)}
            type="number"
            onInput={(input) => {
              const minutes = Math.max(0, Math.min(43_200, Number(input) || 0));
              onChange(
                updateReminder(value, 'CUSTOM', (item) => ({
                  ...item,
                  customOffsetMinutes: minutes,
                })),
              );
            }}
          />
        ))}
      <Text className={styles.sheetHint}>
        默认免打扰时间为 21:00—08:00。只有你明确打开的“重要健康提醒”才会在夜间送达。
      </Text>
      {value.map((offset) => (
        <View className={styles.dndOverrideRow} key={`${offset.kind}-override`}>
          <Glyph name="shield" size="sm" />
          <Text className={styles.dndOverrideText}>
            {formatReminderOffset(offset.kind, offset.customOffsetMinutes ?? null)}
            ：允许夜间送达
          </Text>
          <View
            className={classNames(
              styles.toggle,
              offset.allowDndOverride ? styles.toggleOn : undefined,
            )}
            role="switch"
            aria-checked={offset.allowDndOverride === true}
            aria-label={`${formatReminderOffset(offset.kind, offset.customOffsetMinutes ?? null)}允许夜间送达`}
            onClick={() =>
              onChange(
                updateReminder(value, offset.kind, (item) => ({
                  ...item,
                  allowDndOverride: !item.allowDndOverride,
                })),
              )
            }
          >
            <View className={styles.toggleKnob} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function HealthReminderSheet({
  open,
  value,
  onChange,
  onClose,
  onSave,
  saving = false,
}: {
  open: boolean;
  value: ReminderOffsetValue[];
  onChange: (value: ReminderOffsetValue[]) => void;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
}) {
  return (
    <BottomSheet open={open} title="什么时候轻轻提醒？" onClose={onClose}>
      <ReminderOptions value={value} onChange={onChange} />
      <PrimaryActionButton
        label="保存提醒设置"
        state={saving ? 'loading' : 'default'}
        onClick={onSave}
      />
    </BottomSheet>
  );
}

export function MediaAttachmentPicker({
  value,
  onChange,
  onMessage,
}: {
  value?: PendingHealthAttachment;
  onChange: (value: PendingHealthAttachment | undefined) => void;
  onMessage: (message: string) => void;
}) {
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [working, setWorking] = useState(false);

  async function choose() {
    setPermissionOpen(false);
    setWorking(true);
    try {
      const permission = await platformAdapters.permission.requestAlbum();
      if (permission !== 'granted') {
        onMessage('需要相册权限后，才能选择健康事项附件。');
        return;
      }
      const selected = await platformAdapters.mediaPicker.pickImage();
      if (!selected) return;
      const media = selected.file
        ? await saveDurableLocalMedia(selected.file, selected.mimeType || 'image/jpeg')
        : selected.localPath
          ? await saveDurableLocalMedia(
              selected.localPath,
              selected.mimeType || 'image/jpeg',
            )
          : null;
      if (!media) {
        onMessage('没有读到这份附件，先保留在选择器里，稍后可以再试。');
        return;
      }
      onChange({
        mediaId: media.localId,
        localPath: media.durablePath,
        role: 'HEALTH_ATTACHMENT',
        status: 'PENDING',
        originalFilename: media.originalFilename,
        mimeType: media.mimeType,
      });
      onMessage('附件已留在本机，媒体服务接入后再继续上传。');
    } catch {
      onMessage('附件先留在原处，稍后可以再试。');
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <View className={styles.attachmentPlaceholder}>
        <Glyph name="photo" size="md" className={styles.attachmentGlyph} />
        <View className={styles.attachmentCopy}>
          <Text className={styles.attachmentTitle}>
            {value ? '附件已在本机留存' : '添加照片或资料'}
          </Text>
          <Text className={styles.attachmentCaption}>
            {value
              ? '等待媒体服务接手，不会显示为已上传。'
              : '先接入本机媒体适配器，上传状态会如实显示。'}
          </Text>
        </View>
        <SecondaryGlassButton
          label={working ? '处理中' : value ? '重新选择' : '选择'}
          state={working ? 'loading' : 'default'}
          fullWidth={false}
          onClick={() => setPermissionOpen(true)}
        />
      </View>
      {value ? (
        <View className={styles.attachmentPending} role="status">
          <Glyph name="sparkle" size="sm" />
          <Text>本机待上传 · {value.mediaId.slice(-6)}</Text>
          <View
            className={styles.attachmentRemove}
            role="button"
            aria-label="移除附件"
            onClick={() => onChange(undefined)}
          >
            <Glyph name="close" size="sm" />
          </View>
        </View>
      ) : null}
      <BottomSheet
        open={permissionOpen}
        title="给附件一点空间"
        onClose={() => setPermissionOpen(false)}
      >
        <Text className={styles.permissionCopy}>
          润芽只会在你选择附件时请求相册权限；选中的内容先保存在本机，媒体服务完成前不会显示“上传成功”。
        </Text>
        <PrimaryActionButton label="继续选择" onClick={() => void choose()} />
        <SecondaryGlassButton label="先不选" onClick={() => setPermissionOpen(false)} />
      </BottomSheet>
    </>
  );
}

export function HealthAttachmentPreview({
  value,
}: {
  value?: PendingHealthAttachment;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaId = value?.mediaId;
  const localPath = value?.localPath;

  useEffect(() => {
    let disposed = false;
    let ephemeralUrl: string | null = null;
    setPreviewUrl(null);
    if (!mediaId) return undefined;

    const load = async () => {
      try {
        const record = await getDurableMediaMetadata(mediaId);
        if (!record) return;
        const url = await createEphemeralPreviewUrl(record);
        if (disposed) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url);
          return;
        }
        ephemeralUrl = url.startsWith('blob:') ? url : null;
        setPreviewUrl(url);
      } catch {
        // 预览失败不影响本机文件和同步状态；详情仍显示待上传提示。
      }
    };
    void load();

    return () => {
      disposed = true;
      if (ephemeralUrl) URL.revokeObjectURL(ephemeralUrl);
    };
  }, [localPath, mediaId]);

  async function openPreview() {
    if (!previewUrl) return;
    try {
      await Taro.previewImage({ current: previewUrl, urls: [previewUrl] });
    } catch {
      if (typeof window !== 'undefined')
        window.open(previewUrl, '_blank', 'noopener,noreferrer');
    }
  }

  if (!value) return null;
  return (
    <View className={styles.attachmentPreviewWrap}>
      {previewUrl ? (
        <Image
          className={styles.attachmentPreview}
          src={previewUrl}
          mode="aspectFill"
          aria-label="预览健康事项附件"
          onClick={() => void openPreview()}
        />
      ) : (
        <View className={styles.attachmentPreviewFallback} aria-hidden>
          <Glyph name="photo" size="md" />
        </View>
      )}
      <View className={styles.attachmentPreviewCopy}>
        <Text className={styles.attachmentPreviewTitle}>
          {value.originalFilename || '健康事项附件'}
        </Text>
        <Text className={styles.attachmentPreviewCaption}>
          本机待上传 · 点击图片可预览
        </Text>
      </View>
    </View>
  );
}

export function HealthEventForm({
  current,
  onSave,
  onDone,
  onReturn,
}: {
  current?: HealthEventView;
  onSave: (values: HealthEventDraft) => Promise<unknown>;
  onDone: (message: string) => void;
  onReturn: () => void;
}) {
  const initialDateTime = initialDateTimeOf(current);
  const [eventType, setEventType] = useState<HealthEventType>(
    current?.eventType ?? 'CHECKUP',
  );
  const [title, setTitle] = useState(current?.title ?? '');
  const [date, setDate] = useState(initialDateTime.date);
  const [time, setTime] = useState(initialDateTime.time);
  const [locationName, setLocationName] = useState(current?.locationName ?? '');
  const [locationAddress, setLocationAddress] = useState(
    current?.locationAddress ?? '',
  );
  const [doctorName, setDoctorName] = useState(current?.doctorName ?? '');
  const [note, setNote] = useState(current?.note ?? '');
  const [reminders, setReminders] = useState<ReminderOffsetValue[]>(
    reminderOffsetsFromEvent(current),
  );
  const [attachment, setAttachment] = useState<PendingHealthAttachment | undefined>(
    current?.pendingAttachment,
  );
  const [reminderOpen, setReminderOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const userId = useAuthRuntimeStore((state) => state.userId) ?? 'anonymous';
  const familyId = useFamilyRuntimeStore((state) => state.familyId) ?? 'none';

  // AGENTS §53：Health Note 长文本需要本地草稿；编辑草稿携带服务端版本，避免静默覆盖。
  // useAutoDraft 自带 debounce + useDidHide + 卸载落盘；保存成功后 clear。
  const healthDraft = useAutoDraft<{ note: string }>({
    key: `health_note:${userId}:${familyId}:${current?.id ?? 'new'}`,
    values: { note },
    serverVersion: current?.version,
  });
  const [healthDraftApplied, setHealthDraftApplied] = useState(false);
  useEffect(() => {
    if (healthDraftApplied || !healthDraft.restored) return;
    const draftNote = healthDraft.restored.note;
    if (typeof draftNote === 'string') {
      setNote(draftNote);
      if (draftNote.trim()) setMessage('已恢复上次没写完的备注');
    }
    setHealthDraftApplied(true);
  }, [healthDraft.restored, healthDraftApplied]);

  async function submit() {
    if (healthDraft.conflict) {
      setError('这条备注已在别处更新，请先查看最新版本后再修改。');
      return;
    }
    const trimmedTitle = title.trim();
    const scheduledAt = combineDateTime(date, time);
    if (!trimmedTitle) {
      setError('给这个事项取个名字吧。');
      return;
    }
    if (!scheduledAt) {
      setError('日期和时间还没选好。');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({
        ...(current ? { id: current.id } : {}),
        eventType,
        title: trimmedTitle,
        scheduledAt,
        timezoneName: 'Asia/Shanghai',
        locationName: locationName.trim() || null,
        locationAddress: locationAddress.trim() || null,
        doctorName: doctorName.trim() || null,
        note: note.trim() || null,
        reminder: { offsets: reminders },
        ...(current?.pendingAttachment
          ? { pendingAttachment: attachment ?? null }
          : attachment
            ? { pendingAttachment: attachment }
            : {}),
      });
      await healthDraft.clear();
      onDone(
        attachment
          ? `${current ? '健康事项已更新' : '健康事项已保存'}，附件在本机等待媒体服务。`
          : current
            ? '健康事项已更新。'
            : '健康事项已保存。',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '还没保存好，请再试一次。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className={styles.formStack}>
      <GlassSurface
        level="tinted"
        tone="apricot"
        radius="hero"
        className={styles.formSection}
      >
        <Text className={`text-section-title ${styles.formSectionTitle}`}>
          先选一个温柔的分类
        </Text>
        <View className={styles.typeGrid} role="radiogroup" aria-label="健康事项类型">
          {EVENT_TYPES.map(([type, meta]) => (
            <View
              key={type}
              className={classNames(
                styles.typeCell,
                eventType === type ? styles.typeCellSelected : undefined,
              )}
              role="radio"
              aria-checked={eventType === type}
              onClick={() => setEventType(type)}
            >
              <View
                className={classNames(
                  styles.typeCellIcon,
                  {
                    apricot: styles.chipApricot,
                    sage: styles.chipSage,
                    lavender: styles.chipLavender,
                    sky: styles.chipSky,
                    blush: styles.chipBlush,
                  }[meta.tone],
                )}
              >
                <Glyph name={meta.glyph} size="sm" />
              </View>
              <Text>{meta.label}</Text>
            </View>
          ))}
        </View>
      </GlassSurface>

      {healthDraft.conflict ? (
        <GlassSurface
          level="tinted"
          tone="blush"
          radius="quick"
          className={classNames(styles.draftBanner, styles.draftConflictBanner)}
        >
          <Glyph name="shield" size="sm" />
          <View className={styles.draftBannerText} role="alert">
            <Text>这条备注已在别处更新，不能用旧草稿覆盖最新内容。</Text>
          </View>
          <SecondaryGlassButton
            label="丢弃草稿并查看最新版本"
            fullWidth={false}
            onClick={() => {
              void healthDraft.discard().then(() => {
                setNote(current?.note ?? '');
                setHealthDraftApplied(true);
                setError(null);
              });
            }}
          />
        </GlassSurface>
      ) : healthDraft.restored && healthDraft.restored.note ? (
        <GlassSurface level="tinted" tone="sky" radius="quick" className={styles.draftBanner}>
          <Glyph name="sparkle" size="sm" />
          <Text className={styles.draftBannerText}>已恢复上次没写完的备注</Text>
          <SecondaryGlassButton
            label="丢弃草稿"
            fullWidth={false}
            onClick={() => {
              void healthDraft.discard().then(() => {
                setNote(current?.note ?? '');
                setHealthDraftApplied(true);
              });
            }}
          />
        </GlassSurface>
      ) : null}

      <GlassSurface level="card" radius="card" className={styles.formSection}>
        <GlassInput
          label="事项名称"
          value={title}
          placeholder="例如：下次儿保"
          onInput={setTitle}
        />
        <View className={styles.formColumns}>
          <GlassDateField
            label="日期"
            value={date}
            end="2099-12-31"
            onChange={setDate}
          />
          <GlassTimeField label="时间" value={time} onChange={setTime} />
        </View>
        <View className={styles.formColumns}>
          <GlassInput
            label="地点"
            value={locationName}
            placeholder="医院 / 药房（可选）"
            onInput={setLocationName}
          />
          <GlassInput
            label="医生"
            value={doctorName}
            placeholder="姓名（可选）"
            onInput={setDoctorName}
          />
        </View>
        <GlassInput
          label="地址"
          value={locationAddress}
          placeholder="地址（可选）"
          onInput={setLocationAddress}
        />
        <GlassTextArea
          label="备注"
          value={note}
          placeholder="把想记住的细节写在这里"
          onInput={setNote}
        />
      </GlassSurface>

      <GlassSurface level="card" radius="card" className={styles.formSection}>
        <View
          className={styles.reminderTrigger}
          role="button"
          aria-label="设置健康事项提醒"
          onClick={() => setReminderOpen(true)}
        >
          <View className={styles.reminderTriggerIcon}>
            <Glyph name="bell" size="md" />
          </View>
          <View className={styles.reminderTriggerBody}>
            <Text className={styles.reminderTriggerTitle}>提醒安排</Text>
            <Text className={styles.reminderTriggerSummary}>
              {reminderSummary(reminders)}
            </Text>
          </View>
          <Glyph name="chevron" size="sm" />
        </View>
        <MediaAttachmentPicker
          value={attachment}
          onChange={setAttachment}
          onMessage={setMessage}
        />
        {message ? <Text className={styles.formMessage}>{message}</Text> : null}
      </GlassSurface>

      {error ? <Text className={styles.formError}>{error}</Text> : null}
      <PrimaryActionButton
        label={current ? '保存修改' : '保存健康事项'}
        state={saving ? 'loading' : healthDraft.conflict ? 'disabled' : 'default'}
        icon={<Glyph name="heart" size="sm" />}
        onClick={() => void submit()}
      />
      <SecondaryGlassButton label="先不保存" onClick={onReturn} />

      <HealthReminderSheet
        open={reminderOpen}
        value={reminders}
        onChange={setReminders}
        onClose={() => setReminderOpen(false)}
        onSave={() => setReminderOpen(false)}
      />
    </View>
  );
}

function initialDateTimeOf(current?: HealthEventPublic) {
  return initialDateTime(current);
}
