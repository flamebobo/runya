import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { GemBadge } from '@/components/navigation/GemBadge';
import { RoundIconButton } from '@/components/navigation/RoundIconButton';
import { Glyph } from '@/components/icons/Glyph';
import styles from './AppTopBar.module.scss';
import { useEffect, useState } from 'react';

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

const COLLAPSE_THRESHOLD = 18;

function useCollapsedHeader() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const update = (scrollTop: number) => {
      const next = scrollTop > COLLAPSE_THRESHOLD;
      setCollapsed((current) => (current === next ? current : next));
    };

    if (typeof document !== 'undefined') {
      let frame = 0;
      const readScrollTop = () => {
        const page = document.querySelector<HTMLElement>('.taro_page');
        return Math.max(
          page?.scrollTop ?? 0,
          document.documentElement.scrollTop,
          window.scrollY,
        );
      };
      const handleScroll = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => update(readScrollTop()));
      };
      const page = document.querySelector<HTMLElement>('.taro_page');
      page?.addEventListener('scroll', handleScroll, { passive: true });
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
      return () => {
        if (frame) cancelAnimationFrame(frame);
        page?.removeEventListener('scroll', handleScroll);
        window.removeEventListener('scroll', handleScroll);
      };
    }

    // 小程序没有 DOM scroll event，低频读取 viewport 只负责 UI 收缩，
    // 不承载任何业务状态，因此不会影响媒体保存和记录可靠性。
    const timer = setInterval(() => {
      Taro.createSelectorQuery()
        .selectViewport()
        .scrollOffset((result) => update(result?.scrollTop ?? 0))
        .exec();
    }, 120);
    return () => clearInterval(timer);
  }, []);

  return collapsed;
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
  const collapsed = useCollapsedHeader();

  return (
    <View
      className={`${styles.root} ${collapsed ? styles.collapsed : ''}`}
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <View className={styles.left}>
        {variant === 'standard' || variant === 'admin' ? (
          onBackClick ? (
            <RoundIconButton
              label="返回"
              icon={
                <View className={styles.backIcon}>
                  <Glyph name="chevron" size="md" />
                </View>
              }
              onClick={onBackClick}
            />
          ) : null
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
