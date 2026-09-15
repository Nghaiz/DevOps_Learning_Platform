import { describe, expect, it } from 'vitest';
import { NAV_ICONS, USER_MENU_ICONS } from './nav-icons';
import { PRIMARY_NAV, userMenuItems } from './nav';

/**
 * ## Cái gì nay là lỗi BIÊN DỊCH, và vì sao ô test đổi hình
 *
 * Bản trước tra icon theo `href`, tức `NAV_ICONS` là một bản sao KHOÁ của
 * `nav.ts`, và hai ô ở đây gác hai chiều của bản sao đó. Từ 2026-09-16 `icon`
 * là một field BẮT BUỘC của `PrimaryNavItem` và `NAV_ICONS` là
 * `Record<NavIconName, LucideIcon>` trên một union đóng, nên cả hai chiều đó
 * nay `tsc` bắt:
 *
 * · mục thiếu icon              -> field bắt buộc còn trống;
 * · icon trỏ tên chưa khai      -> không thuộc `NavIconName`;
 * · tên khai mà bảng chưa có    -> `Record` thiếu key.
 *
 * Viết lại ba ô đó ở đây sẽ là ba ô KHÔNG BAO GIỜ đỏ được, đúng thứ
 * `rules/green-that-proves-nothing.md` gọi tên. Nên ô còn lại ở đây chỉ gác
 * đúng chiều mà trình biên dịch KHÔNG thấy: một tên icon nằm trong bảng mà
 * không mục nav nào dùng. Bảng thành nghĩa địa, người sau tin rằng đường đó
 * vẫn còn.
 */
describe('NAV_ICONS ↔ PRIMARY_NAV', () => {
  it('đối chứng: bảng icon và bảng nav đều KHÔNG rỗng', () => {
    // Không có ô này thì ô ngay dưới xanh vì hai tập cùng rỗng, tức xanh vì mù.
    expect(Object.keys(NAV_ICONS).length).toBeGreaterThan(8);
    expect(PRIMARY_NAV.length).toBeGreaterThan(8);
  });

  it('không có tên icon thừa, tên nào cũng có ít nhất một mục dùng tới', () => {
    const used = new Set(PRIMARY_NAV.map((item) => item.icon));
    expect(
      Object.keys(NAV_ICONS).filter((name) => !used.has(name as never)),
      'Mỗi tên trên nằm trong NAV_ICONS mà không mục nav nào dùng. Xoá nó khỏi ' +
        'cả bảng lẫn union NavIconName, đừng để lại làm nghĩa địa.',
    ).toEqual([]);
  });
});

/**
 * `USER_MENU_ICONS` thì NGƯỢC LẠI: nó ở lại dạng tra theo `href` vì
 * `user-menu.tsx` đọc bằng `USER_MENU_ICONS[item.href]`. Bản sao khoá vẫn còn,
 * nên hai chiều vẫn phải gác bằng test.
 */
describe('USER_MENU_ICONS ↔ userMenuItems', () => {
  /** `admin` là vai trò thấy NHIỀU mục nhất, phủ trọn tập đường có thể hiện. */
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
