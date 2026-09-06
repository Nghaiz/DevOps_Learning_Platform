/**
 * "Còn N chỗ" — NGUỒN DUY NHẤT của ngưỡng sức chứa cho cả ứng dụng.
 *
 * ⛔ **Không hằng số 20 hay 23 ở đây.** Trần mềm được orchestrator TÍNH lúc đọc
 * (`hard − poolTarget`, xem `apps/web/src/server/capacity/get-capacity.ts`),
 * chính vì một con số viết tay cạnh `poolTarget` sẽ mục trong im lặng khi một
 * trong hai vế đổi. Mọi thứ dưới đây suy ra từ payload, không từ trí nhớ.
 *
 * ## Vì sao ngưỡng nằm ở ĐÂY chứ không ở `components/session/capacity.ts`
 *
 * Trước 2026-09-06 có HAI hiện thực `describeCapacity`: vỏ dùng ngưỡng tỉ lệ
 * (20% trần mềm), khung phiên dùng ngưỡng cố định (`LOW_REMAINING = 3`). Với
 * trần mềm 20, cùng một payload `{active: 16}` cho badge trên thanh đầu trang
 * đọc "sắp hết chỗ" trong khi nhãn cạnh nút Bắt đầu ngay bên dưới đọc "còn 4
 * chỗ" bình thường — hai câu mâu thuẫn, cùng màn hình, cùng dữ liệu.
 *
 * Gộp về vỏ chứ không về khung phiên vì (a) một ngưỡng CỐ ĐỊNH mục đúng kiểu
 * `capacitySoftLimit` viết tay mà D5 vừa gỡ khỏi orchestrator — trần đổi thì
 * "sắp hết" đổi nghĩa mà không ai sửa dòng nào — và (b) vỏ nằm trên tất cả và
 * không kéo theo phụ thuộc terminal nào, nên `components/session` tiêu thụ
 * `components/shell` được, chiều ngược lại thì không.
 */

/** Cặp số tối thiểu để nói được câu "còn N chỗ". Dùng chung cho vỏ lẫn khung phiên. */
export interface CapacitySnapshot {
  readonly activeSessions: number;
  readonly softCapacity: number;
}

/**
 * Phần payload `capacity.get` (C4/D5) mà vỏ ứng dụng đọc.
 *
 * Khai theo cấu trúc (không `inferRouterOutputs`) để file này chạy được trong
 * test node thuần, KHÔNG mất cổng kiểu: `use-capacity.tsx` giữ state đúng kiểu
 * output của router và truyền thẳng vào `describeCapacity`, nên BE bỏ một field
 * là đỏ ngay ở chỗ gọi.
 */
export interface CapacityView extends CapacitySnapshot {
  readonly hardCapacity: number;
  readonly fetchedAt: string;
}

/** Mức để tô màu, KHÔNG phải để quyết định chặn — nút Bắt đầu luôn bấm được. */
export type CapacityTone = 'ok' | 'low' | 'full';

/** Phần SỐ HỌC dùng chung: hai nơi hiển thị khác nhau, nhưng cùng một mức. */
export interface CapacityLevel {
  /** `max(0, soft − active)` — số phiên còn nhận được trước khi chạm trần mềm. */
  readonly remaining: number;
  readonly exhausted: boolean;
  readonly tone: CapacityTone;
}

export interface CapacityReading extends CapacityLevel {
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

/**
 * Mức từ một cặp số ĐÃ hợp lệ. Hàm TOÀN PHẦN — không có nhánh "chưa biết".
 *
 * Tách khỏi `readCapacity` để `describeCapacity` (đầu vào đã được hai chỗ gọi
 * chặn `null` từ trước) giữ nguyên chữ ký trả về không-null, mà vẫn dùng CHUNG
 * đúng một công thức với khung phiên.
 */
function levelOf(activeSessions: number, softCapacity: number): CapacityLevel {
  // `max(0, …)` vì `soft = hard − poolTarget` có thể ÂM khi ai đó đặt poolTarget
  // lớn hơn trần cứng. "Còn −2 chỗ" là một con số không có nghĩa với người học.
  const remaining = Math.max(0, Math.trunc(softCapacity) - Math.trunc(activeSessions));
  const exhausted = remaining === 0;
  return {
    remaining,
    exhausted,
    tone: exhausted ? 'full' : remaining <= softCapacity * LOW_CAPACITY_RATIO ? 'low' : 'ok',
  };
}

/**
 * `null` = **CHƯA BIẾT**, và nó KHÁC "biết là đã đầy".
 *
 * Query lỗi / chưa chạy / đang tắt đều cho `undefined`, và vẽ chúng thành
 * "Sandbox đang đầy" là bịa ra một sự thật hạ tầng từ một lỗi mạng. Người gọi
 * nhận `null` thì KHÔNG hiện gì cả — im lặng đúng hơn là sai.
 */
export function readCapacity(
  snapshot: CapacitySnapshot | null | undefined,
): CapacityLevel | null {
  if (snapshot == null) {
    return null;
  }
  const { activeSessions, softCapacity } = snapshot;
  // Số không hữu hạn (JSON hỏng, field vắng) cũng là "chưa biết", không phải 0.
  if (!Number.isFinite(activeSessions) || !Number.isFinite(softCapacity)) {
    return null;
  }
  return levelOf(activeSessions, softCapacity);
}

/**
 * Câu cho badge + tooltip trên thanh điều hướng.
 *
 * ⚠ Chữ ký nhận `CapacityView` KHÔNG-null có chủ ý: cả hai chỗ gọi
 * (`capacity-indicator.tsx`, `app-shell.tsx`) đã tự chặn `data === null` và
 * hiện Skeleton/không hiện gì — tức ngữ nghĩa "chưa biết ⇒ không vẽ" đã được
 * giữ ở đó. Muốn dời cổng đó vào đây thì kiểu trả về phải thành
 * `CapacityReading | null` và HAI file kia phải sửa theo.
 */
export function describeCapacity(view: CapacityView): CapacityReading {
  const level = levelOf(view.activeSessions, view.softCapacity);
  const load = `Đang chạy ${String(view.activeSessions)}/${String(view.softCapacity)} phiên (trần cứng ${String(view.hardCapacity)}).`;

  if (level.tone === 'full') {
    return {
      ...level,
      label: 'Hết chỗ',
      // Người dùng gặp 429 mà không được báo trước là lỗi thiết kế (13.B mục 7)
      // — nên câu này phải nói cả việc phải làm, không chỉ tình trạng.
      detail: `${load} Bắt đầu phiên mới lúc này sẽ bị từ chối. Chờ vài phút rồi thử lại, hoặc kết thúc một phiên đang mở ở trang Của tôi.`,
    };
  }

  if (level.tone === 'low') {
    return {
      ...level,
      label: `Chỉ còn ${String(level.remaining)} chỗ`,
      detail: `${load} Sắp hết chỗ — nếu bạn định làm lab, hãy bắt đầu sớm.`,
    };
  }

  return { ...level, label: `Còn ${String(level.remaining)} chỗ`, detail: load };
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
