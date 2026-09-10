import { NextResponse } from 'next/server';
import {
  RESET_COOKIE_PATHS,
  buildResetCookie,
  clearResetCookie,
} from '../../../../../server/auth/reset-link';

/**
 * Bước 2 của luồng đặt lại mật khẩu: ĐỔI mã trong liên kết lấy một cookie
 * `HttpOnly`, rồi chuyển hướng sang `/reset-password` TRẦN.
 *
 * Toàn bộ lý lẽ (vì sao không dùng endpoint chuyển hướng của Better Auth, vì
 * sao `SameSite=Lax`, cookie mang những đường nào) nằm ở
 * `server/auth/reset-link.ts`. Đừng chép lại ở đây.
 *
 * ## Route TĨNH này thắng catch-all `[...all]`
 *
 * `app/api/auth/[...all]/route.ts` mount toàn bộ endpoint của Better Auth. Next
 * ưu tiên phân đoạn tĩnh hơn catch-all, đúng như `logout/` và `refresh/` đã dựa
 * vào. Tên `reset-link` cũng cố ý KHÁC `reset-password`: một thư mục tên
 * `reset-password` ở đây sẽ che mất endpoint `POST /api/auth/reset-password`
 * của chính thư viện, tức che mất đường mà bước 3 gọi vào.
 *
 * ## `Location` TƯƠNG ĐỐI, không dựng URL tuyệt đối
 *
 * `NextResponse.redirect` đòi URL tuyệt đối, mà một URL tuyệt đối ở đây phải
 * đoán origin: `request.url` sau reverse proxy là địa chỉ NỘI BỘ của pod, còn
 * `BETTER_AUTH_URL` thì thêm một biến môi trường vào đường đi của một lượt
 * chuyển hướng cùng site. RFC 7231 cho phép `Location` tương đối và mọi trình
 * duyệt hiện đại xử lý đúng, nên ta không đoán gì cả.
 *
 * `303` chứ không `302`: 303 nói rõ "đi tiếp bằng GET", không để trình duyệt
 * nào tự quyết.
 */

// Set-Cookie + đọc tham số đường dẫn: không có gì cần Node thật, nhưng giữ cùng
// runtime với các route anh em trong `/api/auth/*` để không có hai nền chạy
// khác nhau trong cùng một thư mục.
export const runtime = 'nodejs';

const RESET_PAGE = '/reset-password';

export async function GET(
  _request: Request,
  context: { readonly params: Promise<{ readonly token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: RESET_PAGE },
  });

  for (const path of RESET_COOKIE_PATHS) {
    // Mã rỗng (liên kết bị cắt khi chuyển tiếp thư, hay ai đó gõ tay đường dẫn):
    // XOÁ cookie thay vì để nguyên. Giữ nguyên nghĩa là một cookie CŨ còn sót
    // làm trang hiện form cho một liên kết vừa hỏng, và người dùng gõ xong mật
    // khẩu mới rồi mới biết.
    response.headers.append(
      'Set-Cookie',
      token === '' ? clearResetCookie(path) : buildResetCookie(token, path),
    );
  }

  return response;
}
