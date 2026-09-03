import type { BottomNavKey } from '@runew/domain-types';

export function rootTabUrl(tab: BottomNavKey) {
  return tab === 'today'
    ? '/pages/index/index'
    : `/pages/index/index?tab=${encodeURIComponent(tab)}`;
}
