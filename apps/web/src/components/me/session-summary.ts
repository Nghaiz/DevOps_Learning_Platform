import type { BadgeVariant } from '@devops-platform/ui';
import { TERMINAL_STATUS_FLOOR } from '../../lib/session-reason';

/**
 * Đọc một `JsonSession` của `me.activeSessions` thành câu chữ cho NGƯỜI HỌC.
 *
 * ## Vì sao có bản này bên cạnh `components/admin/session-row.ts`
 *
 * File kia làm đúng việc này cho bảng `/admin/sessions`, và câu chữ của nó là
 * câu chữ của người TRỰC hệ thống: *"Pod ấm trong pool"*, *"Đã thu hồi"*,
 * *"quá hạn 3 phút (reaper chưa dọn)"*. Ba câu đó chính xác với người biết pool
 * và reaper là gì, và vô nghĩa với người vào học Kubernetes buổi đầu.
 *
 * Đây là **bản song song có chủ ý**, không phải một lượt chép thiếu tra cứu, và
 * lý lẽ là lý lẽ mà chính `session-row.ts` đã viết ra khi nó tách khỏi
 * `lib/session-reason.ts`: *"Gộp hai câu hỏi vào một hàm sẽ làm mỗi lần sửa câu
 * chữ cho người học đổi luôn nghĩa của bảng quản trị."* Cùng lập luận, một tầng
 * nữa — người học và người trực hỏi hai câu khác nhau về cùng một dòng dữ liệu.
 *
 * Thứ KHÔNG được phép trôi là **ngưỡng**, nên nó không được chép: `live` dùng
 * thẳng `TERMINAL_STATUS_FLOOR` của `lib/session-reason.ts`, và
 * `session-summary.test.ts` đối chiếu bảng dưới đây với enum `SessionStatus`
 * sinh từ proto — thêm một trạng thái mới ở orchestrator mà quên dịch sẽ ĐỎ ở
 * test, không lặng lẽ hiện một ô trống.
 *
 * ⚠ Bảng khai bằng SỐ chứ không import enum proto: file này được import bởi một
 * client component, và kéo `@bufbuild/protobuf` vào bundle trình duyệt chỉ để
 * lấy tám con số là một cái giá không đáng. Test (chạy ở node) mới import enum
 * thật để đối chiếu.
 */

export interface MySessionStatusView {
  readonly label: string;
  readonly variant: BadgeVariant;
  /** Còn sống không (`status < TERMINAL_STATUS_FLOOR`). */
  readonly live: boolean;
}

const STATUS: Readonly<Record<number, { label: string; variant: BadgeVariant }>> = {
  0: { label: 'Chưa rõ trạng thái', variant: 'outline' },
  1: { label: 'Đang chuẩn bị máy', variant: 'secondary' },
  2: { label: 'Đang chuẩn bị máy', variant: 'secondary' },
  3: { label: 'Máy đã sẵn sàng', variant: 'success' },
  4: { label: 'Đang chạy', variant: 'success' },
  5: { label: 'Đã hết hạn', variant: 'outline' },
  6: { label: 'Đã kết thúc', variant: 'outline' },
  7: { label: 'Phiên gặp lỗi', variant: 'destructive' },
};

/**
 * Trạng thái FE chưa biết KHÔNG được đọc ra "Đang chạy" và cũng không được
 * thành ô trống: hiện đúng con số kèm nói rõ là chưa biết, để người học báo lại
 * được thứ họ nhìn thấy.
 */
export function describeMySessionStatus(status: number): MySessionStatusView {
  const known = STATUS[status];
  if (known === undefined) {
    return { label: `Trạng thái lạ (${String(status)})`, variant: 'warning', live: false };
  }
  return { ...known, live: status < TERMINAL_STATUS_FLOOR };
}

/**
 * Còn bao lâu tới hạn.
 *
 * `now` là THAM SỐ, không đọc `Date.now()` bên trong — một hàm nhãn phụ thuộc
 * đồng hồ là một test không xác định (cùng kỷ luật `summarizeProgress` của P2).
 *
 * Quá hạn mà phiên vẫn nằm trong danh sách là chuyện CÓ THẬT: reaper chưa chạy
 * tới nó. Nói ra bằng câu người học hiểu ("đang được dọn") thay vì hiện
 * `"còn -3 phút"`.
 */
export function describeSessionExpiry(expiresAt: string | null, now: number): string {
  if (expiresAt === null) {
    return 'không rõ hạn';
  }
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) {
    return 'không rõ hạn';
  }
  const minutes = Math.round((at - now) / 60_000);
  if (minutes > 0) {
    return `còn ${String(minutes)} phút`;
  }
  if (minutes === 0) {
    return 'hết hạn ngay bây giờ';
  }
  return 'đã quá hạn, đang được dọn';
}

/**
 * Thời điểm dạng ngày-giờ địa phương.
 *
 * ⚠ Bản thứ TƯ của cùng bốn dòng này trong `apps/web` (ba bản kia ở
 * `components/admin/session-row.ts`, `components/admin/audit-row.ts`,
 * `app/admin/users/users-client.tsx`). Chỗ đúng cho nó là
 * `apps/web/src/lib/format-moment.ts`, nhưng `lib/**` không thuộc path sở hữu
 * của lane E — đã ghi vào report kèm đề xuất gộp. Chép ở đây thay vì import
 * `components/admin/**` vào một trang của người học: một module tên `admin`
 * không phải chỗ trang `/me` nên phụ thuộc vào, và lane G còn đang sửa nó.
 *
 * ⚠ Nhận cả `Date` chứ không chỉ `string`, và đó KHÔNG phải phòng xa: dây tRPC
 * của app này cố ý không có transformer, nhưng `me.listProgress` trả thẳng dòng
 * Drizzle nên KIỂU của nó nói `Date` trong khi JSON qua dây là một chuỗi ISO.
 * Ép một phía đổi kiểu ở chỗ gọi là mời đúng lỗi `.getTime is not a function`
 * mà `lab-score.ts` đã ghi lại. Đã báo lead: chỗ sửa đúng là router (thêm
 * `toISOString()` như `lessons.ts` đã làm), nằm ngoài path sở hữu của lane E.
 */
export function formatMoment(iso: string | Date | null): string {
  if (iso === null) {
    return 'không rõ';
  }
  const at = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(at.getTime()) ? 'không rõ' : at.toLocaleString('vi-VN');
}

/** Id rút gọn cho tiêu đề hộp thoại. Danh sách vẫn hiện id ĐẦY ĐỦ. */
export function shortSessionId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 12)}…`;
}

/** Câu lỗi khi kết thúc phiên hỏng — nói chuyện gì xảy ra VÀ làm gì tiếp. */
export function describeEndSessionError(code: string | null, message: string): string {
  if (code === 'NOT_FOUND') {
    return `${message}. Phiên có thể đã tự hết hạn — tải lại danh sách để xem còn phiên nào không.`;
  }
  return `${message} Tải lại danh sách rồi thử lại; nếu vẫn hỏng thì phiên sẽ tự hết hạn khi tới giờ.`;
}
