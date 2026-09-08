import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { matchesProtected, proxy } from './proxy';
import { PRIMARY_NAV, userMenuItems } from './components/shell/nav';

/**
 * Cổng đăng nhập ở `proxy.ts` (13.B / C6).
 *
 * Hai hỏng khác nhau được gác riêng, vì chúng đến từ hai hướng ngược nhau:
 *
 * 1. **Bỏ sót** — một route mới trong C6 không có trong `PROTECTED_PATHS`, hoặc
 *    trang chi tiết `/x/<id>` không được gác trong khi trang danh sách thì có
 *    (đúng lỗ mà `includes()` bản cũ để lại, xem chú thích ở `proxy.ts`).
 * 2. **Gác nhầm** — `startsWith('/me')` trần nuốt luôn `/mentor`.
 *
 * Một test chỉ kiểm hướng (1) sẽ xanh với `startsWith` trần; một test chỉ kiểm
 * hướng (2) sẽ xanh với một danh sách rỗng.
 */

// `exactOptionalPropertyTypes: true` (tsconfig.base) không cho gán `undefined`
// vào một prop khai `headers?: HeadersInit` — nên bỏ HẲN key thay vì gán rỗng.
function requestFor(pathname: string, cookie?: string): NextRequest {
  const url = `http://localhost${pathname}`;
  return cookie === undefined ? new NextRequest(url) : new NextRequest(url, { headers: { cookie } });
}

/**
 * Mục điều hướng chính CÔNG KHAI có chủ ý — miễn trừ khỏi phép kiểm ngay dưới.
 *
 * Tới P13 mọi mục trong `PRIMARY_NAV` đều nằm sau cổng đăng nhập, nên "mọi mục
 * nav đều được gác" vừa là một phép kiểm vừa là một mệnh đề đúng. P14 phá mệnh
 * đề đó: `/games` chạy HOÀN TOÀN trong trình duyệt, tiến độ ở `localStorage`,
 * 0 lời gọi backend — bắt đăng nhập là dựng một cánh cổng không gác gì
 * (`plans/devops-learning-platform/phase-14-exec.md` §4.2, và ô nghiệm thu §6).
 *
 * Nên đây là một danh sách miễn trừ CÓ TÊN, không phải một vòng lặp bị nới
 * lỏng: thêm `/games` vào `PROTECTED_PATHS` cho test xanh sẽ làm đỏ một ô AC
 * của phase, và sửa vòng lặp thành `.filter(...)` vô danh thì mục thứ tám quên
 * gác cũng lọt luôn.
 */
const PUBLIC_NAV_REASON: Readonly<Record<string, string>> = {
  // Chơi hoàn toàn trong trình duyệt; tiến độ ở `localStorage`; 0 lời gọi
  // backend. Không có tài nguyên phía server nào để một cổng đăng nhập gác —
  // nó sẽ chỉ chặn người lạ khỏi một thứ chạy trên chính máy họ. P14 §4.2.
  '/games': 'chơi trong trình duyệt, tiến độ ở localStorage — không có gì phía server để gác',
};

const PUBLIC_NAV_HREFS: ReadonlySet<string> = new Set(Object.keys(PUBLIC_NAV_REASON));

