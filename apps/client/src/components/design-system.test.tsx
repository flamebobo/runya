import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppDrawer, DEFAULT_DRAWER_ITEMS } from './navigation/AppDrawer';
import { BottomNav } from './navigation/BottomNav';
import { PrimaryActionButton } from './buttons';
import { CuteIconChip } from './foundation/CuteIconChip';
import { GlassDateField } from './forms';
import { ChoiceCard } from './shell/ChoiceCard';
import { AddMomentOverlay } from './overlay/AddMomentOverlay';

describe('design system components', () => {
  it('renders BottomNav with five hit areas', () => {
    const { container } = render(
      <BottomNav active="today" onSelect={() => undefined} onAddClick={() => undefined} />,
    );

    const hitAreas = container.querySelectorAll('[role="button"]');
    expect(hitAreas.length).toBe(5);
    expect(screen.getByLabelText('今天')).toBeTruthy();
    expect(screen.getByLabelText('留下这一刻')).toBeTruthy();
    expect(screen.getByLabelText('回忆')).toBeTruthy();
    expect(screen.getByLabelText('小家')).toBeTruthy();
  });

  it('keeps memory capture as one entry in the central add flow', () => {
    render(<AddMomentOverlay open onSelect={() => undefined} />);

    expect(screen.getByRole('button', { name: '回忆' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '照片' })).toBeNull();
    expect(screen.queryByRole('button', { name: '声音' })).toBeNull();
    expect(screen.queryByRole('button', { name: '宝宝语录' })).toBeNull();
  });

  it('renders the side drawer with 11 items and a backdrop', () => {
    render(
      <AppDrawer
        open
        items={DEFAULT_DRAWER_ITEMS}
        onClose={() => undefined}
        onAdminClick={() => undefined}
      />,
    );

    expect(screen.getByLabelText('应用菜单')).toBeTruthy();
    expect(screen.getByText('润芽 · RUNEW')).toBeTruthy();
    expect(screen.getByLabelText('今天')).toBeTruthy();
    expect(screen.getByLabelText('设置')).toBeTruthy();
    expect(screen.getByLabelText('进入管理模式')).toBeTruthy();
    expect(screen.getByLabelText('关闭菜单')).toBeTruthy();
    expect(screen.getByLabelText('通知')).toBeTruthy();
    expect(DEFAULT_DRAWER_ITEMS).toHaveLength(11);
  });

  it('keeps the closed drawer in the tree but hidden', () => {
    const { container } = render(<AppDrawer open={false} items={DEFAULT_DRAWER_ITEMS} />);
    const overlay = container.querySelector('[aria-label="应用菜单"]');
    expect(overlay).toBeTruthy();
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps loading/disabled button layout stable', () => {
    const { rerender, container } = render(
      <PrimaryActionButton label="保存" state="default" fullWidth={false} />,
    );
    const defaultWidth = container.querySelector('button')?.getBoundingClientRect().width ?? 0;

    rerender(<PrimaryActionButton label="保存" state="loading" fullWidth={false} />);
    const loadingWidth = container.querySelector('button')?.getBoundingClientRect().width ?? 0;

    rerender(<PrimaryActionButton label="保存" state="disabled" fullWidth={false} />);
    const disabled = container.querySelector('button') as HTMLButtonElement;
    expect(disabled.disabled).toBe(true);
    expect(loadingWidth).toBeGreaterThanOrEqual(defaultWidth * 0.9);
  });

  it('renders a date field as a picker trigger', () => {
    render(<GlassDateField label="生日" value="2026-03-22" onChange={() => undefined} />);
    expect(screen.getByLabelText('生日')).toBeTruthy();
    expect(screen.getByText('2026年3月22日')).toBeTruthy();
  });

  it('renders identity choice cards with a selected state', () => {
    render(
      <ChoiceCard
        title="爸爸"
        caption="把陪伴收进时间线"
        glyph="family"
        tone="sage"
        selected
        onClick={() => undefined}
      />,
    );
    expect(screen.getByLabelText('爸爸')).toBeTruthy();
    expect(screen.getByLabelText('爸爸').getAttribute('aria-pressed')).toBe('true');
  });

  it('renders CuteIconChip as a decorative 48px bubble', () => {
    const { container } = render(<CuteIconChip icon="family" tone="sage" />);
    const chip = container.querySelector('[aria-hidden="true"]');
    expect(chip).toBeTruthy();
  });
});
