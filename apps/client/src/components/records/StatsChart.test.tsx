import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatsBucket, StatsRange } from '@runew/contracts';
import { StatsChartView, type RecordScope } from './StatsChart';

const DAY_BUCKETS: StatsBucket[] = [
  { label: '0', feedingAmountMl: 0, sleepSeconds: 7200, diaperCount: 0, foodCount: 0 },
  { label: '1', feedingAmountMl: 0, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
  { label: '2', feedingAmountMl: 0, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
  { label: '3', feedingAmountMl: 2, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
];

const WEEK_BUCKETS: StatsBucket[] = Array.from({ length: 7 }, (_, index) => ({
  label: ['一', '二', '三', '四', '五', '六', '日'][index] ?? '',
  feedingAmountMl: index + 1,
  sleepSeconds: 0,
  diaperCount: 0,
  foodCount: 0,
}));

function Harness({ buckets }: { buckets: StatsBucket[] }) {
  const [range, setRange] = useState<StatsRange>('day');
  const [scope, setScope] = useState<RecordScope>('all');
  return (
    <StatsChartView
      range={range}
      onRange={setRange}
      scope={scope}
      onScopeChange={setScope}
      buckets={buckets}
      onRetry={() => {}}
    />
  );
}

describe('StatsChartView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses one record-type selector and shows an all-record overview', () => {
    render(<Harness buckets={DAY_BUCKETS} />);
    expect(screen.getByRole('tab', { name: '日' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '月' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '年' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '喂奶' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: '睡眠' })).toHaveLength(1);
    expect(screen.getByText('小日子发芽中')).toBeTruthy();
    expect(screen.getByText('2ml')).toBeTruthy();
    expect(screen.getByText('2小时')).toBeTruthy();
  });

  it('labels rolling month and year ranges explicitly', () => {
    render(<Harness buckets={DAY_BUCKETS} />);
    fireEvent.click(screen.getByRole('tab', { name: '月' }));
    expect(screen.getByText('最近 30 天 · 全部记录')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '年' }));
    expect(screen.getByText('最近 12 个月 · 全部记录')).toBeTruthy();
  });

  it('shows metric bars and per-bucket readout after a type is selected', () => {
    render(<Harness buckets={DAY_BUCKETS} />);
    fireEvent.click(screen.getByRole('button', { name: '喂奶' }));
    expect(screen.getByText('2 ml')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /时$/ })).toHaveLength(
      DAY_BUCKETS.length,
    );
    fireEvent.click(screen.getAllByRole('button', { name: /时$/ })[3]!);
    expect(screen.getByText('3时 · 喂奶')).toBeTruthy();
  });

  it('switching type re-scales the readout', () => {
    render(<Harness buckets={DAY_BUCKETS} />);
    fireEvent.click(screen.getByRole('button', { name: '睡眠' }));
    expect(screen.getByText('2小时')).toBeTruthy();
  });

  it('week range renders weekday labels and 7 bars', () => {
    render(<Harness buckets={WEEK_BUCKETS} />);
    fireEvent.click(screen.getByRole('tab', { name: '周' }));
    fireEvent.click(screen.getByRole('button', { name: '喂奶' }));
    expect(screen.getAllByRole('button', { name: /周/ })).toHaveLength(7);
  });

  it('shows quiet state when the selected type has no values', () => {
    render(
      <Harness
        buckets={[
          {
            label: '0',
            feedingAmountMl: 0,
            sleepSeconds: 0,
            diaperCount: 0,
            foodCount: 0,
          },
          {
            label: '1',
            feedingAmountMl: 0,
            sleepSeconds: 0,
            diaperCount: 0,
            foodCount: 0,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '喂奶' }));
    expect(screen.getByText('这段时间还很安静，记录会慢慢长出节奏。')).toBeTruthy();
  });
});
