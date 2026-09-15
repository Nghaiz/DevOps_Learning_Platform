/**
 * Điều hướng — hợp đồng **C6** (`plans/devops-learning-platform/phase-13-exec.md` §2).
 *
 * Dữ liệu THUẦN: không JSX, không import React, không import gì từ `server/**`.
 * `@devops-platform/copy` KHÔNG phá điều kiện đó: gói này khai zero runtime
 * dependency như một hợp đồng (xem khối `//dependencies` trong package.json của
 * nó), và `t()` là một phép tra bảng thuần. Đó là điều kiện để CẢ HAI phía dùng chung một nguồn — `app/layout.tsx`
 * (Server Component, gọi `normalizeRole`) và `app-shell.tsx` (Client Component,
 * đọc bảng nav) — mà không kéo Better Auth/DB vào bundle trình duyệt.
 *
 * ⛔ **Điều kiện "không import React" là thứ quyết định hình dạng của `icon`.**
 * `app/layout.tsx` (Server Component) import `normalizeRole` từ chính file này.
 * Gắn thẳng một component của `lucide-react` vào mỗi mục sẽ kéo cả thư viện
 * icon vào đường đi của server chỉ để hỏi "vai trò này thấy mục nào". Nên
 * `icon` ở đây là một TÊN (`NavIconName`), còn `nav-icons.ts` — module chỉ
 * phía client đọc — ánh xạ tên đó sang component.
 */

import { t } from '@devops-platform/copy';

export type ViewerRole = 'user' | 'author' | 'admin';

/** Người dùng đang đăng nhập, đã rút gọn về đúng thứ vỏ ứng dụng cần. */
export interface Viewer {
  readonly name: string;
  readonly email: string;
  readonly role: ViewerRole;
}

/**
 * Cặp (đường, nhãn) — hình dạng TỐI THIỂU mà mọi nơi hiện một liên kết đều cần.
 *
 * `userMenuItems()` trả đúng hình dạng này (`user-menu.tsx` đọc nó), còn điều
 * hướng chính trả `PrimaryNavItem` giàu hơn. Tách hai kiểu thay vì nhét mọi
 * field vào một: menu tài khoản không có nhóm và không có icon-theo-tên (nó tra
 * icon theo `href`, xem `nav-icons.ts`), nên một kiểu chung sẽ bắt nó khai hai
 * field vô nghĩa.
 */
export interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Thứ tự HIỂN THỊ của các nhóm, và cũng là nguồn khai sinh của `NavGroup`.
 *
 * Suy kiểu TỪ mảng thứ tự chứ không khai union rồi viết thêm một mảng thứ tự
 * bên cạnh: hai bản sẽ trôi khỏi nhau, và hỏng IM LẶNG — một nhóm thiếu trong
 * mảng thứ tự thì cả nhóm đó biến mất khỏi thanh điều hướng mà không lệnh nào
 * kêu. Ở dạng này, một nhóm không có thứ tự là điều không nói ra được.
 */
const GROUP_ORDER = ['learn', 'library', 'studio', 'manage', 'account'] as const;

export type NavGroup = (typeof GROUP_ORDER)[number];

/**
 * Tên icon. Là TÊN, không phải component — xem khối đầu file.
 *
 * `nav-icons.ts` khai `Record<NavIconName, LucideIcon>`, nên thiếu một icon là
 * lỗi BIÊN DỊCH chứ không còn là một ô test đỏ. Chiều còn lại (một tên ở đây
 * mà không mục nào dùng) thì trình biên dịch không thấy, và đó là việc của
 * `nav-icons.test.ts`.
 */
export type NavIconName =
  | 'lessons'
  | 'labs'
  | 'playgrounds'
  | 'paths'
  | 'quiz'
  | 'games'
  | 'problems'
  | 'exams'
  | 'me'
  | 'author'
  | 'author-problems'
  | 'level-builder'
  | 'admin-exams'
  | 'admin-classes'
  | 'admin';

/**
 * Ai THẤY mục này.
 *
 * ⚠ **Đây là trang trí, KHÔNG phải phân quyền** — cùng một câu cảnh báo với
 * `userMenuItems` bên dưới, và cùng một lý do: giấu một liên kết chỉ làm nó
 * không hiện ra. Cổng thật là `PROTECTED_PATHS` ở `proxy.ts` (cổng đăng nhập)
 * cộng `layout.tsx` phía server của từng nhánh (cổng vai trò).
 *
 * · `'everyone'`  — hiện cả với khách chưa đăng nhập. Mục vẫn có thể được gác
 *   ở proxy; khách bấm vào thì bị đẩy sang `/login`, và đó là hành vi mong
 *   muốn (thấy được kho nội dung trước khi đăng nhập).
 * · `'signed-in'` — mọi vai trò đã đăng nhập.
 * · danh sách vai trò — đúng những vai trò đó.
 */
