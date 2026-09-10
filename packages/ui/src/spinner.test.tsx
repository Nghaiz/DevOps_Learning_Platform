import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import {
  ARC_PATH_D,
  ARC_SPIN_ANIMATION_NAME,
  ARC_STROKE,
  ARC_STROKE_HAIRLINE,
} from '@devops-platform/motion/motif';
import { Spinner } from './spinner.tsx';

afterEach(() => {
  cleanup();
});

describe('Spinner', () => {
  it('render với role="status" và nhãn "Đang tải" cho trình đọc màn hình', () => {
    render(<Spinner />);
    expect(screen.getByRole('status', { name: 'Đang tải' })).toBeDefined();
  });

  it.each(['sm', 'md', 'lg'] as const)('size=%s render không lỗi', (size) => {
    render(<Spinner size={size} />);
    expect(screen.getByRole('status')).toBeDefined();
  });
});

/**
 * Design §3: trạng thái đang tải là "chính vòng ellipse đang tự vẽ ra".
 *
 * Ba mệnh đề dưới đây là ba cách bản này hỏng IM LẶNG nếu không có cổng:
 * cung không còn là ellipse của motif (hình khác, khe hở sai phía), animation
 * trỏ vào một tên không tồn tại (`globals.css` đổi tên `@keyframes` ⇒ trình
 * duyệt bỏ qua, cung đứng yên ở dạng ĐẦY, trông y hệt một tiến độ đã xong), và
 * nét không co theo cỡ (`non-scaling-stroke` đo bằng pixel màn hình, nên 4px
 * trên hộp 16px bịt kín khe hở 60°).
 */
describe('Spinner — cung ellipse của motif', () => {
  function path(): SVGPathElement {
    render(<Spinner />);
    const el = screen.getByRole('status').querySelector('path');
    if (el === null) throw new Error('Spinner không vẽ cung nào');
    return el;
  }

  it('vẽ ĐÚNG `ARC_PATH_D`, không phải một hình tự dựng', () => {
    expect(path().getAttribute('d')).toBe(ARC_PATH_D);
  });

  it('chạy bằng `@keyframes` mà `globals.css` khai — không phải một tên khác', () => {
    const animation = path().style.animation;
    expect(
      animation,
      'animation trỏ tên khác ⇒ trình duyệt bỏ qua trong im lặng, cung đứng yên ở dạng ĐẦY',
    ).toContain(ARC_SPIN_ANIMATION_NAME);
    // Vô hạn + alternate: vẽ ra rồi thu lại. Khối `prefers-reduced-motion` của
    // `globals.css` hạ nó thành MỘT lượt tĩnh, nên cổng giảm chuyển động nằm ở
    // CSS và không cần `useReducedMotion` ở tầng này.
    expect(animation).toContain('infinite');
  });

  it('nét co theo cỡ — `non-scaling-stroke` đo bằng pixel màn hình, không theo `viewBox`', () => {
    render(<Spinner size="sm" />);
    render(<Spinner size="lg" />);
    const [small, large] = screen.getAllByRole('status');
    expect(small?.querySelector('path')?.getAttribute('stroke-width')).toBe(String(ARC_STROKE_HAIRLINE));
    expect(large?.querySelector('path')?.getAttribute('stroke-width')).toBe(String(ARC_STROKE));
  });

  /**
   * Khẳng định trên `outerHTML` của CẢ cụm, không chỉ class của `<svg>` gốc.
   * Đối chứng dương ngày 2026-09-11 bắt đúng chỗ này: bản đầu chỉ đọc class
   * của `<svg>`, nên một `animate-spin` dán lên `<path>` bên trong đi lọt —
   * cổng xanh trong khi hình đã quay trở lại.
   */
  it('KHÔNG còn `animate-spin` ở bất kỳ đâu — cung tự vẽ ra, không phải một hình quay', () => {
    const { container } = render(<Spinner />);
    expect(
      (container.firstElementChild as SVGElement).outerHTML,
      'vòng quay nói "đang bận"; cung tự vẽ nói "đang tiến tới đâu đó" — design §3 chọn vế sau',
    ).not.toContain('animate-spin');
  });

  it('mang `data-slot="spinner"` — móc để Button tìm ra nó trong lớp bọc aria-hidden', () => {
    render(<Spinner />);
    expect(screen.getByRole('status').getAttribute('data-slot')).toBe('spinner');
  });
});
