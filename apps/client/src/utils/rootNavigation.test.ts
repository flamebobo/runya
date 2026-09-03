import { describe, expect, it } from 'vitest';
import { rootTabUrl } from './rootNavigation';

describe('rootTabUrl', () => {
  it('keeps the today tab at the root route', () => {
    expect(rootTabUrl('today')).toBe('/pages/index/index');
  });

  it('uses the root shell for every switchable tab', () => {
    expect(rootTabUrl('records')).toBe('/pages/index/index?tab=records');
    expect(rootTabUrl('memories')).toBe('/pages/index/index?tab=memories');
    expect(rootTabUrl('family')).toBe('/pages/index/index?tab=family');
  });
});
