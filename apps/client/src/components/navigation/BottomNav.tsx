import { Text, View } from '@tarojs/components';
import type { BottomNavKey } from '@runew/domain-types';
import { GlassSurface } from '@/components/foundation/GlassSurface';
import { Glyph, type GlyphName } from '@/components/icons/Glyph';
import classNames from '@/utils/classNames';
import styles from './BottomNav.module.scss';

export interface BottomNavProps {
  active: BottomNavKey | null;
  onSelect?: (key: BottomNavKey) => void;
  onAddClick?: () => void;
}

const ITEMS: Array<{
  key: BottomNavKey;
  label: string;
  glyph: GlyphName;
}> = [
  { key: 'today', label: '今天', glyph: 'house' },
  { key: 'records', label: '记录', glyph: 'list' },
  { key: 'memories', label: '回忆', glyph: 'photo' },
  { key: 'family', label: '小家', glyph: 'family' },
];

export function BottomNav({ active, onSelect, onAddClick }: BottomNavProps) {
  return (
    <View className={styles.wrapper} role="navigation" aria-label="主导航">
      <GlassSurface level="floating" radius="floating" className={styles.nav}>
        <View className={styles.grid}>
          {ITEMS.slice(0, 2).map((item) => (
            <NavItem
              key={item.key}
              label={item.label}
              glyph={item.glyph}
              active={active === item.key}
              onClick={() => onSelect?.(item.key)}
            />
          ))}
          <View
            className={styles.addHitArea}
            role="button"
            aria-label="留下这一刻"
            onClick={onAddClick}
          >
            <View className={styles.addButton}>
              <View className={styles.addPlus}>
                <Glyph name="plus" size="lg" />
              </View>
            </View>
          </View>
          {ITEMS.slice(2).map((item) => (
            <NavItem
              key={item.key}
              label={item.label}
              glyph={item.glyph}
              active={active === item.key}
              onClick={() => onSelect?.(item.key)}
            />
          ))}
        </View>
      </GlassSurface>
    </View>
  );
}

function NavItem({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph: GlyphName;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <View
      className={classNames(styles.item, active ? styles.itemActive : undefined)}
      role="button"
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <View className={styles.icon}>
        <Glyph name={glyph} size="md" />
      </View>
      <Text className={styles.itemLabel}>{label}</Text>
    </View>
  );
}
