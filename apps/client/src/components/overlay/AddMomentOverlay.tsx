import { Text, View } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { GemBadge } from '@/components/navigation/GemBadge';
import { RoundIconButton } from '@/components/navigation/RoundIconButton';
import { PageAmbient } from '@/components/shell/PageAmbient';
import { QuickTile } from '@/components/shell/QuickTile';
import classNames from '@/utils/classNames';
import styles from './AddMomentOverlay.module.scss';

export interface AddMomentOverlayProps {
  open: boolean;
  gemAmount?: number;
  onClose?: () => void;
  onSelect?: (actionId: string) => void;
}

const ACTIONS: Array<{ id: string; label: string; glyph: GlyphName; tone: SemanticTone }> = [
  { id: 'feeding', label: '喂奶', glyph: 'bottle', tone: 'apricot' },
  { id: 'sleep', label: '睡眠', glyph: 'moon', tone: 'lavender' },
  { id: 'diaper', label: '尿布', glyph: 'diaper', tone: 'sage' },
  { id: 'food', label: '辅食', glyph: 'bowl', tone: 'blush' },
  { id: 'growth', label: '成长', glyph: 'growth', tone: 'sage' },
  { id: 'memory', label: '回忆', glyph: 'photo', tone: 'sky' },
  { id: 'mood', label: '心情', glyph: 'smile', tone: 'blush' },
  { id: 'diary', label: '日记', glyph: 'diary', tone: 'apricot' },
];

export function AddMomentOverlay({
  open,
  gemAmount = 0,
  onClose,
  onSelect,
}: AddMomentOverlayProps) {
  return (
    <View
      className={classNames(styles.overlay, open ? styles.overlayOpen : undefined)}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? 'true' : undefined}
      aria-hidden={!open}
      aria-label="留下这一刻"
    >
      <PageAmbient />
      <View className={styles.header}>
        <RoundIconButton
          label="返回"
          icon={
            <View className={styles.backIcon}>
              <Glyph name="chevron" size="md" />
            </View>
          }
          onClick={onClose}
        />
        <View className={styles.titles}>
          <Text className={styles.title}>留下这一刻</Text>
          <Text className={styles.subtitle}>选一件想轻轻记下的小事</Text>
        </View>
        <GemBadge amount={gemAmount} />
      </View>
      <View className={styles.grid}>
        {ACTIONS.map((item) => (
          <View key={item.id} className={styles.cell}>
            <QuickTile
              label={item.label}
              glyph={item.glyph}
              tone={item.tone}
              compact
      onClick={() => onSelect?.(item.id)}
            />
          </View>
        ))}
      </View>
      <Text className={styles.hint}>
        先选一件想留下的小事，我们会好好接住。照片、声音和语录，都收进同一间回忆馆。
      </Text>
    </View>
  );
}
