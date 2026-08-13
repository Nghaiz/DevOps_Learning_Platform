import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SplitPane } from './split-pane.tsx';

/**
 * `@testing-library/jest-dom` KHÔNG có trong devDependencies của package này
 * (đã kiểm tra `node_modules` — không tồn tại), nên các matcher quen thuộc như
 * `toHaveAttribute`/`toBeInTheDocument` không tồn tại trên kiểu `Assertion`.
 * Test ở đây cố ý dùng thẳng DOM API (`getAttribute`) thay vì matcher jest-dom
 * — KHÔNG phải sơ suất. Xem báo cáo cuối nhiệm vụ: đây là một khoảng trống hạ
 * tầng test nằm ngoài 5 file được phép sửa của agent này.
 */
function ariaValueNow(el: Element): string | null {
  return el.getAttribute('aria-valuenow');
}

/**
 * jsdom KHÔNG có bố cục thật: mọi `getBoundingClientRect()` trả toàn 0, nên
 * một khẳng định kiểu "kéo xong khoang trái rộng 300px" sẽ XANH một cách vô
 * nghĩa (xem cảnh báo ở `vitest.config.ts`). Test ở đây chỉ khẳng định trên
 * STATE quan sát được: `aria-valuenow`, style `flex-basis`, và các lệnh gọi
 * callback/localStorage — KHÔNG khẳng định pixel.
 *
 * jsdom cũng chưa cài Pointer Capture API (`setPointerCapture` /
 * `releasePointerCapture` không tồn tại trên `Element.prototype`), nên phải tự
 * stub trước khi mô phỏng một cú kéo bằng `fireEvent.pointer*`.
 */
beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SplitPane — bàn phím', () => {
  it('ArrowRight tăng aria-valuenow thêm 2 điểm phần trăm', () => {
    render(<SplitPane left={<div />} right={<div />} />);
    const separator = screen.getByRole('separator');
    expect(ariaValueNow(separator)).toBe('50');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(ariaValueNow(separator)).toBe('52');
  });

  it('ArrowLeft giảm aria-valuenow bớt 2 điểm phần trăm', () => {
    render(<SplitPane left={<div />} right={<div />} />);
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(ariaValueNow(separator)).toBe('48');
  });

  it('Home nhảy tới minRatio, End nhảy tới maxRatio', () => {
    render(<SplitPane left={<div />} right={<div />} minRatio={0.25} maxRatio={0.75} />);
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(ariaValueNow(separator)).toBe('25');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(ariaValueNow(separator)).toBe('75');
  });

  it('clamp: nhấn ArrowRight liên tục không bao giờ vượt quá maxRatio', () => {
    render(<SplitPane left={<div />} right={<div />} maxRatio={0.6} />);
    const separator = screen.getByRole('separator');
    for (let i = 0; i < 20; i += 1) {
      fireEvent.keyDown(separator, { key: 'ArrowRight' });
    }
    expect(ariaValueNow(separator)).toBe('60');
  });

  it('style flex-basis của khoang trái đồng bộ với aria-valuenow', () => {
    render(<SplitPane left={<div />} right={<div />} />);
    const separator = screen.getByRole('separator');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    const leftPane = separator.previousSibling as HTMLElement;
    expect(leftPane.style.flexBasis).toBe('52%');
  });
});

describe('SplitPane — localStorage', () => {
  it('storageKey lưu tỉ lệ và khôi phục đúng sau khi unmount rồi remount', () => {
    const { unmount } = render(<SplitPane left={<div />} right={<div />} storageKey="persist-key" />);
    const separator1 = screen.getByRole('separator');
    // Nhấn phím là một bước "chốt" rời rạc nên ghi localStorage ngay — không
    // cần mô phỏng một cú kéo để kiểm tra tính năng nhớ tỉ lệ.
    fireEvent.keyDown(separator1, { key: 'End' });
    expect(ariaValueNow(separator1)).toBe('80');
    unmount();

    render(<SplitPane left={<div />} right={<div />} storageKey="persist-key" />);
    const separator2 = screen.getByRole('separator');
    expect(ariaValueNow(separator2)).toBe('80');
  });

  it('localStorage ném lỗi (chế độ riêng tư) không làm sập component', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked in private mode');
    });
    expect(() =>
      render(<SplitPane left={<div />} right={<div />} storageKey="throwing-key" />),
    ).not.toThrow();
    // Đọc storage thất bại → rơi về defaultRatio mặc định 0.5 = 50%.
    expect(ariaValueNow(screen.getByRole('separator'))).toBe('50');
  });
});

describe('SplitPane — kéo bằng con trỏ', () => {
  it('pointermove cập nhật ratio ngay, nhưng localStorage chỉ ghi lúc pointerup', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<SplitPane left={<div />} right={<div />} storageKey="drag-key" />);
    const separator = screen.getByRole('separator');
    // Thanh chia là con trực tiếp của container đo kích thước (containerRef) —
    // stub getBoundingClientRect ngay trên phần tử cha đó để mô phỏng một
    // container rộng 1000px bắt đầu từ x=0.
    const container = separator.parentElement as HTMLElement;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 1000,
      top: 0,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 700 }); // 700/1000 = 70%
    expect(ariaValueNow(separator)).toBe('70');
    expect(setItemSpy).not.toHaveBeenCalled();

    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 700 });
    expect(setItemSpy).toHaveBeenCalledWith('drag-key', '0.7');
  });
});
