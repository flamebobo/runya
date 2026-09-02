import { Text, View } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './QuickTile.module.scss';

export interface QuickTileProps {
  label: string;
  glyph: GlyphName;
  tone?: SemanticTone;
  onClick?: () => void;
  compact?: boolean;
}

export function QuickTile({
  label,
  glyph,
  tone = 'apricot',
  onClick,
  compact = false,
}: QuickTileProps) {
  return (
    <GlassSurface
      level="card"
      radius="quick"
      interactive
      className={classNames(styles.tile, compact ? styles.compact : undefined, styles[`tone-${tone}`])}
    >
      <View className={styles.hit} role="button" aria-label={label} onClick={onClick}>
        <View className={classNames(styles.iconChip, styles[`chip-${tone}`])}>
          <View className={classNames(styles.glyph, styles[`glyph-${tone}`])}>
            <Glyph name={glyph} size="md" />
          </View>
          <View className={classNames(styles.spark, styles[`spark-${tone}`])} aria-hidden />
        </View>
        <Text className={styles.label}>{label}</Text>
      </View>
    </GlassSurface>
  );
}
