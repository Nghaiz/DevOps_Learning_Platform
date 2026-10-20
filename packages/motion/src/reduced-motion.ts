/**
 * Bề mặt công khai của subpath `@devops-platform/motion/reduced-motion` — cổng
 * `prefers-reduced-motion` ở MỨC JS (§7, `phase-16.md` mục 16.A.8, rủi ro #4).
 *
 * Ba tầng, ba mục đích khác nhau — đọc `media-query.ts` trước nếu chưa rõ vì
 * sao một khối `@media` không thay được file này:
 *
 * | Xuất | Dùng khi |
 * |---|---|
 * | `prefersReducedMotion()` | đọc một lần, ngoài React (script, khởi tạo cảnh) |
 * | `subscribeReducedMotion(fn)` | theo dõi thay đổi, ngoài React |
 * | `useReducedMotion()` | trong component React |
 * | `startGatedFrameLoop({onFrame})` | vòng `requestAnimationFrame` tự viết (GSAP/Lenis tự gác bằng `gsap.matchMedia`/chế độ của landing) |
 *
 * ⛔ Cung tiến độ KHÔNG dùng gì ở đây. Nó chạy bằng CSS transition (§8.4) nên
 * khối `@media` phổ quát trong `globals.css` đã phủ sẵn — thêm một cổng JS vào
 * đó là thêm một chỗ để lệch, không phải thêm một lớp an toàn.
 */

export {
  REDUCED_MOTION_QUERY,
  prefersReducedMotion,
  subscribeReducedMotion,
} from './media-query.ts';
export type {
  MatchMediaLike,
  MediaQueryChangeEvent,
  MediaQueryChangeListener,
  MediaQueryListLike,
} from './media-query.ts';

export { STATIC_FRAME_TIME_MS, startGatedFrameLoop } from './frame-loop.ts';
export type {
  CancelFrame,
  FrameCallback,
  GatedFrameLoopOptions,
  RequestFrame,
} from './frame-loop.ts';

export { reducedMotionStore, useReducedMotion } from './use-reduced-motion.ts';
export type { ReducedMotionStore } from './use-reduced-motion.ts';
