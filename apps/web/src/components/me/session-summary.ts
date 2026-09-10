import { err, t } from '@devops-platform/copy';
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

type StatusKey =
  | 'me.session-status.unknown'
  | 'me.session-status.preparing'
  | 'me.session-status.ready'
  | 'me.session-status.running'
  | 'me.session-status.expired'
  | 'me.session-status.ended'
  | 'me.session-status.failed';

const STATUS: Readonly<Record<number, { key: StatusKey; variant: BadgeVariant }>> = {
  0: { key: 'me.session-status.unknown', variant: 'outline' },
  1: { key: 'me.session-status.preparing', variant: 'secondary' },
  2: { key: 'me.session-status.preparing', variant: 'secondary' },
  3: { key: 'me.session-status.ready', variant: 'success' },
  4: { key: 'me.session-status.running', variant: 'success' },
  5: { key: 'me.session-status.expired', variant: 'outline' },
  6: { key: 'me.session-status.ended', variant: 'outline' },
  7: { key: 'me.session-status.failed', variant: 'destructive' },
};

/**
 * Trạng thái FE chưa biết KHÔNG được đọc ra "Đang chạy" và cũng không được
 * thành ô trống: hiện đúng con số kèm nói rõ là chưa biết, để người học báo lại
 * được thứ họ nhìn thấy.
 */
export function describeMySessionStatus(status: number): MySessionStatusView {
  const known = STATUS[status];
  if (known === undefined) {
    return { label: t('me.session-status.strange', { status }), variant: 'warning', live: false };
  }
  return {
    label: t(known.key),
    variant: known.variant,
    live: status < TERMINAL_STATUS_FLOOR,
  };
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
    return t('me.expiry.unknown');
  }
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) {
    return t('me.expiry.unknown');
  }
  const minutes = Math.round((at - now) / 60_000);
  if (minutes > 0) {
    return t('me.expiry.remaining', { minutes });
  }
  if (minutes === 0) {
    return t('me.expiry.now');
  }
  return t('me.expiry.overdue');
}

/** Id rút gọn cho tiêu đề hộp thoại. Danh sách vẫn hiện id ĐẦY ĐỦ. */
export function shortSessionId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 12)}…`;
}

/**
 * Câu lỗi khi kết thúc phiên hỏng: nói chuyện gì xảy ra VÀ làm gì tiếp.
 *
 * Hai nửa của `ErrorEntry` được ghép lại ở ĐÂY, và đó là chỗ ghép DUY NHẤT của
 * lane: `ErrorState` có hai khe riêng nên nó nhận `what`/`next` tách rời, còn
 * hàm này trả một chuỗi vì nơi gọi cất nó vào một `useState<string | null>`
 * dùng chung với các câu lỗi khác.
 *
 * ⚠ Nửa `next` giờ là một câu RIÊNG mở đầu bằng động từ viết hoa, nên phép so
 * `toContain('tải lại')` phân biệt hoa thường của test cũ phải đổi theo. Đó là
 * hệ quả bắt buộc của hình dạng `ErrorEntry`, không phải một lượt đổi chữ.
 */
export function describeEndSessionError(code: string | null, message: string): string {
  const entry =
    code === 'NOT_FOUND'
      ? err('me.error.session-end-missing', { message })
      : err('me.error.session-end', { message });
  return `${entry.what} ${entry.next}`;
}
