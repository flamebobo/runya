import { View } from '@tarojs/components';
import classNames from '@/utils/classNames';
import type { SemanticTone } from '@runew/domain-types';
import styles from './GlassSurface.module.scss';

export type GlassLevel = 'control' | 'card' | 'hero' | 'floating' | 'tinted';

export interface GlassSurfaceProps {
  level?: GlassLevel;
  tone?: SemanticTone;
  radius?: 'control' | 'chip' | 'quick' | 'card' | 'hero' | 'heroLg' | 'floating';
  interactive?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function GlassSurface({
  level = 'card',
  tone,
  radius = 'card',
  interactive = false,
  className,
  children,
}: GlassSurfaceProps) {
  return (
    <View
      className={classNames(
        styles.surface,
        `glass-${level}`,
        level === 'tinted' && tone ? `glass-tinted--${tone}` : undefined,
        styles[`radius-${radius}`],
        interactive ? styles.interactive : undefined,
        className,
      )}
    >
      {children}
    </View>
  );
}
