import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
 * Prop `accent` (cung tròn màu độ khó ở góc) đã gỡ ở review-1 #23: không nơi
 * gọi nào dùng, và nó đi ngược luật góc vuông + màu tuyến. Hai ô dưới gác đúng
 * hai mệnh đề còn lại của khối test cũ: thẻ không vẽ thêm gì ngoài children,
 * và không phát ra màu hardcode.
 */
describe('Card — không còn cung góc', () => {
  it('không có lớp cung nào, không có class màu độ khó', () => {
    const { container } = render(<Card interactive>Nội dung</Card>);
    expect(container.querySelector('[data-slot="card-accent"]')).toBeNull();
    expect(cardClasses(container).filter((name) => name.startsWith('text-difficulty-'))).toEqual([]);
    expect(screen.getByText('Nội dung')).toBeDefined();
  });

  it('không phát ra màu hardcode', () => {
    const { container } = render(<Card interactive>Nội dung</Card>);
    const html = (container.firstElementChild as HTMLElement).outerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(html).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
  });
});
