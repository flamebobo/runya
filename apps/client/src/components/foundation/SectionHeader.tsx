import { View, Text } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import { TextAction } from '@/components/buttons';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './SectionHeader.module.scss';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  caption?: string;
  variant?: 'default' | 'guide';
  glyph?: GlyphName;
  tone?: SemanticTone;
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  caption,
  variant = 'default',
  glyph = 'growth',
  tone = 'sage',
}: SectionHeaderProps) {
  const guide = variant === 'guide';

  return (
    <View className={classNames(styles.root, guide ? styles.guide : undefined)}>
      <View className={styles.main}>
        <View className={styles.titleRow}>
          <View
            className={classNames(
              styles.mark,
              guide ? styles[`mark-${tone}`] : undefined,
            )}
            aria-hidden
          >
            <Glyph name={glyph} size="sm" />
          </View>
          <Text className={styles.title}>{title}</Text>
        </View>
        <View className={styles.accent} aria-hidden />
        {caption ? <Text className={styles.caption}>{caption}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <TextAction label={actionLabel} onClick={onAction} />
      ) : null}
    </View>
  );
}
