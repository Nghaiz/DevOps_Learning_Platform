import { describe, expect, it } from 'vitest';
import {
  PRIMARY_NAV,
  activeNavItem,
  isActiveNav,
  navSectionsFor,
  normalizeRole,
  userMenuItems,
  type Viewer,
  type ViewerRole,
} from './nav';

/** Người xem giả, đủ hình dạng `Viewer` và không hơn. */
function viewerWith(role: ViewerRole): Viewer {
  return { name: 'Nguyen Van A', email: 'a@example.test', role };
}

/**
 * Hợp đồng C6 là thứ ba lane khác đọc để biết đường nào tồn tại. Test này khẳng
 * định lại nó TỪNG CHỮ, một lần "đổi nhãn cho gọn" sẽ đỏ ở đây chứ không âm
 * thầm làm lệch điều hướng khỏi tài liệu.
 *
 * Chuỗi viết THẲNG, không phải `t('shell.nav.lessons')`: so bản đồ với chính nó
 * thì ô này xanh với mọi giá trị, kể cả chuỗi rỗng, kể cả một chuỗi mất dấu.
 * (Cùng lý lẽ đã ghi ở `copy-gate.test.ts`, nơi giải thích vì sao file test bị
 * loại khỏi phạm vi quét T4.)
 */
