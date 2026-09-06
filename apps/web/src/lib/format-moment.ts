/**
 * Ngày-giờ địa phương cho mọi bảng trong app — MỘT bản, không bốn.
 *
 * Trước P13 hàm này tồn tại bốn lần: `components/admin/session-row.ts`,
 * `components/admin/audit-row.ts` (`formatAuditMoment`),
 * `components/me/session-summary.ts`, và `app/admin/users/users-client.tsx`
 * (`formatDay`). Ba bản đầu có CÙNG hành vi và chỉ khác nhau ở kiểu đầu vào
 * chúng chịu nhận — tức là ba bản của một thứ, đúng ca `no-duplicated-logic`.
 * Bản thứ tư thì KHÔNG: xem `formatDay` dưới.
 *
 * Chú thích ở `components/me/session-summary.ts` đã nêu đúng chỗ đặt (`lib/`) và
 * đúng lý do lane E không import bản của `admin`: một module tên `admin` không
 * phải thứ một trang của NGƯỜI HỌC nên phụ thuộc vào. `lib/` trung tính với cả
 * hai phía, nên nó là chỗ duy nhất cả `/admin` lẫn `/me` cùng trỏ tới được mà
 * không ai phải mượn tên miền của ai.
 *
 * ⚠ `iso` KHÔNG còn nhận `Date`. Bản của lane E phải nhận vì `me.listProgress`
 * hồi đó trả thẳng dòng Drizzle, nên `updatedAt` là `Date` lúc chạy dù kiểu nói
 * `string`. Router đã được sửa (`toProgressRowDTO`), nên kiểu hẹp ở đây là một
 * CỔNG: nếu ai đó lại trả một cột `timestamp` thẳng ra dây, typecheck đỏ ngay
 * tại chỗ gọi thay vì hỏng âm thầm lúc chạy.
 */

/** `null` và chuỗi không đọc được đều thành "không rõ", không phải "Invalid Date". */
function parseMoment(iso: string | null): Date | null {
  if (iso === null) {
    return null;
  }
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Ngày + giờ. Dùng cho phiên, nhật ký, lịch sử — thứ mà "lúc mấy giờ" có nghĩa. */
export function formatMoment(iso: string | null): string {
  return parseMoment(iso)?.toLocaleString('vi-VN') ?? 'không rõ';
}

/**
 * CHỈ ngày, không giờ. KHÔNG phải một bản trùng của `formatMoment`.
 *
 * `/admin/users` hiện ngày tạo tài khoản: giờ-phút-giây của lượt đăng ký không
 * giúp gì cho việc quản trị người dùng, và một cột dài gấp đôi thì bảng chỉ khó
 * đọc hơn. Gộp hàm này vào `formatMoment` sẽ âm thầm thêm giờ vào bảng đó —
 * một khác biệt CỐ Ý bị xoá đi nhân danh việc dọn trùng lặp.
 */
export function formatDay(iso: string | null): string {
  return parseMoment(iso)?.toLocaleDateString('vi-VN') ?? 'không rõ';
}
