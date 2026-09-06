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

/**
 * Gác nửa còn lại của miễn trừ SC 1.4.11 (`theme/tokens.contract.test.ts`,
 * khối "miễn trừ CÓ CHỨNG MINH"). Bước đang chọn là `bg-primary` = `--ring`
 * ⇒ vòng focus 1.00:1.
 *
 * `ring-offset` KHÔNG dùng được ở đây: hàng bước nằm trong `overflow-x-auto`,
 * nên một vòng đẩy thêm ra ngoài sẽ bị cắt ở mép cuộn — cắt vòng focus cũng là
 * một lỗi a11y, chỉ khác hình dạng. `ring-current` lấy chữ của chính nút:
 * `--primary-foreground` khi đang chọn, `--muted-foreground` khi không, cả hai
 * đã nằm trong `TEXT_PAIRS` ≥4.5:1.
 */
describe('StepNav — vòng focus của mục bước không dùng --ring', () => {
  it.each([
    ['đang chọn', 'intro', 'Giới thiệu'],
    ['không chọn', 'intro', 'Bước 1'],
  ] as const)('mục %s dùng `ring-current`, KHÔNG dùng `ring-ring`', (_label, activeKey, name) => {
    render(<StepNav items={ITEMS} activeKey={activeKey} onSelect={vi.fn()} />);
    const classes = screen.getByRole('button', { name }).className.split(/\s+/);
    expect(classes).toContain('focus-visible:ring-current');
    expect(classes).not.toContain('focus-visible:ring-ring');
  });
});

/**
 * Ba trạng thái bước phải khác nhau bằng HÌNH, không chỉ bằng màu (SC 1.4.1).
 *
 * Khẳng định trên `svg.innerHTML` — tức phần hình học (`<path>`/`<circle>`)
 * BÊN TRONG icon — chứ không trên class hay màu. Nếu ai đó thay ba icon bằng
 * một icon duy nhất tô ba màu, class vẫn khác nhau (`text-success` vs
 * `text-primary`) nên một phép so class sẽ XANH trong khi thứ vừa mất là đúng
 * cái test này sinh ra để giữ. Hình học thì không nói dối được.
 */
describe('StepNav — trạng thái phân biệt bằng hình, không chỉ bằng màu', () => {
  function markerShape(name: string | RegExp): string {
    const svg = screen.getByRole('button', { name }).querySelector('svg');
    expect(svg, `mục "${String(name)}" không có icon trạng thái nào`).not.toBeNull();
    return svg?.innerHTML ?? '';
  }

  it('đã đạt / đang làm / chưa tới cho ra ba hình khác nhau', () => {
    // activeKey = step1 (chưa đạt) ⇒ có đủ ba: step0 đã đạt, step1 đang làm,
    // finish chưa tới.
    render(<StepNav items={ITEMS} activeKey="step1" onSelect={vi.fn()} />);
    const shapes = [markerShape(/Bước 0/), markerShape(/Bước 1/), markerShape(/Hoàn thành/)];
    expect(new Set(shapes).size, `ba trạng thái chỉ cho ${String(new Set(shapes).size)} hình khác nhau`).toBe(3);
  });

  it('icon trạng thái KHÔNG lọt vào tên khả truy cập của nút', () => {
    render(<StepNav items={ITEMS} activeKey="step1" onSelect={vi.fn()} />);
    // `name` khớp CHÍNH XÁC: thêm bất kỳ chữ nào (kể cả sr-only "đã đạt") vào
    // trong nút sẽ làm dòng này đỏ — và cũng sẽ làm
    // `e2e/flows/lesson.flow.spec.ts` đỏ, muộn hơn nhiều.
    expect(screen.getByRole('button', { name: 'Bước 0' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Giới thiệu' })).not.toBeNull();
  });
});

describe('StepNav — vị trí trên tổng số', () => {
  it('hiện "vị trí/tổng" của mục đang chọn', () => {
    render(<StepNav items={ITEMS} activeKey="step1" onSelect={vi.fn()} />);
    // ITEMS = [intro, step0, step1, finish] ⇒ step1 là mục thứ 3 trên 4.
    expect(screen.getByRole('navigation', { name: 'Các bước của bài học' }).textContent).toContain('3/4');
  });

  it('activeKey không khớp mục nào ⇒ KHÔNG in ra một con số sai', () => {
    render(<StepNav items={ITEMS} activeKey="khong-ton-tai" onSelect={vi.fn()} />);
    const nav = screen.getByRole('navigation', { name: 'Các bước của bài học' });
    expect(nav.textContent).not.toContain('0/4');
  });
});

/**
 * Cổng cho lỗi axe `aria-progressbar-name` mức **serious** mà lượt e2e ngày
 * 2026-09-06 bắt được ở `/lessons/:id`.
 *
 * `getByRole('progressbar', { name })` của Testing Library TÍNH tên khả truy
 * cập theo đúng thuật toán accname mà axe dùng — nên đây là phép kiểm trên
 * cùng một thứ axe đo, không phải một phép so thuộc tính gần đúng. Trước bản
 * vá, cả hai `it` dưới đây ném "Unable to find an accessible element".
 */
describe('ProgressBar — tên khả truy cập (axe aria-progressbar-name)', () => {
  it('lấy tên từ `label` khi có', () => {
    render(<ProgressBar value={3} max={10} label="Tiến độ" />);
    expect(screen.getByRole('progressbar', { name: 'Tiến độ' })).not.toBeNull();
  });

  it('vẫn có tên khi caller KHÔNG truyền label', () => {
    render(<ProgressBar value={0} max={4} />);
    expect(screen.getByRole('progressbar', { name: 'Tiến độ bài học' })).not.toBeNull();
  });
});

describe('ProgressBar — số phần trăm cho mắt, không đọc lại cho AT', () => {
  it('hiện phần trăm đã làm tròn', () => {
    render(<ProgressBar value={1} max={3} />);
    expect(screen.getByText('33%')).not.toBeNull();
  });

  it('con số phần trăm mang aria-hidden — aria-valuenow/max đã nói cùng điều đó', () => {
    render(<ProgressBar value={1} max={3} />);
    expect(screen.getByText('33%').getAttribute('aria-hidden')).toBe('true');
  });

  it('đầy 100% thì thanh đổi sang tông status-done, chưa đầy thì status-progress', () => {
    const { unmount } = render(<ProgressBar value={4} max={4} />);
    const full = screen.getByRole('progressbar').firstChild as HTMLElement;
    expect(full.className).toContain('bg-status-done');
    expect(full.className).not.toContain('bg-status-progress');
    unmount();

    render(<ProgressBar value={1} max={4} />);
    const partial = screen.getByRole('progressbar').firstChild as HTMLElement;
    expect(partial.className).toContain('bg-status-progress');
  });

  it('vẫn ĐÚNG MỘT style inline (bề rộng) — không thêm style runtime mới cho CSP gánh', () => {
    const { container } = render(<ProgressBar value={2} max={4} label="Tiến độ" />);
    const withStyle = container.querySelectorAll('[style]');
    expect(withStyle.length).toBe(1);
    expect((withStyle[0] as HTMLElement).style.width).toBe('50%');
  });
});
