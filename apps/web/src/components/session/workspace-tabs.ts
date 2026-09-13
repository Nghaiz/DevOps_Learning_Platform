/**
 * §Y1/§Y4 — mô hình khoang làm việc, tách khỏi React.
 *
 * Mọi quyết định "hàng nào hiện, terminal cao bao nhiêu, phím nào đi đâu, lưu
 * vào khoá nào" nằm ở đây dưới dạng hàm THUẦN. `workspace-panel.tsx` chỉ vẽ ra
 * kết quả.
 *
 * Vì sao tách — ⚠ LÝ DO ĐÃ ĐỔI, kết luận thì không. Bản trước ghi "`apps/web`
 * chạy vitest ở `environment: 'node'`, không jsdom, không RTL", tức là một
 * quyết định nằm trong thân component là quyết định KHÔNG test được. Vế đó hết
 * đúng từ 2026-09-08: `node` nay chỉ còn là MẶC ĐỊNH của gói (phần lớn test ở
 * đây đi Postgres thật), còn file nào cần DOM thì tự bật jsdom + RTL bằng
 * docblock `// @vitest-environment jsdom` ở dòng 1 — xem
 * `workspace-panel.dom.test.tsx`.
 *
 * Tách vẫn đúng, chỉ đổi lý do: một quyết định là hàm THUẦN thì khẳng định
 * được thẳng bằng bảng vào/ra, không phải suy ngược từ cây DOM, và không phải
 * trả giá dựng một jsdom cho mỗi ca. Việc *dây nối* giữa các hàm này với DOM
 * thì đã có file DOM ở trên gác.
 *
 * ## Mô hình sau SỬA ĐỔI 2 — MỘT terminal, hiện ở CẢ HAI tab
 *
 * Trước đây có ba tab (`editor` + hai tab terminal ánh xạ sang tmux window) và
 * một nút "tách đôi". Nay chỉ còn hai tab và MỘT phiên terminal:
 *
 * - tab `editor`   ⇒ hàng 1 (Theia) hiện, hàng 2 (terminal) neo đáy ~40%
 * - tab `terminal` ⇒ hàng 1 ẩn, hàng 2 chiếm trọn khoang
 *
 * ⛔ Terminal KHÔNG BAO GIỜ bị ẩn và không bao giờ đổi cha (§Y1) — nên ở đây
 * không có hàm nào trả về "terminal có hiện không". Câu hỏi duy nhất còn lại là
 * *hàng 1 có hiện không* và *hàng 2 cao bao nhiêu*.
 */

import { t } from '@devops-platform/copy';

export type WorkspaceTabId = 'editor' | 'terminal';

export const EDITOR_TAB = 'editor';
export const TERMINAL_TAB = 'terminal';

/**
 * ⚠ Tiện ích Tailwind đặt `display`. Phần tử mang thuộc tính `hidden` KHÔNG
 * được mang bất kỳ token nào trong danh sách này (`p16-workspace.md` §2).
 *
 * Vì sao hằng này sống ở ĐÂY chứ không nằm trong từng file test: hợp đồng §8
 * AC-2 đòi một mảng "xuất ra được để test đọc", và hai file test khác nhau
 * (`workspace-panel.test.tsx` quét markup tĩnh, `workspace-panel.dom.test.tsx`
 * quét cây DOM sống) cùng cần đúng một danh sách. Hai bản chép là hai bản sẽ
 * lệch, và bản lệch thì bên nào cũng xanh.
 *
 * So khớp theo TOKEN (tách `className` theo khoảng trắng), không `includes`
 * chuỗi: `includes('flex')` trúng cả `flex-1` và `flex-col`, nên một bộ quét
 * viết kiểu đó đỏ ngay lượt đầu rồi bị nới ra cho tới lúc không gác gì nữa.
 */
export const DISPLAY_UTILITIES: readonly string[] = [
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'table',
  'table-cell',
  'contents',
  'flow-root',
  'list-item',
];

/**
 * `true` khi `className` mang một tiện ích `display` — tức khi đặt cạnh thuộc
 * tính `hidden` thì `hidden` bị vô hiệu trong im lặng.
 *
 * Hàm THUẦN, để cả hai file test gọi được cùng một phép đo trên hai nguồn khác
 * nhau (chuỗi `class="..."` của markup tĩnh, và `element.className` của DOM).
 */
export function hasDisplayUtility(className: string): boolean {
  const tokens = new Set(className.split(/\s+/).filter((token) => token !== ''));
  return DISPLAY_UTILITIES.some((utility) => tokens.has(utility));
}

