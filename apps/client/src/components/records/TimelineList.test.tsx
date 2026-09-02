import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimelineList } from './TimelineList';

describe('records timeline', () => {
  it('renders time and title for mixed record kinds', () => {
    const { container } = render(
      <TimelineList
        items={[
          {
            id: '01JTESTFEEDING0000000000001',
            kind: 'FEEDING',
            recordedAt: Date.UTC(2026, 2, 22, 7, 30, 0),
            title: '喂奶 · 150ml',
            subtitle: null,
            status: 'COMPLETED',
            version: 1,
            feedingType: 'BOTTLE',
          },
          {
            id: '01JTESTSLEEP000000000000001',
            kind: 'SLEEP',
            recordedAt: Date.UTC(2026, 2, 22, 4, 12, 0),
            title: '睡着了 · 2小时',
            subtitle: null,
            status: 'COMPLETED',
            version: 1,
          },
          {
            id: '01JTESTDIAPER00000000000001',
            kind: 'DIAPER',
            recordedAt: Date.UTC(2026, 2, 22, 3, 20, 0),
            title: '尿布 · 湿',
            subtitle: null,
            status: 'COMPLETED',
            version: 1,
          },
          {
            id: '01JTESTFOOD0000000000000001',
            kind: 'FOOD',
            recordedAt: Date.UTC(2026, 2, 22, 2, 10, 0),
            title: '辅食 · 南瓜泥',
            subtitle: null,
            status: 'COMPLETED',
            version: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText('喂奶 · 150ml')).toBeTruthy();
    expect(screen.getByText('睡着了 · 2小时')).toBeTruthy();
    expect(screen.getByText('尿布 · 湿')).toBeTruthy();
    expect(screen.getByText('辅食 · 南瓜泥')).toBeTruthy();
    for (const kind of ['FEEDING', 'SLEEP', 'DIAPER', 'FOOD']) {
      expect(container.querySelector(`[data-kind="${kind}"]`)).toBeTruthy();
    }
  });
});
