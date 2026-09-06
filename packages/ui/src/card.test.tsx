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
 * Độ nổi + chuyển động. Mọi khẳng định ở đây là trên CLASS, không trên style
 * đã tính: jsdom không có CSSOM thật (không nạp `globals.css`, không phân giải
 * `var(--elevation-1)`), nên `getComputedStyle(card).boxShadow` trả rỗng ở
 * MỌI trường hợp — một test đọc nó sẽ xanh y hệt nhau dù bóng có hay không.
 * Ánh xạ class là thứ duy nhất đo được ở tầng này; việc class đó có sinh ra
 * luật CSS hay không do `theme/tokens.contract.test.ts` gác (`@theme inline`).
 */
describe('Card — độ nổi và chuyển động', () => {
  it('lúc NGHỈ mang `shadow-elevation-1`, và KHÔNG còn `shadow-sm` cũ', () => {
    const { container } = render(<Card>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('shadow-elevation-1');
    /*
     * `tailwind-merge` KHÔNG khử được cặp này (`elevation-1` không phải cỡ áo
     * phông nên nó rơi vào nhóm shadow-COLOR, mà "màu" thì không xung đột với
     * "bóng") — đo được:
     *   twMerge('shadow-sm shadow-elevation-1') → cả hai cùng sống
     * Nên `shadow-sm` phải được GỠ khỏi nguồn, không thể trông chờ cn() dọn.
     * Để lại cả hai thì thứ tự nguồn CSS quyết định bóng nào thắng.
     */
    expect(classes, 'shadow-sm còn sót ⇒ hai luật box-shadow cùng sống, thứ tự nguồn quyết định').not.toContain(
      'shadow-sm',
    );
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
    expect(classes).not.toContain('hover:shadow-elevation-2');
    expect(classes).not.toContain('motion-safe:hover:-translate-y-0.5');
    expect(container.querySelector('[data-slot="card"]')?.getAttribute('data-interactive')).toBeNull();
  });

  it('`interactive` bật nhấc nhẹ + `--elevation-2` khi hover', () => {
    const { container } = render(<Card interactive>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('hover:shadow-elevation-2');
    expect(classes).toContain('hover:border-input');
    expect(container.querySelector('[data-slot="card"]')?.getAttribute('data-interactive')).toBe('true');
  });

  /**
   * Nhấc phải viết bằng `motion-safe:`, KHÔNG phải `hover:` trần rồi trông chờ
   * khối `@media (prefers-reduced-motion)` toàn cục ở `globals.css` dọn hộ:
   * khối đó hạ `transition-duration` xuống 0.01ms, tức nó làm chuyển động TỨC
   * THÌ chứ không gỡ `translate` đi — thẻ vẫn giật nảy, chỉ là nảy ngay lập
   * tức. Đây là chỗ duy nhất bắt được sự khác biệt đó.
   */
  it('nhấc nằm sau `motion-safe:` nên biến mất hẳn khi người dùng yêu cầu giảm chuyển động', () => {
    const { container } = render(<Card interactive>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('motion-safe:hover:-translate-y-0.5');
    expect(classes, 'nhấc trần ⇒ vẫn giật dưới prefers-reduced-motion, chỉ là giật tức thì').not.toContain(
      'hover:-translate-y-0.5',
    );
  });
});

describe('Card — dải màu độ khó', () => {
  it.each([
    ['basic', 'border-l-difficulty-basic'],
    ['intermediate', 'border-l-difficulty-intermediate'],
    ['advanced', 'border-l-difficulty-advanced'],
  ] as const)('accent=%s vẽ dải %s', (accent, expectedClass) => {
    const { container } = render(<Card accent={accent}>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain(expectedClass);
    expect(classes, 'thiếu bề rộng ⇒ dải màu có màu mà không có dải').toContain('border-l-4');
  });

  it('không truyền `accent` ⇒ không có dải nào', () => {
    const { container } = render(<Card>Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).not.toContain('border-l-4');
    expect(classes.filter((name) => name.startsWith('border-l-difficulty-'))).toEqual([]);
  });

  it('dải màu không đụng viền chung — `border-border` vẫn còn cho ba cạnh kia', () => {
    const { container } = render(<Card accent="advanced">Nội dung</Card>);
    const classes = cardClasses(container);
    expect(classes).toContain('border-border');
    expect(classes).toContain('border-l-difficulty-advanced');
  });

  it('không phát ra màu hardcode ở bất kỳ tổ hợp nào', () => {
    const { container } = render(
      <Card interactive accent="intermediate">
        Nội dung
      </Card>,
    );
    const className = cardClasses(container).join(' ');
    expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(className).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
  });
});
