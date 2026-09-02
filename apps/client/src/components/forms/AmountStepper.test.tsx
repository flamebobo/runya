import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AmountStepper } from './AmountStepper';

describe('AmountStepper', () => {
  it('shows the current milliliters and steps by 30', () => {
    const onChange = vi.fn();
    const { rerender } = render(<AmountStepper value={120} onChange={onChange} />);

    expect(screen.getByLabelText('当前 120 毫升')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('增加 30 毫升'));
    expect(onChange).toHaveBeenCalledWith(150);

    fireEvent.click(screen.getByLabelText('减少 30 毫升'));
    expect(onChange).toHaveBeenCalledWith(90);

    rerender(<AmountStepper value={30} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('减少 30 毫升'));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('jumps to a preset tick', () => {
    const onChange = vi.fn();
    render(<AmountStepper value={120} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('180 毫升'));
    expect(onChange).toHaveBeenCalledWith(180);
  });
});
