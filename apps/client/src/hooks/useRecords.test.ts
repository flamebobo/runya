import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '@runew/contracts';
import { matchesTimelineQuery } from './useRecords';

const BASE_ITEM: TimelineItem = {
  id: '01JDEM3TESTITEM000000000000',
  kind: 'DIAPER',
  recordedAt: Date.UTC(2026, 8, 2, 10),
  title: '尿布 · 湿',
  subtitle: null,
  status: null,
  version: 1,
};

describe('matchesTimelineQuery', () => {
  it('keeps local records inside the selected type and time range', () => {
    expect(matchesTimelineQuery(BASE_ITEM, { kind: 'all' })).toBe(true);
    expect(matchesTimelineQuery(BASE_ITEM, { kind: 'diaper' })).toBe(true);
    expect(matchesTimelineQuery(BASE_ITEM, { kind: 'feeding' })).toBe(false);
  });

  it('excludes records outside the selected time range', () => {
    expect(matchesTimelineQuery(BASE_ITEM, { from: BASE_ITEM.recordedAt + 1 })).toBe(
      false,
    );
    expect(matchesTimelineQuery(BASE_ITEM, { to: BASE_ITEM.recordedAt - 1 })).toBe(
      false,
    );
  });
});
