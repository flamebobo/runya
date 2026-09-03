import type { HealthEventPublic } from '@runew/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildHealthCalendarDays,
  buildHealthMonthDays,
  healthEventsForDate,
  monthAnchorIso,
  nextHealthEvent,
  shiftHealthMonth,
} from './index';

function event(overrides: Partial<HealthEventPublic>): HealthEventPublic {
  return {
    id: '01JDEM3HEALTH00000000000000',
    familyId: '01JDEM3FAMILY0000000000000',
    babyId: '01JDEM3BABY000000000000000',
    eventType: 'CHECKUP',
    title: '儿保',
    scheduledAt: Date.UTC(2026, 8, 3, 2),
    completedAt: null,
    status: 'UPCOMING',
    locationName: null,
    locationAddress: null,
    doctorName: null,
    note: null,
    timezoneName: 'Asia/Shanghai',
    reminder: null,
    createdBy: '01JDEM3USER0000000000000000',
    createdAt: Date.UTC(2026, 7, 1),
    updatedBy: '01JDEM3USER0000000000000000',
    updatedAt: Date.UTC(2026, 7, 1),
    version: 1,
    ...overrides,
  };
}

describe('health page calendar and timeline helpers', () => {
  it('builds a seven-day strip centered on the selected day', () => {
    const days = buildHealthCalendarDays('2026-09-03');
    expect(days).toHaveLength(7);
    expect(days[3]!.iso).toBe('2026-09-03');
    expect(days[3]!.label).toBe('3');
  });

  it('builds a 42-cell month grid and shifts across year boundaries', () => {
    const days = buildHealthMonthDays('2026-09-03');
    expect(days).toHaveLength(42);
    expect(days.some((day) => day.iso === '2026-09-03' && day.currentMonth)).toBe(true);
    expect(monthAnchorIso('2026-09-03')).toBe('2026-09-01');
    expect(shiftHealthMonth('2026-01-15', -1)).toBe('2025-12-01');
    expect(shiftHealthMonth('2025-12-15', 1)).toBe('2026-01-01');
  });

  it('finds the nearest upcoming event without treating completed items as next', () => {
    const items = [
      event({ id: '01JDEM3HEALTH00000000000002', status: 'COMPLETED', scheduledAt: 1 }),
      event({ id: '01JDEM3HEALTH00000000000003', scheduledAt: 3_000 }),
      event({ id: '01JDEM3HEALTH00000000000004', scheduledAt: 2_000 }),
    ];
    expect(nextHealthEvent(items)?.id).toBe('01JDEM3HEALTH00000000000004');
  });

  it('filters a selected day and health type for the timeline', () => {
    const items = [
      event({ eventType: 'VACCINE', scheduledAt: Date.UTC(2026, 8, 3, 3) }),
      event({
        id: '01JDEM3HEALTH00000000000005',
        eventType: 'DENTAL',
        scheduledAt: Date.UTC(2026, 8, 4, 3),
      }),
    ];
    expect(healthEventsForDate(items, '2026-09-03', 'VACCINE')).toHaveLength(1);
    expect(healthEventsForDate(items, '2026-09-03', 'DENTAL')).toHaveLength(0);
  });
});
