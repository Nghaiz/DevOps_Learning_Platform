import { isRetryableCloseCode, CLOSE_ABNORMAL } from './protocol.ts';

/**
 * F10 — backoff 1/2/4/8s, trần 15s.
 *
 * ⛔ TIỀN ĐỀ "KHÔNG CẦN JITTER" ĐÃ BỊ ĐO BÁC BỎ (P3/3.H, AC-H6, 2026-08-16).
 *
 * Bản trước bỏ jitter có chủ ý, với lý do ghi ngay tại đây: *"trần D17 là 1 WS
 * trên một session, và mỗi session thuộc đúng một người dùng. Không có đàn
 * client nào cùng nối lại một lúc để mà phải rải ra."*
 *
 * Lập luận đó đúng cho ca đứt mạng LẺ TẺ và sai chính xác vào lúc **rollout
 * gateway**: drain đóng MỌI phiên trong cùng một khoảnh khắc (đo được: 14 phiên
 * đóng trong 7ms của nhau), nên mọi client chạy cùng lịch 1/2/4/8/15s KHÔNG
 * LỆCH PHA và cùng đâm vào biên một lượt. Số đo trên cụm với 14 phiên:
 * **19 lượt ăn 429 của Traefik** (trần `/ws` là average 20/1m, burst 10).
 *
 * Vì sao sửa Ở ĐÂY chứ không nới trần biên: nới rate-limit là nới một lớp phòng
 * thủ của luật 5 mà self-pentest vừa chấm 10/10, và nó sửa triệu chứng. Phase
 * alignment mới là nguyên nhân.
 *
 * ⚠ VÀ JITTER KHÔNG PHẢI THUỐC CHỮA HẾT — nói rõ để người sau không tin quá:
 * trần biên là token bucket nạp lại ~1 lượt/3s, nên một lớp đủ đông vẫn vượt
 * trần dù rải cỡ nào. Việc jitter làm được là **phá tính đồng pha giữa các đợt**
 * (không có nó, nhóm bị từ chối ở đợt 1 lại cùng nhau quay lại ở đợt 2), và
 * giảm số lượt phí. Trần cho một LỚP HỌC là bài toán của lượt nâng trần biên.
 */
const SCHEDULE_MS = [1_000, 2_000, 4_000, 8_000] as const;
export const MAX_BACKOFF_MS = 15_000;

/**
 * Cơ sở TẤT ĐỊNH của lịch backoff. `attempt` đếm từ 1; vượt bảng ⇒ trần.
 *
 * Giữ nguyên hàm thuần này (thay vì nhét jitter vào trong) vì hai lý do: lịch
 * nền vẫn phải kiểm được bằng test tất định, và `backoffDelayMsJittered` cần
 * một mốc để rải quanh.
 */
export function backoffDelayMs(attempt: number): number {
  if (attempt < 1) {
    return SCHEDULE_MS[0];
  }
  return SCHEDULE_MS[attempt - 1] ?? MAX_BACKOFF_MS;
}

/**
 * Lịch backoff CÓ jitter — đây là hàm đường chạy thật dùng.
 *
 * Rải đều trên `[0.5×base, 1.5×base]`, kẹp trần `MAX_BACKOFF_MS`:
 *   · giữ nguyên KỲ VỌNG bằng `base` (không làm người dùng chờ lâu hơn trung
 *     bình — một jitter chỉ-cộng-thêm sẽ âm thầm kéo dài mọi lần nối lại);
 *   · bề rộng rải bằng đúng `base`, gấp đôi kiểu "equal jitter" `[0.5b, b]`;
 *   · cận dưới `0.5×base` giữ lại tác dụng của backoff — full jitter `[0, b]`
 *     cho phép một client thử lại gần như tức thì và đạp vào đúng cái biên đang
 *     nghẽn.
 *
 * `rand` tiêm được để test tất định; production dùng `Math.random`.
 */
export function backoffDelayMsJittered(attempt: number, rand: () => number = Math.random): number {
  const base = backoffDelayMs(attempt);
  const delay = base * (0.5 + rand());
  return Math.min(Math.round(delay), MAX_BACKOFF_MS);
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
