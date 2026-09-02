import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatsBucket, StatsRange } from '@runew/contracts';
import { StatsChartView } from './StatsChart';

const DAY_BUCKETS: StatsBucket[] = [
  { label: '0', feedingCount: 0, sleepSeconds: 7200, diaperCount: 0, foodCount: 0 },
  { label: '1', feedingCount: 0, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
  { label: '2', feedingCount: 0, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
  { label: '3', feedingCount: 2, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
];

const WEEK_BUCKETS: StatsBucket[] = Array.from({ length: 7 }, (_, index) => ({
  label: ['一', '二', '三', '四', '五', '六', '日'][index] ?? '',
  feedingCount: index + 1,
  sleepSeconds: 0,
  diaperCount: 0,
  foodCount: 0,
}));

function Harness({ buckets }: { buckets: StatsBucket[] }) {
  const [range, setRange] = useState<StatsRange>('day');
  return (
    <StatsChartView range={range} onRange={setRange} buckets={buckets} onRetry={() => {}} />
  );
}

describe('StatsChartView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders segmented control, metric chips and bar columns', () => {
    render(<Harness buckets={DAY_BUCKETS} />);
    expect(screen.getByRole('tab', { name: '日' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '月' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '喂奶' }).length).toBeGreaterThan(0);
    // 每个桶一根柱子：轨道数等于桶数
    expect(screen.getAllByRole('button', { name: /时$/ })).toHaveLength(DAY_BUCKETS.length);
  });

  it('shows per-bucket readout when a bar is tapped', () => {
    render(<Harness buckets={DAY_BUCKETS} />);
    // 默认指标 = 喂奶，汇总读数
    expect(screen.getByText('2 次')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /时$/ })[3]!);
    // 3 时桶：喂奶 2 次
    expect(screen.getByText('3时 · 喂奶')).toBeTruthy();
  });

  it('switching metric re-scales the readout', () => {
    render(<Harness buckets={DAY_BUCKETS} />);
    fireEvent.click(screen.getByRole('button', { name: '睡眠' }));
    // 睡眠汇总：2 小时
    expect(screen.getByText('2小时')).toBeTruthy();
  });

  it('week range renders weekday labels and 7 bars', () => {
    render(<Harness buckets={WEEK_BUCKETS} />);
    fireEvent.click(screen.getByRole('tab', { name: '周' }));
    expect(screen.getAllByRole('button', { name: /周/ })).toHaveLength(7);
  });

  it('shows quiet state when all values are zero', () => {
    render(
      <Harness
        buckets={[
          { label: '0', feedingCount: 0, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
          { label: '1', feedingCount: 0, sleepSeconds: 0, diaperCount: 0, foodCount: 0 },
        ]}
      />,
    );
    expect(screen.getByText('这段时间还很安静，记录会慢慢长出节奏。')).toBeTruthy();
  });
});