describe('PROTECTED_PATHS phủ hết điều hướng C6', () => {
  /**
   * Nguồn của danh sách kỳ vọng là chính bảng nav — không phải một bản chép
   * tay. Thêm một mục vào `PRIMARY_NAV` mà quên gác nó ở proxy sẽ đỏ ở đây,
   * kể cả khi người thêm không biết file này tồn tại.
   */
  it('mọi mục điều hướng chính đều được gác, trừ đường công khai đã khai tên', () => {
    for (const item of PRIMARY_NAV.filter((nav) => !PUBLIC_NAV_HREFS.has(nav.href))) {
      expect(matchesProtected(item.href), `thiếu ${item.href}`).toBe(true);
    }
  });

  /**
   * Đối chứng HAI CHIỀU cho danh sách miễn trừ (`pinned-baseline-test-companion`).
   * Một danh sách miễn trừ không có người canh sẽ thành nghĩa địa, và nó hỏng
   * theo hai hướng ngược nhau — mỗi hướng cần một khẳng định riêng:
   *
   *  1. **Mục ôi** — `/games` bị đổi tên hay gỡ khỏi nav, dòng miễn trừ ở lại.
   *     Lần sau ai đó thêm một route tên `/games` sẽ được miễn gác MIỄN PHÍ, và
   *     không lệnh nào kêu.
   *  2. **Miễn trừ hết đúng** — `/games` sau này CÓ gác thật (ví dụ bảng xếp
   *     hạng theo tài khoản, §8.5). Lúc đó dòng miễn trừ đang che một đường đã
   *     được gác, tức phép kiểm trên đang kiểm ít hơn nó tưởng.
   *
   * Ô này đỏ ở cả hai, và thông báo nói thẳng phải làm gì.
   */
  it('miễn trừ công khai không có mục ôi, và mỗi mục vẫn thật sự công khai', () => {
    const navHrefs = new Set(PRIMARY_NAV.map((item) => item.href));
    for (const href of PUBLIC_NAV_HREFS) {
      expect(navHrefs.has(href), `${href} không còn trong PRIMARY_NAV — xoá khỏi miễn trừ`).toBe(true);
      expect(
        matchesProtected(href),
        `${href} nay ĐÃ được gác, nhưng miễn trừ vẫn nói "${PUBLIC_NAV_REASON[href]}" — xoá khỏi miễn trừ`,
      ).toBe(false);
    }
  });

  it('mọi mục menu người dùng (kể cả của admin) đều được gác', () => {
    for (const item of userMenuItems('admin')) {
      expect(matchesProtected(item.href), `thiếu ${item.href}`).toBe(true);
    }
  });

  it('gác cả trang chi tiết, không chỉ trang danh sách', () => {
    for (const path of [
      '/lessons/k8s-101',
      '/labs/ctf-1',
      '/playgrounds/ubuntu',
      '/paths/devops-co-ban',
      '/quiz/k8s',
      '/admin/users',
      '/admin/sessions/abc',
      '/author/new',
    ]) {
      expect(matchesProtected(path), `thiếu ${path}`).toBe(true);
    }
  });

  it('KHÔNG gác đường chỉ trùng tiền tố chuỗi', () => {
    for (const path of ['/mentor', '/lessons-public', '/quizzes', '/administrators', '/authors']) {
      expect(matchesProtected(path), `gác nhầm ${path}`).toBe(false);
    }
  });

  it('KHÔNG gác trang công khai', () => {
    expect(matchesProtected('/')).toBe(false);
    expect(matchesProtected('/login')).toBe(false);
  });
});

describe('proxy — khách chưa đăng nhập', () => {
  it('mọi route được gác đều đẩy về /login', () => {
    for (const path of ['/lessons', '/quiz', '/me', '/settings', '/author', '/admin']) {
      const response = proxy(requestFor(path));
      expect(response.status, path).toBe(307);
      expect(new URL(response.headers.get('location') ?? '').pathname, path).toBe('/login');
    }
  });

  it('trang chủ và trang đăng nhập đi thẳng, không chuyển hướng', () => {
    expect(proxy(requestFor('/')).status).toBe(200);
    expect(proxy(requestFor('/login')).status).toBe(200);
  });
});

describe('proxy — người đã đăng nhập mở /login', () => {
  /**
   * Đích là `/me`, KHÔNG phải `/dashboard`. `/dashboard` nay chỉ là một 308
   * (D12), nên trỏ về đó biến mỗi lần mở nhầm `/login` thành hai lượt chuyển
   * hướng — và cái đích thật thì không đọc được từ `proxy.ts`.
   */
  it('đẩy về /me', () => {
    const response = proxy(requestFor('/login', 'better-auth.session_token=fake-token-for-test'));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/me');
  });
});
