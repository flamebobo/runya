import { describe, expect, it } from 'vitest';
import { minutesToTime, timeToMinutes } from './SettingsViews';

describe('notification settings time helpers', () => {
  it('round-trips the default crossing-midnight DND window', () => {
    expect(minutesToTime(21 * 60)).toBe('21:00');
    expect(minutesToTime(8 * 60)).toBe('08:00');
    expect(timeToMinutes('21:00')).toBe(21 * 60);
    expect(timeToMinutes('08:00')).toBe(8 * 60);
  });

  it('clamps invalid picker values instead of creating an invalid preference', () => {
    expect(timeToMinutes('not-a-time')).toBe(0);
    expect(minutesToTime(2000)).toBe('23:59');
  });
});