describe('PRIMARY_NAV', () => {
  /**
   * Chín `href` của C6, viết thẳng. Lọc theo danh sách NÀY chứ không theo phép
   * loại trừ nhóm (`group !== 'studio' && group !== 'manage'`): một nhóm thứ
   * sáu ra đời sau sẽ lọt qua phép loại trừ đó và âm thầm được tính là C6.
   */
  const C6_HREFS: readonly string[] = [
    '/lessons',
    '/labs',
    '/playgrounds',
    '/paths',
    '/quiz',
    '/games',
    '/problems',
    '/exams',
    '/me',
  ];

  it('chín mục C6: đúng thứ tự, đúng nhãn', () => {
    const c6 = PRIMARY_NAV.filter((item) => C6_HREFS.includes(item.href)).map(
      ({ href, label }) => ({ href, label }),
    );
    expect(c6).toEqual([
      { href: '/lessons', label: 'Bài học' },
      { href: '/labs', label: 'Lab' },
      { href: '/playgrounds', label: 'Playground' },
      { href: '/paths', label: 'Lộ trình' },
      { href: '/quiz', label: 'Quiz' },
      { href: '/games', label: 'Games' },
      { href: '/problems', label: 'Bài tập' },
      { href: '/exams', label: 'Kỳ thi' },
      { href: '/me', label: 'Của tôi' },
    ]);
  });

  /**
   * Và sáu mục theo vai trò, cũng viết thẳng. Không có ô này thì một mục thứ
   * mười sáu thêm vào giữa sẽ không làm gì đỏ: ô C6 bên trên lọc theo danh sách
   * cố định nên nó mù với mọi thứ ngoài chín `href` đó.
   */
  it('toàn bộ bảng: đúng thứ tự, đúng nhãn, không mục lạ', () => {
    expect(PRIMARY_NAV.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: '/lessons', label: 'Bài học' },
      { href: '/labs', label: 'Lab' },
      { href: '/playgrounds', label: 'Playground' },
      { href: '/paths', label: 'Lộ trình' },
      { href: '/quiz', label: 'Quiz' },
      { href: '/games', label: 'Games' },
      { href: '/problems', label: 'Bài tập' },
      { href: '/exams', label: 'Kỳ thi' },
      { href: '/author', label: 'Soạn bài' },
      { href: '/author/problems', label: 'Soạn bài tập' },
      { href: '/games/git?mode=builder', label: 'Dựng màn chơi' },
      { href: '/admin/exams', label: 'Tổ chức kỳ thi' },
      { href: '/admin/classes', label: 'Lớp học' },
      { href: '/admin', label: 'Quản trị' },
      { href: '/me', label: 'Của tôi' },
    ]);
  });

  /**
   * Nhóm, vai trò và icon là DỮ LIỆU của bảng này, không phải thứ vỏ ứng dụng
   * tự nghĩ ra. Ghim chúng ở đây là thứ giữ cho `app-shell.tsx` không dựng lại
   * ba mảng cứng thêm lần nữa: sửa nhóm của một mục phải đi qua ô này.
   */
  it('mỗi mục khai đủ nhóm, vai trò và icon', () => {
    expect(PRIMARY_NAV.map(({ href, group, roles, icon }) => ({ href, group, roles, icon })))
      .toEqual([
        { href: '/lessons', group: 'library', roles: 'everyone', icon: 'lessons' },
        { href: '/labs', group: 'library', roles: 'everyone', icon: 'labs' },
        { href: '/playgrounds', group: 'library', roles: 'everyone', icon: 'playgrounds' },
        { href: '/paths', group: 'library', roles: 'everyone', icon: 'paths' },
        { href: '/quiz', group: 'library', roles: 'everyone', icon: 'quiz' },
        { href: '/games', group: 'learn', roles: 'everyone', icon: 'games' },
        { href: '/problems', group: 'learn', roles: 'everyone', icon: 'problems' },
        { href: '/exams', group: 'learn', roles: 'everyone', icon: 'exams' },
        { href: '/author', group: 'studio', roles: ['author', 'admin'], icon: 'author' },
        {
          href: '/author/problems',
          group: 'studio',
          roles: ['author', 'admin'],
          icon: 'author-problems',
        },
        {
          href: '/games/git?mode=builder',
          group: 'studio',
          roles: ['author', 'admin'],
          icon: 'level-builder',
        },
        { href: '/admin/exams', group: 'manage', roles: ['admin'], icon: 'admin-exams' },
        { href: '/admin/classes', group: 'manage', roles: ['admin'], icon: 'admin-classes' },
        { href: '/admin', group: 'manage', roles: ['admin'], icon: 'admin' },
        { href: '/me', group: 'account', roles: 'signed-in', icon: 'me' },
      ]);
  });

  /**
   * `/me` phải ở CUỐI, và đây là khẳng định riêng chứ không phải một hệ quả
   * đọc ra từ ô `toEqual` bên trên. Ô đó ghim cả bảng nên nó đỏ với BẤT KỲ
   * thay đổi nào; ai thêm mục mới sẽ cập nhật nó bằng cách dán mục đó vào chỗ
   * nào đó rồi chạy lại cho xanh. Ô này nói ra cái luật: mục cá nhân đứng sau
   * mọi mục kho nội dung và mọi mục theo vai trò.
   */
  it('mục cá nhân đứng cuối', () => {
    expect(PRIMARY_NAV.at(-1)?.href).toBe('/me');
    expect(PRIMARY_NAV.at(-1)?.group).toBe('account');
  });

  /**
   * `/games` là trụ cột ③ (P14) và nó KHÔNG được gác đăng nhập, hợp đồng
   * `phase-14-exec.md` §4.2. Phép kiểm thật nằm ở `proxy.test.ts` (nó sở hữu
   * `matchesProtected`); ở đây chỉ ghim rằng đường trong bảng nav đúng bằng
   * đường mà route dựng ra, để một lần đổi `/games` thành `/game` không âm thầm
   * cho ra một mục điều hướng 404.
   */
  it('có mục /games trỏ đúng route đã dựng', () => {
    expect(PRIMARY_NAV.filter((item) => item.href === '/games')).toHaveLength(1);
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

/**
 * Nhóm hiển thị theo vai trò. Đây là thứ `app-shell.tsx` render, nên nó phải
 * được gác ở đây chứ không chỉ nằm trong một component không ai dựng lên trong
 * test.
 */
describe('navSectionsFor', () => {
  function groupsFor(viewer: Viewer | null): readonly string[] {
    return navSectionsFor(viewer).map((section) => section.group);
  }

  it('khách chưa đăng nhập chỉ thấy kho nội dung, không thấy mục cá nhân', () => {
    expect(groupsFor(null)).toEqual(['learn', 'library']);
  });

  it('user thường thấy thêm nhóm tài khoản, KHÔNG thấy studio hay quản lý', () => {
    expect(groupsFor(viewerWith('user'))).toEqual(['learn', 'library', 'account']);
  });

  it('author thấy studio, KHÔNG thấy quản lý', () => {
    expect(groupsFor(viewerWith('author'))).toEqual(['learn', 'library', 'studio', 'account']);
  });

  it('admin thấy cả bốn nhóm', () => {
    expect(groupsFor(viewerWith('admin'))).toEqual([
      'learn',
      'library',
      'studio',
      'manage',
      'account',
    ]);
  });

  /**
   * Đối chứng âm cho cổng vai trò. Ba ô trên đếm NHÓM, nên một lượt "đơn giản
   * hoá" `visibleTo` thành `return true` vẫn có thể đọc như đang kiểm thứ gì đó
   * miễn tên nhóm còn khớp. Ô này nói thẳng: hai đường quản trị không được rơi
   * vào tay ai ngoài admin.
   */
  it('không vai trò nào ngoài admin nhận được đường /admin trong thanh điều hướng', () => {
    for (const viewer of [null, viewerWith('user'), viewerWith('author')]) {
      const hrefs = navSectionsFor(viewer).flatMap((section) =>
        section.items.map((item) => item.href),
      );
      expect(hrefs.some((href) => href.startsWith('/admin'))).toBe(false);
    }
  });

  it('thứ tự mục TRONG một nhóm giữ nguyên thứ tự của PRIMARY_NAV', () => {
    const library = navSectionsFor(null).find((section) => section.group === 'library');
    expect(library?.items.map((item) => item.href)).toEqual([
      '/lessons',
      '/labs',
      '/playgrounds',
      '/paths',
      '/quiz',
    ]);
  });

  it('mỗi nhóm hiện ra đều có nhãn và không nhóm nào rỗng', () => {
    for (const section of navSectionsFor(viewerWith('admin'))) {
      expect(section.label, section.group).not.toBe('');
      expect(section.items.length, section.group).toBeGreaterThan(0);
    }
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

  /** Hình dạng trả về là cặp (href, label) trần: `user-menu.tsx` đọc đúng nó. */
  it('trả về đúng hai field, không rò field của điều hướng chính', () => {
    for (const item of userMenuItems('admin')) {
      expect(Object.keys(item).sort()).toEqual(['href', 'label']);
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

/**
 * `activeNavItem` là thứ thay cho ba nhánh đặc cách mà vỏ ứng dụng từng viết
 * tay (`/games` khớp cả `/`, `/author` và `/admin` phải khớp CHÍNH XÁC). Mỗi
 * nhánh đó là một luật không ai gác; ở đây chúng là hành vi có ô test.
 */
describe('activeNavItem', () => {
  it('trang chi tiết làm sáng mục cha', () => {
    expect(activeNavItem('/lessons/k8s-101', PRIMARY_NAV)?.href).toBe('/lessons');
  });

  /**
   * Khớp DÀI NHẤT thắng. Không có luật này thì `/author/problems` làm sáng cả
   * "Soạn bài" lẫn "Soạn bài tập", và cách chữa cũ (ép `/author` khớp chính
   * xác) lại làm `/author/new` mất mục sáng, ô ngay dưới.
   */
  it('mục cụ thể hơn thắng mục cha', () => {
    expect(activeNavItem('/author/problems', PRIMARY_NAV)?.href).toBe('/author/problems');
    expect(activeNavItem('/admin/exams', PRIMARY_NAV)?.href).toBe('/admin/exams');
  });

  it('đường con không có mục riêng thì rơi về mục cha', () => {
    expect(activeNavItem('/author/new', PRIMARY_NAV)?.href).toBe('/author');
    expect(activeNavItem('/admin/users', PRIMARY_NAV)?.href).toBe('/admin');
  });

  /** `app/page.tsx` render `GamesHub`, nên trang chủ CHÍNH LÀ màn chọn game. */
  it('trang chủ làm sáng mục Games', () => {
    expect(activeNavItem('/', PRIMARY_NAV)?.href).toBe('/games');
  });

  /**
   * Mục mang query là một CHẾ ĐỘ, không phải một địa chỉ. Không có luật bỏ qua
   * này thì `/games/git` (chơi bình thường) sẽ làm sáng "Dựng màn chơi", vì
   * `/games/git?mode=builder` dài hơn `/games`.
   */
  it('mục mang query không bao giờ sáng, và không cướp mục của trang gốc', () => {
    expect(activeNavItem('/games/git', PRIMARY_NAV)?.href).toBe('/games');
    const anyBuilder = ['/games/git', '/games', '/games/git/1'].map(
      (path) => activeNavItem(path, PRIMARY_NAV)?.href,
    );
    expect(anyBuilder).not.toContain('/games/git?mode=builder');
  });

  it('đường không có mục nào trả về null, không đoán bừa một mục', () => {
    expect(activeNavItem('/settings', PRIMARY_NAV)).toBeNull();
    expect(activeNavItem('/login', PRIMARY_NAV)).toBeNull();
  });
});
