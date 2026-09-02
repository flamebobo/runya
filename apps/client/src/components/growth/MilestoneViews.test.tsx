import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MilestonePublic, MonthlyStoryResponse } from '@runew/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  MilestoneDetailView,
  MilestoneEditor,
  MilestoneListView,
  MonthlyStoryView,
} from './MilestoneViews';

const milestone: MilestonePublic = {
  id: '01JDEM4MILESTONE00000000000',
  familyId: '01JDEM4FAMILY0000000000000',
  babyId: '01JDEM4BABY000000000000000',
  title: '第一次自己坐稳',
  description: '午睡醒来后，扶着小熊坐了很久。',
  happenedAt: Date.UTC(2026, 8, 2, 9, 30),
  timezoneName: 'Asia/Shanghai',
  coverMediaId: null,
  createdBy: '01JDEM4CREATOR000000000000',
  createdAt: Date.UTC(2026, 8, 2, 9, 31),
  updatedBy: '01JDEM4CREATOR000000000000',
  updatedAt: Date.UTC(2026, 8, 2, 9, 31),
  version: 1,
  syncState: 'synced',
};

const story: MonthlyStoryResponse = {
  month: '2026-09',
  title: '这个月的润润',
  summary: '留下了 2 次成长测量，也收藏了 1 个第一次。',
  growthRecordCount: 2,
  milestoneCount: 1,
  changes: [{ metric: 'height', first: 71.2, latest: 72.5, delta: 1.3, unit: 'cm' }],
  milestones: [milestone],
};

describe('Growth keepsake views', () => {
  it('renders the milestone collection and opens a selected keepsake', () => {
    const onSelect = vi.fn();
    render(
      <MilestoneListView
        babyName="润润"
        items={[milestone]}
        onCreate={vi.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('已点亮 1 颗成长星星')).toBeTruthy();
    expect(screen.getByText('第 1 颗成长星星')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /第一次自己坐稳/ }));
    expect(onSelect).toHaveBeenCalledWith(milestone.id);
  });

  it('renders milestone detail as a keepsake before editing', () => {
    const onEdit = vi.fn();
    render(<MilestoneDetailView item={milestone} onEdit={onEdit} />);

    expect(screen.getByRole('heading', { name: '第一次自己坐稳' })).toBeTruthy();
    expect(screen.getByText('那一天，家人记下')).toBeTruthy();
    expect(screen.getByText('午睡醒来后，扶着小熊坐了很久。')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '编辑这个里程碑' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('fills the existing title field from a preset and saves it', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MilestoneEditor
        onSave={onSave}
        onRemove={vi.fn()}
        onRestore={vi.fn()}
        onDone={vi.fn()}
        onReturn={vi.fn()}
      />,
    );

    const preset = screen.getByRole('button', { name: '第一次走路' });
    fireEvent.click(preset);

    expect(preset.getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByLabelText('名称') as HTMLInputElement).value).toBe(
      '第一次走路',
    );

    fireEvent.click(screen.getByRole('button', { name: '收藏这个第一次' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ title: '第一次走路' }),
        undefined,
      ),
    );
  });

  it('renders a monthly story and links its milestone back to the keepsake', () => {
    const onSelectMilestone = vi.fn();
    render(<MonthlyStoryView story={story} onSelectMilestone={onSelectMilestone} />);

    expect(screen.getByText('这个月，又长大了一点')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('71.2 → 72.5 cm')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '查看第一次自己坐稳' }));
    expect(onSelectMilestone).toHaveBeenCalledWith(milestone.id);
  });
});
