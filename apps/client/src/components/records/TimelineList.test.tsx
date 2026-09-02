import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TimelineList } from './TimelineList';

describe('records timeline', () => {
  it('renders time and title for mixed record kinds', () => {
    render(
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
        ]}
      />,
    );

    expect(screen.getByText('喂奶 · 150ml')).toBeTruthy();
    expect(screen.getByText('睡着了 · 2小时')).toBeTruthy();
  });
});
