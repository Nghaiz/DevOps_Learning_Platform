import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Checkbox } from './checkbox.tsx';

afterEach(() => {
  cleanup();
});

describe('Checkbox', () => {
  it('mặc định chưa chọn', () => {
    render(<Checkbox aria-label="Đồng ý" />);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  });

  it('bấm chọn gọi onCheckedChange(true)', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Đồng ý" onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
  });

  it('bấm lần hai bỏ chọn', async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Đồng ý" />);
    const box = screen.getByRole('checkbox');
    await user.click(box);
    await user.click(box);
    expect(box.getAttribute('aria-checked')).toBe('false');
  });

  it('disabled ⇒ không đổi trạng thái khi click', async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Đồng ý" disabled />);
    await user.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  });
});
