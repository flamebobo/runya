import { Text, View } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import { CuteIconChip } from '@/components/foundation/CuteIconChip';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './QuickTile.module.scss';

export interface QuickTileProps {
  label: string;
  glyph: GlyphName;
  tone?: SemanticTone;
  onClick?: () => void;
  compact?: boolean;
  selected?: boolean;
}

export function QuickTile({
  label,
  glyph,
  tone = 'apricot',
  onClick,
  compact = false,
  selected = false,
}: QuickTileProps) {
  return (
    <GlassSurface
      level="card"
      radius="quick"
      interactive
      className={classNames(
        styles.tile,
        compact ? styles.compact : undefined,
        styles[`tone-${tone}`],
        selected ? styles.selected : undefined,
      )}
    >
      <View
        className={styles.hit}
        role="button"
        aria-label={label}
        aria-pressed={selected}
        onClick={onClick}
      >
        <View className={styles.iconWrap}>
          <CuteIconChip icon={glyph} tone={tone} size="sm" selected={selected} />
        </View>
        <Text className={styles.label}>{label}</Text>
      </View>
    </GlassSurface>
  );
}
