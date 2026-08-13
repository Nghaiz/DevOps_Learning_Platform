/**
 * Contract §7 — dịch kết quả "hỏi lý do thật" thành quyết định cho máy trạng thái.
 *
 * Tách khỏi React có chủ ý: đây là phần DUY NHẤT có nhánh, và `apps/web` không có
 * jsdom/testing-library (test chạy môi trường node). Một hàm thuần thì test được
 * bằng đúng bộ công cụ đang có; nếu để logic này nằm trong `useEffect` thì nó chỉ
 * còn cách kiểm chứng bằng trình duyệt.
 *
 * Vì sao cần ở CẢ HAI trang: trình duyệt không cho phân biệt "gateway chết" với
 * "handshake bị từ chối 401/403" — cả hai đều đến dưới dạng close `1006`
 * (`packages/terminal/src/backoff.ts`). Máy trạng thái vì thế chọn RETRY và dựa
 * vào lượt hỏi lý do này làm phanh. Không có phanh thì một phiên đã chết hẳn quay
 * vòng backoff 15s vĩnh viễn dưới nhãn "Đang kết nối…" — đo được: 37s im lặng
 * tuyệt đối, 0 dòng console (báo cáo 2026-08-13, harness 2d-ws-ingress §A).
 */

/**
 * Trạng thái phiên phía orchestrator: 5=EXPIRED, 6=REAPED, 7=FAILED — ba trạng
 * thái không nối lại được nữa. Dưới ngưỡng này là phiên còn sống, và lúc đó rớt
 * kết nối đúng là chuyện đáng thử lại.
 */
export const TERMINAL_STATUS_FLOOR = 5;

export interface ReasonOutcome {
  readonly message: string;
  /** `true` = dừng hẳn vòng nối lại. */
  readonly gone: boolean;
}

const GONE_MESSAGE = 'Phiên đã kết thúc ở máy chủ (hết hạn hoặc đã bị thu hồi).';
const STILL_TRYING_MESSAGE = 'Chưa mở được kết nối tới phiên — đang thử lại.';

/** `null` = máy chủ trả lời nhưng KHÔNG kèm phiên nào ⇒ phiên không còn. */
export function reasonFromStatus(status: number | null): ReasonOutcome {
  if (status === null || status >= TERMINAL_STATUS_FLOOR) {
    return { message: GONE_MESSAGE, gone: true };
  }
  return { message: STILL_TRYING_MESSAGE, gone: false };
}

/**
 * Lỗi ở CHÍNH lượt hỏi lý do.
 *
 * Mặc định là `gone: false` — gọi hỏng có thể chỉ là mạng chập, và kết luận
 * "phiên chết" từ một lần gọi hỏng sẽ giết một phiên còn sống.
 *
 * BA mã là ngoại lệ, và chúng nói về PHIÊN chứ không nói về đường mạng:
 * `NOT_FOUND` (orchestrator không còn phiên này), `FORBIDDEN`/`UNAUTHORIZED`
 * (phiên không thuộc về người gọi, hoặc đăng nhập đã hết hạn). Cả ba đều retry
 * vô ích. Bản inline cũ ở `/session` để chúng rơi vào nhánh catch chung, nên một
 * phiên đã bị reaper xoá vẫn quay vòng như thể mạng chập.
 */
export function reasonFromLookupError(code: string | null, message: string): ReasonOutcome {
  if (code === 'NOT_FOUND') {
    return { message: GONE_MESSAGE, gone: true };
  }
  if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
    return { message: 'Không còn quyền truy cập phiên này. Hãy đăng nhập lại.', gone: true };
  }
  return { message, gone: false };
}
