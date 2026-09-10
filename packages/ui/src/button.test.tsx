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
    // nền ĐẶC đã bỏ — nay là viền, xem §'tách destructive khỏi primary'
    ['destructive', 'border-destructive'],
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
    // chữ NGHỈ của biến thể viền là 'text-destructive', không phải '-foreground'
    ['destructive', 'text-destructive'],
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
/**
 * Khe icon trái/phải. KHÔNG đụng tới nhánh `loading`/Spinner hay `ring-offset`
 * — hai thứ đó có cổng riêng ở trên và vừa được sửa.
 */
describe('Button — khe icon', () => {
  it('`iconLeft` render TRƯỚC nhãn, `iconRight` render SAU', () => {
    render(
      <Button iconLeft={<svg data-testid="trái" aria-hidden="true" />} iconRight={<svg data-testid="phải" aria-hidden="true" />}>
        Bắt đầu
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Bắt đầu' });
    const order = Array.from(button.querySelectorAll('[data-testid]')).map((node) =>
      node.getAttribute('data-testid'),
    );
    expect(order).toEqual(['trái', 'phải']);
    // Nhãn phải nằm GIỮA hai icon, không phải trước cả hai.
    expect(button.textContent).toBe('Bắt đầu');
  });

  it('icon KHÔNG chen vào accessible name của nút', () => {
    render(
      <Button iconLeft={<svg aria-hidden="true" />}>Lưu</Button>,
    );
    // Tìm được bằng đúng tên "Lưu" nghĩa là icon không đóng góp chữ nào.
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDefined();
  });

  it('cỡ icon mặc định nhường cho cỡ khai tường minh', () => {
    render(<Button>Nút</Button>);
    const classes = screen.getByRole('button', { name: 'Nút' }).className.split(/\s+/);
    /*
     * `[&_svg]:size-4` trần sẽ là `.nút svg` (0,1,1) và thắng class `size-5`
     * (0,1,0) của chính icon — nơi gọi mất khả năng phóng to icon, một cách IM
     * LẶNG. `:not([class*='size-'])` là thứ trả lại quyền đó, nên nó được ghim
     * ở đây chứ không chỉ nằm trong chú thích.
     */
    expect(classes).toContain("[&_svg:not([class*='size-'])]:size-4");
  });

  /**
   * Ghim GIỚI HẠN, không phải tính năng: Radix `Slot` đòi `props.children` là
   * ĐÚNG MỘT React element, nên nhánh `asChild` không thể chèn thêm node anh
   * em. Không có test này thì việc icon biến mất đọc ra như một con bug ngẫu
   * nhiên; có nó thì đó là một hành vi đã khai báo, và ai đổi ý sẽ thấy dòng
   * này đỏ chứ không phải người dùng thấy nút vỡ.
   */
  it('`asChild`: icon bị BỎ QUA (Slot chỉ nhận một element con) — nhãn vẫn nguyên', () => {
    render(
      <Button asChild iconLeft={<svg data-testid="trái" aria-hidden="true" />}>
        <a href="/bai-hoc">Đi tới bài học</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Đi tới bài học' });
    expect(link.textContent).toBe('Đi tới bài học');
    expect(screen.queryByTestId('trái'), 'Slot không thể nhận node anh em — xem chú thích single-child').toBeNull();
  });

  it('nút đang `loading` vẫn giữ nguyên icon trong luồng (bề rộng không nhảy)', () => {
    render(
      <Button loading iconLeft={<svg data-testid="trái" aria-hidden="true" />}>
        Lưu
      </Button>,
    );
    // Icon vẫn render — `text-transparent` của nút làm mờ cả cụm icon+nhãn
    // phía sau Spinner, thay vì gỡ icon ra khỏi luồng làm nút co lại.
    expect(screen.getByTestId('trái')).toBeDefined();
    /*
     * Tìm Spinner bằng DOM chứ KHÔNG bằng `getByRole('status')`: trong nút,
     * Spinner nằm trong lớp bọc `aria-hidden="true"` (cố ý — nếu không, tên
     * nút bị gộp thành "Đang tảiLưu"), nên nó KHÔNG có mặt trong cây trợ năng
     * và `getByRole` không thể thấy. Chỉ `<Spinner>` dùng ĐỘC LẬP mới giữ
     * `role="status"` — đó là ca mà test ở khối trên kiểm.
     */
    const spinner = document.querySelector('svg[data-slot="spinner"]');
    expect(spinner, 'nhánh loading phải còn Spinner đè giữa').not.toBeNull();
    expect(spinner?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('không truyền icon ⇒ nút không tự sinh svg nào (Spinner chỉ xuất hiện khi loading)', () => {
    const { container } = render(<Button>Nút</Button>);
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });
});

/**
 * Quyết định #1 của 14.A: sau khi thương hiệu chuyển sang ĐỎ, `primary` và
 * `destructive` phải phân biệt được KHÔNG DỰA VÀO MÀU.
 *
 * Vì sao phải gác ở đây chứ không tin vào mắt: hai token nay chỉ lệch 2.3° hue
 * (`--primary` 25 vs `--destructive` 27.325), đo được **1.01:1** giữa hai mặt
 * nút ở nhánh sáng. Nếu cả hai cùng tô nền đặc thì "Lưu" và "Xoá vĩnh viễn"
 * trông y hệt nhau — và với người mù màu đỏ-lục, hoặc trên bản in đen trắng,
 * chúng ĐÚNG LÀ một.
 *
 * ⚠ jsdom KHÔNG có CSSOM thật nên không đọc được màu đã tính; một test kiểu
 * "ảnh chụp khác nhau" không viết được ở tầng này. Thứ đo được — và cũng là
 * thứ thật sự quyết định — là các class CẤU TRÚC đi ra DOM. Chúng là những
 * khác biệt SỐNG SÓT khi khử màu:
 *
 *   | | primary | destructive |
 *   |---|---|---|
 *   | nền      | `bg-primary` (ĐẶC) | `bg-transparent` (rỗng) |
 *   | viền     | không có | `border` + `border-destructive` |
 *   | chữ      | `text-primary-foreground` (sáng, đảo) | `text-destructive` (đậm) |
 *   | icon     | không có mặc định | `TriangleAlert` bắt buộc |
 *
 * Quy ra độ chói tương đối (chính là kênh xám mà ảnh đen trắng giữ lại): nền
 * nút primary là một khối ĐẶC, còn nền nút destructive lúc nghỉ TRONG SUỐT nên
 * nó lộ ra mặt bên dưới. Chênh lệch đo được **6.0885:1** ở nhánh sáng và
 * **4.6415:1** ở nhánh tối (trên `--card`: 6.0885 / 4.2009). Tức ngay cả khi
 * xoá sạch sắc độ, hai nút vẫn là "khối đặc tối" cạnh "khung rỗng sáng".
 *
 * ⚠ Bốn con số trên ĐÃ ĐỔI ngày 2026-09-10 (trước là 4.82 / 4.61, tính cho
 * `--primary` = `#e31029` của hệ cũ). `p16-tokens.md` đặt `--primary` sáng
 * thành `#BC2626`, nên khoảng cách rộng ra.
 *
 * Vế SỐ HỌC của khẳng định này KHÔNG nằm ở đây mà ở
 * `theme/tokens.contract.test.ts` § "AC-4 — luật hai kênh sống sót khi KHỬ
 * MÀU", vì chuỗi oklch → sRGB → độ chói sống ở đó. Chép chuỗi ấy sang một test
 * component chỉ để lấy một con số là dựng bản thứ hai của phép đo, rồi hai bản
 * trôi khỏi nhau. Ở FILE NÀY thứ được gác là các class CẤU TRÚC đi ra DOM —
 * chúng là thứ jsdom thật sự quan sát được.
 */
describe('Button — primary vs destructive phân biệt được khi KHỬ MÀU (quyết định #1, 14.A)', () => {
  const classesOf = (name: string) =>
    screen.getByRole('button', { name }).className.split(/\s+/);

  it('primary tô nền ĐẶC và KHÔNG có viền; destructive có viền và KHÔNG tô nền', () => {
    render(
      <div>
        <Button variant="primary">Lưu</Button>
        <Button variant="destructive">Xoá</Button>
      </div>,
    );
    const primary = classesOf('Lưu');
    const destructive = classesOf('Xoá');

    expect(primary).toContain('bg-primary');
    expect(primary, 'primary có viền thì nó mất đúng dấu hiệu tách nó khỏi destructive').not.toContain('border');

    expect(destructive).toContain('border');
    expect(destructive).toContain('border-destructive');
    expect(destructive).toContain('bg-transparent');
    expect(destructive, 'nền đặc quay lại ⇒ hai nút lại trông như nhau khi khử màu').not.toContain('bg-destructive');
  });

  it('hai nút KHÔNG chung bất kỳ class nền/viền/chữ nào — khác biệt là cấu trúc, không phải sắc độ', () => {
    render(
      <div>
        <Button variant="primary">Lưu</Button>
        <Button variant="destructive">Xoá</Button>
      </div>,
    );
    const shape = (list: string[]) =>
      list.filter((c) => /^(bg-|border|text-)/.test(c) && c !== 'text-sm');
    const primary = new Set(shape(classesOf('Lưu')));
    const shared = shape(classesOf('Xoá')).filter((c) => primary.has(c));
    expect(shared, `class trùng nhau: ${shared.join(', ')}`).toEqual([]);
  });

  /**
   * Icon là NỬA CÒN LẠI của tín hiệu. Viền một mình không đủ: `outline` cũng có
   * viền, nên "có viền" chỉ nói "đây không phải nút chính", chưa nói "đây là
   * nút NGUY HIỂM".
   */
  it('destructive tự mang icon cảnh báo; primary thì KHÔNG', () => {
    const { container: withDestructive } = render(<Button variant="destructive">Xoá</Button>);
    expect(withDestructive.querySelector('svg.lucide-triangle-alert')).not.toBeNull();
    cleanup();

    const { container: withPrimary } = render(<Button variant="primary">Lưu</Button>);
    expect(withPrimary.querySelector('svg')).toBeNull();
  });

  it('icon mặc định KHÔNG lọt vào tên hỗ trợ tiếp cận của nút', () => {
    render(<Button variant="destructive">Xoá vĩnh viễn</Button>);
    // Tên nút phải đúng là nhãn — nếu icon thiếu `aria-hidden` thì thuật toán
    // tính tên gộp thêm node svg và `getByRole` với tên chính xác sẽ trượt.
    const button = screen.getByRole('button', { name: 'Xoá vĩnh viễn' });
    expect(button.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('`iconLeft` của nơi gọi ĐÈ icon mặc định, `iconLeft={null}` TẮT hẳn', () => {
    const { container } = render(
      <Button variant="destructive" iconLeft={<Spinner size="sm" />}>
        Xoá
      </Button>,
    );
    expect(container.querySelector('svg.lucide-triangle-alert')).toBeNull();
    cleanup();

    const { container: off } = render(
      <Button variant="destructive" iconLeft={null}>
        Xoá
      </Button>,
    );
    expect(off.querySelector('svg')).toBeNull();
  });

  /**
   * Cùng ràng buộc single-child của Radix `Slot` như `iconLeft` thường: nhánh
   * `asChild` truyền thẳng `children`, nên icon mặc định cũng phải im lặng lùi
   * ra. Ghim lại để nó là một hành vi CÓ CHỦ Ý, không phải một sự bỏ qua tình cờ
   * mà lần refactor sau sẽ "sửa" thành lỗi Slot.
   */
  it('asChild BỎ QUA icon mặc định (Slot chỉ nhận đúng một element con)', () => {
    const { container } = render(
      <Button variant="destructive" asChild>
        <a href="/xoa">Xoá</a>
      </Button>,
    );
    expect(container.querySelector('a')).not.toBeNull();
    expect(container.querySelector('svg')).toBeNull();
  });
});
