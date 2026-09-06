/**
 * "Còn N chỗ" — đọc `capacity.get` (C4/D5) thành một câu tiếng Việt.
 *
 * ⛔ **Không hằng số 20 hay 23 ở đây.** Trần mềm được orchestrator TÍNH lúc đọc
 * (`hard − poolTarget`, xem `apps/web/src/server/capacity/get-capacity.ts`),
 * chính vì một con số viết tay cạnh `poolTarget` sẽ mục trong im lặng khi một
 * trong hai vế đổi. Mọi thứ dưới đây suy ra từ payload, không từ trí nhớ.
 */

/**
 * Phần payload `capacity.get` mà vỏ ứng dụng thật sự đọc.
 *
 * Khai theo cấu trúc (không `inferRouterOutputs`) để file này chạy được trong
 * test node thuần, KHÔNG mất cổng kiểu: `use-capacity.tsx` giữ state đúng kiểu
 * output của router và truyền thẳng vào `describeCapacity`, nên BE bỏ một field
 * là đỏ ngay ở chỗ gọi.
 */
export interface CapacityView {
  readonly activeSessions: number;
  readonly softCapacity: number;
  readonly hardCapacity: number;
  readonly fetchedAt: string;
}

export type CapacityTone = 'ok' | 'low' | 'full';

export interface CapacityReading {
  /** `max(0, soft − active)` — số phiên còn nhận được trước khi chạm trần mềm. */
  readonly remaining: number;
  readonly tone: CapacityTone;
  /** Câu ngắn cho badge trên thanh điều hướng. */
  readonly label: string;
  /** Câu đầy đủ: chuyện gì đang xảy ra + làm gì tiếp. Không chứa thời điểm (xem §fetchedAt). */
  readonly detail: string;
}

/**
 * Ngưỡng "sắp hết" là TỈ LỆ, không phải một số phiên cố định.
 *
 * Một ngưỡng cứng ("≤3 chỗ") là đúng hằng số viết tay mà D5 vừa gỡ khỏi
 * orchestrator: trần mềm đổi (thêm node, đổi `poolTarget`) thì "sắp hết" đổi
 * nghĩa mà không ai sửa dòng nào. 20% tự co giãn theo trần thật.
 */
export const LOW_CAPACITY_RATIO = 0.2;

export function describeCapacity(view: CapacityView): CapacityReading {
  const remaining = Math.max(0, view.softCapacity - view.activeSessions);
  const load = `Đang chạy ${String(view.activeSessions)}/${String(view.softCapacity)} phiên (trần cứng ${String(view.hardCapacity)}).`;

  if (remaining === 0) {
    return {
      remaining,
      tone: 'full',
      label: 'Hết chỗ',
      // Người dùng gặp 429 mà không được báo trước là lỗi thiết kế (13.B mục 7)
      // — nên câu này phải nói cả việc phải làm, không chỉ tình trạng.
      detail: `${load} Bắt đầu phiên mới lúc này sẽ bị từ chối. Chờ vài phút rồi thử lại, hoặc kết thúc một phiên đang mở ở trang Của tôi.`,
    };
  }

  if (remaining <= view.softCapacity * LOW_CAPACITY_RATIO) {
    return {
      remaining,
      tone: 'low',
      label: `Chỉ còn ${String(remaining)} chỗ`,
      detail: `${load} Sắp hết chỗ — nếu bạn định làm lab, hãy bắt đầu sớm.`,
    };
  }

  return {
    remaining,
    tone: 'ok',
    label: `Còn ${String(remaining)} chỗ`,
    detail: load,
  };
}

/**
 * Giờ đọc số liệu, dạng `HH:MM:SS` theo múi giờ trình duyệt.
 *
 * Tách khỏi `describeCapacity` có chủ ý: định dạng thời gian phụ thuộc locale +
 * múi giờ của máy chạy, nên nhét nó vào hàm thuần sẽ biến một test xác định
 * thành một test đỏ tuỳ máy. Trả `null` khi chuỗi không phải thời điểm hợp lệ —
 * hiện "không rõ" còn hơn hiện "Invalid Date".
 */
export function formatFetchedAt(fetchedAt: string): string | null {
  const at = new Date(fetchedAt);
  return Number.isNaN(at.getTime()) ? null : at.toLocaleTimeString('vi-VN');
}
