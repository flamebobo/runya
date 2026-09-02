import { describe, expect, it } from 'vitest';
import { combineLocalDateTime, formatClock, localDayRange } from './recordTime';

describe('record time helpers', () => {
  it('builds an inclusive local day range', () => {
    const { from, to } = localDayRange('2026-03-22');
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(to).getHours()).toBe(23);
    expect(to).toBeGreaterThan(from);
  });

  it('combines local date and time without using interval ticks', () => {
    const ms = combineLocalDateTime('2026-03-22', '23:00');
    expect(formatClock(ms)).toBe('23:00');
  });
});
