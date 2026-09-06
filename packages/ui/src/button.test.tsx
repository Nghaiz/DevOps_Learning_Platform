import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Button } from './button.tsx';
import { Spinner } from './spinner.tsx';

afterEach(() => {
  cleanup();
});

describe('Button — tương thích ngược', () => {
  it('ba variant cũ (primary/secondary/ghost) vẫn render không lỗi', () => {
    render(
      <div>
        <Button variant="primary">A</Button>
        <Button variant="secondary">B</Button>
        <Button variant="ghost">C</Button>
      </div>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'B' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'C' })).toBeDefined();
  });
});

/**
 * ⚠ Ở đây KHÔNG chỉ khẳng định "render được". Một `render()` + `getByRole()`
 * cho một biến thể là phép kiểm không bao giờ đỏ được: nó chỉ hỏng nếu `cva`
 * ném lỗi, mà `cva` không ném — biến thể lạ chỉ lặng lẽ trả về class rỗng.
 * Tức là xoá `destructive` khỏi bảng variant vẫn để test cũ xanh, và nút
 * "Kết thúc phiên" chuyển sang trông y hệt nút thường.
 *
 * Thứ thực sự là hợp đồng ở tầng này là ÁNH XẠ biến thể → class token. Khẳng
 * định lên `className` là khẳng định lên đúng thứ đó, và cũng là cách duy nhất
 * đo được trong jsdom (không có CSSOM thật để đọc màu đã tính).
 */
