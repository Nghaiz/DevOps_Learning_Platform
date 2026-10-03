import { describe, expect, it } from 'vitest';
import {
  NAV_SECTIONS,
  PRIMARY_NAV,
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
 * Bảng section của bản dựng lại PTIT (design-brief §3). Ghim chữ VIẾT THẲNG: so
 * `t()` với chính bản đồ copy thì ô này xanh với mọi giá trị, kể cả chuỗi rỗng.
 */
describe('bảng section', () => {
  it('đúng thứ tự, nhãn, màu và trang con', () => {
    expect(
      NAV_SECTIONS.map((section) => ({
        id: section.id,
        label: section.label,
        tone: section.tone,
        roles: section.roles,
        items: section.items.map((entry) => [entry.href, entry.label, entry.icon]),
      })),
    ).toEqual([
      {
        id: 'learn',
        label: 'Học',
        tone: 'primary',
        roles: 'everyone',
        items: [
          ['/paths', 'Lộ trình', 'paths'],
          ['/lessons', 'Bài học', 'lessons'],
          ['/quiz', 'Trắc nghiệm', 'quiz'],
        ],
      },
      {
        id: 'practice',
        label: 'Thực hành',
        tone: 'docker',
        roles: 'everyone',
        items: [
          ['/labs', 'Lab', 'labs'],
          ['/playgrounds', 'Sân chơi', 'playgrounds'],
        ],
      },
      {
        id: 'judge',
        label: 'Luyện đề',
        tone: 'iac',
        roles: 'everyone',
        items: [
          ['/problems', 'Bài tập', 'problems'],
          ['/exams', 'Kỳ thi', 'exams'],
        ],
      },
      {
        id: 'games',
        label: 'Trò chơi',
        tone: 'signal',
        roles: 'everyone',
        items: [['/games', 'Chọn game', 'games']],
      },
      {
        id: 'studio',
        label: 'Xưởng soạn',
        tone: 'cicd',
        roles: ['author', 'admin'],
        items: [
          ['/author', 'Bài học và lab', 'author'],
          ['/author/problems', 'Đề bài', 'author-problems'],
          ['/games/git?mode=builder', 'Dựng màn chơi', 'level-builder'],
        ],
      },
      {
        id: 'admin',
        label: 'Quản trị',
        tone: 'ink',
        roles: ['admin'],
        items: [
          ['/admin', 'Tổng quan', 'admin'],
          ['/admin/users', 'Người dùng', 'admin-users'],
          ['/admin/classes', 'Lớp học', 'admin-classes'],
          ['/admin/exams', 'Kỳ thi', 'admin-exams'],
          ['/admin/sessions', 'Phiên đang chạy', 'admin-sessions'],
          ['/admin/content', 'Nội dung', 'admin-content'],
          ['/admin/audit', 'Nhật ký', 'admin-audit'],
        ],
      },
    ]);
  });

  it('PRIMARY_NAV là bảng phẳng của mọi trang con, không trùng href', () => {
    const hrefs = PRIMARY_NAV.map((entry) => entry.href);
    expect(hrefs).toEqual(NAV_SECTIONS.flatMap((section) => section.items.map((entry) => entry.href)));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('mỗi trang con thuộc đúng section chứa nó và có mô tả', () => {
    for (const section of NAV_SECTIONS) {
      for (const entry of section.items) {
        expect(entry.section).toBe(section.id);
        expect(entry.description.length).toBeGreaterThan(10);
      }
    }
  });

  it('mọi mục Quản trị nằm dưới /admin, và chỉ chúng', () => {
    const admin = sectionById('admin').items.map((entry) => entry.href);
    expect(admin.every((href) => href === '/admin' || href.startsWith('/admin/'))).toBe(true);
    const outside = NAV_SECTIONS.filter((section) => section.id !== 'admin').flatMap((s) => s.items);
    expect(outside.some((entry) => entry.href.startsWith('/admin'))).toBe(false);
  });

  it('không chữ thương mại nào trong nhãn hay mô tả', () => {
    const text = PRIMARY_NAV.map((entry) => `${entry.label} ${entry.description}`).join(' ').toLowerCase();
    for (const word of ['giá', 'gói', 'nâng cấp', 'dùng thử', 'thanh toán', 'premium', 'pricing']) {
      expect(text).not.toContain(word);
    }
  });

  it('sectionById ném lỗi cho id lạ thay vì trả undefined', () => {
    expect(() => sectionById('nope' as never)).toThrow();
  });
});

describe('ai thấy section nào', () => {
  it('khách và sinh viên: bốn section học tập', () => {
    expect(sectionsFor(null).map((s) => s.id)).toEqual(['learn', 'practice', 'judge', 'games']);
    expect(sectionsFor(viewer('user')).map((s) => s.id)).toEqual(['learn', 'practice', 'judge', 'games']);
  });

  it('tác giả thêm Xưởng soạn, quản trị viên thấy cả sáu', () => {
    expect(sectionsFor(viewer('author')).map((s) => s.id)).toEqual(['learn', 'practice', 'judge', 'games', 'studio']);
    expect(sectionsFor(viewer('admin')).map((s) => s.id)).toEqual([
      'learn',
      'practice',
      'judge',
      'games',
      'studio',
      'admin',
    ]);
  });

  it('không ai ngoài admin thấy liên kết /admin', () => {
    for (const role of ['user', 'author'] as const) {
      const hrefs = sectionsFor(viewer(role)).flatMap((s) => s.items.map((entry) => entry.href));
      expect(hrefs.some((href) => href.startsWith('/admin'))).toBe(false);
      expect(userMenuItems(role).some((entry) => entry.href.startsWith('/admin'))).toBe(false);
    }
  });
});

describe('menu tài khoản', () => {
  it('theo vai trò, đúng hình dạng {href, label}', () => {
    expect(userMenuItems('user')).toEqual([
      { href: '/me', label: 'Bàn học của tôi' },
      { href: '/settings', label: 'Hồ sơ và cài đặt' },
    ]);
    expect(userMenuItems('author').map((entry) => entry.href)).toEqual(['/me', '/settings', '/author']);
    expect(userMenuItems('admin').map((entry) => entry.href)).toEqual(['/me', '/settings', '/author', '/admin']);
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

  it('mục mang query không bao giờ được tô, đường lạ trả null', () => {
    expect(activeNavItem('/games/git', PRIMARY_NAV)?.href).toBe('/games');
    expect(activeNavItem('/nowhere', PRIMARY_NAV)).toBeNull();
    expect(activeNavItem('/', PRIMARY_NAV)).toBeNull();
  });

  it('activeSection suy từ mục đang mở', () => {
    expect(activeSection('/labs/abc')).toBe('practice');
    expect(activeSection('/exams/1')).toBe('judge');
    expect(activeSection('/games/k8s')).toBe('games');
    expect(activeSection('/me')).toBeNull();
  });
});
