import { describe, expect, it } from 'vitest';
import {
  NAV_SECTIONS,
  PRIMARY_NAV,
  SECTION_HUBS,
  activeNavItem,
  activeSection,
  isActiveNav,
  normalizeRole,
  sectionById,
  sectionsFor,
  userMenuItems,
  type Viewer,
  type ViewerRole,
} from './nav';

const viewer = (role: ViewerRole): Viewer => ({ name: 'Trần Minh Khoa', email: 'khoa@stu.ptit.edu.vn', role });

/**
 * Bảng mục của bản dựng lại 2026-10. Ghim chữ VIẾT THẲNG: so `t()` với chính bản đồ
 * copy thì ô này xanh với mọi giá trị, kể cả chuỗi rỗng.
 */
describe('bảng mục', () => {
  it('đúng thứ tự, nhãn, trang tổng quan, biểu tượng và trang con', () => {
    expect(
      NAV_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        hub: section.hub,
        icon: section.icon,
        roles: section.roles,
        items: section.items.map((entry) => [entry.href, entry.label, entry.icon]),
      })),
    ).toEqual([
      {
        id: 'learn',
        label: 'Học',
        hub: '/learn',
        icon: 'book',
        roles: 'everyone',
        items: [
          ['/paths', 'Lộ trình', 'stairs'],
          ['/lessons', 'Bài học', 'book'],
          ['/quiz', 'Trắc nghiệm', 'quiz'],
        ],
      },
      {
        id: 'practice',
        label: 'Thực hành',
        hub: '/practice',
        icon: 'flask',
        roles: 'everyone',
        items: [
          ['/labs', 'Lab', 'flask'],
          ['/playgrounds', 'Sân chơi', 'sandbox'],
        ],
      },
      {
        id: 'judge',
        label: 'Luyện đề',
        hub: '/judge',
        icon: 'problem',
        roles: 'everyone',
        items: [
          ['/problems', 'Bài tập', 'problem'],
          ['/exams', 'Kỳ thi', 'timer'],
        ],
      },
      {
        id: 'games',
        label: 'Trò chơi',
        hub: '/games',
        icon: 'gamepad',
        roles: 'everyone',
        items: [
          ['/games/k8s', 'Kubernetes', 'kube'],
          ['/games/git', 'Git', 'branch'],
          ['/games/cicd', 'CI/CD', 'pipeline'],
        ],
      },
      {
        id: 'studio',
        label: 'Soạn bài',
        hub: '/studio',
        icon: 'pen',
        roles: ['author', 'admin'],
        items: [
          ['/author', 'Bài học và lab', 'file-text'],
          ['/author/problems', 'Đề bài', 'problem'],
          ['/games/git?mode=builder', 'Dựng màn Git', 'branch'],
        ],
      },
      {
        id: 'admin',
        label: 'Quản trị',
        hub: '/admin',
        icon: 'panel',
        roles: ['admin'],
        items: [
          ['/admin/users', 'Tài khoản', 'users'],
          ['/admin/classes', 'Lớp học', 'classroom'],
          ['/admin/exams', 'Kỳ thi', 'timer'],
          ['/admin/sessions', 'Máy đang chạy', 'server'],
          ['/admin/content', 'Nội dung', 'layers'],
          ['/admin/audit', 'Nhật ký', 'history'],
        ],
      },
    ]);
  });

  it('PRIMARY_NAV là bảng phẳng của mọi trang con, không trùng href', () => {
    const hrefs = PRIMARY_NAV.map((entry) => entry.href);
    expect(hrefs).toEqual(NAV_SECTIONS.flatMap((section) => section.items.map((entry) => entry.href)));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('mỗi mục có đúng một trang tổng quan, không trùng với trang con nào', () => {
    expect(SECTION_HUBS.map((hub) => hub.href)).toEqual(NAV_SECTIONS.map((section) => section.hub));
    const children = new Set(PRIMARY_NAV.map((entry) => entry.href));
    for (const hub of SECTION_HUBS) {
      expect(children.has(hub.href)).toBe(false);
    }
  });

  it('mỗi trang con thuộc đúng mục chứa nó và có mô tả', () => {
    for (const section of NAV_SECTIONS) {
      expect(section.lead.length).toBeGreaterThan(20);
      for (const entry of section.items) {
        expect(entry.section).toBe(section.id);
        expect(entry.description.length).toBeGreaterThan(10);
      }
    }
  });

  it('mọi mục Quản trị nằm dưới /admin, và chỉ chúng', () => {
    const admin = sectionById('admin').items.map((entry) => entry.href);
    expect(admin.every((href) => href.startsWith('/admin/'))).toBe(true);
    const outside = NAV_SECTIONS.filter((section) => section.id !== 'admin').flatMap((s) => s.items);
    expect(outside.some((entry) => entry.href.startsWith('/admin'))).toBe(false);
  });

  it('không chữ thương mại nào trong nhãn hay mô tả', () => {
    const text = [...PRIMARY_NAV.map((entry) => `${entry.label} ${entry.description}`), ...NAV_SECTIONS.map((s) => s.lead)]
      .join(' ')
      .toLowerCase();
    for (const word of ['giá', 'gói', 'nâng cấp', 'dùng thử', 'thanh toán', 'premium', 'pricing']) {
      expect(text).not.toContain(word);
    }
  });

  it('sectionById ném lỗi cho id lạ thay vì trả undefined', () => {
    expect(() => sectionById('nope' as never)).toThrow();
  });
});

