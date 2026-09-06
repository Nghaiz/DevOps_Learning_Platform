import type { TRPCError } from '@trpc/server';

/**
 * S2 — biên quyết định thông điệp lỗi nào được phép ra tới trình duyệt.
 *
 * ## Nguyên nhân, không phải triệu chứng
 *
 * `getErrorShape` của `@trpc/server@11.18.0` đặt `message: error.message` rồi
 * đưa cho `errorFormatter`. Còn constructor của `TRPCError` là:
 *
 *     const message = opts.message ?? cause?.message ?? opts.code;
 *
 * (đọc từ `@trpc/server/dist/tracked-*.mjs`, không phải từ trí nhớ). Nên khi một
 * procedure để lọt một lỗi KHÔNG phải `TRPCError` — Drizzle, `postgres`, `fs`,
 * bất cứ gì — `getTRPCErrorFromUnknown` bọc nó thành `INTERNAL_SERVER_ERROR`
 * **không có `message`**, và vế `cause.message` điền vào chỗ trống ấy nguyên văn
 * thông điệp của tầng dưới. Với Drizzle 0.45.2 đó là:
 *
 *     Failed query: insert into "content_items" (...) values ($1, $2, $3)
 *     params: lab-tran-so,<user_id của người gọi>,3000000000
 *
 * Vá theo từng call-site (thêm `.max()`, thêm một `try/catch`) chỉ đóng ĐÚNG cái
 * đường vừa tìm ra; đường thứ tư luôn xuất hiện. Chốt chặn phải nằm ở đây, và
 * bất biến của nó là: **không thông điệp nào sinh ra dưới tầng mã của ta được đi
 * ra ngoài**, bất kể procedure nào ném.
 *
 * ## Vì sao KHÔNG chặn theo `code`
 *
 * Cách rẻ tiền là "mã 500 thì xoá message". Nhưng repo có nhiều lỗi
 * `INTERNAL_SERVER_ERROR` **ta tự soạn** kèm câu tiếng Việt dùng được và
 * **hành động tiếp theo** cho người học — ví dụ `routers/lessons.ts`: "Đẩy file
 * kèm bài học thất bại (exit 1). Hãy khởi động lại phiên." Xoá theo mã sẽ giết
 * hết những câu đó và làm giao diện tệ đi để đổi lấy an toàn. Phân biệt đúng là
 * "ta có tự viết câu này không", và constructor ở trên cho ta quan sát được điều
 * đó mà không cần sửa 94 chỗ ném.
 */

/** Câu cuối cùng khi không có gì cụ thể hơn cho `code`. */
export const GENERIC_ERROR_MESSAGE =
  'Hệ thống gặp sự cố khi xử lý yêu cầu. Hãy thử lại; nếu vẫn lỗi, báo quản trị viên.';

/**
 * Câu thay thế theo `code` — nói CHUYỆN GÌ XẢY RA + LÀM GÌ TIẾP, không phải mã
 * lỗi trần. `lib/trpc.ts` (`describeTrpcError`) hiển thị `message` THẲNG cho
 * người dùng, nên đây là chuỗi người học đọc được, không phải log.
 */
const SAFE_MESSAGE_BY_CODE: Partial<Record<TRPCError['code'], string>> = {
  BAD_REQUEST: 'Dữ liệu gửi lên không hợp lệ. Hãy kiểm tra lại các ô đã nhập rồi gửi lại.',
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử lại.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  NOT_FOUND: 'Không tìm thấy dữ liệu bạn yêu cầu — có thể nó đã bị xoá. Hãy tải lại trang.',
  TIMEOUT: 'Máy chủ xử lý quá lâu nên yêu cầu bị huỷ. Hãy thử lại.',
  CONFLICT: 'Dữ liệu vừa bị một thao tác khác thay đổi. Hãy tải lại trang rồi thử lại.',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên quá lớn. Hãy giảm kích thước rồi gửi lại.',
  TOO_MANY_REQUESTS: 'Bạn thao tác quá nhanh. Hãy chờ một lát rồi thử lại.',
  NOT_IMPLEMENTED: 'Chức năng này chưa sẵn sàng.',
};

/**
 * Dấu hiệu văn bản của tầng dưới — LỚP CHẶN THỨ HAI, không phải lớp chính.
 *
 * Lớp chính (`isAuthored`) dựa vào ngữ nghĩa constructor của tRPC. Nếu tRPC đổi
 * cách điền `message`, lớp ấy im lặng hỏng — và một bộ lọc im lặng hỏng đúng là
 * thứ `green-that-proves-nothing` gọi tên. Danh sách này bắt những chuỗi mà mã
 * của ta KHÔNG BAO GIỜ sinh ra (SQL, mã lỗi Postgres tiếng Anh, khung stack),
 * nên nó không thể một mình là bản vá, nhưng nó chặn được ca lớp chính bỏ lọt.
 */
const LOWER_LAYER_SIGNATURES: readonly RegExp[] = [
  /failed query/i,
  /\bparams:/i,
  /\binsert into\b/i,
  /\bdelete from\b/i,
  /\bselect\b[\s\S]*\bfrom\b/i,
  /\bupdate\b[\s\S]*\bset\b/i,
  /\$\d+/,
  /duplicate key value/i,
  /out of range for type/i,
  /invalid input syntax/i,
  /violates .*constraint/i,
  /\brelation\b[\s\S]*does not exist/i,
  /\b(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE|ECONNRESET)\b/,
  /\bat [\w.<>]+ \(.*:\d+:\d+\)/,
];

/**
 * Câu này có phải do CHÍNH mã của ta viết không?
 *
 * `false` nghĩa là tRPC đã rơi về một trong hai vế dự phòng của constructor, tức
 * chuỗi đến từ nơi khác:
 *  - `message === cause.message` ⇒ rơi về `cause.message` (lỗi Drizzle/pg/fs).
 *  - `message === code` ⇒ không ai truyền `message` (người dùng thấy chuỗi tiếng
 *    Anh trần như `UNAUTHORIZED`).
 *
 * Ca biên "câu ta soạn TRÙNG y hệt `cause.message`" bị xếp nhầm là không-tự-soạn
 * và bị thay. Đó là chiều sai AN TOÀN: mất một câu, không rò một câu.
 */
function isAuthored(error: TRPCError): boolean {
  const cause: unknown = error.cause;
  if (cause instanceof Error && error.message === cause.message) {
    return false;
  }
  return error.message !== error.code;
}

export interface SafeMessage {
  readonly message: string;
  /** `true` = đã thay câu gốc; gọi bên ngoài PHẢI ghi log câu gốc ở server. */
  readonly redacted: boolean;
}

/**
 * Câu an toàn để trả cho client, kèm cờ cho biết có phải đã thay hay không.
 *
 * KHÔNG tự ghi log ở đây: hàm này thuần để test được không cần bắt stdout, và
 * chỗ gọi (`errorFormatter`) mới là nơi có `path` của procedure — thứ khiến dòng
 * log tra cứu được. "Errors Over Silent Fallbacks": thay câu mà không log là
 * nuốt lỗi.
 */
export function toClientSafeMessage(error: TRPCError): SafeMessage {
  const replacement = SAFE_MESSAGE_BY_CODE[error.code] ?? GENERIC_ERROR_MESSAGE;
  if (!isAuthored(error)) {
    return { message: replacement, redacted: true };
  }
  if (LOWER_LAYER_SIGNATURES.some((pattern) => pattern.test(error.message))) {
    return { message: replacement, redacted: true };
  }
  return { message: error.message, redacted: false };
}
