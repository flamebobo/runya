import { View, Text } from '@tarojs/components';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph } from '@/components/icons/Glyph';
import styles from './GemBadge.module.scss';

export interface GemBadgeProps {
  amount: number;
}

export function GemBadge({ amount }: GemBadgeProps) {
  return (
    <GlassSurface level="tinted" tone="apricot" radius="quick" className={styles.badge}>
      <View className={styles.icon} aria-hidden>
        <Glyph name="gem" size="sm" />
      </View>
      <Text className={styles.amount} aria-label={`宝石 ${amount}`}>
        {amount}
      </Text>
    </GlassSurface>
  );
}
