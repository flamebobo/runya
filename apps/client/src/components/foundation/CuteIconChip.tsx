import { View } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './CuteIconChip.module.scss';

export interface CuteIconChipProps {
  icon: GlyphName;
  tone?: SemanticTone;
  size?: 'sm' | 'md';
  sparkle?: boolean;
  dashed?: boolean;
  selected?: boolean;
  className?: string;
}

export function CuteIconChip({
  icon,
  tone = 'sage',
  size = 'md',
  sparkle = true,
  dashed = false,
  selected = false,
  className,
}: CuteIconChipProps) {
  return (
    <View
      className={classNames(
        styles.chip,
        styles[size],
        styles[`tone-${tone}`],
        dashed ? styles.dashed : undefined,
        selected ? styles.selected : undefined,
        className,
      )}
      aria-hidden
    >
      <View className={styles.inner} aria-hidden />
      <View className={styles.glyph}>
        <Glyph name={icon} size={size === 'md' ? 'md' : 'sm'} />
      </View>
      {sparkle && !dashed ? (
        <>
          <View className={styles.spark} aria-hidden />
          <View className={styles.sprout} aria-hidden />
        </>
      ) : null}
    </View>
  );
}