export type NavAudience = 'everyone' | 'signed-in' | readonly ViewerRole[];

export interface PrimaryNavItem extends NavItem {
  readonly group: NavGroup;
  readonly icon: NavIconName;
  readonly roles: NavAudience;
}

/**
 * Điều hướng chính — **nhãn của chín mục C6 khớp hợp đồng từng chữ**.
 *
 * ## Thứ tự ở đây là thứ tự C6, KHÔNG phải thứ tự trên màn hình
 *
 * Chín mục C6 giữ nguyên thứ tự hợp đồng (`/lessons` … `/me`). Thứ tự hiển thị
 * do `group` cộng `GROUP_ORDER` quyết định, và hai thứ đó độc lập nhau có chủ
 * ý: đổi cách xếp nhóm trên màn hình không được phép làm lệch hợp đồng, và
 * ngược lại. `nav.test.ts` ghim CẢ HAI.
 *
 * Sáu mục sau `/exams` là nhóm STUDIO và QUẢN LÝ, thêm 2026-09-16 khi vỏ ứng
 * dụng được nối lại về bảng này. Chúng KHÔNG thuộc C6 — hợp đồng C6 nói về chín
 * mục kia — nên ô test ghim C6 lọc chúng ra bằng chính danh sách chín `href`
 * viết thẳng, không bằng một phép loại trừ theo nhóm (một nhóm thứ sáu ra đời
 * sau sẽ lọt qua phép loại trừ đó mà không ai thấy).
 *
 * `/me` ở CUỐI mảng và ở nhóm cuối: sáu mục đầu là kho nội dung, mục cá nhân là
 * chỗ của riêng người dùng.
 *
 * ⚠ Nhãn đến từ `packages/copy` (`shell.nav.*`). Bảng này là SSOT của THỨ TỰ,
 * của cặp (href, khoá), của NHÓM, VAI TRÒ và ICON; chữ hiển thị là SSOT của bản
 * đồ copy. Ô `nav.test.ts` cố ý ghim chữ VIẾT THẲNG chứ không ghim
 * `t('shell.nav.lessons')`: so bản đồ với chính nó thì ô đó xanh với mọi giá
 * trị, kể cả chuỗi rỗng.
 *
 * ⚠ Thêm một mục ở đây là sửa BA file cùng lúc: `packages/copy/src/surfaces/
 * shell.ts` (khoá và chữ), `nav.ts` (`icon` là field bắt buộc nên thiếu icon là
 * lỗi biên dịch) và `nav.test.ts` (`toEqual` ghim từng chữ). Đó là thiết kế.
 *
 * ⛔ Thêm mục ở đây KHÔNG tự động gác đăng nhập cho đường đó. Cổng là
 * `PROTECTED_PATHS` trong `proxy.ts`, và `/games` cùng `/games/git` cố ý KHÔNG
 * có trong đó: game chạy hoàn toàn ở trình duyệt, tiến độ ở `localStorage`.
 * `proxy.test.ts` đọc THẲNG bảng này nên một mục mới quên gác sẽ đỏ ở đó.
 *
 * ⚠ `/games/git?mode=builder` mang QUERY. Nó là một CHẾ ĐỘ của một trang, không
 * phải một địa chỉ riêng, nên nó không bao giờ được đánh dấu "đang mở" (xem
 * `activeNavItem`), và `proxy.test.ts` cắt phần query trước khi hỏi cổng.
 */
