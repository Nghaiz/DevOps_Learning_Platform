import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ARC_PATH_D, ARC_STROKE_HAIRLINE } from '@devops-platform/motion/motif';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card.tsx';

afterEach(() => {
  cleanup();
});

/** Class của chính `<div data-slot="card">`, tách sẵn để khẳng định từng token. */
function cardClasses(container: HTMLElement): readonly string[] {
  const card = container.querySelector('[data-slot="card"]');
  if (card === null) throw new Error('không tìm thấy [data-slot="card"]');
  return (card.getAttribute('class') ?? '').split(/\s+/);
}

describe('Card — tương thích ngược', () => {
  it('preserves h3 by default and allows a page or section heading without changing its styles', () => {
    const { rerender } = render(<CardTitle>Title</CardTitle>);
    const defaultTitle = screen.getByRole('heading', { level: 3, name: 'Title' });
    const style = defaultTitle.className;
    rerender(<CardTitle as="h1">Title</CardTitle>);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' }).className).toBe(style);
    rerender(<CardTitle as="h2">Title</CardTitle>);
    expect(screen.getByRole('heading', { level: 2, name: 'Title' }).className).toBe(style);
  });

  it('Card + CardTitle + CardDescription render trực tiếp không cần CardHeader', () => {
    render(
      <Card>
        <CardTitle>Bài học Kubernetes</CardTitle>
        <CardDescription>Triển khai Pod đầu tiên</CardDescription>
      </Card>,
    );
    expect(screen.getByText('Bài học Kubernetes')).toBeDefined();
    expect(screen.getByText('Triển khai Pod đầu tiên')).toBeDefined();
  });
});

describe('Card — bộ compound đầy đủ', () => {
  it('CardHeader/CardContent/CardFooter render đúng thứ tự nội dung', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Tiêu đề</CardTitle>
        </CardHeader>
        <CardContent>Nội dung</CardContent>
        <CardFooter>Hành động</CardFooter>
      </Card>,
    );
    expect(screen.getByText('Tiêu đề')).toBeDefined();
    expect(screen.getByText('Nội dung')).toBeDefined();
    expect(screen.getByText('Hành động')).toBeDefined();
  });
});

/**
 * Tấm phẳng (design-brief §0.1): KHÔNG bóng, KHÔNG bo góc, viền hairline. Mọi
 * khẳng định ở đây là trên CLASS, không trên style đã tính: jsdom không có
 * CSSOM thật (không nạp `globals.css`), nên `getComputedStyle(card).boxShadow`
 * trả rỗng ở MỌI trường hợp — một test đọc nó sẽ xanh dù bóng có hay không.
 */
