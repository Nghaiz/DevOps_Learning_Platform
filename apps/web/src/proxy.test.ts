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
  // Trình dựng màn chơi của game Git (`/games/git?mode=builder`), thêm vào
  // thanh điều hướng 2026-09-16. Cùng hợp đồng với `/games`: nó là một CHẾ ĐỘ
  // của một trang chạy trong trình duyệt, và `e2e/games-builder-network.spec.ts`
  // (nằm trong `e2e:ci`) là cổng đo đúng mệnh đề "0 lời gọi backend" đó.
  //
  // ⚠ Ngày nào trình dựng bắt đầu LƯU màn chơi lên server, dòng này phải biến
  // mất và `/games/git` phải vào `PROTECTED_PATHS` — đúng chiều thứ hai mà ô
  // "miễn trừ không có mục ôi" bên dưới gác.
  '/games/git': 'trình dựng chạy trong trình duyệt, 0 lời gọi backend (e2e/games-builder-network.spec.ts)',
};

/**
 * Phần ĐƯỜNG DẪN của một `href` trong bảng nav.
 *
 * `matchesProtected` nhận một `pathname`, còn bảng nav mang cả query
 * (`/games/git?mode=builder`) vì đó là thứ thẻ `<Link>` cần. Cắt tại chỗ dùng
 * thay vì lưu thêm một field `pathname` vào `PRIMARY_NAV`: giá trị suy ra được
 * thì không lưu (`rules/code-conventions.md` § No Derived Fields).
 */
function pathnameOf(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

const PUBLIC_NAV_PATHS: ReadonlySet<string> = new Set(Object.keys(PUBLIC_NAV_REASON));

describe('PROTECTED_PATHS phủ hết điều hướng C6', () => {
  /**
   * Nguồn của danh sách kỳ vọng là chính bảng nav — không phải một bản chép
   * tay. Thêm một mục vào `PRIMARY_NAV` mà quên gác nó ở proxy sẽ đỏ ở đây,
   * kể cả khi người thêm không biết file này tồn tại.
   */
  it('mọi mục điều hướng chính đều được gác, trừ đường công khai đã khai tên', () => {
    for (const path of PRIMARY_NAV.map((nav) => pathnameOf(nav.href)).filter(
      (path) => !PUBLIC_NAV_PATHS.has(path),
    )) {
      expect(matchesProtected(path), `thiếu ${path}`).toBe(true);
    }
  });

  /**
   * Đối chứng cho ô ngay trên, và nó ghi lại một ĐIỂM MÙ có thật.
   *
   * Tới 2026-09-16 `PRIMARY_NAV` chỉ mang chín mục C6, nên vòng lặp trên chưa
   * bao giờ hỏi về `/author/problems`, `/admin/exams`, `/admin/classes` —
   * những đường mà vỏ ứng dụng KHÔNG hề thiếu (chúng nằm dưới tiền tố `/author`
   * và `/admin` đã có trong `PROTECTED_PATHS`), nhưng cũng chưa cổng nào KHẲNG
   * ĐỊNH là có. Một vòng lặp đọc một bảng không chứa thứ cần kiểm thì xanh vì
   * nó rỗng ở đúng chỗ đó, không phải vì sản phẩm đúng.
   *
   * Ô này tồn tại để lượt sau ai gỡ mấy mục đó khỏi nav (hoặc đổi tên đường)
   * phải nói ra, thay vì lặng lẽ thu hẹp phạm vi của ô trên.
   */
  it('vòng lặp trên phủ cả đường theo vai trò, không chỉ chín mục C6', () => {
    const guarded = PRIMARY_NAV.map((nav) => pathnameOf(nav.href)).filter(
      (path) => !PUBLIC_NAV_PATHS.has(path),
    );
    for (const path of ['/author', '/author/problems', '/admin', '/admin/exams', '/admin/classes']) {
      expect(guarded, `${path} không còn trong điều hướng chính`).toContain(path);
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
    const navPaths = new Set(PRIMARY_NAV.map((item) => pathnameOf(item.href)));
    for (const path of PUBLIC_NAV_PATHS) {
      expect(navPaths.has(path), `${path} không còn trong PRIMARY_NAV — xoá khỏi miễn trừ`).toBe(
        true,
      );
      expect(
        matchesProtected(path),
        `${path} nay ĐÃ được gác, nhưng miễn trừ vẫn nói "${PUBLIC_NAV_REASON[path]}" — xoá khỏi miễn trừ`,
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
