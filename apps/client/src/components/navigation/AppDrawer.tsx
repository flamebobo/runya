import { Image, View, Text } from '@tarojs/components';
import type { SemanticTone } from '@runew/domain-types';
import { drawerLogo } from '@/assets/figma';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import { GemBadge } from '@/components/navigation/GemBadge';
import { RoundIconButton } from '@/components/navigation/RoundIconButton';
import classNames from '@/utils/classNames';
import styles from './AppDrawer.module.scss';

export interface DrawerMenuItem {
  id: string;
  title: string;
  tone?: SemanticTone;
  glyph?: GlyphName;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface AppDrawerProps {
  open: boolean;
  babyName?: string;
  babyAgeLabel?: string;
  gemAmount?: number;
  items: DrawerMenuItem[];
  onClose?: () => void;
  onAdminClick?: () => void;
  onSearchClick?: () => void;
  onNotificationClick?: () => void;
}

const GLYPH_COLOR: Record<SemanticTone, string> = {
  apricot: styles.glyphApricot ?? '',
  sage: styles.glyphSage ?? '',
  lavender: styles.glyphLavender ?? '',
  sky: styles.glyphSky ?? '',
  blush: styles.glyphBlush ?? '',
};

export function AppDrawer({
  open,
  babyName = '润润',
  babyAgeLabel = '8个月12天',
  gemAmount = 0,
  items,
  onClose,
  onSearchClick,
  onNotificationClick,
  onAdminClick,
}: AppDrawerProps) {
  return (
    <View
      className={classNames(styles.overlay, open ? styles.overlayOpen : undefined)}
      role={open ? 'dialog' : undefined}
      aria-modal={open ? 'true' : undefined}
      aria-hidden={!open}
      aria-label="应用菜单"
    >
      <View className={styles.backdrop} onClick={onClose} />
      <View className={styles.panel}>
        <GlassSurface level="hero" radius="heroLg" className={styles.hero}>
          <View className={styles.heroTop}>
            <Image className={styles.logo} src={drawerLogo} mode="aspectFit" />
            <View className={styles.brandBlock}>
              <Text className={styles.brand}>润芽 · RUNEW</Text>
              <Text className={styles.context}>
                {babyName} · {babyAgeLabel}
              </Text>
            </View>
          </View>
          <View className={styles.heroActions}>
            <GemBadge amount={gemAmount} />
            <View className={styles.heroButtons}>
              <RoundIconButton
                label="搜索"
                size="sm"
                tone="sky"
                icon={<Glyph name="search" size="sm" className={styles.searchIcon} />}
                onClick={onSearchClick}
              />
              <RoundIconButton
                label="通知"
                size="sm"
                tone="apricot"
                icon={<Glyph name="bell" size="sm" className={styles.notifyIcon} />}
                onClick={onNotificationClick}
              />
              <RoundIconButton
                label="关闭菜单"
                size="sm"
                icon={<Glyph name="close" size="sm" className={styles.closeIcon} />}
                onClick={onClose}
              />
            </View>
          </View>
        </GlassSurface>
        <View className={styles.menu}>
          {items.map((item) => {
            const tone = item.tone ?? 'apricot';
            return (
              <GlassSurface
                key={item.id}
                level="card"
                radius="card"
                interactive={!item.disabled}
                className={classNames(
                  styles.row,
                  styles[`row-${tone}`],
                  item.active ? styles.rowActive : undefined,
                  item.disabled ? styles.rowDisabled : undefined,
                )}
              >
                <View
                  className={styles.rowHit}
                  role="button"
                  aria-label={item.title}
                  aria-disabled={item.disabled}
                  onClick={item.disabled ? undefined : item.onClick}
                >
                  <View className={classNames(styles.iconChip, styles[`chip-${tone}`])}>
                    <View className={classNames(styles.rowGlyph, GLYPH_COLOR[tone])}>
                      <Glyph name={item.glyph ?? 'house'} size="md" />
                    </View>
                  </View>
                  <Text className={styles.title}>{item.title}</Text>
                  <View className={styles.chevron} aria-hidden>
                    <Glyph name="chevron" size="sm" />
                  </View>
                </View>
              </GlassSurface>
            );
          })}
        </View>
        <GlassSurface level="floating" radius="floating" className={styles.adminRow}>
          <View
            className={styles.adminHit}
            role="button"
            aria-label="进入管理模式"
            onClick={onAdminClick}
          >
            <View className={styles.adminIcon}>
              <Glyph name="settings" size="sm" />
            </View>
            <Text className={styles.adminLabel}>管理模式</Text>
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

export const DEFAULT_DRAWER_ITEMS: DrawerMenuItem[] = [
  { id: 'today', title: '今天', tone: 'apricot', glyph: 'house' },
  { id: 'records', title: '日常记录', tone: 'apricot', glyph: 'list' },
  { id: 'growth', title: '成长', tone: 'sage', glyph: 'growth' },
  { id: 'knowledge', title: '育儿知识', tone: 'sky', glyph: 'book' },
  { id: 'health', title: '健康', tone: 'sage', glyph: 'heart' },
  { id: 'memories', title: '宝宝回忆', tone: 'sky', glyph: 'photo' },
  { id: 'mom', title: '妈妈空间', tone: 'blush', glyph: 'smile' },
  { id: 'gems', title: '宝石商城', tone: 'apricot', glyph: 'gem' },
  { id: 'family', title: '我们的小家', tone: 'sage', glyph: 'family' },
  { id: 'baby', title: '宝宝档案', tone: 'sky', glyph: 'baby' },
  { id: 'settings', title: '设置', tone: 'apricot', glyph: 'settings' },
];
