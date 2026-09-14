import { err, t, type TextKey } from '@devops-platform/copy';
import type { BadgeVariant } from '@devops-platform/ui';

/**
 * Đọc một `JsonSession` của `admin.sessions.list` thành câu tiếng Việt, phần
 * QUYẾT ĐỊNH, tách khỏi JSX để test được trong vitest node thuần.
 *
 * ## Vì sao có `session-row.ts` riêng thay vì dùng `lib/session-reason.ts`
 *
 * File kia trả lời câu hỏi của NGƯỜI HỌC đang mất kết nối: "có nên thử nối lại
 * không" (`gone: boolean`, ngưỡng `TERMINAL_STATUS_FLOOR = 5`). Trang quản trị
 * hỏi chuyện khác: "phiên này đang ở pha nào, của ai, và bấm kết thúc thì
 * chuyện gì xảy ra". Gộp hai câu hỏi vào một hàm sẽ làm mỗi lần sửa câu chữ cho
 * người học đổi luôn nghĩa của bảng quản trị.
 *
 * Ngưỡng thì vẫn dùng chung: `isLiveStatus` khớp đúng `TERMINAL_STATUS_FLOOR`,
 * và test khẳng định lại điều đó bằng chính hằng số kia, không chép số 5.
 */

/**
 * `orchestrator.v1.SessionStatus` (`packages/shared-types/gen/orchestrator/v1/session_pb.ts`).
 *
 * Khai lại bằng số ở đây, KHÔNG import enum sinh từ proto: file này chạy trong
 * test node và được import bởi client component; kéo cả module proto vào chỉ để
 * lấy năm con số là kéo theo `@bufbuild/protobuf` vào bundle trình duyệt. Test
 * `session-row.test.ts` đối chiếu bảng này với enum THẬT, nên hai bên không
 * trôi khỏi nhau trong im lặng.
 *
 * Bảng giữ KHOÁ chứ không giữ câu: chữ nằm ở `surfaces/admin.ts`. Đổi một nhãn
 * không còn là sửa file này.
 */
interface StatusEntry {
  readonly labelKey: TextKey;
  readonly variant: BadgeVariant;
  /** Còn nối được vào không (status < 5, cùng ngưỡng `TERMINAL_STATUS_FLOOR`). */
  readonly live: boolean;
}

export interface StatusView {
  readonly label: string;
  readonly variant: BadgeVariant;
  readonly live: boolean;
}

const STATUS: Readonly<Record<number, StatusEntry>> = {
  0: { labelKey: 'admin.session-status.unspecified', variant: 'outline', live: true },
  1: { labelKey: 'admin.session-status.pending', variant: 'secondary', live: true },
  2: { labelKey: 'admin.session-status.warm', variant: 'secondary', live: true },
  3: { labelKey: 'admin.session-status.claimed', variant: 'success', live: true },
  4: { labelKey: 'admin.session-status.running', variant: 'success', live: true },
  5: { labelKey: 'admin.session-status.expired', variant: 'outline', live: false },
  6: { labelKey: 'admin.session-status.reaped', variant: 'outline', live: false },
  7: { labelKey: 'admin.session-status.failed', variant: 'destructive', live: false },
};

/**
 * Trạng thái lạ (orchestrator thêm giá trị mới mà FE chưa biết) KHÔNG được đọc
 * ra "Đang chạy" và cũng không được thành ô trống. Nó hiện đúng con số, kèm nói
 * rõ là chưa biết: người trực nhìn thấy một số lạ sẽ đi hỏi, còn nhìn thấy một
 * ô trống thì tưởng bảng hỏng.
 */
export function describeSessionStatus(status: number): StatusView {
  const entry = STATUS[status];
  if (entry === undefined) {
    return {
      label: t('admin.session-status.unknown', { status }),
      variant: 'warning',
      live: false,
    };
  }
  return { label: t(entry.labelKey), variant: entry.variant, live: entry.live };
}

export interface TerminatePlan {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly ownedBySelf: boolean;
}

/**
 * Câu xác nhận cho `admin.sessions.terminate`.
 *
 * ⚠ Phần quan trọng nhất là **nói ra ai là người bấm**, không chỉ phiên nào bị
 * kết thúc. D15 mở một nhánh actor thứ ba ở `ReapSession` (`admin_user_id`)
 * đúng để orchestrator ghi nhật ký reap dưới tên ADMIN thay vì dưới tên chủ
 * phiên; bản trước gửi `actor.userId` và ghi ra một dòng audit SAI, không phải
 * một dòng audit thiếu. Giao diện phải phản ánh sự phân biệt đó, nếu không thì
 * cả công của D15 vô hình với người dùng nó.
 *
 * Phiên của CHÍNH admin cũng đi đường admin (nút này chỉ có một đường), nên câu
 * chữ nói thẳng: nó vẫn được ghi là một hành động quản trị, không phải "tôi tự
 * kết thúc phiên của tôi" ở `/me`.
 */
export function planTerminate(input: {
  readonly sessionId: string;
  readonly ownerUserId: string;
  readonly viewerId: string;
}): TerminatePlan {
  const ownedBySelf = input.ownerUserId === input.viewerId;
  const owner = ownedBySelf ? t('admin.terminate.owner-self') : input.ownerUserId;

  return {
    title: t('admin.terminate.title', { id: shortId(input.sessionId) }),
    body: t('admin.terminate.body', { owner }),
    confirmLabel: t('admin.terminate.confirm'),
    ownedBySelf,
  };
}

/** Chủ phiên hiển thị trong bảng: id thật, kèm dấu khi đó là chính người đang xem. */
export function describeSessionOwner(ownerUserId: string, viewerId: string): string {
  if (ownerUserId === '') {
    return t('admin.sessions.owner-unknown');
  }
  return ownerUserId === viewerId ? t('admin.sessions.owner-self', { id: ownerUserId }) : ownerUserId;
}

/**
 * Id rút gọn cho tiêu đề/nút. Bảng vẫn hiện id ĐẦY ĐỦ; rút gọn ở chỗ tra cứu
 * là cách chắc chắn để hai phiên khác nhau trông giống nhau.
 */
export function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 12)}…`;
}

/**
 * Còn bao lâu tới hạn.
 *
 * `now` là THAM SỐ, không đọc `Date.now()` bên trong: một hàm nhãn phụ thuộc
 * đồng hồ là một test không xác định. Cùng kỷ luật với `summarizeProgress` của
 * P2 mà 13.D mục 13 nhắc tên.
 */
export function describeExpiry(expiresAt: string | null, now: number): string {
  if (expiresAt === null) {
    return t('admin.expiry.unknown');
  }
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) {
    return t('admin.expiry.unknown');
  }
  const minutes = Math.round((at - now) / 60_000);
  if (minutes > 0) {
    return t('admin.expiry.remaining', { minutes });
  }
  if (minutes === 0) {
    return t('admin.expiry.now');
  }
  // Quá hạn mà phiên vẫn còn trong danh sách là thông tin THẬT: reaper chưa
  // chạy tới nó. Hiện "còn -3 phút" thì không ai đọc ra điều đó.
  return t('admin.expiry.overdue', { minutes: Math.abs(minutes) });
}

/** Câu lỗi khi kết thúc phiên hỏng. Ghép hai nửa vì `ConfirmDialog` chỉ có một khe `error`. */
export function describeTerminateError(code: string | null, message: string): string {
  const entry =
    code === 'NOT_FOUND'
      ? err('admin.error.terminate-not-found', { message })
      : err('admin.error.terminate-other', { message });
  return `${entry.what} ${entry.next}`;
}
