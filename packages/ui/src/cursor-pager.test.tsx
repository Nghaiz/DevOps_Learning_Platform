import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CursorPager } from './cursor-pager.tsx';

afterEach(() => {
  cleanup();
});

describe('CursorPager', () => {
  it('hiện đúng số trang', () => {
    render(<CursorPager hasNext page={3} onNext={vi.fn()} onReset={vi.fn()} />);
    expect(screen.getByText('Trang 3')).toBeDefined();
  });

  it('hasNext=false ⇒ nút Tiếp disable (KHÔNG ẩn — người dùng thấy đã hết trang)', () => {
    render(<CursorPager hasNext={false} page={2} onNext={vi.fn()} onReset={vi.fn()} />);
    const next = screen.getByRole('button', { name: 'Tiếp' }) as HTMLButtonElement;
    expect(next).toBeDefined();
    expect(next.disabled).toBe(true);
  });

  it('bấm Tiếp gọi onNext khi hasNext=true', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(<CursorPager hasNext page={1} onNext={onNext} onReset={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('bấm "Về đầu" gọi onReset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<CursorPager hasNext page={4} onNext={vi.fn()} onReset={onReset} />);
    await user.click(screen.getByRole('button', { name: 'Về đầu' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('page=1 ⇒ "Về đầu" disable (đã ở đầu, không có gì để quay lại)', () => {
    render(<CursorPager hasNext page={1} onNext={vi.fn()} onReset={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Về đầu' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('loading=true ⇒ nút Tiếp ở trạng thái loading (disabled)', () => {
    render(<CursorPager hasNext page={1} loading onNext={vi.fn()} onReset={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Tiếp' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
