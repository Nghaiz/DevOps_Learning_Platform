import { describe, expect, it } from 'vitest';
import {
  RESET_COOKIE_NAME,
  RESET_COOKIE_PATHS,
  RESET_TOKEN_TTL_SECONDS,
  buildResetCookie,
  buildResetLink,
  clearResetCookie,
} from './reset-link';
import { buildResetPasswordMailBody } from './reset-mail';

/**
 * Hình dạng của cookie và của liên kết trong thư. Test ĐƠN VỊ thuần, không mạng,
 * không DB.
 *
 * Cổng luật 8 (`security/rule-08-no-token-in-url.test.ts`) grep cây nguồn tìm
 * chuỗi vi phạm. Nó bắt được một dòng mã dựng URL sai, nhưng nó KHÔNG bắt được
 * một hàm dựng URL sai lúc CHẠY: `buildResetLink` có thể nối tham số truy vấn từ
 * hai mảnh và không mảnh nào khớp regex của cổng. Ô đầu tiên dưới đây đóng đúng
 * lỗ đó bằng cách kiểm GIÁ TRỊ đã dựng.
 */

const TOKEN = 'abc123XYZ';

describe('liên kết đặt lại mật khẩu: mã nằm ở đường dẫn, không ở query string', () => {
  it('không dựng ra tham số truy vấn nào', () => {
    const link = buildResetLink('http://localhost:3000', TOKEN);
    expect(link).toBe(`http://localhost:3000/api/auth/reset-link/${TOKEN}`);
    // Khẳng định TRỰC TIẾP trên URL đã dựng, không phải trên mã nguồn.
    expect(link.includes('?')).toBe(false);
    expect(link.includes('&')).toBe(false);
    expect(new URL(link).search).toBe('');
    expect([...new URL(link).searchParams.keys()]).toEqual([]);
  });

  it('mã nằm ở phân đoạn CUỐI của đường dẫn, đọc lại được nguyên vẹn', () => {
    const link = buildResetLink('http://localhost:3000', TOKEN);
    const segments = new URL(link).pathname.split('/');
    expect(segments[segments.length - 1]).toBe(TOKEN);
  });

  it('cắt dấu chéo thừa ở cuối origin thay vì sinh đường dẫn hai chéo', () => {
    expect(buildResetLink('http://localhost:3000/', TOKEN)).toBe(
      `http://localhost:3000/api/auth/reset-link/${TOKEN}`,
    );
    expect(buildResetLink('http://localhost:3000///', TOKEN)).toBe(
      `http://localhost:3000/api/auth/reset-link/${TOKEN}`,
    );
  });

  it('mã có ký tự cần thoát thì thoát, không cắt đôi đường dẫn', () => {
    const link = buildResetLink('http://localhost:3000', 'a/b c');
    expect(link.endsWith('/a%2Fb%20c')).toBe(true);
  });

  it('thân thư mang đúng liên kết đó và không mang mã trần ở chỗ nào khác', () => {
    const link = buildResetLink('http://localhost:3000', TOKEN);
    const body = buildResetPasswordMailBody(link);
    expect(body).toContain(link);
    // Mã xuất hiện ĐÚNG một lần, và chỉ bên trong liên kết. Một bản "tiện thể
    // in mã ra cho người dùng tự dán" là một mã nằm trong thân thư ở dạng có
    // thể chép nhầm sang chỗ khác.
    expect(body.split(TOKEN)).toHaveLength(2);
    expect(body).toContain('30 phút');
  });
});

describe('cookie mang mã', () => {
  it('HttpOnly, Secure, SameSite=Lax, và Max-Age lấy từ CÙNG hằng số với hạn của mã', () => {
    const cookie = buildResetCookie(TOKEN, '/reset-password');
    expect(cookie).toContain(`${RESET_COOKIE_NAME}=${TOKEN}`);
    expect(cookie).toContain('Path=/reset-password');
    expect(cookie).toContain(`Max-Age=${String(RESET_TOKEN_TTL_SECONDS)}`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  /**
   * ĐỐI CHỨNG ÂM cho `SameSite`. Không có ô này thì một lượt "dọn cho nhất
   * quán" đổi `Lax` thành `Strict` (giống cookie sandbox) đi qua mọi cổng, và
   * hỏng ở đúng chỗ không test đơn vị nào tới được: trình duyệt không gửi cookie
   * vừa đặt cho lượt GET ngay sau một chuyển hướng đến từ site khác.
   */
  it('KHÔNG phải Strict, vì cookie được đặt trong điều hướng đến từ hộp thư', () => {
    expect(buildResetCookie(TOKEN, '/reset-password')).not.toContain('SameSite=Strict');
  });

  it('hai đường, và đường nhập mật khẩu không dùng chung path với API', () => {
    expect([...RESET_COOKIE_PATHS]).toEqual(['/reset-password', '/api/auth/reset-finish']);
    // ⛔ Không đường nào là '/'. Xem lý do ở reset-link.ts.
    expect(RESET_COOKIE_PATHS.some((path) => path === '/')).toBe(false);
  });

  it('lượt xoá khớp cùng cặp (tên, path) và đặt Max-Age=0', () => {
    for (const path of RESET_COOKIE_PATHS) {
      const cleared = clearResetCookie(path);
      expect(cleared).toContain(`${RESET_COOKIE_NAME}=;`);
      expect(cleared).toContain(`Path=${path}`);
      expect(cleared).toContain('Max-Age=0');
      expect(cleared).toContain('HttpOnly');
    }
  });

  it('hạn ngắn hơn mặc định 1 giờ của thư viện, và không phải 0', () => {
    expect(RESET_TOKEN_TTL_SECONDS).toBeGreaterThan(0);
    expect(RESET_TOKEN_TTL_SECONDS).toBeLessThan(3600);
  });
});
