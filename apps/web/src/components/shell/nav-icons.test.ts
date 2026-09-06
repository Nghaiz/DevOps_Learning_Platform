import { describe, expect, it } from 'vitest';
import { NAV_ICONS, USER_MENU_ICONS } from './nav-icons';
import { PRIMARY_NAV, userMenuItems } from './nav';

/**
 * Bảng icon tra theo `href` là một bản sao khoá của `nav.ts`. Bản sao khoá thì
 * trôi: thêm một mục vào `PRIMARY_NAV` mà quên bảng này sẽ ra một mục điều
 * hướng KHÔNG có icon giữa năm mục có icon — sai lệch thị giác mà không lệnh
 * nào kêu.
 *
 * Hai chiều, cố ý (`pinned-baseline-test-companion`): thiếu icon là một lỗi,
 * icon trỏ tới đường KHÔNG còn tồn tại là một lỗi khác — bảng biến thành nghĩa
 * địa và người sau tin rằng đường đó vẫn còn.
 */
describe('NAV_ICONS ↔ PRIMARY_NAV', () => {
  it('mọi mục điều hướng chính đều có icon', () => {
    const missing = PRIMARY_NAV.filter((item) => !(item.href in NAV_ICONS)).map((item) => item.href);
    expect(missing).toEqual([]);
  });

  it('không có icon thừa trỏ tới đường không còn trong điều hướng chính', () => {
    const known = new Set(PRIMARY_NAV.map((item) => item.href));
    expect(Object.keys(NAV_ICONS).filter((href) => !known.has(href))).toEqual([]);
  });
});

describe('USER_MENU_ICONS ↔ userMenuItems', () => {
  /** `admin` là vai trò thấy NHIỀU mục nhất — phủ trọn tập đường có thể hiện. */
  const adminHrefs = userMenuItems('admin').map((item) => item.href);

  it('mọi mục menu tài khoản đều có icon', () => {
    expect(adminHrefs.filter((href) => !(href in USER_MENU_ICONS))).toEqual([]);
  });

  it('không có icon thừa trỏ tới đường không còn trong menu tài khoản', () => {
    const known = new Set(adminHrefs);
    expect(Object.keys(USER_MENU_ICONS).filter((href) => !known.has(href))).toEqual([]);
  });

  it('đối chứng: tập đường của admin không rỗng (nếu rỗng, hai khẳng định trên xanh vô nghĩa)', () => {
    expect(adminHrefs.length).toBeGreaterThan(0);
  });
});
