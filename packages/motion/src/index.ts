/**
 * §7 — biến thể framer-motion dùng chung.
 *
 * Ba thời lượng và một đường cong, khai đúng một lần ở đây để tám lane không
 * ai tự đặt số. Chúng là bản sao JS của `--motion-fast|base|slow` và
 * `--ease-out` trong `globals.css`; `index.test.ts` gác việc hai bên không lệch.
 *
 * ## Vì sao phải sao chép sang JS
 *
 * framer-motion nhận thời lượng bằng **giây** qua một object JS, không đọc
 * được `var(--motion-base)`. Đó là cùng lớp lý do mà `packages/terminal` phải
 * giữ bảng màu ANSI dạng dữ liệu (§9.1): một API JavaScript không phân giải
 * được biến CSS. Sao chép là bắt buộc; thứ chọn được là nó có cổng gác hay
 * không.
 *
 * ## Reduced motion
 *
 * ⛔ KHÔNG hạ thời lượng ở đây khi người dùng bật giảm chuyển động. Hai cơ chế
 * đã lo việc đó và cả hai đều phủ rộng hơn một biến thể:
 *
 * 1. `<MotionConfig reducedMotion="user">` bọc ở gốc app — framer-motion tự bỏ
 *    mọi biến đổi hình học (`x`, `y`, `scale`, `rotate`) và chỉ giữ `opacity`.
 * 2. khối `@media (prefers-reduced-motion: reduce)` trong `globals.css` phủ
 *    `transition-duration`/`animation-duration` bằng `!important`.
 *
 * Cái duy nhất KHÔNG cơ chế nào phủ được là một vòng `requestAnimationFrame` —
 * đó là việc của `@devops-platform/motion/reduced-motion`.
 */

import type { Transition, Variants } from 'framer-motion';

// ── §7 Thời lượng ────────────────────────────────────────────────────────────

/** `--motion-fast` — hover, active, đổi màu, tooltip hiện. */
export const MOTION_FAST_MS = 150;
/** `--motion-base` — mở/đóng panel, chuyển tab, toast vào/ra. */
export const MOTION_BASE_MS = 220;
/** `--motion-slow` — dialog, chuyển chặng, cung tiến độ chạy. */
export const MOTION_SLOW_MS = 320;

/** framer-motion tính bằng giây; CSS tính bằng mili-giây. Đổi ở một chỗ. */
export function toSeconds(ms: number): number {
  return ms / 1000;
}

/**
 * `--ease-out` — `cubic-bezier(0.16, 1, 0.3, 1)`. Giảm tốc mạnh: nhanh lúc đầu
 * rồi dừng êm, nên chuyển động cảm thấy "phản hồi tức thì" thay vì "trôi".
 *
 * ⛔ Giá trị này **kế thừa và KHÔNG đổi** (§0). Nó trùng tên với biến theme sẵn
 * có của Tailwind v4 một cách có chủ ý, nên đổi nó là đổi tiện ích `ease-out`
 * của toàn hệ.
 */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function easeOut(durationMs: number): Transition {
  return { duration: toSeconds(durationMs), ease: EASE_OUT };
}

export const transitionFast: Transition = easeOut(MOTION_FAST_MS);
export const transitionBase: Transition = easeOut(MOTION_BASE_MS);
export const transitionSlow: Transition = easeOut(MOTION_SLOW_MS);

// ── Biến thể ─────────────────────────────────────────────────────────────────

/**
 * Hiện/ẩn thuần độ mờ. Dùng khi phần tử KHÔNG được phép dịch chuyển — ví dụ
 * một lớp phủ đã căn khít, hoặc nội dung trong một khối `overflow-hidden` mà
 * một cú dịch 8px sẽ lộ mép.
 */
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transitionBase },
  exit: { opacity: 0, transition: transitionFast },
};

/**
 * Vào từ dưới lên. Mặc định cho thẻ danh mục và panel mở ra.
 *
 * `y: 8` chứ không 24: quãng dịch dài đọc ra là "trang đang tải" chứ không phải
 * "phần tử vừa xuất hiện", và nó là quãng mà người nhạy tiền đình cảm nhận rõ
 * nhất. `MotionConfig reducedMotion="user"` sẽ bỏ hẳn `y` và chỉ giữ `opacity`.
 */
export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transitionBase },
  exit: { opacity: 0, y: 8, transition: transitionFast },
};

/**
 * Chuyển chặng trang chủ — `--motion-slow`, quãng dịch dài hơn vì khối cũng
 * lớn hơn.
 */
export const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: transitionSlow },
  exit: { opacity: 0, y: -16, transition: transitionBase },
};

/**
 * Container cho một danh sách vào lần lượt.
 *
 * `staggerChildren` mặc định 0.04s, và trần `delayChildren` là lý do có tham
 * số: 24 thẻ × 0.06s = 1.44 giây trước khi thẻ cuối hiện — người dùng đọc ra
 * đó là trang chậm, không phải trang có nhịp. Danh sách dài thì hạ bước xuống,
 * đừng để mặc định.
 */
export function staggerContainer(stepSeconds = 0.04): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stepSeconds } },
    exit: {},
  };
}
