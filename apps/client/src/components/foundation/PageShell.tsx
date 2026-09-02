import { View } from '@tarojs/components';
import { PageAmbient } from '@/components/shell/PageAmbient';
import classNames from '@/utils/classNames';
import styles from './PageShell.module.scss';

export interface PageShellProps {
  children: React.ReactNode;
  bottomNav?: boolean;
  night?: boolean;
  scroll?: boolean;
  className?: string;
}

export function PageShell({
  children,
  bottomNav = false,
  night = false,
  scroll = true,
  className,
}: PageShellProps) {
  return (
    <View
      className={classNames(
        styles.shell,
        bottomNav ? styles.withBottomNav : undefined,
        night ? styles.night : undefined,
        scroll ? styles.scroll : styles.noScroll,
        className,
      )}
    >
      <PageAmbient />
      <View className={styles.layer}>{children}</View>
    </View>
  );
}
