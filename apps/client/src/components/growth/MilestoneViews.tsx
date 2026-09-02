import { Text, View } from '@tarojs/components';
import type {
  CreateMilestoneBody,
  MilestonePublic,
  MonthlyStoryResponse,
} from '@runew/contracts';
import type { SemanticTone } from '@runew/domain-types';
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
import { EmptyState } from '@/components/feedback';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { ConfirmDialog } from '@/components/overlay';
import { SyncBadge } from '@/components/sync/SyncBar';
import { combineLocalDateTime, dateFromMs, timeFromMs } from '@/utils/recordTime';
import {
  GROWTH_METRICS,
  formatGrowthDate,
  formatGrowthValue,
  formatMonthLabel,
} from './constants';
import styles from './Growth.module.scss';

interface MilestonePreset {
  title: string;
  glyph: GlyphName;
  tone: SemanticTone;
}

const MILESTONE_PRESETS: MilestonePreset[] = [
  { title: '第一次翻身', glyph: 'baby', tone: 'blush' },
  { title: '第一次独坐', glyph: 'sparkle', tone: 'lavender' },
  { title: '第一次爬行', glyph: 'growth', tone: 'sage' },
  { title: '第一次扶站', glyph: 'growth', tone: 'sage' },
  { title: '第一次走路', glyph: 'growth', tone: 'apricot' },
  { title: '第一次叫妈妈', glyph: 'quote', tone: 'blush' },
  { title: '长出第一颗牙', glyph: 'smile', tone: 'sky' },
  { title: '第一次旅行', glyph: 'photo', tone: 'apricot' },
];

function actionError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'issues' in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    const message = issues?.[0]?.message;
    if (message) return message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function KeepsakeArt({ compact = false }: { compact?: boolean }) {
  return (
    <View
      className={compact ? styles.keepsakeArtCompact : styles.keepsakeArt}
      aria-hidden
    >
      <View className={styles.keepsakeHalo} />
      <View className={styles.keepsakeEarLeft} />
      <View className={styles.keepsakeEarRight} />
      <View className={styles.keepsakeFace}>
        <View className={styles.keepsakeEyeLeft} />
        <View className={styles.keepsakeEyeRight} />
        <View className={styles.keepsakeSmile} />
      </View>
      <View className={styles.keepsakeSparkle}>
        <Glyph name="sparkle" size="sm" />
      </View>
    </View>
  );
}

function MilestoneRow({
  item,
  index,
  onClick,
}: {
  item: MilestonePublic;
  index: number;
  onClick: () => void;
}) {
  return (
    <View className={styles.milestoneTimelineItem}>
      <View className={styles.milestoneTimelineRail} aria-hidden>
        <View className={styles.milestoneTimelineStar}>
          <Glyph name="sparkle" size="sm" />
        </View>
      </View>
      <GlassSurface
        level="tinted"
        tone="lavender"
        radius="card"
        interactive
        className={styles.milestoneTimelineCard}
      >
        <View
          className={styles.milestoneRow}
          role="button"
          aria-label={`${item.title}，${formatGrowthDate(item.happenedAt)}`}
          onClick={onClick}
        >
          <View className={styles.recordBody}>
            <View className={styles.recordTitleRow}>
              <Text className={styles.milestoneOrdinal}>第 {index + 1} 颗成长星星</Text>
              <SyncBadge state={item.syncState} />
            </View>
            <Text className={styles.milestoneTitle}>{item.title}</Text>
            <Text className={styles.milestoneDate}>
              {formatGrowthDate(item.happenedAt, true)}
            </Text>
            {item.description ? (
              <Text className={styles.milestoneDescription}>{item.description}</Text>
            ) : null}
          </View>
          <View className={styles.rowChevron} aria-hidden>
            <Glyph name="chevron" size="sm" />
          </View>
        </View>
      </GlassSurface>
    </View>
  );
}

