/**
 * §7 + §8.4 — nguyên thuỷ media query của cổng `prefers-reduced-motion` mức JS.
 *
 * Đây là TẦNG DƯỚI. Bề mặt công khai là `reduced-motion.ts` (subpath
 * `@devops-platform/motion/reduced-motion`), file đó gom cả `frame-loop.ts` và
 * `use-reduced-motion.ts` lại. Tách ra để hai file kia import xuống đây mà
 * không tạo vòng import ngược lên barrel.
 *
 * ## Vì sao gói này tồn tại
 *
 * `globals.css` đã có một khối phổ quát (`apps/web/src/app/globals.css:719`):
 *
 * ```css
 * @media (prefers-reduced-motion: reduce) {
 *   *, *::before, *::after {
 *     animation-duration: 0.01ms !important;
 *     animation-iteration-count: 1 !important;
 *     transition-duration: 0.01ms !important;
 *     scroll-behavior: auto !important;
 *   }
 * }
 * ```
 *
 * Khối đó phủ được **mọi** chuyển động do CSS lái. Nó KHÔNG phủ được một vòng
 * `requestAnimationFrame`: rAF không phải một thuộc tính CSS, không có
 * declaration nào để `!important` thắng, và trình duyệt không hề gọi lại vòng
 * lặp của bạn khi cờ đổi. Đây là rủi ro số 4 trong bảng của `phase-16.md`
 * ("Cảnh 3D bỏ qua reduced-motion vì chỉ dựa vào CSS", 3×4=12) và là lớp lỗi
 * "xanh mà không chứng minh gì": trang TRÔNG NHƯ đã tuân thủ vì mọi transition
 * đã tắt, trong khi canvas vẫn quay đúng 60 khung/giây.
 *
 * Vì vậy: cung tiến độ đi bằng CSS transition (`motif.ts`, §8.4) và **không**
 * cần cổng nào; cảnh 3D trang chủ — chỗ duy nhất rAF là bắt buộc — đi qua
 * `startGatedFrameLoop` dưới đây.
 *
 * ## Vì sao phải có `addEventListener('change')`
 *
 * Đọc `matchMedia(...).matches` MỘT LẦN lúc mount là một ảnh chụp. Người dùng
 * bật "Giảm chuyển động" trong cài đặt hệ điều hành GIỮA phiên — đúng lúc họ
 * bắt đầu thấy khó chịu — thì ảnh chụp đó đã cũ và vòng rAF chạy tiếp cho tới
 * lần tải trang sau. Khối CSS ở trên tự cập nhật (media query là sống); một
 * biến boolean đọc một lần thì không.
 */

/** Chuỗi media query. Khai một lần ở đây để không lane nào gõ lại. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface MediaQueryChangeEvent {
  readonly matches: boolean;
}

export type MediaQueryChangeListener = (event: MediaQueryChangeEvent) => void;

/**
 * Bề mặt TỐI THIỂU của `MediaQueryList` mà cổng này cần.
 *
 * Khai riêng thay vì dùng thẳng `MediaQueryList` của lib.dom vì hai lý do đo
 * được: (1) test giả lập được bằng một object literal, không cần jsdom; (2)
 * `addListener`/`removeListener` (bản đã deprecate) là đường DUY NHẤT trên
 * Safari < 14, và lib.dom đánh dấu chúng deprecated nên gọi thẳng sẽ bị gạch —
 * ở đây chúng là nhánh dự phòng có chủ ý.
 */
export interface MediaQueryListLike {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: MediaQueryChangeListener): void;
  removeEventListener?(type: 'change', listener: MediaQueryChangeListener): void;
  addListener?(listener: MediaQueryChangeListener): void;
  removeListener?(listener: MediaQueryChangeListener): void;
}

export type MatchMediaLike = (query: string) => MediaQueryListLike;

const NOOP = (): void => {};

/**
 * `globalThis.matchMedia` nếu gọi được, `null` nếu không (SSR, worker, môi
 * trường test ở `environment: 'node'`).
 *
 * `.call(globalThis, …)` chứ không `mm(query)`: một vài trình duyệt đòi
 * `matchMedia` chạy với `this` là `window`, và việc rút nó ra khỏi object làm
 * mất binding — hỏng dạng `Illegal invocation`, tức một lỗi ném ra chứ không
 * phải một giá trị sai.
 */
function readGlobalMatchMedia(): MatchMediaLike | null {
  try {
    const mm = globalThis.matchMedia;
    if (typeof mm !== 'function') {
      return null;
    }
    return (query: string) => mm.call(globalThis, query);
  } catch {
    return null;
  }
}

/**
 * `undefined` ⇒ tự đọc global. `null` ⇒ ÉP coi như không có (dùng để dựng cảnh
 * SSR trong test). Một hàm ⇒ dùng đúng nó.
 *
 * Phân biệt `undefined` với `null` là cố ý: nếu gộp hai cái, test không có cách
 * nào diễn đạt "môi trường này KHÔNG có matchMedia" mà không phải xoá global
 * thật.
 */
function resolveMatchMedia(explicit?: MatchMediaLike | null): MatchMediaLike | null {
  if (explicit === undefined) {
    return readGlobalMatchMedia();
  }
  return explicit;
}

/**
 * Đọc MỘT LẦN. `false` khi không đọc được.
 *
 * Vì sao mặc định `false` chứ không `true` ("an toàn hơn"): giá trị này chỉ có
 * ý nghĩa ở client sau hydrate, nơi `matchMedia` luôn có. Ở server nó phải khớp
 * với thứ CSS làm — mà CSS mặc định là KHÔNG áp khối `@media` — nếu không mỗi
 * lần render server sẽ ra một cây khác client và React báo hydration mismatch
 * trên mọi trang có chuyển động. Chuyển động thật thì đã bị khối CSS chặn ở
 * tầng dưới rồi.
 */
export function prefersReducedMotion(matchMedia?: MatchMediaLike | null): boolean {
  const mm = resolveMatchMedia(matchMedia);
  if (mm === null) {
    return false;
  }
  try {
    return mm(REDUCED_MOTION_QUERY).matches === true;
  } catch {
    return false;
  }
}

/**
 * Theo dõi thay đổi. Trả về hàm huỷ đăng ký (luôn gọi được, kể cả khi không
 * đăng ký được gì — call-site không phải kiểm `null`).
 *
 * Thứ tự thử: `addEventListener('change')` → `addListener` (Safari < 14) →
 * chịu. Không đảo thứ tự: `addListener` còn tồn tại trên trình duyệt hiện đại
 * nhưng đã deprecate, và một ngày nó biến mất thì nhánh dự phòng phải là nhánh
 * SAU chứ không phải nhánh chính.
 */
export function subscribeReducedMotion(
  listener: (reduced: boolean) => void,
  matchMedia?: MatchMediaLike | null,
): () => void {
  const mm = resolveMatchMedia(matchMedia);
  if (mm === null) {
    return NOOP;
  }

  let mql: MediaQueryListLike;
  try {
    mql = mm(REDUCED_MOTION_QUERY);
  } catch {
    return NOOP;
  }

  const onChange: MediaQueryChangeListener = (event) => {
    listener(event.matches === true);
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
    return () => {
      mql.removeEventListener?.('change', onChange);
    };
  }

  if (typeof mql.addListener === 'function') {
    mql.addListener(onChange);
    return () => {
      mql.removeListener?.(onChange);
    };
  }

  return NOOP;
}
