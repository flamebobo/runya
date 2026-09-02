import { Image, Text, View } from '@tarojs/components';
import { drawerLogo, heroArt, stickerStar } from '@/assets/figma';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { PageShell } from '@/components/foundation/PageShell';
import styles from './AuthScreen.module.scss';

export interface AuthScreenProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthScreen({
  eyebrow = '润芽 · RUNEW',
  title,
  subtitle,
  children,
  footer,
}: AuthScreenProps) {
  return (
    <PageShell>
      <View className={styles.page}>
        <GlassSurface level="hero" radius="hero" className={styles.brandCard}>
          <View className={styles.brand}>
            <Image className={styles.art} src={heroArt} mode="aspectFit" />
            <Image className={styles.sticker} src={stickerStar} mode="aspectFit" />
            <View className={styles.logoWrap}>
              <Image className={styles.logo} src={drawerLogo} mode="aspectFit" />
            </View>
            <View className={styles.brandCopy}>
              <Text className={styles.eyebrow}>{eyebrow}</Text>
              <Text className={`text-page-title ${styles.title}`}>{title}</Text>
              <Text className={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>
        </GlassSurface>
        <GlassSurface level="hero" radius="heroLg" className={styles.card}>
          <View className={styles.cardBody}>{children}</View>
        </GlassSurface>
        {footer ? <View className={styles.footer}>{footer}</View> : null}
      </View>
    </PageShell>
  );
}
