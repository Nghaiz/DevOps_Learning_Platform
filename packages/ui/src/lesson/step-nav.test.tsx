import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { StepNav, type StepNavItem } from './step-nav.tsx';
import { ProgressBar } from './progress-bar.tsx';

const ITEMS: readonly StepNavItem[] = [
  { key: 'intro', label: 'Giới thiệu', done: true },
  { key: 'step0', label: 'Bước 0', done: true },
  { key: 'step1', label: 'Bước 1', done: false },
  { key: 'finish', label: 'Hoàn thành', done: false },
];

describe('StepNav', () => {
  it('vô hiệu hoá nút Trước khi đang ở mục đầu tiên', () => {
    render(<StepNav items={ITEMS} activeKey="intro" onSelect={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Trước' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Tiếp' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('vô hiệu hoá nút Tiếp khi đang ở mục cuối cùng', () => {
    render(<StepNav items={ITEMS} activeKey="finish" onSelect={vi.fn()} />);
    expect((screen.getByRole('button', { name: 'Tiếp' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Trước' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('bấm vào một mục gọi onSelect với đúng key của mục đó', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StepNav items={ITEMS} activeKey="intro" onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /Bước 1/ }));
    expect(onSelect).toHaveBeenCalledWith('step1');
  });

  it('mục đang active mang aria-current="step", các mục khác thì không', () => {
    render(<StepNav items={ITEMS} activeKey="step0" onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Bước 0/ }).getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: /Bước 1/ }).getAttribute('aria-current')).toBeNull();
  });

  it('nút Trước/Tiếp điều hướng đúng mục kề nhau dựa trên vị trí của activeKey', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StepNav items={ITEMS} activeKey="step0" onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Trước' }));
    expect(onSelect).toHaveBeenCalledWith('intro');
    await user.click(screen.getByRole('button', { name: 'Tiếp' }));
    expect(onSelect).toHaveBeenCalledWith('step1');
  });
});

/**
 * ProgressBar được test ở ĐÂY, không phải một `progress-bar.test.tsx` riêng.
 * Nguyên do: brief phân quyền file cho agent này chỉ liệt kê đúng 5 file
 * (split-pane.tsx/.test.tsx, step-nav.tsx/.test.tsx, progress-bar.tsx) — KHÔNG
 * có `progress-bar.test.tsx`. Thêm một file ngoài danh sách sẽ phá ranh giới
 * sở hữu file dùng để tránh đụng độ với agent song song khác đang làm việc
 * trong cùng thư mục `lesson/`. Test ProgressBar được gộp vào file gần nhất
 * còn quyền ghi thay vì bỏ sót — xem báo cáo cuối cùng để biết đây là một chỗ
 * hợp đồng nhiệm vụ thiếu sót, không phải một lựa chọn tuỳ tiện.
 *
 * (Test dùng DOM API thuần thay vì matcher jest-dom. Lưu ý: jest-dom NAY đã
 * là devDependency và được nạp ở `vitest.setup.ts` — bản đầu của chú thích này
 * nói ngược lại và đã hết đúng.)
 */
describe('ProgressBar', () => {
  it('tính đúng phần trăm và đặt các thuộc tính aria progressbar', () => {
    render(<ProgressBar value={3} max={10} label="Tiến độ" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('10');
    const fill = bar.firstChild as HTMLElement;
    expect(fill.style.width).toBe('30%');
    expect(screen.getByText('Tiến độ')).not.toBeNull();
  });

  it('max = 0 không tạo ra NaN trong style width — trả về 0% thay vì chia cho 0', () => {
    render(<ProgressBar value={0} max={0} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstChild as HTMLElement;
    expect(fill.style.width).toBe('0%');
    expect(fill.style.width).not.toContain('NaN');
  });
});
