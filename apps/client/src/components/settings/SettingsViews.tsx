import { Text, View } from '@tarojs/components';
import type {
  NotificationPreferences,
  UpdateNotificationPreferencesBody,
} from '@runew/contracts';
import type { GlyphName } from '@/components/icons/Glyph';
import { useState } from 'react';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { GlassTimeField } from '@/components/forms';
import { Glyph } from '@/components/icons/Glyph';
import { PrimaryActionButton } from '@/components/buttons';
import classNames from '@/utils/classNames';
import styles from './Settings.module.scss';

export type NotificationPreferenceKey =
  | 'healthEnabled'
  | 'familyTasksEnabled'
  | 'rewardsEnabled'
  | 'backupEnabled'
  | 'capsulesEnabled'
  | 'anniversariesEnabled';

const PREFERENCE_ROWS: Array<{
  key: NotificationPreferenceKey;
  label: string;
  caption: string;
  glyph: GlyphName;
  tone: 'sage' | 'sky' | 'apricot' | 'lavender' | 'blush';
}> = [
  {
    key: 'healthEnabled',
    label: '健康提醒',
    caption: '体检、疫苗、就诊和用药安排',
    glyph: 'heart',
    tone: 'sage',
  },
  {
    key: 'familyTasksEnabled',
    label: '家庭协作',
    caption: '一起做的事和轻轻的提醒',
    glyph: 'family',
    tone: 'sky',
  },
  {
    key: 'rewardsEnabled',
    label: '宝石奖励',
    caption: '家庭奖励的状态变化',
    glyph: 'gem',
    tone: 'apricot',
  },
  {
    key: 'backupEnabled',
    label: '备份消息',
    caption: '备份完成或需要留意时',
    glyph: 'shield',
    tone: 'lavender',
  },
  {
    key: 'capsulesEnabled',
    label: '时光胶囊',
    caption: '胶囊到了可以打开的日子',
    glyph: 'sparkle',
    tone: 'blush',
  },
  {
    key: 'anniversariesEnabled',
    label: '纪念日',
    caption: '值得记住的家庭日子',
    glyph: 'sparkle',
    tone: 'apricot',
  },
];

export function minutesToTime(minutes: number): string {
  const normalized = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function timeToMinutes(value: string): number {
  const [hour = NaN, minute = NaN] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return Math.max(0, Math.min(1439, hour * 60 + minute));
}

function Toggle({
  checked,
  label,
  onClick,
}: {
  checked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <View
      className={classNames(styles.toggle, checked ? styles.toggleOn : undefined)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
    >
      <View className={styles.toggleKnob} />
    </View>
  );
}

export function NotificationSettingsView({
  preferences,
  onToggle,
  onDnd,
  updating = false,
}: {
  preferences: NotificationPreferences;
  onToggle: (key: NotificationPreferenceKey, value: boolean) => void;
  onDnd: () => void;
  updating?: boolean;
}) {
  return (
    <View className={styles.stack}>
      <GlassSurface
        level="tinted"
        tone="sky"
        radius="hero"
        className={styles.settingsHero}
      >
        <View className={styles.heroArt} aria-hidden>
          <Glyph name="bell" size="lg" />
          <View className={styles.heroSpark}>
            <Glyph name="sparkle" size="sm" />
          </View>
        </View>
        <View className={styles.heroCopy}>
          <Text className={styles.heroTitle}>让消息刚刚好</Text>
          <Text className={styles.heroCaption}>只接收你想听见的，不用担心被催促。</Text>
        </View>
      </GlassSurface>
      <View className={styles.preferenceList}>
        {PREFERENCE_ROWS.map((item) => (
          <GlassSurface
            key={item.key}
            level="card"
            radius="card"
            className={styles.preferenceCard}
          >
            <View className={styles.preferenceRow}>
              <View
                className={classNames(
                  styles.preferenceIcon,
                  styles[`tone-${item.tone}`],
                )}
              >
                <Glyph name={item.glyph} size="sm" />
              </View>
              <View className={styles.preferenceCopy}>
                <Text className={styles.preferenceTitle}>{item.label}</Text>
                <Text className={styles.preferenceCaption}>{item.caption}</Text>
              </View>
              <Toggle
                checked={preferences[item.key]}
                label={`${item.label}通知`}
                onClick={() => onToggle(item.key, !preferences[item.key])}
              />
            </View>
          </GlassSurface>
        ))}
      </View>
      <GlassSurface level="card" radius="card" interactive className={styles.dndLink}>
        <View
          className={styles.preferenceRow}
          role="button"
          aria-label="设置免打扰时间"
          onClick={onDnd}
        >
          <View className={classNames(styles.preferenceIcon, styles['tone-lavender'])}>
            <Glyph name="moon" size="sm" />
          </View>
          <View className={styles.preferenceCopy}>
            <Text className={styles.preferenceTitle}>免打扰时间</Text>
            <Text className={styles.preferenceCaption}>
              {preferences.dndEnabled
                ? `${minutesToTime(preferences.dndStartMinute)}—${minutesToTime(preferences.dndEndMinute)}，夜里安静一点`
                : '暂时关闭免打扰'}
            </Text>
          </View>
          <Glyph name="chevron" size="sm" />
        </View>
      </GlassSurface>
      {updating ? <Text className={styles.updateHint}>正在保存设置…</Text> : null}
    </View>
  );
}

export function DndSettingsView({
  preferences,
  onSave,
  saving = false,
}: {
  preferences: NotificationPreferences;
  onSave: (body: UpdateNotificationPreferencesBody) => Promise<void>;
  saving?: boolean;
}) {
  const [enabled, setEnabled] = useState(preferences.dndEnabled);
  const [start, setStart] = useState(minutesToTime(preferences.dndStartMinute));
  const [end, setEnd] = useState(minutesToTime(preferences.dndEndMinute));

  async function save() {
    await onSave({
      dndEnabled: enabled,
      dndStartMinute: timeToMinutes(start),
      dndEndMinute: timeToMinutes(end),
    });
  }

  return (
    <View className={styles.stack}>
      <GlassSurface
        level="tinted"
        tone="lavender"
        radius="hero"
        className={styles.dndHero}
      >
        <View className={styles.dndMoon} aria-hidden>
          <Glyph name="moon" size="lg" />
        </View>
        <View className={styles.heroCopy}>
          <Text className={styles.heroTitle}>夜里先好好休息</Text>
          <Text className={styles.heroCaption}>
            普通提醒会延后到早上，高优先健康提醒只在你明确允许时送达。
          </Text>
        </View>
      </GlassSurface>
      <GlassSurface level="card" radius="card" className={styles.formCard}>
        <View className={styles.switchHeading}>
          <View className={styles.preferenceCopy}>
            <Text className={styles.preferenceTitle}>开启免打扰</Text>
            <Text className={styles.preferenceCaption}>默认建议：21:00 到 08:00</Text>
          </View>
          <Toggle
            checked={enabled}
            label="开启免打扰"
            onClick={() => setEnabled(!enabled)}
          />
        </View>
        <View className={styles.formColumns}>
          <GlassTimeField label="开始" value={start} onChange={setStart} />
          <GlassTimeField label="结束" value={end} onChange={setEnd} />
        </View>
        <Text className={styles.dndHint}>
          跨过午夜的时间段也会正常工作；设置会保存在你的通知偏好中。
        </Text>
      </GlassSurface>
      <PrimaryActionButton
        label="保存免打扰设置"
        state={saving ? 'loading' : 'default'}
        icon={<Glyph name="moon" size="sm" />}
        onClick={() => void save()}
      />
    </View>
  );
}
