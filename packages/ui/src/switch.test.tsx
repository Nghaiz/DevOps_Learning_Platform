import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Switch } from './switch.tsx';

afterEach(() => {
  cleanup();
});

describe('Switch', () => {
  it('mặc định tắt (aria-checked=false)', () => {
    render(<Switch aria-label="Hiện tên trên bảng xếp hạng" />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('bấm đổi trạng thái và gọi onCheckedChange', async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Bật" onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole('switch'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('điều khiển bằng bàn phím (Space) cũng đổi được trạng thái', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Bật" />);
    screen.getByRole('switch').focus();
    await user.keyboard(' ');
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
  });

  it('disabled ⇒ click không đổi trạng thái', async () => {
    const user = userEvent.setup();
    render(<Switch aria-label="Bật" disabled />);
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });
});
