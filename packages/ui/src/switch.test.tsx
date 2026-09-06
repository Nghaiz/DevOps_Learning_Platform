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

/**
 * Gác miễn trừ SC 1.4.11 — xem `theme/tokens.contract.test.ts` khối "miễn trừ
 * CÓ CHỨNG MINH". Lúc BẬT rãnh là `bg-primary` = `--ring`, nên không có offset
 * thì vòng focus của một Switch đang bật là 1.00:1.
 */
describe('Switch — vòng focus tách khỏi mặt rãnh (miễn trừ SC 1.4.11)', () => {
  it('có ĐỦ CẢ HAI class offset, ở cả trạng thái tắt lẫn bật', () => {
    render(<Switch aria-label="Bật" defaultChecked />);
    const classes = screen.getByRole('switch').className.split(/\s+/);
    expect(classes).toContain('focus-visible:ring-offset-2');
    expect(classes, 'thiếu ring-offset-background ⇒ khe offset màu #fff, trắng trên nền tối').toContain(
      'focus-visible:ring-offset-background',
    );
  });
});
