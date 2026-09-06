import { Text, View } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import { CuteIconChip } from '@/components/foundation/CuteIconChip';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './ChoiceCard.module.scss';

export interface ChoiceCardProps {
  title: string;
  caption?: string;
  glyph: GlyphName;
  tone?: SemanticTone;
  selected?: boolean;
  onClick?: () => void;
}

export function ChoiceCard({
  title,
  caption,
  glyph,
  tone = 'apricot',
  selected = false,
  onClick,
}: ChoiceCardProps) {
  return (
    <GlassSurface
      level="tinted"
      tone={tone}
      radius="card"
      interactive
      className={classNames(styles.card, selected ? styles.selected : undefined)}
    >
      <View
        className={styles.hit}
        role="button"
        aria-label={title}
        aria-pressed={selected}
        onClick={onClick}
      >
        <CuteIconChip icon={glyph} tone={tone} selected={selected} />
        <View className={styles.copy}>
          <Text className={styles.title}>{title}</Text>
          {caption ? <Text className={styles.caption}>{caption}</Text> : null}
        </View>
      </View>
    </GlassSurface>
  );
}
