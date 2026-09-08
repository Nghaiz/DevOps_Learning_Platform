import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV, isActiveNav, normalizeRole, userMenuItems } from './nav';

/**
 * Hợp đồng C6 là thứ ba lane khác đọc để biết đường nào tồn tại. Test này khẳng
 * định lại nó TỪNG CHỮ — một lần "đổi nhãn cho gọn" sẽ đỏ ở đây chứ không âm
 * thầm làm lệch điều hướng khỏi tài liệu.
 */
describe('PRIMARY_NAV — C6 verbatim', () => {
  it('đúng bảy mục, đúng thứ tự, đúng nhãn', () => {
    expect(PRIMARY_NAV).toEqual([
      { href: '/lessons', label: 'Bài học' },
      { href: '/labs', label: 'Lab' },
      { href: '/playgrounds', label: 'Playground' },
      { href: '/paths', label: 'Lộ trình' },
      { href: '/quiz', label: 'Quiz' },
      { href: '/games', label: 'Games' },
      { href: '/me', label: 'Của tôi' },
    ]);
  });

  /**
   * `/me` phải ở CUỐI, và đây là khẳng định riêng chứ không phải một hệ quả
   * đọc ra từ ô `toEqual` bên trên. Ô đó ghim cả bảy cặp nên nó đỏ với BẤT KỲ
   * thay đổi nào; ai thêm mục thứ tám sẽ cập nhật nó bằng cách dán mục mới vào
   * chỗ nào đó rồi chạy lại cho xanh. Ô này nói ra cái luật: sáu mục đầu là kho
   * nội dung, mục cuối là chỗ của riêng người dùng.
   */
  it('mục cá nhân đứng cuối, sau mọi mục kho nội dung', () => {
    expect(PRIMARY_NAV.at(-1)).toEqual({ href: '/me', label: 'Của tôi' });
  });

  /**
   * `/games` là trụ cột ③ (P14) và nó KHÔNG được gác đăng nhập — hợp đồng
   * `phase-14-exec.md` §4.2. Phép kiểm thật nằm ở `proxy.test.ts` (nó sở hữu
   * `matchesProtected`); ở đây chỉ ghim rằng đường trong bảng nav đúng bằng
   * đường mà route dựng ra, để một lần đổi `/games` → `/game` không âm thầm cho
   * ra một mục điều hướng 404.
   */
  it('có mục /games trỏ đúng route đã dựng', () => {
    expect(PRIMARY_NAV.filter((item) => item.href === '/games')).toEqual([
      { href: '/games', label: 'Games' },
    ]);
  });

  /**
   * Chỉ kiểm phần TIẾNG VIỆT, có chủ ý.
   *
   * Nửa tiếng Anh đã có lệnh grep AC ở `phase-13-exec.md` §5 gác trên toàn
   * `apps/web/src` — viết lại nó ở đây không thêm phép kiểm nào, mà chính dòng
   * test lại phải CHỨA đúng những từ bị cấm nên nó tự làm lệnh grep AC kêu
   * (cùng hình dạng dương-tính-giả của `toast.tsx` ghi ở
   * `docs/design-system.md` §7a). Ngược lại, một nhãn về giá viết bằng tiếng
   * Việt thì lệnh grep AC KHÔNG thấy — đó mới là chỗ test này thêm giá trị.
   */
  it('không mục nào dính chuỗi thương mại tiếng Việt', () => {
    const text = PRIMARY_NAV.map((item) => `${item.href} ${item.label}`).join(' ');
    expect(text).not.toMatch(/giá|gói cước|thanh toán|nâng cấp|dùng thử/i);
  });
});

describe('userMenuItems — cổng vai trò', () => {
  it('user thường chỉ thấy Hồ sơ & cài đặt', () => {
    expect(userMenuItems('user')).toEqual([{ href: '/settings', label: 'Hồ sơ & cài đặt' }]);
  });

  it('author thấy thêm Soạn bài, KHÔNG thấy Quản trị', () => {
    const hrefs = userMenuItems('author').map((item) => item.href);
    expect(hrefs).toEqual(['/settings', '/author']);
    expect(hrefs).not.toContain('/admin');
  });

  it('admin thấy cả Soạn bài lẫn Quản trị', () => {
    expect(userMenuItems('admin').map((item) => item.href)).toEqual([
      '/settings',
      '/author',
      '/admin',
    ]);
  });

  /**
   * Đối chứng âm cho cổng vai trò: nếu ai đó "đơn giản hoá" `userMenuItems`
   * thành `return USER_MENU_NAV`, ba khẳng định trên vẫn có thể đọc như đang
   * kiểm thứ gì đó — khẳng định này thì không, nó nói thẳng "user không được
   * thấy hai đường quản trị".
   */
  it('không vai trò nào ngoài admin nhận được /admin', () => {
    for (const role of ['user', 'author'] as const) {
      expect(userMenuItems(role).some((item) => item.href === '/admin')).toBe(false);
    }
  });
});

describe('normalizeRole — fail-closed', () => {
  it('giữ nguyên ba vai trò đã biết', () => {
    expect(normalizeRole('user')).toBe('user');
    expect(normalizeRole('author')).toBe('author');
    expect(normalizeRole('admin')).toBe('admin');
  });

  it('giá trị lạ, thiếu, hay sai kiểu đều về user', () => {
    expect(normalizeRole('superadmin')).toBe('user');
    expect(normalizeRole('ADMIN')).toBe('user');
    expect(normalizeRole(undefined)).toBe('user');
    expect(normalizeRole(null)).toBe('user');
    expect(normalizeRole(1)).toBe('user');
    expect(normalizeRole({ role: 'admin' })).toBe('user');
  });
});

describe('isActiveNav', () => {
  it('khớp chính đường đó', () => {
    expect(isActiveNav('/lessons', '/lessons')).toBe(true);
  });

  it('khớp đường con — trang chi tiết vẫn làm sáng mục cha', () => {
    expect(isActiveNav('/lessons/k8s-101', '/lessons')).toBe(true);
  });

  it('KHÔNG khớp đường chỉ trùng tiền tố chuỗi', () => {
    expect(isActiveNav('/mentor', '/me')).toBe(false);
    expect(isActiveNav('/lessons-public', '/lessons')).toBe(false);
  });

  it('KHÔNG khớp đường khác hẳn', () => {
    expect(isActiveNav('/labs', '/lessons')).toBe(false);
  });
});
