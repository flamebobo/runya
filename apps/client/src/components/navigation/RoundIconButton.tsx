import { View } from '@tarojs/components';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import type { SemanticTone } from '@runew/domain-types';
import styles from './RoundIconButton.module.scss';

export interface RoundIconButtonProps {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'md' | 'sm';
  tone?: SemanticTone | 'control';
}

export function RoundIconButton({
  label,
  icon,
  onClick,
  disabled,
  size = 'md',
  tone = 'control',
}: RoundIconButtonProps) {
  return (
    <View
      className={classNames(
        styles.hitArea,
        size === 'sm' ? styles.hitSm : undefined,
        disabled ? styles.disabled : undefined,
      )}
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <GlassSurface
        level={tone === 'control' ? 'control' : 'tinted'}
        tone={tone === 'control' ? undefined : tone}
        radius={size === 'sm' ? 'chip' : 'control'}
        interactive
        className={classNames(styles.button, size === 'sm' ? styles.buttonSm : undefined)}
      >
        {icon ?? (
          <View className={styles.menuIcon}>
            <Glyph name="menu" size="md" />
          </View>
        )}
      </GlassSurface>
    </View>
  );
}
