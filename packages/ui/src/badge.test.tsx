import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge, type BadgeVariant } from './badge.tsx';

afterEach(() => {
  cleanup();
});

/** Bảy biến thể ngữ nghĩa — bốn tiến độ + ba độ khó. */
const SEMANTIC_VARIANTS = [
  'difficulty-basic',
  'difficulty-intermediate',
  'difficulty-advanced',
  'status-todo',
  'status-progress',
  'status-done',
  'status-locked',
] as const satisfies readonly BadgeVariant[];

const ALL_VARIANTS = [
  'default',
  'secondary',
  'success',
  'warning',
  'destructive',
  'outline',
  ...SEMANTIC_VARIANTS,
] as const satisfies readonly BadgeVariant[];

/** `<svg>` đầu tiên trong badge, hoặc `null` nếu biến thể đó không vẽ icon nào. */
function iconOf(container: HTMLElement): SVGElement | null {
  return container.querySelector('svg');
}

/**
 * Danh tính icon lấy từ class `lucide-<tên>` do chính `lucide-react` phát ra
 * (đo được trên DOM thật: `class="lucide lucide-circle-check size-3.5 …"`).
 * Đây là thứ duy nhất phân biệt được HAI icon khác nhau trong jsdom — so
 * `svg.outerHTML` thì đổi một nét path cũng làm test đỏ vô cớ.
 */
function iconName(icon: SVGElement): string {
  return (
    Array.from(icon.classList).find((name) => name.startsWith('lucide-')) ??
    `KHÔNG có class lucide-* trên: ${icon.getAttribute('class') ?? '(không class)'}`
  );
}

describe('Badge', () => {
  /**
   * ⚠ Khẳng định trên ÁNH XẠ variant → class token, không phải trên "render
   * được". `cva` không ném khi một biến thể biến mất — nó lặng lẽ trả class
   * rỗng — nên một test chỉ `getByText('Nhãn')` vẫn xanh sau khi ai đó xoá
   * `success` khỏi bảng, và mọi badge "Đạt" chuyển sang trông như badge
   * mặc định. Đây là chỗ duy nhất đo được điều đó trong jsdom (không có CSSOM
   * thật để đọc màu đã tính).
   */
  it.each([
    ['default', 'bg-primary'],
    ['secondary', 'bg-secondary'],
    ['success', 'bg-success'],
    ['warning', 'bg-warning'],
    ['destructive', 'bg-destructive'],
    ['outline', 'border-border'],
    ['difficulty-basic', 'bg-difficulty-basic'],
    ['difficulty-intermediate', 'bg-difficulty-intermediate'],
    ['difficulty-advanced', 'bg-difficulty-advanced'],
    ['status-todo', 'bg-muted'],
    ['status-progress', 'bg-status-progress'],
    ['status-done', 'bg-status-done'],
    ['status-locked', 'bg-status-locked'],
  ] as const satisfies ReadonlyArray<readonly [BadgeVariant, string]>)(
    'variant=%s ánh xạ sang class %s',
    (variant, expectedClass) => {
      render(<Badge variant={variant}>Nhãn</Badge>);
      const badge = screen.getByText('Nhãn');
      expect(badge.className.split(/\s+/)).toContain(expectedClass);
    },
  );

  /**
   * Màu CHỮ đi kèm, gác riêng: một biến thể có nền đúng mà quên
   * `text-*-foreground` sẽ thừa kế `text-foreground` của cây cha — chữ tối
   * trên nền tô đậm, tức đúng cái lỗi tương phản mà cặp token sinh ra để
   * tránh, và nó KHÔNG lộ ra ở test ánh xạ nền phía trên.
   */
  it.each([
    ['difficulty-basic', 'text-difficulty-basic-foreground'],
    ['difficulty-intermediate', 'text-difficulty-intermediate-foreground'],
    ['difficulty-advanced', 'text-difficulty-advanced-foreground'],
    ['status-todo', 'text-muted-foreground'],
    ['status-progress', 'text-status-progress-foreground'],
    ['status-done', 'text-status-done-foreground'],
    ['status-locked', 'text-status-locked-foreground'],
  ] as const satisfies ReadonlyArray<readonly [BadgeVariant, string]>)(
    'variant=%s mang màu chữ %s',
    (variant, expectedClass) => {
      render(<Badge variant={variant}>Nhãn</Badge>);
      expect(screen.getByText('Nhãn').className.split(/\s+/)).toContain(expectedClass);
    },
  );

  it('mặc định là variant "default" khi không truyền gì', () => {
    render(<Badge>Nhãn</Badge>);
    expect(screen.getByText('Nhãn').className.split(/\s+/)).toContain('bg-primary');
  });

  it.each(ALL_VARIANTS)('variant=%s không phát ra màu hardcode', (variant) => {
    render(<Badge variant={variant}>Nhãn</Badge>);
    const { className } = screen.getByText('Nhãn');
    expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(className).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
  });
});

