import { describe, expect, it } from 'vitest';
import {
  familyAnniversaryCountdown,
  formatFamilyAnniversaryDate,
  formatFamilyTaskMeta,
  isFamilyTaskOverdue,
} from './familyPresentation';

describe('family presentation', () => {
  it('treats a past due open task as overdue, and completed ones as settled', () => {
    expect(isFamilyTaskOverdue({ completedAt: null, dueAt: 1 }, 2)).toBe(true);
    expect(isFamilyTaskOverdue({ completedAt: 1, dueAt: 1 }, 2)).toBe(false);
    expect(isFamilyTaskOverdue({ completedAt: null, dueAt: 3 }, 2)).toBe(false);
    expect(isFamilyTaskOverdue({ completedAt: null }, 2)).toBe(false);
  });

  it('joins task meta without turning overdue into a KPI date', () => {
    expect(
      formatFamilyTaskMeta(
        {
          dueAt: Date.UTC(2026, 2, 12),
          repeatRule: 'WEEKLY',
          experienceReward: 8,
        },
        '妈妈',
        Date.UTC(2026, 2, 1),
      ),
    ).toMatch(/妈妈 · .+ · 每周 · \+8 家庭经验/);
    expect(
      formatFamilyTaskMeta(
        { dueAt: Date.UTC(2026, 2, 1), completedAt: null },
        null,
        Date.UTC(2026, 2, 12),
      ),
    ).toBe('日子已经到了');
    expect(formatFamilyTaskMeta({ completedAt: null })).toBe('');
  });

  it('formats anniversary dates and yearly countdown in local time', () => {
    expect(formatFamilyAnniversaryDate('2020-03-22')).toBe('2020年3月22日');
    const today = new Date(2026, 0, 1);
    expect(familyAnniversaryCountdown('2026-01-01', today)).toBe('就是今天');
    expect(familyAnniversaryCountdown('2026-01-02', today)).toBe('明天就是');
    expect(familyAnniversaryCountdown('2026-01-11', today)).toBe('还有 10 天');
    expect(familyAnniversaryCountdown('2025-12-31', today)).toBe('还有 364 天');
    expect(familyAnniversaryCountdown('not-a-date', today)).toBe('');
  });
});