describe('Button — variant ánh xạ đúng class token', () => {
  it.each([
    ['primary', 'bg-primary'],
    ['secondary', 'bg-secondary'],
    ['outline', 'border-input'],
    ['ghost', 'hover:bg-accent'],
    ['destructive', 'bg-destructive'],
    ['link', 'text-primary'],
  ] as const)('variant=%s có class %s', (variant, expectedClass) => {
    render(<Button variant={variant}>Nút</Button>);
    const button = screen.getByRole('button', { name: 'Nút' });
    expect(button.className.split(/\s+/)).toContain(expectedClass);
  });

  it.each([
    ['sm', 'h-8'],
    ['md', 'h-10'],
    ['lg', 'h-11'],
    ['icon', 'size-10'],
  ] as const)('size=%s có class %s', (size, expectedClass) => {
    render(<Button size={size}>Nút</Button>);
    expect(screen.getByRole('button', { name: 'Nút' }).className.split(/\s+/)).toContain(expectedClass);
  });

  it('mặc định là primary/md khi không truyền variant/size', () => {
    render(<Button>Nút</Button>);
    const classes = screen.getByRole('button', { name: 'Nút' }).className.split(/\s+/);
    expect(classes).toContain('bg-primary');
    expect(classes).toContain('h-10');
  });

  /**
   * Quy tắc §5.1 của `docs/design-system.md` ("không bao giờ `#hex` hay
   * `slate-*`/`gray-*`/…") được gác bằng một lệnh grep ở Đợt 3. Grep đó đọc
   * MÃ NGUỒN; test này đọc class THỰC SỰ ĐI RA DOM sau khi qua `cva` +
   * `tailwind-merge`, nên nó còn bắt được màu lọt vào qua `className` của nơi
   * gọi hoặc qua một biến thể sinh động.
   */
  it.each(['primary', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const)(
    'variant=%s không phát ra màu hardcode (#hex / slate-* / gray-* / zinc-* / neutral-*)',
    (variant) => {
      render(<Button variant={variant}>Nút</Button>);
      const { className } = screen.getByRole('button', { name: 'Nút' });
      expect(className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(className).not.toMatch(/\b(slate|gray|zinc|neutral)-[0-9]{2,3}\b/);
    },
  );
});

describe('Button — loading', () => {
  it('loading=true ⇒ disabled, aria-busy, hiện Spinner, vẫn giữ text con trong DOM (giữ bề rộng)', () => {
    render(<Button loading>Lưu</Button>);
    // Tên hỗ trợ tiếp cận (accessible name) của nút PHẢI vẫn là "Lưu" — Spinner
    // đè lên mang `aria-hidden` nên KHÔNG được gộp "Đang tải" vào tên nút.
    // `aria-busy="true"` trên chính nút là tín hiệu bận dành cho trình đọc màn
    // hình, không phải nhãn của Spinner con.
    const button = screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    // `hidden: true` vì Spinner đè bị `aria-hidden` — vẫn PHẢI có mặt trong DOM
    // (giữ bề rộng nút), chỉ ẩn khỏi cây accessibility.
    expect(screen.getByRole('status', { name: 'Đang tải', hidden: true })).toBeDefined();
    expect(button.textContent).toBe('Lưu');
  });

  it('loading=false (mặc định) ⇒ không disabled, không Spinner', () => {
    render(<Button>Lưu</Button>);
    const button = screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('Button — disabled', () => {
  it('disabled=true (không loading) ⇒ nút vô hiệu, click không gọi onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Gửi
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Gửi' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button — asChild', () => {
  it('render root là phần tử con (thẻ a) thay vì <button>', () => {
    render(
      <Button asChild>
        <a href="/lessons">Đi tới bài học</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Đi tới bài học' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/lessons');
  });

  /**
   * Hồi quy cho lỗi Radix `Slot` yêu cầu `Children.only`: JSX có HAI biểu thức
   * con luôn tạo MẢNG cho `props.children`, kể cả khi một trong hai bằng
   * `false` lúc runtime — nên `asChild && loading` từng ném "Slot failed to
   * slot onto its children". Đã sửa (nhánh ternary một biểu thức) nhưng chưa
   * từng có test ghim lại; hình dạng lỗi này quay lại rất dễ khi ai đó thêm
   * một `{icon}` cạnh `{children}`.
   */
  it('asChild + loading KHÔNG ném lỗi Slot single-child', () => {
    expect(() =>
      render(
        <Button asChild loading>
          <a href="/lessons">Đi tới bài học</a>
        </Button>,
      ),
    ).not.toThrow();
    expect(screen.getByRole('link', { name: 'Đi tới bài học' })).toBeDefined();
  });

  /**
   * `disabled` là thuộc tính chỉ có tác dụng trên phần tử form. Với `<a>` nó
   * được in ra nhưng bị bỏ qua hoàn toàn, và `disabled:pointer-events-none` /
   * `disabled:opacity-50` không khớp vì `:disabled` không bao giờ đúng với
   * anchor. Trước bản sửa: liên kết "bị khoá" vẫn bấm được, vẫn nhận focus, và
   * trông y hệt liên kết bình thường.
   */
  it('asChild + disabled: khoá bằng aria-disabled + pointer-events-none, không dựa vào thuộc tính disabled', () => {
    render(
      <Button asChild disabled>
        <a href="/admin">Quản trị</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Quản trị' });
    expect(link.getAttribute('aria-disabled')).toBe('true');
    const classes = link.className.split(/\s+/);
    expect(classes).toContain('pointer-events-none');
    expect(classes).toContain('opacity-50');
  });

  /**
   * Nhánh `asChild` KHÔNG render Spinner (Slot chỉ nhận một phần tử con), nên
   * `text-transparent` ở đây sẽ giấu nhãn mà không có gì thay thế — chữ tàng
   * hình, không spinner. `tailwind-merge` còn nuốt luôn
   * `text-primary-foreground` khi hai class cùng nhóm `text-color` gặp nhau,
   * nên hỏng này không thể tự lộ bằng mắt trong jsdom.
   */
  it('asChild + loading: giữ nhãn NHÌN THẤY ĐƯỢC (không text-transparent khi không có Spinner)', () => {
    render(
      <Button asChild loading>
        <a href="/lessons">Đi tới bài học</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Đi tới bài học' });
    const classes = link.className.split(/\s+/);
    expect(classes).not.toContain('text-transparent');
    expect(classes).toContain('text-primary-foreground');
    expect(link.getAttribute('aria-busy')).toBe('true');
    expect(link.getAttribute('aria-disabled')).toBe('true');
  });

  it('asChild KHÔNG loading/disabled: không dính pointer-events-none (liên kết vẫn bấm được)', () => {
    render(
      <Button asChild>
        <a href="/lessons">Đi tới bài học</a>
      </Button>,
    );
    const classes = screen.getByRole('link', { name: 'Đi tới bài học' }).className.split(/\s+/);
    expect(classes).not.toContain('pointer-events-none');
    expect(classes).not.toContain('opacity-50');
    expect(screen.getByRole('link', { name: 'Đi tới bài học' }).getAttribute('aria-disabled')).toBeNull();
  });
});

/**
 * Đây là chỗ GÁC miễn trừ SC 1.4.11 mà `theme/tokens.contract.test.ts` khai ở
 * khối "miễn trừ CÓ CHỨNG MINH": cặp `--ring`/`--primary` được rút khỏi bảng
 * đo với lý do "vòng focus đã tách khỏi mặt nút bằng offset". Không có test
 * này thì miễn trừ đó là một đoạn văn không thể sai — tức không gác gì cả.
 *
 * Hai class phải đi CÙNG NHAU. `ring-offset-2` một mình để Tailwind rơi về
 * mặc định của nó, `--tw-ring-offset-color: #fff` — khe TRẮNG trên nền tối.
 */
describe('Button — vòng focus tách khỏi mặt nút (miễn trừ SC 1.4.11)', () => {
  it.each(['primary', 'destructive', 'secondary', 'outline', 'ghost', 'link'] as const)(
    'variant=%s có ĐỦ CẢ HAI class offset',
    (variant) => {
      render(<Button variant={variant}>Nút</Button>);
      const classes = screen.getByRole('button', { name: 'Nút' }).className.split(/\s+/);
      expect(classes).toContain('focus-visible:ring-offset-2');
      expect(classes, 'thiếu ring-offset-background ⇒ khe offset màu #fff, trắng trên nền tối').toContain(
        'focus-visible:ring-offset-background',
      );
    },
  );

  it('KHÔNG quay lại `ring-offset-0` — vòng focus sát mặt nút primary chỉ 1.00:1, vô hình', () => {
    render(<Button variant="primary">Nút</Button>);
    expect(screen.getByRole('button', { name: 'Nút' }).className.split(/\s+/)).not.toContain(
      'focus-visible:ring-offset-0',
    );
  });
});

/**
 * Spinner của `loading` TỪNG VÔ HÌNH ở mọi biến thể nút thường.
 *
 * `text-transparent` trên `<button>` (để giấu nhãn phía sau) làm
 * `currentColor` thành trong suốt, mà `lucide-react` vẽ icon bằng
 * `stroke="currentColor"` + `fill="none"` — không còn nét nào. Lớp bọc Spinner
 * lại khai đúng `text-current`, tức nó thừa kế chính sự trong suốt đó.
 *
 * ⚠ Vì sao test cũ không thể bắt: jsdom KHÔNG tính computed style, nên
 * `getByRole('status')` vẫn thấy phần tử — nó chỉ không nhìn thấy được. Một
 * test khẳng định phần tử CÓ MẶT là test không bao giờ đỏ được. Thứ khẳng định
 * ở đây vì vậy là CLASS quyết định màu.
 */
describe('Button — Spinner lúc loading phải có màu riêng, không thừa kế currentColor', () => {
  it.each([
    ['primary', 'text-primary-foreground'],
    ['secondary', 'text-secondary-foreground'],
    ['outline', 'text-foreground'],
    ['ghost', 'text-foreground'],
    ['destructive', 'text-destructive-foreground'],
    ['link', 'text-primary'],
  ] as const)('variant=%s: lớp bọc Spinner đặt màu %s', (variant, tone) => {
    render(
      <Button variant={variant} loading>
        Lưu
      </Button>,
    );
    const spinner = screen.getByRole('status', { name: 'Đang tải', hidden: true });
    const wrapper = spinner.parentElement;
    expect(wrapper).not.toBeNull();
    const classes = (wrapper as HTMLElement).className.split(/\s+/);
    expect(classes).toContain(tone);
    expect(classes, '`text-current` chính là thứ đã làm Spinner vô hình').not.toContain('text-current');
  });

  /**
   * Tiền đề của test trên. Nếu một ngày `text-transparent` bị bỏ khỏi nút thì
   * `text-current` lại vô hại, và khẳng định `not.toContain('text-current')` ở
   * trên mất ý nghĩa mà vẫn xanh. Test này giữ cho tiền đề đó tường minh.
   */
  it('nút loading VẪN mang `text-transparent` — nên lớp bọc buộc phải tự có màu', () => {
    render(<Button loading>Lưu</Button>);
    expect(screen.getByRole('button', { name: 'Lưu' }).className.split(/\s+/)).toContain('text-transparent');
  });

  /**
   * `Spinner` độc lập thì `text-current` là ĐÚNG (nó theo màu chữ của chỗ đặt
   * nó — ErrorState, nút đang thử lại…). Ghim lại để không ai "sửa" luôn cả
   * component gốc khi đọc test ở trên.
   */
  it('`Spinner` dùng độc lập vẫn giữ `text-current` — chỉ lớp bọc trong Button mới cần màu riêng', () => {
    render(<Spinner />);
    expect(screen.getByRole('status', { name: 'Đang tải' }).getAttribute('class')).toContain('text-current');
  });
});