export const WORKSPACE_TAB_LABEL: Readonly<Record<WorkspaceTabId, string>> = {
  editor: t('session.workspace.tab-editor'),
  terminal: t('session.workspace.tab-terminal'),
};

export function isWorkspaceTab(value: unknown): value is WorkspaceTabId {
  return value === EDITOR_TAB || value === TERMINAL_TAB;
}

/**
 * Thứ tự tab trên thanh. Bài không khai `layout: ide` ⇒ đúng MỘT mục.
 *
 * Panel dùng độ dài của mảng này để quyết định có vẽ `role="tablist"` hay
 * không: một tablist một mục là nhiễu thị giác chứ không phải chức năng (§Y4).
 */
export function listWorkspaceTabs(hasEditor: boolean): readonly WorkspaceTabId[] {
  return hasEditor ? [EDITOR_TAB, TERMINAL_TAB] : [TERMINAL_TAB];
}

/**
 * Kẹp `activeTab` về một tab CÓ THẬT.
 *
 * Cần vì `activeTab` do cha điều khiển (§Y4), và cha có thể yêu cầu `editor` ở
 * một bài không có editor — ví dụ một giá trị đọc lại từ `localStorage` của bài
 * IDE trước đó. Không kẹp thì hàng 1 rỗng chiếm chỗ và người học nhìn một mảng
 * trắng bên trên terminal.
 */
export function resolveActiveTab(requested: WorkspaceTabId, hasEditor: boolean): WorkspaceTabId {
  if (!hasEditor) {
    return TERMINAL_TAB;
  }
  return requested;
}

/**
 * Hàng 1 (Theia) có hiện không.
 *
 * SỬA ĐỔI 3 (2026-09-13) làm hàm này mang cả hai nghĩa cùng lúc: hàng 1 hiện
 * ĐÚNG KHI hàng 2 ẩn, và ngược lại. Trước đó hai hàng cùng hiện ở tab Editor
 * nên chỉ hàng 1 phụ thuộc vào nó.
 */
export function isEditorVisible(activeTab: WorkspaceTabId, hasEditor: boolean): boolean {
  return hasEditor && activeTab === EDITOR_TAB;
}

/**
 * ⛔ §Y1 — dấu hiệu "hình học của khoang terminal vừa đổi", để `TerminalPane`
 * biết phải gọi `handle.fit()`.
 *
 * ## SỬA ĐỔI 3 (2026-09-13) — hai hàng loại trừ nhau, không còn chia đôi
 *
 * Chỉ đạo của chủ dự án: tab IDE hiện IDE, tab Terminal hiện terminal, hết.
 * Nên chuỗi này chỉ còn hai giá trị, và cơ chế phần trăm chiều cao đã bị gỡ
 * hẳn cùng thanh kéo (`TERMINAL_PERCENT_*`, `clampTerminalPercent`,
 * `nextTerminalPercentOnKey`). Gỡ chứ không để lại dạng ẩn: một thanh kéo
 * không bao giờ hiện được là mã chết, và mã chết trong file này là thứ người
 * đọc sau sẽ tưởng còn dùng.
 *
 * ⚠ Vì sao vẫn là một CHUỖI chứ không phải một cờ boolean: nó vẫn phải ĐỔI ở
 * mỗi lượt chuyển tab để `useFitOnLayoutChange` chạy lại. Một cờ "terminal
 * đang hiện" cũng đổi đúng hai lần như thế, nên ở đây chuỗi không hơn cờ về
 * chức năng — nó hơn ở chỗ đọc log/devtools ra được TÊN của bố cục, và nó giữ
 * nguyên kiểu `string` mà `WorkspaceLayoutProvider` và giá trị mặc định
 * `'standalone'` đang dùng.
 *
 * ⚠ Lượt fit khi terminal vừa bị ẩn là VÔ HẠI và cố ý không chặn ở đây:
 * `TerminalHandle.fit()` đo trước rồi mới phát, và container 0×0 làm phép đo
 * trả `null` nên không có `resize` nào tới PTY (`packages/terminal/src/
 * terminal-core.ts`, thân `fit()`). Chặn thêm một lần nữa ở tầng này là dựng
 * một cái chốt thứ hai cho một cửa đã khoá.
 */
export function workspaceLayoutToken(input: {
  readonly activeTab: WorkspaceTabId;
  readonly hasEditor: boolean;
}): string {
  return isEditorVisible(input.activeTab, input.hasEditor) ? 'editor-only' : 'terminal-full';
}

