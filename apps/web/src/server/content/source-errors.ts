import { TRPCError } from '@trpc/server';
import { ContentSourcesUnavailableError, InvalidCursorError } from '@devops-platform/scenario';

/**
 * Dịch lỗi của `ContentSource` sang `TRPCError` — SSOT cho MỌI router phân trang
 * nội dung (`lessons.list`, `playgrounds.list`, `labs.list`).
 *
 * Gom về một chỗ vì đây là chỗ thứ BA cần đúng khối `catch` này (ngưỡng
 * rule-of-two của `code-conventions.md` § No Duplicated Logic). Ba bản chép tay
 * sẽ trôi khỏi nhau đúng theo cách tệ nhất: một router quên nhánh
 * `ContentSourcesUnavailableError` thì nó rơi xuống `throw cause` và người dùng
 * nhận 500 với câu chung, trong khi hai router kia trả 503 với câu nói được phải
 * làm gì — cùng một sự cố, ba giao diện khác nhau.
 *
 * ⛔ CÂU Ở ĐÂY LÀ CÂU TA TỰ SOẠN, KHÔNG chuyển tiếp `cause.message`. Đây không
 * phải sở thích trình bày mà là ràng buộc của bộ lọc S2
 * (`trpc/error-message.ts`): nó phân biệt "câu ta viết" với "câu tầng dưới" bằng
 * phép so `error.message === cause.message`. Chuyển tiếp nguyên văn ⇒ hai chuỗi
 * bằng nhau ⇒ `isAuthored()` trả `false` ⇒ câu bị thay bằng câu chung. Nghĩa là
 * "chuyển tiếp cho tiện" tự nó XOÁ mất câu vừa chuyển tiếp.
 */
export function rethrowContentSourceError(cause: unknown): never {
  if (cause instanceof ContentSourcesUnavailableError) {
    /*
     * KHÔNG phải "kho trống" — là "không đọc được". Hai thứ đó khác nhau ở việc
     * người dùng nên làm gì, nên chúng không được nhìn giống nhau.
     *
     * 503 chứ không 500: đây là trạng thái TẠM THỜI của hạ tầng, và mã 5xx chung
     * đọc ra như một bug của ứng dụng. `composite-source.ts` đã ghi WARN cho
     * TỪNG nguồn hỏng ngay trước khi ném, nên chi tiết chẩn đoán có đủ trong log
     * — client không cần và không được nhận chúng.
     */
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Chưa đọc được kho nội dung nên danh sách có thể thiếu. Hãy tải lại trang sau ít phút.',
      cause,
    });
  }

  if (cause instanceof InvalidCursorError) {
    // Cursor trỏ vào một mục không còn tồn tại. NÉM chứ không lặng lẽ quay về
    // trang 1: một infinite-scroll nhận lại trang 1 sẽ nối nó vào cuối danh sách
    // và lặp vô hạn — lỗi hiện ra dưới dạng "danh sách lặp lại mãi", không trỏ
    // về một cursor cũ.
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ', cause });
  }

  // Lỗi lạ đi tiếp nguyên trạng: `errorFormatter` là nơi quyết định nó được nói
  // gì với client, và nó sẽ THAY câu (lỗi Drizzle/pg không bao giờ tự soạn).
  // Nuốt ở đây sẽ giấu mất một sự cố thật.
  throw cause;
}
