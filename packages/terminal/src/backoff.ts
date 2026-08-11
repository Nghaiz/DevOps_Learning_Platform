import { isRetryableCloseCode, CLOSE_ABNORMAL } from './protocol.ts';

/**
 * F10 — backoff 1/2/4/8s, trần 15s.
 *
 * Không jitter, có chủ ý: trần D17 là **1 WS trên một session**, và mỗi session
 * thuộc đúng một người dùng. Không có đàn client nào cùng nối lại một lúc để mà
 * phải rải ra — jitter ở đây chỉ làm thời điểm nối lại khó đoán khi đọc log.
 */
const SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000] as const;
export const MAX_BACKOFF_MS = 15_000;

/** `attempt` đếm từ 1. Vượt bảng ⇒ trần. */
export function backoffDelayMs(attempt: number): number {
  if (attempt < 1) {
    return SCHEDULE_MS[0];
  }
  return SCHEDULE_MS[attempt - 1] ?? MAX_BACKOFF_MS;
}

export interface RetryDecisionInput {
  /** Mã đóng WS. `1006` = handshake hỏng / mạng đứt (contract §7). */
  readonly closeCode: number;
  /** `expiresAt` của session, ms epoch. `null` = chưa từng nhận `ready`. */
  readonly expiresAtMs: number | null;
  readonly nowMs: number;
}

export type RetryDecision =
  | { readonly retry: true }
  | { readonly retry: false; readonly reason: 'expired' | 'terminal-close-code' };

/**
 * F10 — "chỉ khi `now < expiresAt`, và **dừng hẳn** với close code báo
 * authz/hết hạn (không retry vô ích vào 403)".
 *
 * Thứ tự hai phép kiểm là có ý: hạn kiểm TRƯỚC mã đóng. Một session đã hết hạn
 * mà đóng bằng `4500` (mã retry được) vẫn không đáng nối lại — pod đã bị reaper
 * xoá, mọi lượt thử đều đâm vào 404. Đảo thứ tự thì client quay vòng 15s một
 * lần cho tới khi người dùng đóng tab.
 *
 * `1006` ĐƯỢC retry: nó vừa là "gateway chết / mạng đứt" (đáng nối lại) vừa là
 * "handshake bị từ chối 401/403" (không đáng) — trình duyệt không cho ta phân
 * biệt. Chọn retry vì ca mạng đứt phổ biến hơn nhiều, và vế authz đã có hai
 * cái phanh khác: `expiresAtMs` ở trên, và `session.get` mà F9 gọi khi thấy
 * `1006` lúc chưa từng `ready` — biết lý do thật rồi thì máy trạng thái dừng.
 */
export function decideRetry(input: RetryDecisionInput): RetryDecision {
  if (input.expiresAtMs !== null && input.nowMs >= input.expiresAtMs) {
    return { retry: false, reason: 'expired' };
  }
  if (input.closeCode === CLOSE_ABNORMAL || isRetryableCloseCode(input.closeCode)) {
    return { retry: true };
  }
  return { retry: false, reason: 'terminal-close-code' };
}