/**
 * Điều hướng bàn phím theo khuôn `tablist` NGANG của ARIA APG: mũi tên
 * trái/phải có VÒNG LẠI, `Home`/`End` nhảy về hai đầu.
 *
 * Trả `null` khi phím không thuộc khuôn, để call-site biết KHÔNG được
 * `preventDefault()`: nuốt mọi phím ở đây sẽ chặn cả `Tab` (đường thoát khỏi
 * thanh tab) lẫn phím tắt của trình duyệt.
 */
export function nextTabOnKey(
  key: string,
  tabs: readonly WorkspaceTabId[],
  activeTab: WorkspaceTabId,
): WorkspaceTabId | null {
  if (tabs.length === 0) {
    return null;
  }
  const at = tabs.indexOf(activeTab);
  const from = at === -1 ? 0 : at;

  switch (key) {
    case 'ArrowRight':
      return tabs[(from + 1) % tabs.length] ?? null;
    case 'ArrowLeft':
      return tabs[(from - 1 + tabs.length) % tabs.length] ?? null;
    case 'Home':
      return tabs[0] ?? null;
    case 'End':
      return tabs[tabs.length - 1] ?? null;
    default:
      return null;
  }
}

// ── Ghi nhớ giữa các lần vào ────────────────────────────────────────────────

export interface StoredWorkspaceState {
  readonly activeTab: WorkspaceTabId;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * ⚠ Khoá TÁCH RIÊNG theo bố cục — bài `ide` và bài thường KHÔNG dùng chung.
 *
 * Repo đã dính đúng lớp lỗi này một lần ở tỉ lệ `SplitPane`: dùng chung một
 * khoá thì tỉ lệ của bài thường bị áp lên bài IDE (xem chú thích quanh
 * `dlp-lesson-split-ide` trong `app/lessons/[id]/lesson-client.tsx`). Ở đây còn
 * khó thấy hơn: một `activeTab: 'editor'` lưu từ bài IDE, đọc lại ở bài thường,
 * bị `resolveActiveTab` kẹp im lặng — nên triệu chứng là "tab đã lưu không có
 * tác dụng" chứ không phải một lỗi ai đó đi tìm.
 *
 * Hậu tố sinh ở đây thay vì bắt call-site truyền hai khoá: một call-site quên
 * là một lần trộn, và trộn thì không có gì báo.
 */
export function workspaceStorageKey(base: string, hasEditor: boolean): string {
  return `${base}:${hasEditor ? 'ide' : 'plain'}`;
}

/**
 * ⚠ Hình dạng lưu đã đổi HAI lần. SỬA ĐỔI 2: `split` → `terminalPercent`, và
 * `terminal-1` thôi là một tab hợp lệ. SỬA ĐỔI 3 (2026-09-13): bỏ hẳn
 * `terminalPercent` cùng thanh kéo.
 *
 * ⚠ Lần này CỐ Ý không từ chối bản ghi cũ. Một `{"activeTab":"terminal",
 * "terminalPercent":70}` vẫn khai đúng cái tab mà người dùng đã chọn; trường
 * thừa chỉ mô tả một thanh kéo không còn tồn tại. Từ chối cả bản ghi sẽ làm
 * mọi người đang dùng mất tab đã nhớ ở đúng lượt cập nhật này — một hồi quy
 * im lặng để đổi lấy đúng con số không.
 *
 * Ngược lại, một `activeTab` không hợp lệ VẪN trả `null`: im lặng chấp nhận nó
 * sẽ mở bài ở một trạng thái không ai chọn.
 */
export function parseWorkspaceState(raw: string | null): StoredWorkspaceState | null {
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Giá trị rác (bản cũ, hoặc người dùng tự sửa) — coi như chưa lưu gì.
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const tab = record['activeTab'];
  if (!isWorkspaceTab(tab)) {
    return null;
  }
  return { activeTab: tab };
}

/**
 * `storage` được TIÊM VÀO chứ không đọc thẳng `localStorage`: ngoài chuyện test
 * được ở env `node`, `localStorage` NÉM trong một số chế độ riêng tư — cùng lý
 * do `SplitPane` đã bọc try/catch. Bố cục là thứ "tiện thêm"; nó không được
 * phép làm sập trang.
 */
export function readWorkspaceState(
  key: string,
  storage: StorageLike | null,
): StoredWorkspaceState | null {
  if (storage === null) {
    return null;
  }
  try {
    return parseWorkspaceState(storage.getItem(key));
  } catch {
    return null;
  }
}

export function writeWorkspaceState(
  key: string,
  state: StoredWorkspaceState,
  storage: StorageLike | null,
): void {
  if (storage === null) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage bị chặn/đầy — phiên hiện tại vẫn dùng được, chỉ là lần sau không nhớ.
  }
}

/** `localStorage` nếu đọc được, `null` nếu không (SSR, chế độ riêng tư). */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
