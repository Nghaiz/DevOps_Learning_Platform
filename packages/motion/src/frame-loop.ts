/**
 * §8.4 ngoại lệ — vòng `requestAnimationFrame` DUY NHẤT được phép, và cổng của nó.
 *
 * Cung tiến độ chạy bằng CSS transition nên không dùng file này. Chỗ dùng là
 * cảnh 3D trang chủ, nơi rAF là bắt buộc: ở đó "tuân thủ reduced-motion" nghĩa
 * là **không có vòng lặp nào cả**, mỗi chặng chỉ một khung tĩnh (design §7.3).
 *
 * ⚠ Đây là chỗ mà một cổng dễ nói dối nhất. Một cài đặt kiểu
 *
 * ```ts
 * const speed = reduced ? 0 : 1;
 * requestAnimationFrame(function tick(t) { draw(t * speed); requestAnimationFrame(tick); });
 * ```
 *
 * *trông như* đã tuân thủ — cảnh đứng yên — nhưng vẫn quay đủ 60 lượt/giây,
 * vẫn giữ GPU bận, vẫn xả pin, và trên máy yếu vẫn làm cuộn giật. Người bật cờ
 * này thường bật vì tiền đình chứ không chỉ vì thẩm mỹ, nhưng chi phí thì họ
 * vẫn trả. Vì vậy phép gác ở đây là **`requestFrame` không được gọi lần nào**,
 * không phải "giá trị truyền vào bằng 0".
 */

import type { MatchMediaLike } from './media-query.ts';
import { prefersReducedMotion, subscribeReducedMotion } from './media-query.ts';

/**
 * Thời điểm truyền cho khung TĨNH duy nhất vẽ ở chế độ giảm chuyển động.
 *
 * `0` chứ không phải `performance.now()`: khung tĩnh phải **tất định**. Truyền
 * đồng hồ thật vào sẽ khiến cảnh 3D dựng ra một pose khác nhau mỗi lần tải, tức
 * một "chuyển động" chạy ở tốc độ một khung mỗi lần vào trang.
 */
export const STATIC_FRAME_TIME_MS = 0;

export type FrameCallback = (timeMs: number) => void;
export type RequestFrame = (callback: FrameCallback) => number;
export type CancelFrame = (handle: number) => void;

export interface GatedFrameLoopOptions {
  /** Vẽ một khung. Nhận mốc thời gian mà `requestAnimationFrame` cấp. */
  readonly onFrame: FrameCallback;
  /**
   * Tiêm vào để test đếm được số lần gọi. `undefined` ⇒ `globalThis.requestAnimationFrame`;
   * `null` ⇒ ÉP coi như không có (SSR).
   */
  readonly requestFrame?: RequestFrame | null;
  readonly cancelFrame?: CancelFrame | null;
  /** Cùng quy ước ba trạng thái như `prefersReducedMotion`. */
  readonly matchMedia?: MatchMediaLike | null;
}

function readGlobalRequestFrame(): RequestFrame | null {
  try {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') {
      return null;
    }
    return (callback: FrameCallback) => raf.call(globalThis, callback);
  } catch {
    return null;
  }
}

function readGlobalCancelFrame(): CancelFrame | null {
  try {
    const caf = globalThis.cancelAnimationFrame;
    if (typeof caf !== 'function') {
      return null;
    }
    return (handle: number) => {
      caf.call(globalThis, handle);
    };
  } catch {
    return null;
  }
}

/**
 * Chạy `onFrame` mỗi khung — TRỪ KHI người dùng đã bật giảm chuyển động, lúc đó
 * vẽ đúng MỘT khung tĩnh và không lập lịch gì thêm.
 *
 * Trả về hàm dừng. Gọi nhiều lần vô hại.
 *
 * ## Đổi cờ giữa chừng
 *
 * `subscribeReducedMotion` là lý do hàm này không phải một `if` đơn giản:
 *
 * - bật giảm chuyển động khi đang chạy ⇒ huỷ khung đang chờ, vẽ một khung tĩnh,
 *   ngừng lập lịch;
 * - tắt giảm chuyển động ⇒ vòng lặp khởi động lại ngay, không cần tải lại trang.
 *
 * Khung tĩnh được vẽ LẠI mỗi lần vào chế độ giảm chứ không chỉ lần đầu: nếu
 * không, cảnh đóng băng ở đúng nửa chừng một chuyển động — một pose không ai
 * thiết kế, thường là mờ hoặc lệch khung.
 *
 * ## Không có rAF (SSR, jsdom)
 *
 * Cũng vẽ một khung tĩnh. "Không animate được" và "không được phép animate" cho
 * ra cùng một kết quả nhìn thấy được; im lặng không vẽ gì thì khác — nó để lại
 * một canvas trắng mà không có gì báo.
 */
export function startGatedFrameLoop(options: GatedFrameLoopOptions): () => void {
  const { onFrame } = options;
  const request =
    options.requestFrame === undefined ? readGlobalRequestFrame() : options.requestFrame;
  const cancel = options.cancelFrame === undefined ? readGlobalCancelFrame() : options.cancelFrame;

  let stopped = false;
  let handle: number | null = null;

  const schedule = (): void => {
    if (stopped || request === null || handle !== null) {
      return;
    }
    handle = request(tick);
  };

  function tick(timeMs: number): void {
    handle = null;
    if (stopped) {
      return;
    }
    onFrame(timeMs);
    schedule();
  }

  const cancelPending = (): void => {
    if (handle !== null) {
      cancel?.(handle);
      handle = null;
    }
  };

  const applyReduced = (reduced: boolean): void => {
    if (stopped) {
      return;
    }
    if (reduced || request === null) {
      cancelPending();
      onFrame(STATIC_FRAME_TIME_MS);
      return;
    }
    schedule();
  };

  applyReduced(prefersReducedMotion(options.matchMedia));
  const unsubscribe = subscribeReducedMotion(applyReduced, options.matchMedia);

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    unsubscribe();
    cancelPending();
  };
}
