import '@testing-library/jest-dom/vitest';

/**
 * Nạp matcher của `@testing-library/jest-dom` (`toBeInTheDocument`,
 * `toBeDisabled`, `toHaveAttribute`, …).
 *
 * Đường import PHẢI là `/vitest`, không phải bare `@testing-library/jest-dom`:
 * bản bare đăng ký vào `expect` của Jest. Với vitest nó chạy nhưng KHÔNG gắn
 * matcher nào, và triệu chứng là `expect(...).toBeInTheDocument is not a
 * function` ở giữa một file test trông hoàn toàn bình thường.
 */

/**
 * 13.A — jsdom KHÔNG cài `ResizeObserver`, `Element.prototype.scrollIntoView`,
 * và `Element.prototype.hasPointerCapture`/`setPointerCapture`/
 * `releasePointerCapture`. Radix (`Select`, `DropdownMenu`, `Tooltip`) gọi
 * các API này khi định vị/scroll nội dung popover — thiếu polyfill thì TEST
 * (không phải component) ném `TypeError: ... is not a function`, một lỗi
 * trông như bug component nhưng thật ra là môi trường test thiếu API trình
 * duyệt. Stub ở MỨC TOÀN CỤC một lần ở đây thay vì lặp lại trong từng file
 * test — same rule-of-two như `split-pane.test.tsx` đã làm với
 * `setPointerCapture` (nay gộp về đây để không định nghĩa hai lần).
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfill toàn cục, không có type chuẩn khớp `lib.dom` trong môi trường jsdom
(globalThis as any).ResizeObserver ??= ResizeObserverStub;

if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof Element.prototype.hasPointerCapture !== 'function') {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = () => {};
}
if (typeof Element.prototype.releasePointerCapture !== 'function') {
  Element.prototype.releasePointerCapture = () => {};
}
