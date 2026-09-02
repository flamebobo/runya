import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrowthTrendPoint } from '@runew/contracts';

const setOption = vi.fn();
const dispose = vi.fn();
const resize = vi.fn();

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  init: vi.fn(() => ({
    setOption,
    dispose,
    resize,
    getZr: () => ({ handler: { dispatch: vi.fn() } }),
  })),
}));
vi.mock('echarts/charts', () => ({ LineChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

import { GrowthTrendChart } from './GrowthTrendChart';

const POINTS: GrowthTrendPoint[] = [
  {
    recordId: '01JDEM4GROWTH0000000000000',
    recordedAt: new Date(2026, 8, 1, 10, 30).getTime(),
    value: 72.5,
  },
  {
    recordId: '01JDEM4GROWTH0000000000001',
    recordedAt: new Date(2026, 8, 8, 9, 15).getTime(),
    value: 73.1,
  },
];

describe('GrowthTrendChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an inviting empty state without drawing a fake curve', () => {
    render(<GrowthTrendChart metric="head" points={[]} />);

    expect(screen.getByText('还没有头围曲线')).toBeTruthy();
    expect(screen.queryByLabelText(/头围趋势图/)).toBeNull();
    expect(setOption).not.toHaveBeenCalled();
  });

  it('draws the real points and always exposes date, value, and unit as text', () => {
    render(<GrowthTrendChart metric="height" points={POINTS} />);

    expect(screen.getByLabelText('身高趋势图，共 2 个数值')).toBeTruthy();
    expect(screen.getByRole('list', { name: '身高数值列表' })).toBeTruthy();
    expect(screen.getByText('9月1日')).toBeTruthy();
    expect(screen.getByText('72.5 cm')).toBeTruthy();
    expect(screen.getByText('73.1 cm')).toBeTruthy();
    expect(setOption).toHaveBeenCalledTimes(1);
  });
});