export const PRIMARY_NAV: readonly PrimaryNavItem[] = [
  {
    href: '/lessons',
    label: t('shell.nav.lessons'),
    group: 'library',
    icon: 'lessons',
    roles: 'everyone',
  },
  { href: '/labs', label: t('shell.nav.labs'), group: 'library', icon: 'labs', roles: 'everyone' },
  {
    href: '/playgrounds',
    label: t('shell.nav.playgrounds'),
    group: 'library',
    icon: 'playgrounds',
    roles: 'everyone',
  },
  {
    href: '/paths',
    label: t('shell.nav.paths'),
    group: 'library',
    icon: 'paths',
    roles: 'everyone',
  },
  { href: '/quiz', label: t('shell.nav.quiz'), group: 'library', icon: 'quiz', roles: 'everyone' },
  { href: '/games', label: t('shell.nav.games'), group: 'learn', icon: 'games', roles: 'everyone' },
  /*
   * `/problems` và `/exams` thêm 2026-09-15 (§18.G), ĐÃ hỏi và được chủ dự án
   * duyệt đúng như dòng cảnh báo ở trên yêu cầu.
   *
   * `/problems` không phải một mục mới của 18.G: đo bằng grep toàn repo ngày
   * 2026-09-15, trang danh mục bài tập KHÔNG có link vào từ bất kỳ đâu và chỉ
   * tới được bằng cách gõ URL. Nó là trụ của cả hệ OJ, nên "chưa ai tới được"
   * là một lỗi đứng im từ P16 chứ không phải một lựa chọn.
   *
   * `/exams` phải có mặt vì một kỳ thi có GIỜ: một màn chỉ tới được bằng gõ URL
   * là một màn sinh viên không tìm ra kịp.
   */
  {
    href: '/problems',
    label: t('shell.nav.problems'),
    group: 'learn',
    icon: 'problems',
    roles: 'everyone',
  },
  { href: '/exams', label: t('shell.nav.exams'), group: 'learn', icon: 'exams', roles: 'everyone' },

  /*
   * ── STUDIO ───────────────────────────────────────────────────────────────
   *
   * Nhãn của `/author` dùng LẠI `shell.account.menu.author` thay vì một khoá
   * mới mang đúng chữ đó. Cùng lý lẽ với `shell.theme.label` (xem `shell.ts`):
   * hai khoá mang cùng một câu là hai chỗ để trôi khỏi nhau, và ở đây chúng trỏ
   * đúng cùng một đích.
   */
  {
    href: '/author',
    label: t('shell.account.menu.author'),
    group: 'studio',
    icon: 'author',
    roles: ['author', 'admin'],
  },
  {
    href: '/author/problems',
    label: t('shell.nav.author-problems'),
    group: 'studio',
    icon: 'author-problems',
    roles: ['author', 'admin'],
  },
  {
    href: '/games/git?mode=builder',
    label: t('shell.nav.level-builder'),
    group: 'studio',
    icon: 'level-builder',
    roles: ['author', 'admin'],
  },

  // ── QUẢN LÝ ──────────────────────────────────────────────────────────────
  {
    href: '/admin/exams',
    label: t('shell.nav.admin-exams'),
    group: 'manage',
    icon: 'admin-exams',
    roles: ['admin'],
  },
  {
    href: '/admin/classes',
    label: t('shell.nav.admin-classes'),
    group: 'manage',
    icon: 'admin-classes',
    roles: ['admin'],
  },
  {
    href: '/admin',
    label: t('shell.account.menu.admin'),
    group: 'manage',
    icon: 'admin',
    roles: ['admin'],
  },

  { href: '/me', label: t('shell.nav.me'), group: 'account', icon: 'me', roles: 'signed-in' },
];

/**
 * Nhãn tiêu đề của từng nhóm.
 *
 * `Record<NavGroup, string>` chứ không phải một bản đồ lỏng: thêm một nhóm vào
 * `GROUP_ORDER` mà quên nhãn là lỗi biên dịch, không phải một tiêu đề `undefined`
 * nằm trên thanh điều hướng.
 *
 * Nhóm `account` dùng LẠI `shell.account.group` ('Tài khoản') — khoá đó tồn tại
 * đúng để làm nhãn nhóm tài khoản, và đây là nhóm tài khoản.
 */
const GROUP_LABEL: Readonly<Record<NavGroup, string>> = {
  learn: t('shell.nav.group.learn'),
  library: t('shell.nav.group.library'),
  studio: t('shell.nav.group.studio'),
  manage: t('shell.nav.group.manage'),
  account: t('shell.account.group'),
};

export interface NavSection {
  readonly group: NavGroup;
  readonly label: string;
  readonly items: readonly PrimaryNavItem[];
}

/**
 * Phép kiểm tầm nhìn DUY NHẤT, dùng chung cho điều hướng chính và menu tài khoản.
 *
 * Một hàm chứ hai: hai bản sẽ trả lời khác nhau cho cùng một câu hỏi ngay lần
 * đầu ai đó thêm một vai trò, và chênh lệch đó không hiện ra ở đâu cả.
 */
function visibleTo(roles: NavAudience, role: ViewerRole | null): boolean {
  if (roles === 'everyone') {
    return true;
  }
  if (role === null) {
    return false;
  }
  return roles === 'signed-in' || roles.includes(role);
}

/**
 * Thanh điều hướng đã chia nhóm, cho đúng người xem này.
 *
 * Nhóm rỗng bị loại HẲN: một tiêu đề "STUDIO" đứng trên khoảng trống nói với
 * người học rằng có thứ gì đó họ không được phép thấy — thông tin không ai cần
 * và không ai hỏi.
 */
export function navSectionsFor(viewer: Viewer | null): readonly NavSection[] {
  const role = viewer?.role ?? null;
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABEL[group],
    items: PRIMARY_NAV.filter((item) => item.group === group && visibleTo(item.roles, role)),
  })).filter((section) => section.items.length > 0);
}

