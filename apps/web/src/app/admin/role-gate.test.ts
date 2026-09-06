import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAdminAccess } from '../../components/admin/admin-guard';

/**
 * Cổng vai trò của `/admin` (13.G deliverable 1) — kiểm ở HAI mức, cố ý.
 *
 * · **Hàm thuần** `resolveAdminAccess`: mọi nhánh vai trò, gồm cả giá trị rác.
 * · **Chính `AdminLayout`**: chứng minh layout THẬT SỰ gọi hàm đó rồi
 *   `redirect`. Chỉ test hàm thuần thì một layout quên gọi nó vẫn xanh 100% —
 *   đúng hạng "phép kiểm gác nhầm artifact" của `green-that-proves-nothing`.
 *
 * `redirect` giả được cho NÉM, giống hệt bản thật của Next (nó ném để dừng
 * render). Nếu chỉ ghi nhận lời gọi mà không ném, test sẽ không phân biệt được
 * "chuyển hướng rồi dừng" với "chuyển hướng rồi VẪN render tiếp trang quản trị"
 * — mà cái sau mới là lỗ hổng.
 */
const { redirect, usePathname } = vi.hoisted(() => ({
  redirect: vi.fn((to: string): never => {
    throw new Error(`REDIRECT:${to}`);
  }),
  usePathname: vi.fn(() => '/admin'),
}));
vi.mock('next/navigation', () => ({ redirect, usePathname }));

const { readViewerSession } = vi.hoisted(() => ({
  readViewerSession: vi.fn<() => Promise<unknown>>(),
}));
vi.mock('../../components/catalog/viewer-role.server', () => ({ readViewerSession }));

// `vi.mock` được hoist lên trên mọi import, nên import layout nằm SAU hai khối
// trên là bắt buộc — đặt lên đầu file thì bản mock vẫn ăn, nhưng người đọc sẽ
// tưởng nó nạp `next/navigation` thật.
import AdminLayout from './layout';

function sessionWithRole(role: unknown): { user: { role: unknown } } {
  return { user: { role } };
}

beforeEach(() => {
  redirect.mockClear();
  readViewerSession.mockReset();
});

describe('resolveAdminAccess — hàm quyết định', () => {
  it('admin đi qua', () => {
    expect(resolveAdminAccess(sessionWithRole('admin'))).toEqual({ allow: true });
  });

  it('người học bị đẩy về /me', () => {
    expect(resolveAdminAccess(sessionWithRole('user'))).toEqual({ allow: false, redirectTo: '/me' });
  });

  it('người soạn bài KHÔNG phải quản trị — cũng bị đẩy về /me', () => {
    expect(resolveAdminAccess(sessionWithRole('author'))).toEqual({ allow: false, redirectTo: '/me' });
  });

  it('chưa đăng nhập về /login, không phải /me (tránh nảy hai lần)', () => {
    expect(resolveAdminAccess(null)).toEqual({ allow: false, redirectTo: '/login' });
  });

  it.each([undefined, null, '', 'ADMIN', 'administrator', 0, {}, ['admin']])(
    'fail-closed: vai trò rác %o KHÔNG được coi là admin',
    (role) => {
      expect(resolveAdminAccess(sessionWithRole(role)).allow).toBe(false);
    },
  );
});

describe('AdminLayout — cổng thật', () => {
  it('người học: chuyển hướng /me VÀ không render nội dung quản trị', async () => {
    readViewerSession.mockResolvedValue(sessionWithRole('user'));
    await expect(AdminLayout({ children: null })).rejects.toThrow('REDIRECT:/me');
    expect(redirect).toHaveBeenCalledExactlyOnceWith('/me');
  });

  it('người soạn bài: chuyển hướng /me', async () => {
    readViewerSession.mockResolvedValue(sessionWithRole('author'));
    await expect(AdminLayout({ children: null })).rejects.toThrow('REDIRECT:/me');
  });

  it('chưa đăng nhập: chuyển hướng /login', async () => {
    readViewerSession.mockResolvedValue(null);
    await expect(AdminLayout({ children: null })).rejects.toThrow('REDIRECT:/login');
  });

  /**
   * ĐỐI CHỨNG DƯƠNG. Không có ca này thì một layout `redirect('/me')` vô điều
   * kiện — tức trang quản trị chết hẳn với cả admin — vẫn xanh cả ba ca trên.
   *
   * ⚠ Vì sao không khẳng định thẳng `.resolves.toBeDefined()`: `apps/web` chưa
   * cấu hình JSX runtime cho vitest (`vitest.config.ts` không đặt
   * `esbuild.jsx`), nên esbuild dịch JSX theo runtime CỔ ĐIỂN và mọi component
   * gọi trực tiếp trong test đều ném `ReferenceError: React is not defined`.
   * Đó là hiện vật của bộ chạy test, KHÔNG phải hành vi của layout — và
   * `vitest.config.ts` nằm ngoài phạm vi sở hữu của lane này (đã ghi vào report
   * kèm patch một dòng cho lead).
   *
   * Khối dưới đây KHÔNG nuốt lỗi: nó chốt rằng nếu có ném thì phải ném ĐÚNG
   * hiện vật đã biết. Layout ném vì bất kỳ lý do nào khác là đỏ. Khi lead thêm
   * `esbuild: { jsx: 'automatic' }`, `failure` thành `null` và khối này tự vô
   * hiệu — lúc đó XOÁ nó và dùng `.resolves.toBeDefined()`.
   */
  it('admin: KHÔNG chuyển hướng', async () => {
    readViewerSession.mockResolvedValue(sessionWithRole('admin'));
    const failure: unknown = await AdminLayout({ children: null }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(redirect).not.toHaveBeenCalled();
    if (failure !== null) {
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe('React is not defined');
    }
  });
});