describe('ai thấy mục nào', () => {
  it('khách và sinh viên: bốn mục học tập', () => {
    expect(sectionsFor(null).map((s) => s.id)).toEqual(['learn', 'practice', 'judge', 'games']);
    expect(sectionsFor(viewer('user')).map((s) => s.id)).toEqual(['learn', 'practice', 'judge', 'games']);
  });

  it('tác giả thêm Soạn bài, quản trị viên thấy cả sáu', () => {
    expect(sectionsFor(viewer('author')).map((s) => s.id)).toEqual(['learn', 'practice', 'judge', 'games', 'studio']);
    expect(sectionsFor(viewer('admin')).map((s) => s.id)).toEqual(['learn', 'practice', 'judge', 'games', 'studio', 'admin']);
  });

  it('không ai ngoài admin thấy liên kết /admin', () => {
    for (const role of ['user', 'author'] as const) {
      const hrefs = sectionsFor(viewer(role)).flatMap((s) => [s.hub, ...s.items.map((entry) => entry.href)]);
      expect(hrefs.some((href) => href.startsWith('/admin'))).toBe(false);
      expect(userMenuItems(role).some((entry) => entry.href.startsWith('/admin'))).toBe(false);
    }
  });
});

describe('menu tài khoản', () => {
  it('giống nhau ở mọi vai trò: trang của tôi và cài đặt', () => {
    expect(userMenuItems('user')).toEqual([
      { href: '/me', label: 'Trang của tôi', icon: 'user' },
      { href: '/settings', label: 'Cài đặt', icon: 'sliders' },
    ]);
    // Soạn bài và Quản trị là MỤC CHA trên thanh trên, không lặp lại trong menu tài khoản.
    expect(userMenuItems('admin').map((entry) => entry.href)).toEqual(['/me', '/settings']);
  });
});

describe('normalizeRole', () => {
  it('fail-closed, phân biệt hoa thường', () => {
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('author')).toBe('author');
    expect(normalizeRole('ADMIN')).toBe('user');
    expect(normalizeRole(undefined)).toBe('user');
    expect(normalizeRole(42)).toBe('user');
  });
});

describe('mục đang mở', () => {
  it('khớp đúng đường hoặc đường con, không nuốt tiền tố giả', () => {
    expect(isActiveNav('/lessons/k8s-101', '/lessons')).toBe(true);
    expect(isActiveNav('/lessons-public', '/lessons')).toBe(false);
  });

  it('khớp dài nhất thắng', () => {
    expect(activeNavItem('/author/problems/new', PRIMARY_NAV)?.href).toBe('/author/problems');
    expect(activeNavItem('/author/new', PRIMARY_NAV)?.href).toBe('/author');
    expect(activeNavItem('/admin/exams/abc', PRIMARY_NAV)?.href).toBe('/admin/exams');
  });

  it('mục mang query chỉ được tô khi query trùng, đường lạ trả null', () => {
    expect(activeNavItem('/games/git', PRIMARY_NAV)?.href).toBe('/games/git');
    expect(activeNavItem('/games/git', PRIMARY_NAV, 'mode=builder')?.href).toBe('/games/git?mode=builder');
    expect(activeNavItem('/nowhere', PRIMARY_NAV)).toBeNull();
    expect(activeNavItem('/', PRIMARY_NAV)).toBeNull();
  });

  it('activeSection suy từ trang con hoặc chính trang tổng quan', () => {
    expect(activeSection('/labs/abc')).toBe('practice');
    expect(activeSection('/exams/1')).toBe('judge');
    expect(activeSection('/games/k8s')).toBe('games');
    expect(activeSection('/learn')).toBe('learn');
    expect(activeSection('/studio')).toBe('studio');
    expect(activeSection('/games/git', 'mode=builder')).toBe('studio');
    expect(activeSection('/me')).toBeNull();
  });
});