interface RoleGatedItem extends NavItem {
  readonly roles: NavAudience;
}

const USER_MENU_NAV: readonly RoleGatedItem[] = [
  { href: '/settings', label: t('shell.account.menu.settings'), roles: 'signed-in' },
  { href: '/author', label: t('shell.account.menu.author'), roles: ['author', 'admin'] },
  { href: '/admin', label: t('shell.account.menu.admin'), roles: ['admin'] },
];

/**
 * Mục menu người dùng thấy được với vai trò `role`.
 *
 * ⚠ **Đây là trang trí, KHÔNG phải phân quyền.** Giấu một liên kết chỉ làm nó
 * không hiện ra; gõ thẳng `/admin` vào thanh địa chỉ vẫn tới nơi. Cổng thật là
 * `layout.tsx` phía server của chính route đó (`getSession` + role →
 * `redirect('/me')`) — hợp đồng C6 ghi rõ, và `proxy.ts` cố ý KHÔNG gác vai trò
 * (nó chỉ kiểm sự tồn tại của cookie, không đụng DB, xem chú thích ở đó).
 */
export function userMenuItems(role: ViewerRole): readonly NavItem[] {
  return USER_MENU_NAV.filter((item) => visibleTo(item.roles, role)).map(({ href, label }) => ({
    href,
    label,
  }));
}

const KNOWN_ROLES: readonly ViewerRole[] = ['user', 'author', 'admin'];

/**
 * Vai trò lấy từ session server, fail-closed: giá trị lạ → `'user'`.
 *
 * ⚠ **Bản sao có chủ ý của `toRole` trong `apps/web/src/server/trpc/init.ts`** —
 * hàm đó không được export, và `server/**` thuộc lane BE1 nên lane này không sửa
 * được. Hai allowlist rời nhau là một chỗ để trôi: thêm vai trò thứ tư mà chỉ
 * sửa một bên thì menu và `adminProcedure` sẽ nói hai chuyện khác nhau. Đã ghi
 * vào report để lead cho export `toRole` rồi xoá bản này.
 */
export function normalizeRole(raw: unknown): ViewerRole {
  return KNOWN_ROLES.find((known) => known === raw) ?? 'user';
}

/**
 * Mục nav nào đang "ở trong" đường hiện tại.
 *
 * Cùng luật khớp với `matchesProtected` của `proxy.ts` và vì cùng một lý do:
 * `startsWith(href)` trần sẽ nuốt `/mentor` cho mục `/me`, còn so bằng chính
 * xác thì `/lessons/<id>` không làm sáng mục "Bài học" — người học vào trang chi
 * tiết sẽ thấy thanh nav không mục nào được chọn.
 */
export function isActiveNav(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Trang chủ `/` render `GamesHub` (`app/page.tsx`), tức nó CHÍNH LÀ màn chọn
 * game — không phải một trang giới thiệu riêng.
 *
 * Không mục nav nào trỏ `/`, nên thiếu dòng này thì ở trang chủ KHÔNG mục nào
 * sáng và thanh breadcrumb không có gì để nói. Một dòng nói ra được, thay vì
 * một nhánh `pathname === '/'` nằm rải trong vỏ ứng dụng.
 */
const HOME_NAV_HREF = '/games';

/**
 * Mục nav khớp đường hiện tại, khớp DÀI NHẤT thắng.
 *
 * "Dài nhất thắng" là thứ thay cho đống nhánh đặc cách. `/author` và
 * `/author/problems` cùng khớp `/author/problems`; so tiền tố trần sẽ làm sáng
 * CẢ HAI, còn ép `/author` phải khớp chính xác thì `/author/new` mất mục sáng.
 * Luật này đúng cho cả hai, và đúng luôn cho `/admin` với `/admin/exams`.
 *
 * ⚠ Mục mang QUERY (`?mode=builder`) bị BỎ QUA hoàn toàn. Nó là một chế độ của
 * một trang, không phải một địa chỉ; `usePathname()` không mang query nên không
 * có cách nào phân biệt được nó với trang gốc mà không kéo `useSearchParams()`
 * vào root layout (thứ buộc cả cây phải render động). Hệ quả nói thẳng: đang mở
 * trình dựng màn chơi thì mục sáng là "Games", không phải "Dựng màn chơi".
 */
export function activeNavItem<T extends NavItem>(
  pathname: string,
  items: readonly T[],
): T | null {
  const path = pathname === '/' ? HOME_NAV_HREF : pathname;
  let best: T | null = null;
  for (const item of items) {
    if (item.href.includes('?') || !isActiveNav(path, item.href)) {
      continue;
    }
    if (best === null || item.href.length > best.href.length) {
      best = item;
    }
  }
  return best;
}
