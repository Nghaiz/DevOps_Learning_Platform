import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';
import { ADMIN_NAV, isActiveAdminNav } from './admin-nav';

/**
 * D12 chốt phạm vi màn hình: năm đường quản trị, không hơn. Thêm một mục ở đây
 * mà không hỏi chủ dự án là đỏ ngay.
 */
describe('ADMIN_NAV', () => {
  it('đúng năm màn hình đã chốt', () => {
    expect(ADMIN_NAV.map((item) => item.href)).toEqual([
      '/admin',
      '/admin/users',
      '/admin/sessions',
      '/admin/content',
      '/admin/audit',
    ]);
  });

  /**
   * Mọi mục PHẢI nằm dưới `/admin` — cổng vai trò là `app/admin/layout.tsx`, và
   * nó chỉ bọc những đường trong nhánh đó. Một mục trỏ ra ngoài là một trang
   * quản trị không ai gác.
   */
  it('không mục nào trỏ ra ngoài nhánh /admin', () => {
    const outside = ADMIN_NAV.filter(
      (item) => item.href !== '/admin' && !item.href.startsWith('/admin/'),
    );
    expect(outside).toEqual([]);
  });

  /*
    Nhãn nay là KHOÁ chứ không phải câu (16.F, p16-copy.md §1.6), nên ô này
    dựng câu ra từ bản đồ rồi mới đo. So `labelKey` với chính nó thì xanh với
    mọi giá trị, kể cả một khoá trỏ vào một mục rỗng.
  */
  it('nhãn tiếng Việt, không rỗng', () => {
    expect(ADMIN_NAV.every((item) => t(item.labelKey).trim().length > 0)).toBe(true);
  });

  it('mỗi mục một khoá riêng, không mục nào chép khoá của mục khác', () => {
    const keys = ADMIN_NAV.map((item) => item.labelKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('isActiveAdminNav', () => {
  it('Tổng quan chỉ sáng ở đúng /admin', () => {
    expect(isActiveAdminNav('/admin', '/admin')).toBe(true);
    expect(isActiveAdminNav('/admin/users', '/admin')).toBe(false);
  });

  it('mục con sáng ở chính nó và ở đường con của nó', () => {
    expect(isActiveAdminNav('/admin/users', '/admin/users')).toBe(true);
    expect(isActiveAdminNav('/admin/users/abc', '/admin/users')).toBe(true);
  });

  it('không nuốt đường có cùng tiền tố chuỗi', () => {
    expect(isActiveAdminNav('/admin/users-export', '/admin/users')).toBe(false);
  });

  it('đúng MỘT mục sáng ở mỗi màn hình', () => {
    for (const item of ADMIN_NAV) {
      const active = ADMIN_NAV.filter((candidate) => isActiveAdminNav(item.href, candidate.href));
      expect(active.map((entry) => entry.href)).toEqual([item.href]);
    }
  });
});
