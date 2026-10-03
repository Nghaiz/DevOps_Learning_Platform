/**
 * Kiểm tham số đường dẫn của trang chi tiết quản trị (`/admin/classes/:id`,
 * `/admin/exams/:id`) TRƯỚC khi gọi procedure nào.
 *
 * `/admin/exams/abc` không phải "kỳ thi không tồn tại" mà là "không phải một
 * id". Để nó đi tiếp thì client gọi hai, ba procedure, cả mấy cùng trả 400 từ
 * Zod (`z.string().uuid()`), và người dùng nhận mấy khối lỗi cho một đường dẫn
 * gõ sai. `notFound()` ở trang nói đúng chuyện đang xảy ra, và không cho người
 * ngoài một đường dò rẻ vào tầng DB.
 *
 * Cùng một biểu thức cho cả hai trang: hai bản chép là hai chỗ để một trang
 * nhận `UUID` viết hoa còn trang kia thì không.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