/**
 * WCAG 1.4.1 Use of Color — màu KHÔNG được là phương tiện DUY NHẤT truyền đạt
 * thông tin. Bảy biến thể ngữ nghĩa mang trạng thái (độ khó, tiến độ), nên mỗi
 * cái phải có một HÌNH riêng bên cạnh màu riêng.
 *
 * Vì sao gác ở đây chứ không ở axe: axe-core không có rule nào cho 1.4.1 — nó
 * không thể biết hai badge khác màu có cùng nghĩa hay không. Kiểm được bằng
 * máy thì chỉ còn cách này.
 */
describe('Badge — icon ngữ nghĩa (WCAG 1.4.1, không chỉ dựa vào màu)', () => {
  it.each(SEMANTIC_VARIANTS)('variant=%s có icon mặc định, và icon đó ẩn với trình đọc màn hình', (variant) => {
    const { container } = render(<Badge variant={variant}>Nhãn</Badge>);
    const icon = iconOf(container);
    expect(icon, `variant ${variant} phải có icon mặc định — màu một mình không đủ`).not.toBeNull();
    // Icon đi KÈM chữ ⇒ trang trí ⇒ phải ẩn, nếu không trình đọc màn hình đọc
    // thừa một node vô nghĩa cạnh nhãn đã nói đủ.
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
  });

  /**
   * Đối chứng cho chính phép đo trên: bốn trạng thái tiến độ phải là BỐN hình
   * KHÁC NHAU. Nếu không có khẳng định này thì gán nhầm cả bốn về cùng một
   * icon vẫn xanh ở test "có icon mặc định" — tức bảo đảm 1.4.1 sẽ rỗng ruột
   * đúng theo cách nó hay rỗng.
   */
  it('bốn trạng thái tiến độ mang bốn hình KHÁC NHAU', () => {
    const names = ['status-todo', 'status-progress', 'status-done', 'status-locked'].map((variant) => {
      const { container } = render(<Badge variant={variant as BadgeVariant}>Nhãn</Badge>);
      const icon = iconOf(container);
      expect(icon).not.toBeNull();
      return iconName(icon as SVGElement);
    });
    expect(new Set(names).size, `trùng hình: ${names.join(', ')}`).toBe(4);
  });

  it('ba mức độ khó mang ba hình KHÁC NHAU', () => {
    const names = ['difficulty-basic', 'difficulty-intermediate', 'difficulty-advanced'].map((variant) => {
      const { container } = render(<Badge variant={variant as BadgeVariant}>Nhãn</Badge>);
      const icon = iconOf(container);
      expect(icon).not.toBeNull();
      return iconName(icon as SVGElement);
    });
    expect(new Set(names).size, `trùng hình: ${names.join(', ')}`).toBe(3);
  });

  it.each(['default', 'secondary', 'success', 'warning', 'destructive', 'outline'] as const)(
    'variant=%s (phi ngữ nghĩa) KHÔNG tự thêm icon',
    (variant) => {
      const { container } = render(<Badge variant={variant}>Nhãn</Badge>);
      expect(iconOf(container)).toBeNull();
    },
  );

  it('icon đứng TRƯỚC nhãn, không phải sau', () => {
    const { container } = render(<Badge variant="status-done">Đã xong</Badge>);
    const badge = screen.getByText('Đã xong');
    expect(badge.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(iconOf(container)).not.toBeNull();
  });

  it('`icon` do nơi gọi truyền THAY icon mặc định', () => {
    const { container } = render(
      <Badge variant="status-done" icon={<svg data-testid="riêng" aria-hidden="true" />}>
        Đã xong
      </Badge>,
    );
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByTestId('riêng')).toBeDefined();
  });

  it('`icon={null}` TẮT hẳn icon, kể cả icon mặc định của biến thể', () => {
    const { container } = render(
      <Badge variant="status-done" icon={null}>
        Đã xong
      </Badge>,
    );
    expect(iconOf(container)).toBeNull();
    expect(screen.getByText('Đã xong')).toBeDefined();
  });

  it('nhãn vẫn là accessible name của badge — icon không chen vào', () => {
    render(<Badge variant="status-locked">Bị khoá</Badge>);
    // `textContent` là thứ trình đọc màn hình gom lại; icon `aria-hidden`
    // không đóng góp gì, nên chuỗi phải SẠCH, không dính tên icon.
    expect(screen.getByText('Bị khoá').textContent).toBe('Bị khoá');
  });
});
