import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RewardPublic } from '@runew/contracts';
import GemsPage from './index';

vi.mock('@/components/shell/AppBootstrapGate', () => ({
  AppBootstrapGate: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useBootstrap', () => ({
  useBootstrapQuery: () => ({
    data: {
      gemBalance: 1,
      currentBaby: { nickname: '润润', name: '润润', birthday: '2026-01-16' },
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/api/gems', () => ({
  fetchGemBalance: vi.fn(),
  fetchRewards: vi.fn(),
  fetchOrders: vi.fn(),
  fetchTransactions: vi.fn(),
  redeemReward: vi.fn(),
  cancelRewardOrder: vi.fn(),
  fulfillRewardOrder: vi.fn(),
  createCustomReward: vi.fn(),
}));

import {
  fetchGemBalance,
  fetchOrders,
  fetchRewards,
  fetchTransactions,
} from '@/api/gems';

const tea: RewardPublic = {
  id: '01JGEMREWARD00000000000001',
  familyId: '01JGEMFAMILY0000000000001',
  name: '一杯喜欢的奶茶',
  description: '给今天留一点甜甜的休息时间',
  priceGems: 8,
  stock: null,
  illustrationKey: 'tea',
  status: 'ACTIVE',
  custom: false,
  sortOrder: 0,
  version: 1,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GemsPage />
    </QueryClientProvider>,
  );
}

describe('Gems page', () => {
  beforeEach(() => {
    vi.mocked(fetchGemBalance).mockResolvedValue({ balance: 1, ledgerBalance: 1 });
    vi.mocked(fetchRewards).mockResolvedValue([tea]);
    vi.mocked(fetchOrders).mockResolvedValue([]);
    vi.mocked(fetchTransactions).mockResolvedValue([]);
  });

  it('keeps BottomNav visible and renders wish cards', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('一杯喜欢的奶茶')).toBeTruthy());
    expect(screen.getByLabelText('主导航')).toBeTruthy();
    expect(screen.getByLabelText('留下这一刻')).toBeTruthy();
    expect(screen.getByText('颗可用')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '愿望目录' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '我的愿望' })).toBeTruthy();
    expect(screen.queryByText('愿望目录')).toBeNull();
  });

  it('shows a warm empty catalog instead of a blank shop', async () => {
    vi.mocked(fetchRewards).mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText('目录还是空的')).toBeTruthy());
    expect(screen.getByRole('button', { name: '定制愿望' })).toBeTruthy();
  });

  it('lets a shortfall wish open, then offers leaving a record instead of buying', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('一杯喜欢的奶茶')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '一杯喜欢的奶茶，8 宝石' }));
    await waitFor(() => expect(screen.getByText(/还差 7 颗宝石/)).toBeTruthy());
    expect(screen.getByRole('button', { name: '先去留下记录' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '立即下单' })).toBeNull();
  });

  it('offers a rich sticker library when customizing a family wish', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '定制愿望' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '定制愿望' }));
    await waitFor(() => expect(screen.getByText('心情 · 心愿')).toBeTruthy());
    expect(screen.getByLabelText('收起')).toBeTruthy();
    expect(screen.getByRole('tab', { name: '吃喝' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: '宝宝与家' })).toBeTruthy();
    expect(screen.getByLabelText('小猫，心情')).toBeTruthy();
    expect(screen.getByLabelText('彩虹，心情')).toBeTruthy();
    expect(screen.queryByLabelText('看海，出门')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '出门' }));
    expect(screen.getByLabelText('看海，出门')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: '吃喝' }));
    fireEvent.click(screen.getByLabelText('奶茶，吃喝'));
    expect(screen.getByText('吃喝 · 奶茶')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByLabelText('蛋糕，吃喝'));
    expect(screen.getByText('吃喝 · 蛋糕')).toBeTruthy();
    fireEvent.mouseLeave(screen.getByLabelText('蛋糕，吃喝'));
    expect(screen.getByText('吃喝 · 奶茶')).toBeTruthy();
    expect(screen.getByText('定制一个家庭愿望')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('收起'));
    expect(screen.queryByText('定制一个家庭愿望')).toBeNull();
  });
});
