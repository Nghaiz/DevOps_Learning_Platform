import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { StepNav, type StepNavItem, type StepNavLabels } from './step-nav.tsx';

const ITEMS: readonly StepNavItem[] = [
  { key: 'intro', label: 'Giới thiệu', done: true },
  { key: 'step0', label: 'Bước 0', done: true },
  { key: 'step1', label: 'Bước 1', done: false },
  { key: 'finish', label: 'Hoàn thành', done: false },
];

const LABELS: StepNavLabels = {
  list: 'Các bước của bài',
  prev: 'Trước',
  next: 'Tiếp',
  done: 'Đã đạt',
  current: 'Đang làm',
  todo: 'Chưa làm',
};

function renderNav(activeKey: string, onSelect = vi.fn()) {
  render(
    <StepNav items={ITEMS} activeKey={activeKey} onSelect={onSelect} labels={LABELS}>
      <p>THAN_BUOC</p>
    </StepNav>,
  );
  return onSelect;
}

describe('StepNav: tuyến dọc', () => {
  it('là một danh sách có tên, mỗi bước một mục', () => {
    renderNav('step0');
    const list = screen.getByRole('list', { name: 'Các bước của bài' });
    expect(list.querySelectorAll(':scope > li')).toHaveLength(ITEMS.length);
  });

  it('thân bước chỉ treo dưới bước ĐANG mở, đúng một lần', () => {
    renderNav('step1');
    expect(screen.getAllByText('THAN_BUOC')).toHaveLength(1);
    const current = screen.getByRole('button', { name: /Bước 1/ });
    expect(current.closest('li')?.textContent).toContain('THAN_BUOC');
  });

  it('mục đang mở mang aria-current="step", các mục khác thì không', () => {
    renderNav('step0');
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toContain('Bước 0');
  });

  it('bấm một bước gọi onSelect với đúng key', async () => {
    const onSelect = renderNav('intro');
    await userEvent.click(screen.getByRole('button', { name: /Hoàn thành/ }));
    expect(onSelect).toHaveBeenCalledWith('finish');
  });

  it('Trước khoá ở bước đầu, Tiếp thì không', () => {
    renderNav('intro');
    expect((screen.getByRole('button', { name: 'Trước', exact: true }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Tiếp', exact: true }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Tiếp ở bước cuối bị khoá', () => {
    renderNav('finish');
    expect((screen.getByRole('button', { name: 'Tiếp', exact: true }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Trước/Tiếp đi đúng sang bước kề', async () => {
    const onSelect = renderNav('step0');
    await userEvent.click(screen.getByRole('button', { name: 'Tiếp', exact: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Trước', exact: true }));
    expect(onSelect.mock.calls).toEqual([['step1'], ['intro']]);
  });

  it('trạng thái khác nhau ở HÌNH: đã đạt, đang làm, chưa làm', () => {
    const { container } = render(<StepNav items={ITEMS} activeKey="step1" onSelect={vi.fn()} labels={LABELS} />);
    const stations = [...container.querySelectorAll('[data-station]')].map((el) => el.getAttribute('data-station'));
    expect(stations).toEqual(['done', 'done', 'current', 'todo']);
    // Ga đã đạt có dấu tích, ga chưa làm thì không.
    expect(container.querySelectorAll('[data-station="done"] svg')).toHaveLength(2);
    expect(container.querySelectorAll('[data-station="todo"] svg')).toHaveLength(0);
  });

  it('trạng thái đọc được bằng chữ, và ga trang trí bị ẩn khỏi cây trợ năng', () => {
    const { container } = render(<StepNav items={ITEMS} activeKey="step1" onSelect={vi.fn()} labels={LABELS} />);
    expect(screen.getByRole('button', { name: /Bước 1, Đang làm/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /Giới thiệu, Đã đạt/ })).toBeDefined();
    for (const station of container.querySelectorAll('[data-station]')) {
      expect(station.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('hiện vị trí/tổng của bước đang mở', () => {
    renderNav('step1');
    expect(document.body.textContent).toContain('3/4');
  });

  it('activeKey không khớp mục nào: không bung thân bước nào, không in con số sai', () => {
    renderNav('khong-co');
    expect(screen.queryByText('THAN_BUOC')).toBeNull();
    expect(document.body.textContent).not.toContain('0/4');
  });

  it('mọi nút bước có vòng focus bằng token `ring`', () => {
    renderNav('step0');
    for (const name of [/Giới thiệu/, /Bước 1/]) {
      expect(screen.getByRole('button', { name }).className).toContain('focus-visible:ring-ring');
    }
  });
});