describe('Card — tấm phẳng và phản hồi tương tác', () => {
  it('lúc NGHỈ không có class bóng nào và không có class bo góc nào', () => {
    const { container } = render(<Card>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes.filter((name) => /(^|:)shadow-/.test(name)), 'thẻ nổi bằng bóng là thứ bản dựng lại cấm').toEqual([]);
    expect(classes.filter((name) => /(^|:)rounded-/.test(name)), 'bo góc quay lại ⇒ thẻ hết vuông').toEqual([]);
    expect(classes).toContain('border-border');
    expect(classes).toContain('bg-card');
  });

  it('chuyển tiếp chạy theo token `--motion-base` + `ease-out`, không phải số cứng', () => {
    const { container } = render(<Card>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('duration-[var(--motion-base)]');
    expect(classes).toContain('ease-out');
    // Số cứng kiểu `duration-200` là đúng thứ token sinh ra để thay thế.
    expect(classes.filter((name) => /^duration-\d+$/.test(name))).toEqual([]);
  });

  it('MẶC ĐỊNH không có hover — thẻ tĩnh không được hứa một hành động không tồn tại', () => {
    const { container } = render(<Card>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes.filter((name) => name.startsWith('hover:') || name.includes(':active:'))).toEqual([]);
    expect(
      container.querySelector('[data-slot="card"]')?.getAttribute('data-interactive'),
    ).toBeNull();
  });

  it('`interactive` đổi viền sang mực + nền ngả muted khi hover, KHÔNG nhấc thẻ', () => {
    const { container } = render(<Card interactive>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('hover:border-ink');
    expect(classes).toContain('hover:bg-muted/40');
    expect(classes.filter((name) => name.includes('-translate-y'))).toEqual([]);
    expect(container.querySelector('[data-slot="card"]')?.getAttribute('data-interactive')).toBe(
      'true',
    );
  });

  /**
   * Lún phải viết bằng `motion-safe:`, KHÔNG phải `active:` trần rồi trông chờ
   * khối `@media (prefers-reduced-motion)` toàn cục ở `globals.css` dọn hộ:
   * khối đó hạ `transition-duration` xuống 0.01ms, tức nó làm chuyển động TỨC
   * THÌ chứ không gỡ `translate` đi — thẻ vẫn giật, chỉ là giật ngay lập tức.
   */
  it('cú lún khi nhấn nằm sau `motion-safe:`', () => {
    const { container } = render(<Card interactive>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('motion-safe:active:translate-y-px');
    expect(classes, 'lún trần ⇒ vẫn giật dưới prefers-reduced-motion').not.toContain('active:translate-y-px');
  });
});

/**
 * Cung màu độ khó — design §3 ("một cung màu ở góc thay cho viền trái phẳng").
 *
 * Khối này là bản CHUYỂN của khối "dải màu độ khó" cũ, không phải một khối
 * mới: mỗi ô dưới đây gác đúng mệnh đề mà ô tương ứng ở bản `border-l-4` gác,
 * chỉ đọc trên hình mới. Không ô nào bị xoá — đổi hình mà bớt cổng thì lần
 * hỏng sau sẽ im lặng.
 *
 * Khẳng định trên `d` chứ không chỉ trên sự tồn tại của `<svg>`: một `<svg>`
 * rỗng cũng render ra một `<svg>`. `ARC_PATH_D` là thứ duy nhất chứng minh
 * hình được vẽ LÀ vòng ellipse của motif chứ không phải một hình bất kỳ ai đó
 * dán vào.
 */
describe('Card — cung màu độ khó', () => {
  function accentArc(container: HTMLElement): SVGPathElement {
    const path = container.querySelector('[data-slot="card-accent"] path');
    if (path === null) throw new Error('không tìm thấy cung của [data-slot="card-accent"]');
    return path as unknown as SVGPathElement;
  }

  it.each([
    ['basic', 'text-difficulty-basic'],
    ['intermediate', 'text-difficulty-intermediate'],
    ['advanced', 'text-difficulty-advanced'],
  ] as const)('accent=%s vẽ cung màu %s', (accent, expectedClass) => {
    const { container } = render(<Card accent={accent}>Nội dung</Card>);
    const svg = container.querySelector('[data-slot="card-accent"] svg');
    expect(svg, 'không có cung nào ⇒ thẻ mất chỉ dấu độ khó').not.toBeNull();
    expect((svg?.getAttribute('class') ?? '').split(/\s+/)).toContain(expectedClass);
    // `currentColor` + `text-difficulty-*` là cặp: thiếu vế nào thì cung có
    // hình mà không có màu, hoặc có màu mà không ai đọc được nó.
    expect(accentArc(container).getAttribute('stroke')).toBe('currentColor');
    expect(
      accentArc(container).getAttribute('stroke-width'),
      'thiếu bề dày ⇒ cung có màu mà không có nét',
    ).toBe(String(ARC_STROKE_HAIRLINE));
    expect(accentArc(container).getAttribute('d'), 'cung không phải ellipse của motif').toBe(
      ARC_PATH_D,
    );
  });

  it('không truyền `accent` ⇒ không có cung nào', () => {
    const { container } = render(<Card>Nội dung</Card>);
    expect(container.querySelector('[data-slot="card-accent"]')).toBeNull();
    expect(cardClasses(container).filter((name) => name.startsWith('text-difficulty-'))).toEqual(
      [],
    );
  });

  it('cung không đụng viền chung — `border-border` vẫn còn cho cả bốn cạnh', () => {
    const { container } = render(<Card accent="advanced">Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('border-border');
    // Dải `border-l-4` cũ ĐÃ ĐI: để sót nó lại thì thẻ mang cả hai chỉ dấu.
    expect(classes, 'dải viền trái cũ còn sót ⇒ hai chỉ dấu độ khó cùng lúc').not.toContain(
      'border-l-4',
    );
    expect(container.querySelector('[data-slot="card-accent"]')).not.toBeNull();
  });

  /**
   * `inset-0` phủ toàn thẻ. Thiếu `pointer-events-none` thì lớp bọc nuốt mọi
   * cú bấm — và `CatalogCard` là một `<Link>` bọc ngoài `Card`, nên lỗi đó
   * giết đúng đường đi chính của lưới danh mục mà không đỏ ở bất kỳ đâu khác.
   */
  it('lớp bọc cung KHÔNG chặn con trỏ', () => {
    const { container } = render(<Card accent="basic">Nội dung</Card>);
    const wrapper = container.querySelector('[data-slot="card-accent"]');
    expect((wrapper?.getAttribute('class') ?? '').split(/\s+/)).toContain('pointer-events-none');
    expect(
      wrapper?.getAttribute('aria-hidden'),
      'cung lặp lại điều Badge đã nói ⇒ phải ẩn với AT',
    ).toBe('true');
  });

  /**
   * Cung định vị TUYỆT ĐỐI theo thẻ. Không có `relative` trên chính thẻ, nó
   * neo vào tổ tiên định vị gần nhất — khác nhau ở mỗi nơi gọi, và hỏng im
   * lặng: cung vẫn vẽ, chỉ là vẽ ở một góc màn hình nào đó.
   */
  it('thẻ mang `relative` để cung neo đúng vào nó', () => {
    const { container } = render(<Card accent="basic">Nội dung</Card>);
    expect(cardClasses(container)).toContain('relative');
  });

  it('nội dung con vẫn render khi có cung — cung không thế chỗ children', () => {
    render(<Card accent="advanced">Nội dung</Card>);
    expect(screen.getByText('Nội dung')).toBeDefined();
  });

  it('không phát ra màu hardcode ở bất kỳ tổ hợp nào', () => {
    const { container } = render(
      <Card interactive accent="intermediate">
        Nội dung
      </Card>,
    );
    const html = (container.firstElementChild as HTMLElement).outerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(html).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
  });
});
