import type { AuthoredItem } from './content-state';

/**
 * Máy trạng thái của lượt XUẤT BẢN, đọc từ `authoring.list`.
 *
 * ## Vì sao phải có máy trạng thái, không phải một cờ `isPublishing`
 *
 * `authoring.publish` trả về NGAY với `{ state: 'publishing' }` và bắn lượt chạy
 * thử ra ngoài request (`void runPublishTrial(...)`). **Không có procedure
 * `authoring.status`.** Cách duy nhất để biết kết quả là hỏi lại `list` và đọc
 * `state` + `publishError`.
 *
 * ## Ba cái bẫy mà một cờ boolean sẽ dẫm phải
 *
 * 1. **Bản nháp kế nhiệm BIẾN MẤT khi xuất bản thành công.** `runPublishTrial`
 *    với `promoteTo` khác `null` chép nội dung bản nháp đè lên bài gốc rồi
 *    `delete` chính bản nháp trong cùng transaction. Nên hàng `<id>__draft` mà
 *    ta đang theo dõi không đổi trạng thái — nó không còn tồn tại. Đọc điều đó
 *    thành "mất bài" là sai; nó là dấu hiệu THÀNH CÔNG, và bằng chứng nằm ở hàng
 *    bài gốc (`published`).
 *
 * 2. **`list` chuẩn hoá một lượt `publishing` treo thành `draft`.** Nên
 *    "draft + không có lỗi" sau khi ta bấm Xuất bản không phải trạng thái ban
 *    đầu — nó là một lượt chạy thử không để lại dấu vết nào (pod `web` chết giữa
 *    chừng, hoặc quá 15 phút treo). Hiện "sẵn sàng xuất bản" ở đó là nuốt mất
 *    một sự cố.
 *
 * 3. **Ai đó khác có thể đang xuất bản.** Bài ở `publishing` mà ta chưa bấm gì
 *    vẫn là "đang chạy thử" — trạng thái tới từ DỮ LIỆU, không từ việc ta có bấm
 *    nút hay không.
 */

export type PublishPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting' }
  | { readonly kind: 'running' }
  | { readonly kind: 'passed'; readonly promotedTo: string | null }
  | { readonly kind: 'failed'; readonly error: string }
  /** Không còn dấu vết nào của lượt chạy thử. KHÔNG kết luận đạt hay trượt. */
  | { readonly kind: 'lost' }
  | { readonly kind: 'archived' };

export interface PublishInput {
  /** Đã bấm Xuất bản trong phiên làm việc này (chưa nhất thiết đã xong). */
  readonly started: boolean;
  /** Mutation đang bay. */
  readonly submitting: boolean;
  /** Hàng của id đang mở. `null` = không còn trong `list`. */
  readonly row: AuthoredItem | null;
  /** Hàng của bài GỐC khi id đang mở là một bản nháp kế nhiệm. `null` nếu không phải. */
  readonly baseRow: AuthoredItem | null;
}

export function publishPhase(input: PublishInput): PublishPhase {
  if (input.submitting) {
    return { kind: 'submitting' };
  }

  if (input.row === null) {
    // Hàng biến mất. Chỉ có MỘT đường sinh ra chuyện đó trong toàn hệ thống:
    // đường đổi ngôi của `runPublishTrial`. Nên bằng chứng phải là bài gốc đã
    // lên — không có nó thì đây là chuyện khác và ta không được đoán.
    if (input.baseRow !== null && input.baseRow.state === 'published') {
      return { kind: 'passed', promotedTo: input.baseRow.id };
    }
    return { kind: 'lost' };
  }

  switch (input.row.state) {
    case 'publishing':
      // KHÔNG phụ thuộc `started`: trạng thái tới từ dữ liệu. Một tab khác (hoặc
      // một admin) bấm Xuất bản thì ta cũng phải thấy nó đang chạy.
      return { kind: 'running' };

    case 'published':
      return { kind: 'passed', promotedTo: null };

    case 'archived':
      return { kind: 'archived' };

    case 'draft':
      if (input.row.publishError !== null) {
        return { kind: 'failed', error: input.row.publishError };
      }
      // Nháp sạch mà ta đã bấm Xuất bản = lượt chạy thử biến mất không kết quả.
      return input.started ? { kind: 'lost' } : { kind: 'idle' };
  }
}

/** Nhịp hỏi lại, ms. Lượt chạy thử mất tới ~49 s chỉ để dựng sandbox (đo ở P7). */
export const PUBLISH_POLL_INTERVAL_MS = 4_000;