export function MilestoneListView({
  babyName,
  items,
  onCreate,
  onSelect,
}: {
  babyName: string;
  items: MilestonePublic[];
  onCreate: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <View className={styles.stack}>
      <GlassSurface
        level="tinted"
        tone="lavender"
        radius="heroLg"
        className={styles.milestoneListHero}
      >
        <View className={styles.milestoneHeroGlow} aria-hidden />
        <View className={styles.milestoneIntro}>
          <KeepsakeArt compact />
          <View className={styles.milestoneIntroCopy}>
            <Text className={styles.milestoneCollectionLabel}>
              {babyName}的成长星图
            </Text>
            <View
              className={styles.milestoneIntroHeading}
              role="heading"
              aria-level={2}
            >
              <Text className={`text-section-title ${styles.milestoneIntroTitle}`}>
                每个第一次，都值得被记住
              </Text>
            </View>
            <Text className={styles.heroCaption}>
              翻身、坐稳、开口，沿着时间慢慢收藏。
            </Text>
          </View>
        </View>
        <View className={styles.milestoneHeroFooter}>
          <Text>
            {items.length > 0
              ? `已点亮 ${items.length} 颗成长星星`
              : '第一颗星星正在等你'}
          </Text>
          <View className={styles.milestoneHeroSpark} aria-hidden>
            <Glyph name="sparkle" size="sm" />
          </View>
        </View>
      </GlassSurface>

      {items.length === 0 ? (
        <GlassSurface level="card" radius="card">
          <EmptyState
            title="第一颗小星星还在等你"
            description="从一个记得很清楚的第一次开始，就很好。"
            actionLabel="收藏一个第一次"
            onAction={onCreate}
          />
        </GlassSurface>
      ) : (
        <View className={styles.milestoneTimeline}>
          {items.map((item, index) => (
            <MilestoneRow
              key={item.id}
              item={item}
              index={index}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </View>
      )}
      <PrimaryActionButton
        label="记录第一次"
        tone="apricot"
        icon={<Glyph name="plus" size="sm" />}
        onClick={onCreate}
      />
    </View>
  );
}

export function MilestoneDetailView({
  item,
  onEdit,
}: {
  item: MilestonePublic;
  onEdit: () => void;
}) {
  return (
    <View className={styles.keepsakeDetail}>
      <GlassSurface
        level="tinted"
        tone="apricot"
        radius="heroLg"
        className={styles.keepsakeStage}
      >
        <View className={styles.keepsakeConfetti} aria-hidden>
          <View className={styles.confettiOne}>
            <Glyph name="sparkle" size="sm" />
          </View>
          <View className={styles.confettiTwo}>
            <Glyph name="sparkle" size="sm" />
          </View>
        </View>
        <Text className={styles.keepsakeBadge}>一颗珍贵的成长星星</Text>
        <KeepsakeArt />
        <View className={styles.keepsakeHeading} role="heading" aria-level={1}>
          <Text className={`text-page-title ${styles.keepsakeTitle}`}>
            {item.title}
          </Text>
        </View>
        <Text className={styles.keepsakeDate}>
          {formatGrowthDate(item.happenedAt, true)}
        </Text>
      </GlassSurface>

      <GlassSurface level="card" radius="card" className={styles.keepsakeStoryCard}>
        <View className={styles.keepsakeStoryHeader}>
          <View className={styles.storyMark} aria-hidden>
            <Glyph name="book" size="sm" />
          </View>
          <Text className={styles.factLabel}>那一天，家人记下</Text>
        </View>
        <Text className={styles.keepsakeStory}>
          {item.description || '这个瞬间已经收好，想起更多细节时，还可以慢慢补上。'}
        </Text>
      </GlassSurface>

      <GlassSurface
        level="tinted"
        tone="lavender"
        radius="card"
        className={styles.keepsakeMetaCard}
      >
        <View className={styles.keepsakeMetaItem}>
          <View className={styles.factIcon} aria-hidden>
            <Glyph name="sparkle" size="sm" />
          </View>
          <View className={styles.recordBody}>
            <Text className={styles.factLabel}>发生在</Text>
            <Text className={styles.factValue}>
              {formatGrowthDate(item.happenedAt, true)}
            </Text>
          </View>
        </View>
        <View className={styles.keepsakeMetaDivider} />
        <View className={styles.keepsakeMetaItem}>
          <View className={styles.factIcon} data-tone="sky" aria-hidden>
            <Glyph name="growth" size="sm" />
          </View>
          <View className={styles.recordBody}>
            <Text className={styles.factLabel}>收藏状态</Text>
            <View className={styles.keepsakeSync}>
              <SyncBadge state={item.syncState} />
            </View>
          </View>
        </View>
      </GlassSurface>

      <Text className={styles.keepsakeClosing}>
        第一次只有一次，幸好这一天被好好留下了。
      </Text>
      <PrimaryActionButton label="编辑这个里程碑" tone="lavender" onClick={onEdit} />
    </View>
  );
}

export interface MilestoneEditorProps {
  current?: MilestonePublic;
  onSave: (values: CreateMilestoneBody, current?: MilestonePublic) => Promise<unknown>;
  onRemove: (item: MilestonePublic) => Promise<unknown>;
  onRestore: (item: MilestonePublic) => Promise<unknown>;
  onDone: (message: string) => void;
  onReturn: () => void;
}

export function MilestoneEditor({
  current,
  onSave,
  onRemove,
  onRestore,
  onDone,
  onReturn,
}: MilestoneEditorProps) {
  const timestamp = useMemo(
    () => current?.happenedAt ?? Date.now(),
    [current?.happenedAt],
  );
  const [title, setTitle] = useState(current?.title ?? '');
  const [description, setDescription] = useState(current?.description ?? '');
  const [date, setDate] = useState(dateFromMs(timestamp));
  const [time, setTime] = useState(timeFromMs(timestamp));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function save() {
    if (!title.trim()) {
      setMessage('给这个第一次取个名字吧');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await onSave(
        {
          title: title.trim(),
          description: description.trim() || null,
          happenedAt: combineLocalDateTime(date, time),
          timezoneName:
            Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
          coverMediaId: current?.coverMediaId ?? null,
        },
        current,
      );
      onDone(current ? '里程碑修改已收好' : '新的第一次已经收藏起来 ✨');
    } catch (error) {
      setMessage(actionError(error, '这个第一次还没收好，请再试一次'));
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
      setMessage(actionError(error, '这次还没放进最近删除，请再试一次'));
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
      onDone('这个第一次已经回来了');
    } catch (error) {
      setMessage(actionError(error, '这次还没恢复，请再试一次'));
    } finally {
      setSaving(false);
    }
  }

  if (deleted) {
    return (
      <GlassSurface
        level="tinted"
        tone="blush"
        radius="hero"
        className={styles.deletedState}
      >
        <View className={styles.deletedIcon} aria-hidden>
          <Glyph name="sparkle" size="lg" />
        </View>
        <Text className={`text-section-title ${styles.deletedTitle}`}>
          已经放进最近删除
        </Text>
        <Text className={styles.deletedCaption}>这个第一次还在，30 天内都能恢复。</Text>
        <PrimaryActionButton
          label="恢复这个里程碑"
          tone="lavender"
          state={saving ? 'loading' : 'default'}
          onClick={() => void restore()}
        />
        <SecondaryGlassButton label="返回里程碑列表" onClick={onReturn} />
      </GlassSurface>
    );
  }

  return (
    <View className={styles.stack}>
      <GlassSurface
        level="tinted"
        tone="lavender"
        radius="hero"
        className={styles.milestoneComposeHero}
      >
        <View className={styles.milestoneHeroMark} aria-hidden>
          <Glyph name="sparkle" size="lg" />
        </View>
        <View>
          <View className={styles.detailHeroTop}>
            <Text className={`text-section-title ${styles.heroTitle}`}>
              {current ? current.title : '收藏一个新的第一次'}
            </Text>
            {current ? <SyncBadge state={current.syncState} /> : null}
          </View>
          <Text className={styles.heroCaption}>
            {current
              ? formatGrowthDate(current.happenedAt)
              : '写下真实发生的事，其他内容以后也能补。'}
          </Text>
        </View>
      </GlassSurface>

      <GlassSurface level="card" radius="card" className={styles.formCard}>
        <Text className={styles.formTitle}>这个第一次</Text>
        {!current ? (
          <View className={styles.milestonePresetSection}>
            <View className={styles.milestonePresetHeading}>
              <Text className={styles.milestonePresetTitle}>常见里程碑</Text>
              <Text className={styles.milestonePresetCaption}>
                先选一个，也可以继续修改名称
              </Text>
            </View>
            <View className={styles.milestonePresetGrid}>
              {MILESTONE_PRESETS.map((preset) => {
                const selected = title === preset.title;
                return (
                  <GlassSurface
                    key={preset.title}
                    level="tinted"
                    tone={preset.tone}
                    radius="quick"
                    interactive
                    className={selected ? styles.milestonePresetSelected : undefined}
                  >
                    <View
                      className={styles.milestonePresetButton}
                      role="button"
                      aria-label={preset.title}
                      aria-pressed={selected}
                      onClick={() => {
                        setTitle(preset.title);
                        setMessage('');
                      }}
                    >
                      <View
                        className={styles.milestonePresetIcon}
                        data-tone={preset.tone}
                        aria-hidden
                      >
                        <Glyph name={preset.glyph} size="sm" />
                      </View>
                      <Text className={styles.milestonePresetLabel}>
                        {preset.title}
                      </Text>
                    </View>
                  </GlassSurface>
                );
              })}
            </View>
          </View>
        ) : null}
        <GlassInput
          label="名称"
          value={title}
          placeholder="例如 第一次自己坐稳"
          error={Boolean(message && !title.trim())}
          onInput={(value) => {
            setTitle(value);
            if (value.trim()) setMessage('');
          }}
        />
        <GlassDateField label="日期" value={date} onChange={setDate} />
        <GlassTimeField label="时间" value={time} onChange={setTime} />
        <GlassTextArea
          label="想记住的细节"
          value={description}
          placeholder="当时发生了什么？可以慢慢写"
          onInput={setDescription}
        />
      </GlassSurface>

      {message ? (
        <Text className={styles.formError} aria-live="polite">
          {message}
        </Text>
      ) : null}
      <PrimaryActionButton
        label={current ? '保存修改' : '收藏这个第一次'}
        tone="lavender"
        state={saving ? 'loading' : 'default'}
        onClick={() => void save()}
      />
      {current ? (
        <DangerButton label="删除这个里程碑" onClick={() => setConfirmOpen(true)} />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="放进最近删除？"
        message="这个里程碑会先收起来，30 天内还可以找回来。"
        confirmLabel="删除"
        danger
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void remove()}
      />
    </View>
  );
}

export function MonthlyStoryView({
  story,
  onSelectMilestone,
}: {
  story: MonthlyStoryResponse;
  onSelectMilestone?: (id: string) => void;
}) {
  const hasStory = story.growthRecordCount > 0 || story.milestoneCount > 0;

  return (
    <View className={styles.monthlyStory}>
      <GlassSurface
        level="tinted"
        tone="apricot"
        radius="heroLg"
        className={styles.monthlyHero}
      >
        <View className={styles.monthlyArt} aria-hidden>
          <View className={styles.monthlySun} />
          <View className={styles.monthlySprout}>
            <Glyph name="growth" size="lg" />
          </View>
          <View className={styles.monthlyStar}>
            <Glyph name="sparkle" size="sm" />
          </View>
          <View className={styles.monthlyCloud} />
        </View>
        <Text className={styles.monthLabel}>
          {formatMonthLabel(story.month)} · 成长故事
        </Text>
        <View className={styles.monthlyHeading} role="heading" aria-level={1}>
          <Text className={`text-page-title ${styles.monthlyTitle}`}>
            {hasStory ? '这个月，又长大了一点' : '这个月，故事正在慢慢写'}
          </Text>
        </View>
        <Text className={styles.monthlySummary}>{story.summary}</Text>
        <View className={styles.monthlyCounts}>
          <View className={styles.monthlyCountItem}>
            <Text className={styles.monthlyCountValue}>{story.growthRecordCount}</Text>
            <Text className={styles.monthlyCountLabel}>次真实测量</Text>
          </View>
          <View className={styles.monthlyCountDivider} />
          <View className={styles.monthlyCountItem}>
            <Text className={styles.monthlyCountValue}>{story.milestoneCount}</Text>
            <Text className={styles.monthlyCountLabel}>个珍贵第一次</Text>
          </View>
        </View>
        <Text className={styles.monthlySource}>只取自家人留下的真实记录</Text>
      </GlassSurface>

      {story.changes.length > 0 ? (
        <GlassSurface level="card" radius="card" className={styles.monthlyChapter}>
          <View className={styles.chapterHeading}>
            <View className={styles.chapterIcon} aria-hidden>
              <Glyph name="growth" size="sm" />
            </View>
            <View>
              <Text className={styles.chapterKicker}>小小的变化</Text>
              <Text className={`text-section-title ${styles.chapterTitle}`}>
                数字也在说长大的故事
              </Text>
            </View>
          </View>
          <View className={styles.monthlyRows}>
            {story.changes.map((change) => {
              const definition = GROWTH_METRICS[change.metric];
              return (
                <View key={change.metric} className={styles.monthlyRow}>
                  <View
                    className={styles.monthlyRowIcon}
                    data-metric={change.metric}
                    aria-hidden
                  >
                    <Glyph name="growth" size="sm" />
                  </View>
                  <View className={styles.recordBody}>
                    <Text className={styles.monthlyRowTitle}>
                      {definition.shortLabel}
                    </Text>
                    <Text className={styles.changeRange}>
                      {formatGrowthValue(change.first)} →{' '}
                      {formatGrowthValue(change.latest)} {change.unit}
                    </Text>
                  </View>
                  <Text className={styles.changeDelta}>
                    {change.delta > 0 ? '+' : ''}
                    {formatGrowthValue(change.delta)} {change.unit}
                  </Text>
                </View>
              );
            })}
          </View>
        </GlassSurface>
      ) : null}

      {story.milestones.length > 0 ? (
        <GlassSurface
          level="tinted"
          tone="lavender"
          radius="card"
          className={styles.monthlyChapter}
        >
          <View className={styles.chapterHeading}>
            <View className={styles.chapterIcon} data-tone="lavender" aria-hidden>
              <Glyph name="sparkle" size="sm" />
            </View>
            <View>
              <Text className={styles.chapterKicker}>第一次收藏</Text>
              <Text className={`text-section-title ${styles.chapterTitle}`}>
                这个月亮起的新星星
              </Text>
            </View>
          </View>
          <View className={styles.storyMilestones}>
            {story.milestones.map((item) => (
              <View
                key={item.id}
                className={styles.storyMilestone}
                role={onSelectMilestone ? 'button' : undefined}
                aria-label={onSelectMilestone ? `查看${item.title}` : undefined}
                onClick={() => onSelectMilestone?.(item.id)}
              >
                <View className={styles.storyMilestoneStar} aria-hidden>
                  <Glyph name="sparkle" size="sm" />
                </View>
                <View className={styles.recordBody}>
                  <Text className={styles.milestoneTitle}>{item.title}</Text>
                  <Text className={styles.milestoneDate}>
                    {formatGrowthDate(item.happenedAt)}
                  </Text>
                  {item.description ? (
                    <Text className={styles.storyMilestoneDescription}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                {onSelectMilestone ? (
                  <View className={styles.rowChevron} aria-hidden>
                    <Glyph name="chevron" size="sm" />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </GlassSurface>
      ) : null}

      {!hasStory ? (
        <GlassSurface level="card" radius="card" className={styles.quietCard}>
          <Glyph name="book" size="lg" />
          <Text className={styles.quietTitle}>这一页还留着一点空白</Text>
          <Text className={styles.quietCaption}>
            下一次测量或新的第一次，会自动写进这个月。
          </Text>
        </GlassSurface>
      ) : (
        <View className={styles.monthlyEnding}>
          <View className={styles.monthlyEndingLine} />
          <Text>每一点变化，都有家人在身边接住。</Text>
          <View className={styles.monthlyEndingSpark} aria-hidden>
            <Glyph name="sparkle" size="sm" />
          </View>
        </View>
      )}
    </View>
  );
}
