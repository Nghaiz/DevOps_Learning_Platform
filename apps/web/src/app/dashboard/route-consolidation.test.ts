import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * D12 — `/dashboard` và `/session` gộp vào `/me` bằng **308**.
 *
 * Test này gác đúng hai thứ dễ trôi:
 *
 * 1. **Đích.** Đổi `/me` thành bất cứ gì khác là đỏ ở đây.
 * 2. **Mã trạng thái.** `redirect()` của Next là **307**, `permanentRedirect()`
 *    là **308** — hai hàm khác nhau, cùng một chữ ký, và gõ nhầm không sinh lỗi
 *    biên dịch nào. Đó là lý do có khẳng định "KHÔNG gọi `redirect`" bên dưới:
 *    một test chỉ kiểm "có chuyển hướng về /me" sẽ xanh y hệt với 307.
 *
 * Đặt ở `app/dashboard/` (cạnh một trong hai trang) chứ không ở
 * `components/shell/`: nó kiểm hành vi của hai route file, và repo đã có tiền lệ
 * test nằm cạnh route (`app/lessons/[id]/phases.test.ts`).
 */
const { permanentRedirect, redirect } = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ permanentRedirect, redirect }));

// `vi.mock` được hoist lên trên MỌI import, nên hai import dưới đây nằm sau nó
// là bắt buộc chứ không phải nhầm lẫn: đặt chúng lên đầu file thì hai route vẫn
// nhận đúng bản mock, nhưng người đọc sẽ tưởng chúng nạp `next/navigation` thật.
import DashboardRedirect from './page';
import SessionRedirect from '../(session)/session/page';

beforeEach(() => {
  permanentRedirect.mockClear();
  redirect.mockClear();
});

describe('/dashboard', () => {
  it('chuyển VĨNH VIỄN (308) về /me', () => {
    DashboardRedirect();
    expect(permanentRedirect).toHaveBeenCalledExactlyOnceWith('/me');
  });

  it('KHÔNG dùng redirect() (307) — mã tạm thời sai nghĩa cho một route đã gộp', () => {
    DashboardRedirect();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('/session', () => {
  it('chuyển VĨNH VIỄN (308) về /me', () => {
    SessionRedirect();
    expect(permanentRedirect).toHaveBeenCalledExactlyOnceWith('/me');
  });

  it('KHÔNG dùng redirect() (307)', () => {
    SessionRedirect();
    expect(redirect).not.toHaveBeenCalled();
  });
});
