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

/**
 * Gác miễn trừ SC 1.4.11 — xem `theme/tokens.contract.test.ts` khối "miễn trừ
 * CÓ CHỨNG MINH". Lúc TÍCH, ô là `bg-primary` = `--ring`: hộp kiểm đang được
 * chọn là hộp kiểm KHÔNG thấy được focus, nếu thiếu offset.
 */
describe('Checkbox — vòng focus tách khỏi mặt ô (miễn trừ SC 1.4.11)', () => {
  it('có ĐỦ CẢ HAI class offset', () => {
    render(<Checkbox aria-label="Đồng ý" defaultChecked />);
    const classes = screen.getByRole('checkbox').className.split(/\s+/);
    expect(classes).toContain('focus-visible:ring-offset-2');
    expect(classes, 'thiếu ring-offset-background ⇒ khe offset màu #fff, trắng trên nền tối').toContain(
      'focus-visible:ring-offset-background',
    );
  });
});
