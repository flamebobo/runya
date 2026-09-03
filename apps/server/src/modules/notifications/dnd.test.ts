import { createUlid, utcNowMs } from '@runew/shared-utils';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  effectiveFireAt,
  isInDnd,
  minuteOfDayOf,
  type DndWindow,
} from './dnd.js';

const CROSSING_WINDOW: DndWindow = {
  enabled: true,
  startMinute: 21 * 60,
  endMinute: 8 * 60,
};

describe('dnd window', () => {
  it('treats 21:00-08:00 as quiet hours across midnight', () => {
    // 23:30 在 DND 内。
    expect(isInDnd(CROSSING_WINDOW, 23 * 60 + 30)).toBe(true);
    // 03:00 在 DND 内。
    expect(isInDnd(CROSSING_WINDOW, 3 * 60)).toBe(true);
    // 07:59 在 DND 内，08:00 结束。
    expect(isInDnd(CROSSING_WINDOW, 8 * 60 - 1)).toBe(true);
    expect(isInDnd(CROSSING_WINDOW, 8 * 60)).toBe(false);
    // 12:00 白天不在 DND 内。
    expect(isInDnd(CROSSING_WINDOW, 12 * 60)).toBe(false);
    // 21:00 开始。
    expect(isInDnd(CROSSING_WINDOW, 21 * 60)).toBe(true);
  });

  it('does nothing when disabled or zero-length', () => {
    expect(isInDnd({ ...CROSSING_WINDOW, enabled: false }, 23 * 60)).toBe(false);
    expect(isInDnd({ enabled: true, startMinute: 600, endMinute: 600 }, 600)).toBe(false);
  });

  it('defers regular reminders inside DND to window end', () => {
    // 2026-09-03 23:30 +08:00 的本地时间戳。
    const tz = 480;
    const fireAt = Date.UTC(2026, 8, 3, 23, 30) - tz * 60_000;
    const effective = effectiveFireAt(CROSSING_WINDOW, fireAt, false, tz);
    const localMinute = minuteOfDayOf(effective, tz);
    expect(localMinute).toBe(8 * 60);
    // 推迟到第二天 08:00。
    expect(effective).toBeGreaterThan(fireAt);
  });

  it('defers reminders firing in the early morning to same-day window end', () => {
    const tz = 480;
    const fireAt = Date.UTC(2026, 8, 3, 1, 0) - tz * 60_000; // 本地 01:00
    const effective = effectiveFireAt(CROSSING_WINDOW, fireAt, false, tz);
    expect(minuteOfDayOf(effective, tz)).toBe(8 * 60);
    expect(effective).toBeGreaterThan(fireAt);
  });

  it('lets allow_dnd_override health reminders fire during DND', () => {
    const tz = 480;
    const fireAt = Date.UTC(2026, 8, 3, 23, 30) - tz * 60_000;
    expect(effectiveFireAt(CROSSING_WINDOW, fireAt, true, tz)).toBe(fireAt);
  });

  it('leaves daytime reminders untouched', () => {
    const tz = 480;
    const fireAt = Date.UTC(2026, 8, 3, 14, 0) - tz * 60_000; // 本地 14:00
    expect(effectiveFireAt(CROSSING_WINDOW, fireAt, false, tz)).toBe(fireAt);
  });

  it('handles same-day windows like 12:00-14:00', () => {
    const window: DndWindow = { enabled: true, startMinute: 12 * 60, endMinute: 14 * 60 };
    const tz = 480;
    const fireAt = Date.UTC(2026, 8, 3, 13, 0) - tz * 60_000; // 本地 13:00
    const effective = effectiveFireAt(window, fireAt, false, tz);
    expect(minuteOfDayOf(effective, tz)).toBe(14 * 60);
  });
});
