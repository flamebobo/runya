import { describe, expect, it } from 'vitest';
import {
  illustrationCaption,
  illustrationGroups,
  ledgerCopy,
  rewardVisual,
  rewardVisuals,
} from './gemsVisual';

describe('gems visual copy', () => {
  it('maps known illustrations and falls back for unknown keys', () => {
    expect(rewardVisual('tea').glyph).toBe('bowl');
    expect(rewardVisual('tea').sticker).toBeTruthy();
    expect(rewardVisual('sea').label).toBe('看海');
    expect(rewardVisual('rest').label).toBe('睡觉');
    expect(rewardVisual('travel').label).toBe('旅行');
    expect(rewardVisual('missing').label).toBe('心愿');
    expect(rewardVisual(null).tone).toBe('sky');
    expect(Object.keys(rewardVisuals).length).toBeGreaterThanOrEqual(24);
  });

  it('groups sticker marks by family kind', () => {
    expect(illustrationGroups.map((group) => group.label)).toEqual([
      '吃喝',
      '休息',
      '出门',
      '宝宝与家',
      '心情',
    ]);
    expect(illustrationGroups[0]!.options.map((option) => option.label)).toEqual([
      '奶茶',
      '咖啡',
      '蛋糕',
      '冰淇淋',
      '水果',
      '晚餐',
    ]);
    expect(illustrationCaption(rewardVisual('tea'))).toBe('吃喝 · 奶茶');
    expect(illustrationCaption(rewardVisual('hug'))).toBe('休息 · 抱抱');
    expect(illustrationCaption(rewardVisual('wish'))).toBe('心情 · 心愿');
  });

  it('explains ledger rows without ecommerce language', () => {
    expect(
      ledgerCopy({
        id: '01JGEMTX000000000000000001',
        familyId: '01JGEMFAMILY0000000000001',
        userId: '01JGEMUSER0000000000000001',
        amount: 1,
        balanceAfter: 1,
        reasonCode: 'RECORD_CREATED',
        reasonText: 'DIAPER_RECORD',
        sourceType: 'RECORD_REWARD',
        sourceId: '01JGEMRECORD0000000000001',
        createdAt: Date.UTC(2026, 8, 5),
      }).title,
    ).toBe('留下记录');
    expect(
      ledgerCopy({
        id: '01JGEMTX000000000000000002',
        familyId: '01JGEMFAMILY0000000000001',
        userId: '01JGEMUSER0000000000000001',
        amount: -8,
        balanceAfter: 0,
        reasonCode: 'REWARD_REDEEMED',
        reasonText: '一杯喜欢的奶茶',
        sourceType: 'REWARD_ORDER',
        sourceId: '01JGEMORDER00000000000001',
        createdAt: Date.UTC(2026, 8, 5),
      }).caption,
    ).toContain('一杯喜欢的奶茶');
  });
});
