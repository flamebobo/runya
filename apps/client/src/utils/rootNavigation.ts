import type { BottomNavKey } from '@runew/domain-types';

export function rootTabUrl(tab: BottomNavKey) {
  if (tab === 'today') return '/pages/index/index';
  if (tab === 'family') return '/pages/family/index';
  return `/pages/index/index?tab=${encodeURIComponent(tab)}`;
}
