import { describe, expect, it } from 'vitest';
import { formatBabyAgeLabel, formatBirthdayLabel } from './babyAge';

describe('formatBabyAgeLabel', () => {
  it('formats months and days', () => {
    expect(formatBabyAgeLabel('2025-06-01', new Date('2026-03-02T12:00:00'))).toBe('9个月1天');
  });
});

describe('formatBirthdayLabel', () => {
  it('formats ISO date in Chinese', () => {
    expect(formatBirthdayLabel('2026-03-22')).toBe('2026年3月22日');
  });
});
