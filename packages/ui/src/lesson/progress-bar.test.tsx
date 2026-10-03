import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ARC_PATH_D } from '@devops-platform/motion/motif';
import { ProgressBar } from './progress-bar.tsx';


/** Phần cung đã đi qua và giá trị --p của nó (đọc từ style inline do arcProgressProps phát ra). */
function arcProgress(bar: HTMLElement): HTMLElement {
  const paths = bar.querySelectorAll('path');
  expect(paths.length, 'cung tiến độ phải có ĐỦ rãnh + phần đã đi qua').toBe(2);
  return paths[1] as unknown as HTMLElement;
}

function arcP(bar: HTMLElement): number {
  return Number(arcProgress(bar).style.getPropertyValue('--p'));
}

describe('ProgressBar', () => {
  it('tính đúng phần trăm và đặt các thuộc tính aria progressbar', () => {
    render(<ProgressBar value={3} max={10} label="Tiến độ" />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('10');
    // Bản `border-l-4`/`width: 30%` cũ đo bề rộng của khối tô. Cùng mệnh đề,
    // đọc trên hình mới: 3/10 ⇒ cung quét 30% của 300°.
    expect(arcP(bar)).toBeCloseTo(0.3, 6);
    expect(screen.getByText('Tiến độ')).not.toBeNull();
  });

  it('cung vẽ ĐÚNG ellipse hở của motif, không phải một hình tự dựng', () => {
    render(<ProgressBar value={3} max={10} />);
    const bar = screen.getByRole('progressbar');
    for (const path of bar.querySelectorAll('path')) {
      expect(path.getAttribute('d'), 'cung lệch khỏi ARC_PATH_D ⇒ khe hở không còn đúng phía').toBe(ARC_PATH_D);
    }
  });

  /**
   * `pathLength={1}` KHÔNG phải trang trí: chu vi ellipse không có công thức
   * sơ cấp, nên thiếu nó thì `stroke-dasharray: 1` đo trên độ dài THẬT và
   * `p = 1` không khép vào mép khe hở — lệch vài phần trăm, đủ thấy mà không
   * đủ để ai gọi tên. Xem `arcProgressProps` ở `packages/motion`.
   */
  it('cung chuẩn hoá độ dài về 1 (`pathLength`), không tự tính chu vi', () => {
    render(<ProgressBar value={1} max={4} />);
    const progress = arcProgress(screen.getByRole('progressbar'));
    expect(progress.getAttribute('pathLength')).toBe('1');
    expect(progress.getAttribute('stroke-dasharray')).toBe('1');
  });

  it('max = 0 không tạo ra NaN trong tiến độ — trả về 0 thay vì chia cho 0', () => {
    render(<ProgressBar value={0} max={0} />);
    const bar = screen.getByRole('progressbar');
    expect(arcProgress(bar).style.getPropertyValue('--p')).toBe('0');
    expect(arcProgress(bar).getAttribute('style') ?? '').not.toContain('NaN');
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

  /**
   * Tông màu đọc trên `getAttribute('class')`, KHÔNG trên `.className`: phần
   * tử mang tông giờ là một `<svg>`, và `SVGElement.className` là một
   * `SVGAnimatedString` chứ không phải chuỗi — `toContain` trên nó xanh/đỏ vì
   * lý do chẳng liên quan gì tới màu.
   *
   * `text-*` chứ không `bg-*`: cung lấy `stroke: currentColor` (§8.5) nên màu
   * đi qua màu CHỮ của phần tử, không qua nền.
   */
  it('đầy 100% thì cung đổi sang tông status-done, chưa đầy thì status-progress', () => {
    const { unmount } = render(<ProgressBar value={4} max={4} />);
    const full = screen.getByRole('progressbar').firstChild as SVGElement;
    expect(full.getAttribute('class')).toContain('text-status-done');
    expect(full.getAttribute('class')).not.toContain('text-status-progress');
    unmount();

    render(<ProgressBar value={1} max={4} />);
    const partial = screen.getByRole('progressbar').firstChild as SVGElement;
    expect(partial.getAttribute('class')).toContain('text-status-progress');
  });

  it('vẫn ĐÚNG MỘT style inline (cung) — không thêm style runtime mới cho CSP gánh', () => {
    const { container } = render(<ProgressBar value={2} max={4} label="Tiến độ" />);
    const withStyle = container.querySelectorAll('[style]');
    expect(withStyle.length, 'mỗi style inline là một lý do nữa để CSP giữ style-src unsafe-inline').toBe(1);
    // Bản cũ: `width: 50%` trên khối tô. Bản này: `--p` trên cung. Cùng một
    // ngân sách, cùng một con số.
    expect((withStyle[0] as HTMLElement).style.getPropertyValue('--p')).toBe('0.5');
  });
});
