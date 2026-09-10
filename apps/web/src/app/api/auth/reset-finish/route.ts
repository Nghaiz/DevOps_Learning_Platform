import { NextResponse, type NextRequest } from 'next/server';
import { getAuth } from '../../../../server/auth/config';
import {
  RESET_COOKIE_NAME,
  RESET_COOKIE_PATHS,
  clearResetCookie,
} from '../../../../server/auth/reset-link';

/**
 * Bước 3 của luồng đặt lại mật khẩu: nhận mật khẩu mới, lấy mã TỪ COOKIE, gọi
 * Better Auth.
 *
 * ## Vì sao không gọi thẳng `authClient.resetPassword` từ trình duyệt
 *
 * Vì mã nằm trong cookie `HttpOnly`, và đó là điểm chính chứ không phải một chi
 * tiết cài đặt: JavaScript của trang KHÔNG đọc được nó, nên một lỗ XSS ở bất kỳ
 * đâu trong ứng dụng cũng không lấy được mã đặt lại mật khẩu đang treo. Cái giá
 * là client không tự gọi được endpoint của thư viện (nó cần mã trong thân
 * request), nên route này đứng giữa: nó là nơi DUY NHẤT trong hệ đọc cookie đó.
 *
 * ## Vì sao KHÔNG đặt tên thư mục là `reset-password`
 *
 * `POST /api/auth/reset-password` là endpoint của chính Better Auth, và một
 * route tĩnh cùng tên sẽ che mất nó (Next ưu tiên tĩnh hơn catch-all). Đường mà
 * `getAuth().api.resetPassword` gọi vào là hàm trong tiến trình chứ không phải
 * HTTP, nên hôm nay che cũng không hỏng gì — nhưng nó sẽ hỏng trong im lặng ở
 * lần đầu tiên có ai đó gọi endpoint ấy qua mạng.
 *
 * ## Ba mã lỗi, và chúng KHÔNG gộp được
 *
 * `no-link` (không có cookie) và `invalid-link` (có cookie, thư viện từ chối mã)
 * dẫn tới cùng một câu cho người dùng, nhưng tách ở tầng này để log nói được
 * "người dùng tới thẳng trang" khác với "liên kết đã hết hạn hoặc đã dùng rồi".
 * `weak-password` là lỗi của thứ vừa gõ, không phải của liên kết, nên câu tiếp
 * theo phải khác hẳn: gõ lại, đừng đi xin liên kết mới.
 */

export const runtime = 'nodejs';

/**
 * Khớp `minPasswordLength` mặc định của Better Auth (8) và thuộc tính
 * `minLength` của hai ô mật khẩu trên form. Kiểm ở đây chứ không để thư viện
 * kiểm, vì ta cần phân biệt "mật khẩu yếu" với "mã hỏng": thư viện ném cùng một
 * lớp `APIError` cho cả hai, và đọc `code` của nó là buộc route này vào một
 * chuỗi nội bộ của thư viện.
 */
const MIN_PASSWORD_LENGTH = 8;

function respond(status: number, body: Record<string, unknown>, clear: boolean): NextResponse {
  const response = NextResponse.json(body, { status });
  if (clear) {
    for (const path of RESET_COOKIE_PATHS) {
      response.headers.append('Set-Cookie', clearResetCookie(path));
    }
  }
  return response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(RESET_COOKIE_NAME)?.value ?? '';
  if (token === '') {
    return respond(400, { error: 'no-link' }, false);
  }

  let newPassword: unknown;
  try {
    const body: unknown = await request.json();
    newPassword =
      typeof body === 'object' && body !== null
        ? (body as Record<string, unknown>)['newPassword']
        : undefined;
  } catch (cause: unknown) {
    console.error('[auth] reset-finish nhận thân request không phải JSON', cause);
    return respond(400, { error: 'weak-password' }, false);
  }

  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    // KHÔNG xoá cookie: mã vẫn còn nguyên giá trị, người dùng chỉ cần gõ lại một
    // mật khẩu dài hơn. Xoá ở đây là bắt họ đi xin liên kết mới vì một lỗi gõ.
    return respond(400, { error: 'weak-password' }, false);
  }

  try {
    await getAuth().api.resetPassword({ body: { newPassword, token } });
  } catch (cause: unknown) {
    // Chuỗi của thư viện là chữ NGƯỜI VẬN HÀNH đọc; người dùng đọc `ErrorEntry`
    // từ `packages/copy`. Cùng quyết định đã ghi ở `login-form.tsx`.
    console.error('[auth] reset-password bị từ chối', cause);
    // XOÁ cookie: mã đã hỏng (hết hạn, hoặc đã tiêu ở một lượt trước), giữ lại
    // chỉ để trang tiếp tục hiện form cho một thứ không bao giờ chạy nữa.
    return respond(400, { error: 'invalid-link' }, true);
  }

  // Mã là dùng-một-lần: Better Auth đã `consumeVerificationValue`, nên cookie
  // bây giờ mang một chuỗi chết. Xoá ngay thay vì để nó sống hết 30 phút.
  return respond(200, { ok: true }, true);
}
