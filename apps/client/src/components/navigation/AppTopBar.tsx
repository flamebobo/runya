import { View, Text } from '@tarojs/components';
import { GemBadge } from '@/components/navigation/GemBadge';
import { RoundIconButton } from '@/components/navigation/RoundIconButton';
import { Glyph } from '@/components/icons/Glyph';
import styles from './AppTopBar.module.scss';

export type AppTopBarVariant = 'home' | 'standard' | 'admin';

export interface AppTopBarProps {
  variant?: AppTopBarVariant;
  title: string;
  subtitle?: string;
  gemAmount?: number;
  onMenuClick?: () => void;
  onBackClick?: () => void;
  actionLabel?: string;
  onActionClick?: () => void;
}

export function AppTopBar({
  variant = 'home',
  title,
  subtitle,
  gemAmount = 0,
  onMenuClick,
  onBackClick,
  actionLabel,
  onActionClick,
}: AppTopBarProps) {
  return (
    <View className={styles.root}>
      <View className={styles.left}>
        {variant === 'standard' || variant === 'admin' ? (
          <RoundIconButton
            label="返回"
            icon={
              <View className={styles.backIcon}>
                <Glyph name="chevron" size="md" />
              </View>
            }
            onClick={onBackClick}
          />
        ) : (
          <RoundIconButton label="打开菜单" onClick={onMenuClick} />
        )}
      </View>
      <View className={styles.center}>
        <Text className={styles.title}>{title}</Text>
        {subtitle ? <Text className={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View className={styles.right}>
        {variant === 'home' ? <GemBadge amount={gemAmount} /> : null}
        {actionLabel ? (
          <View
            className={styles.textAction}
            role="button"
            aria-label={actionLabel}
            onClick={onActionClick}
          >
            <Text>{actionLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
