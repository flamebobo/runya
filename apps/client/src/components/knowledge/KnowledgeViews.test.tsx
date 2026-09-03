import { fireEvent, render, screen } from '@testing-library/react';
import type { KnowledgeRecommendation } from '@runew/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  KnowledgeCard,
  KnowledgeQuickEntry,
  KnowledgeSearchBar,
  formatAgeWindow,
  formatReviewDate,
} from './KnowledgeViews';

const article: KnowledgeRecommendation = {
  id: '01JDEMKNOWLEDGE00000000000',
  title: '白天小睡的节奏，可以慢慢观察出来',
  summary: '观察困意信号比卡时间更有效。',
  category: 'SLEEP',
  minAgeDays: 90,
  maxAgeDays: 210,
  sourceName: '美国儿科学会育儿百科',
  sourceUrl: null,
  reviewedAt: Date.UTC(2026, 7, 20),
  contentVersion: 1,
  priority: 85,
  publishedAt: Date.UTC(2026, 7, 20),
  updatedAt: Date.UTC(2026, 7, 20),
  version: 1,
  reason: '适合 3–7 个月大的宝宝',
};

describe('knowledge cards', () => {
  it('renders category, age window, source and recommendation reason', () => {
    render(<KnowledgeCard item={article} reason={article.reason} onClick={vi.fn()} />);

    expect(screen.getByText('睡眠')).toBeTruthy();
    expect(screen.getByText('适合 3–7 个月大的宝宝')).toBeTruthy();
    expect(screen.getByText(/来源：美国儿科学会育儿百科/)).toBeTruthy();
    expect(screen.getByText('3–7 个月')).toBeTruthy();
  });

  it('opens the article and triggers save / later / dismiss actions', () => {
    const onClick = vi.fn();
    const onSave = vi.fn();
    const onLater = vi.fn();
    const onDismiss = vi.fn();
    render(
      <KnowledgeCard
        item={article}
        onClick={onClick}
        onSave={onSave}
        onLater={onLater}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /阅读白天小睡/ }));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '收藏' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '稍后看' }));
    expect(onLater).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '不感兴趣' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // 卡片级操作不应触发打开详情。
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the content-updated banner for an upgraded version', () => {
    render(
      <KnowledgeCard item={article} contentUpdated onClick={vi.fn()} />,
    );
    expect(screen.getByText('内容有更新，点击看看新版本')).toBeTruthy();
  });

  it('formats age windows and review dates in product tone', () => {
    expect(formatAgeWindow(null, null)).toBe('各阶段通用');
    expect(formatAgeWindow(304, 456)).toBe('10–15 个月');
    expect(formatAgeWindow(150, null)).toBe('5 个月起');
    expect(formatAgeWindow(null, 120)).toBe('4 个月以内');
    expect(formatReviewDate(Date.UTC(2026, 7, 20))).toBe('2026年8月20日');
  });
});

describe('knowledge quick entries and search bar', () => {
  it('renders three library entries with counts and opens them', () => {
    const onOpenLibrary = vi.fn();
    render(
      <KnowledgeQuickEntry
        savedCount={2}
        laterCount={1}
        learnedCount={5}
        onOpenLibrary={onOpenLibrary}
      />,
    );

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '打开已学' }));
    expect(onOpenLibrary).toHaveBeenCalledWith('learned');
  });

  it('renders search bar placeholder and clears the query', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <KnowledgeSearchBar value="" onChange={onChange} onFocusSearch={vi.fn()} />,
    );
    expect(screen.getByText('搜搜辅食、睡眠、出牙…')).toBeTruthy();

    rerender(
      <KnowledgeSearchBar value="辅食" onChange={onChange} onFocusSearch={vi.fn()} />,
    );
    expect(screen.getByText('辅食')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '清空搜索' }));
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('renders an editable search input on the search page', () => {
    const onChange = vi.fn();
    render(
      <KnowledgeSearchBar
        editable
        value=""
        onChange={onChange}
        onFocusSearch={vi.fn()}
      />,
    );
    // editable 模式渲染真实输入框（test-setup 将 Input 映射为 input）。
    const input = screen.getByLabelText('输入搜索关键词');
    fireEvent.change(input, { target: { value: '辅食' } });
    expect(onChange).toHaveBeenCalledWith('辅食');
  });

  it('plays the learned-out transition when justLearned is set', () => {
    render(<KnowledgeCard item={article} justLearned onClick={vi.fn()} />);
    expect(screen.getByText('已记下，下一篇继续')).toBeTruthy();
  });
});
