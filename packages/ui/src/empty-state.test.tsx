import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state.tsx';
import { Button } from './button.tsx';

afterEach(() => {
  cleanup();
});

describe('EmptyState', () => {
  it('render title, không có description/action thì không render các phần đó', () => {
    render(<EmptyState title="Chưa có lab nào" />);
    expect(screen.getByText('Chưa có lab nào')).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('có action ⇒ render được nút hành động và bấm được', () => {
    render(
      <EmptyState
        title="Chưa có lab nào"
        description="Là tác giả? Tạo lab đầu tiên."
        action={<Button>Tạo lab</Button>}
      />,
    );
    expect(screen.getByText('Là tác giả? Tạo lab đầu tiên.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tạo lab' })).toBeDefined();
  });
});

/**
 * Trạng thái rỗng phải trông CÓ CHỦ Ý. Icon là thứ phân biệt "không có gì ở
 * đây, bình thường thôi" với "trang bị lỗi" — nên nó là MẶC ĐỊNH, không phải
 * tuỳ nơi gọi nhớ truyền.
 */
describe('EmptyState — icon', () => {
  it('không truyền `icon` ⇒ vẫn có icon mặc định', () => {
    const { container } = render(<EmptyState title="Chưa có lab nào" />);
    expect(container.querySelector('svg'), 'trạng thái rỗng chỉ có chữ ⇒ trông như trang lỗi').not.toBeNull();
  });

  /**
   * Icon lặp lại điều `title` đã nói bằng chữ ⇒ trang trí ⇒ phải ẩn. Khẳng
   * định trên LỚP BỌC chứ không trên `<svg>`: chính lớp bọc mang `aria-hidden`,
   * nên icon do nơi gọi truyền vào cũng được che theo mà không cần tự khai.
   */
  it('icon nằm trong khối `aria-hidden` — kể cả icon do nơi gọi truyền', () => {
    const { container } = render(
      <EmptyState title="Chưa có lab nào" icon={<svg data-testid="riêng" />} />,
    );
    const icon = container.querySelector('[data-testid="riêng"]');
    expect(icon).not.toBeNull();
    expect(icon?.closest('[aria-hidden="true"]'), 'icon lọt ra ngoài vùng ẩn ⇒ đọc thừa').not.toBeNull();
  });

  it('`icon` do nơi gọi truyền THAY icon mặc định (không phải cộng thêm)', () => {
    const { container } = render(
      <EmptyState title="Chưa có lab nào" icon={<svg data-testid="riêng" />} />,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('`icon={null}` ⇒ không vẽ icon nào, và không để lại khối bọc rỗng', () => {
    const { container } = render(<EmptyState title="Chưa có lab nào" icon={null} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('icon không chen vào phần chữ trình đọc màn hình nhận được', () => {
    render(<EmptyState title="Chưa có lab nào" description="Là tác giả? Tạo lab đầu tiên." />);
    expect(screen.getByText('Chưa có lab nào').textContent).toBe('Chưa có lab nào');
  });

  it('không phát ra màu hardcode', () => {
    const { container } = render(<EmptyState title="Chưa có lab nào" description="Thử bỏ bớt bộ lọc." />);
    const html = (container.firstElementChild as HTMLElement).outerHTML;
    expect(html).not.toMatch(/class="[^"]*#[0-9a-fA-F]{3,8}/);
    expect(html).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
  });
});

/**
 * Design §3: trạng thái rỗng là "vòng ellipse hở, **bên trong không có gì**".
 *
 * Vế thứ hai là vế dễ mất nhất, và mất im lặng: một `<circle fill>` nền, một
 * đĩa `bg-muted` ở lớp bọc, hay một glyph nhét vào giữa đều render ra bình
 * thường và trông "đầy đặn hơn" với mắt chưa đọc design. Nên nó có cổng riêng
 * chứ không gộp vào ô kiểm hình.
 */
describe('EmptyState: hình mặc định là đoạn tuyến tàu vuông', () => {
  it('vẽ đoạn tuyến với ga vuông, không hình tròn nào', () => {
    const { container } = render(<EmptyState title="Chưa có lab nào" />);
    const svg = container.querySelector('svg[data-empty-glyph="station"]');
    expect(svg, 'thiếu hình mặc định của trạng thái rỗng').not.toBeNull();
    expect(svg?.querySelectorAll('rect').length).toBe(3);
    expect(svg?.querySelectorAll('circle, ellipse').length).toBe(0);
  });

  it('ga cuối rỗng ruột, viền đứt: chưa có gì ở đó', () => {
    const { container } = render(<EmptyState title="Chưa có lab nào" />);
    const rects = container.querySelectorAll('svg rect');
    const last = rects[rects.length - 1];
    expect(last?.getAttribute('fill')).toBe('none');
    expect(last?.getAttribute('stroke-dasharray')).not.toBeNull();
  });

  it('lớp bọc không có đĩa nền tròn', () => {
    const { container } = render(<EmptyState title="Chưa có lab nào" />);
    const wrapper = container.querySelector('[aria-hidden="true"]');
    const classes = (wrapper?.getAttribute('class') ?? '').split(/s+/);
    expect(classes).not.toContain('bg-muted');
    expect(classes).not.toContain('rounded-full');
  });
});
