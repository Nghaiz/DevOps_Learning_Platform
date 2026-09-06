/**
 * Một lượt tải trang danh mục đỏ: đó là loại lỗi nào, và người dùng nên làm gì.
 *
 * ## Vì sao phải phân loại thay vì một câu chung
 *
 * Hai lớp lỗi tới cùng một chỗ trên giao diện nhưng đòi hai hành động NGƯỢC
 * nhau, và đoán sai bên nào cũng trả giá thật:
 *
 * - **Thử-lại-được** (`SERVICE_UNAVAILABLE` khi không đọc được kho nội dung,
 *   timeout, mạng đứt). Thử lại CHÍNH LÀ việc đúng cần làm. Đẩy người dùng về
 *   trang 1 ở đây vừa vô ích — trang 1 đọc cùng cái nguồn đang hỏng — vừa lấy
 *   mất chỗ họ đang đọc.
 * - **Cursor hỏng** (`BAD_REQUEST` từ `InvalidCursorError`, khi mục làm mốc đã
 *   bị gỡ khỏi kho). Thử lại bao nhiêu lần cũng ra đúng lỗi đó; lối ra duy nhất
 *   là quay về đầu.
 *
 * Bản trước của `catalog-error.tsx` dùng MỘT câu cho cả hai: hễ `page > 1` là
 * nói "Mục làm mốc của trang này có thể đã bị gỡ khỏi kho — về đầu danh sách".
 * Từ lúc `compositeContentSource` đổi sang NÉM khi không đọc được nguồn
 * (`0ec4f8a`/`2cb5593`), câu đó SAI SỰ THẬT cho lớp lỗi phổ biến nhất, và nó
 * mời người dùng bấm đúng cái nút phá hoại nhất.
 *
 * ## Vì sao có nhánh thứ ba `unknown`
 *
 * `FORBIDDEN`/`NOT_FOUND` không thuộc lớp nào: thử lại không chắc đỡ, mà về đầu
 * cũng không chắc đỡ. Gán bừa chúng vào một trong hai lớp là dựng một lời hứa
 * mà dữ liệu không đỡ nổi — hạng lỗi nhãn-khẳng-định-quá-dữ-liệu. Nhánh này nói
 * ít: vẫn cho thử lại (rẻ, vô hại) và chỉ NÊU lối về đầu như phương án cuối.
 *
 * ## `null` và `undefined` KHÁC nhau ở đây
 *
 * `trpcErrorCode()` trả `null` khi lỗi không đến từ server (mạng đứt, JSON
 * hỏng) — đó là thông tin thật và nó xếp vào lớp thử-lại-được. `undefined` là
 * "nơi gọi chưa truyền mã xuống" — không phải một phép đo, nên nó rơi về
 * `unknown` chứ không được đọc thành "mạng đứt". Gộp hai thứ này sẽ làm năm
 * client hiện chưa truyền mã (xem `catalog-error.tsx`) im lặng nhận một chẩn
 * đoán mà không ai đo được.
 */
export type CatalogErrorKind = 'retryable' | 'stale-cursor' | 'unknown';

export interface CatalogErrorAdvice {
  readonly kind: CatalogErrorKind;
  /** Hiện nút "Thử lại" không. `false` cho lớp thử-lại-vô-ích. */
  readonly canRetry: boolean;
  /** Hiện lối thoát "về đầu danh sách" không. */
  readonly canGoFirstPage: boolean;
  /** Câu phụ dưới ô lỗi. `null` = không có gì đáng thêm; một dòng luôn hiện sẽ thành nhiễu. */
  readonly hint: string | null;
}

/**
 * Mã lỗi mà thử lại là việc đúng.
 *
 * `INTERNAL_SERVER_ERROR` nằm đây chứ không ở `unknown`: một 500 thường là mất
 * kết nối DB giữa chừng, và kể cả khi nó là lỗi tất định thì "về đầu danh sách"
 * cũng không sửa được gì — nên lời khuyên đúng vẫn là thử lại tại chỗ.
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
  'TOO_MANY_REQUESTS',
  'INTERNAL_SERVER_ERROR',
]);

export function describeCatalogError(args: {
  readonly code: string | null | undefined;
  readonly page: number;
}): CatalogErrorAdvice {
  const midway = args.page > 1;

  // Trang 1 KHÔNG gửi cursor, nên một BAD_REQUEST ở đó không thể là cursor
  // hỏng — và mời "về đầu danh sách" khi người dùng đang đứng ở đầu là một nút
  // không làm gì.
  if (args.code === 'BAD_REQUEST' && midway) {
    return {
      kind: 'stale-cursor',
      canRetry: false,
      canGoFirstPage: true,
      hint: `Mốc phân trang của trang ${args.page} không còn trong kho, nên tải lại sẽ ra đúng lỗi này. Quay về đầu danh sách để đọc tiếp.`,
    };
  }

  if (args.code === null || (typeof args.code === 'string' && RETRYABLE_CODES.has(args.code))) {
    return {
      kind: 'retryable',
      canRetry: true,
      canGoFirstPage: false,
      // Trang 1: KHÔNG thêm câu nào. Chính `message` của server đã nói
      // "Chưa đọc được kho nội dung…" (`server/content/source-errors.ts`) và nút
      // Thử lại đã là bước tiếp theo — một dòng nữa ở đây chỉ chép lại câu ngay
      // phía trên nó. Việc phân biệt "không đọc được" với "kho trống" ở trang 1
      // do CẤU TRÚC gánh (ErrorState chứ không EmptyState), không cần nói thêm.
      hint: midway
        ? `Chỗ đang đọc được giữ nguyên — Thử lại sẽ nạp lại đúng trang ${args.page}, không đưa bạn về đầu.`
        : null,
    };
  }

  return {
    kind: 'unknown',
    canRetry: true,
    canGoFirstPage: midway,
    hint: midway ? 'Nếu thử lại vẫn lỗi, quay về đầu danh sách để đọc tiếp.' : null,
  };
}
