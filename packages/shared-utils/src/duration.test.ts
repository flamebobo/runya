import { describe, expect, it } from 'vitest';
import {
  elapsedSecondsFromRange,
  feedingElapsedSeconds,
  formatDurationHms,
} from './index.js';

describe('timer duration truth', () => {
  it('uses timestamps, not accumulated ticks, after a background gap', () => {
    const startedAt = 1_000_000;
    const firstForegroundNow = startedAt + 5_000;
    expect(elapsedSecondsFromRange(startedAt, null, firstForegroundNow)).toBe(5);

    const afterBackgroundNow = startedAt + 65_000;
    expect(elapsedSecondsFromRange(startedAt, null, afterBackgroundNow)).toBe(65);
  });

  it('sums breast segments and ignores pause gaps', () => {
    const startedAt = 10_000;
    const segments = [
      { startedAt, endedAt: startedAt + 30_000 },
      { startedAt: startedAt + 50_000, endedAt: startedAt + 80_000 },
      { startedAt: startedAt + 90_000, endedAt: null },
    ];
    const now = startedAt + 100_000;
    expect(feedingElapsedSeconds(segments, now)).toBe(70);
  });

  it('formats clock display from elapsed seconds', () => {
    expect(formatDurationHms(0)).toBe('00:00:00');
    expect(formatDurationHms(75)).toBe('00:01:15');
    expect(formatDurationHms(2 * 3600 + 14 * 60 + 8)).toBe('02:14:08');
  });
});
