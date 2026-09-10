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
  editor: 'Editor',
  terminal: 'Terminal',
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
 * Hàng 1 (Theia) có hiện không. Đây là biến DUY NHẤT mà việc chuyển tab đổi —
 * cùng với chiều cao hàng 2.
 */
export function isEditorVisible(activeTab: WorkspaceTabId, hasEditor: boolean): boolean {
  return hasEditor && activeTab === EDITOR_TAB;
}

// ── Chiều cao khoang terminal ở tab Editor (§Y6) ─────────────────────────────

/** Mặc định ~40% chiều cao khoang, theo §Y6. */
export const TERMINAL_PERCENT_DEFAULT = 40;

/**
 * Trần/sàn của thanh kéo.
 *
 * Sàn 15% chứ không 0: một terminal cao 0 vẫn MOUNTED (đúng §Y1) nhưng người
 * dùng không nhìn thấy gì và cũng không còn chỗ nào để nắm mà kéo ngược lại —
 * tức một cách vô tình tự khoá mình ra khỏi terminal. Trần 85% giữ lại một dải
 * editor đủ để nhận ra nó vẫn ở đó.
 */
export const TERMINAL_PERCENT_MIN = 15;
export const TERMINAL_PERCENT_MAX = 85;

/** Mỗi lần nhấn mũi tên đổi 4 điểm phần trăm — thô đủ để cảm nhận, mịn đủ để chỉnh. */
export const TERMINAL_PERCENT_STEP = 4;

/**
 * Kẹp về [MIN, MAX] và làm tròn.
 *
 * `NaN` (giá trị rác trong storage, hoặc một phép chia cho chiều cao 0) trả về
 * MẶC ĐỊNH chứ không kẹp: `Math.min`/`Math.max` với NaN lan NaN ra ngoài, và
 * một `flexBasis: "NaN%"` là khai báo CSS không hợp lệ — trình duyệt bỏ qua nó
 * trong im lặng và khoang trở về kích thước tự nhiên, không có gì báo.
 */
export function clampTerminalPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return TERMINAL_PERCENT_DEFAULT;
  }
  return Math.round(Math.min(TERMINAL_PERCENT_MAX, Math.max(TERMINAL_PERCENT_MIN, value)));
}

/**
 * Phần trăm mới khi nhấn phím trên thanh kéo, `null` cho phím ngoài khuôn.
 *
 * `null` để call-site biết KHÔNG được `preventDefault()` — nuốt mọi phím ở đây
 * sẽ chặn cả `Tab` (đường thoát khỏi thanh kéo) lẫn phím tắt của trình duyệt.
 *
 * Mũi tên LÊN làm terminal CAO THÊM: thanh kéo đi lên thì phần dưới nó rộng ra.
 */
export function nextTerminalPercentOnKey(key: string, percent: number): number | null {
  switch (key) {
    case 'ArrowUp':
      return clampTerminalPercent(percent + TERMINAL_PERCENT_STEP);
    case 'ArrowDown':
      return clampTerminalPercent(percent - TERMINAL_PERCENT_STEP);
    case 'Home':
      return TERMINAL_PERCENT_MIN;
    case 'End':
      return TERMINAL_PERCENT_MAX;
    default:
      return null;
  }
}

/**
 * ⛔ §Y1 — dấu hiệu "hình học của khoang terminal vừa đổi", để `TerminalPane`
 * biết phải gọi `handle.fit()`.
 *
 * Vì sao là một CHUỖI chứ không phải một cờ "đang hiện": ở mô hình mới terminal
 * không bao giờ bị ẩn, nên một cờ hiện/ẩn đứng yên mãi mãi và effect fit sẽ
 * KHÔNG BAO GIỜ chạy lại. Thứ thật sự đổi là kích thước — chuyển tab (40% →
 * 100%) và kéo thanh chia. Chuỗi này đổi đúng ở hai lúc đó.
 *
 * ⚠ Khi hàng 1 đang ẩn, phần trăm KHÔNG được vào chuỗi: người dùng ở tab
 * Terminal thì terminal chiếm trọn khoang bất kể phần trăm đã lưu là bao nhiêu.
 * Nhét nó vào sẽ đẻ ra một lượt fit thừa mỗi lần khôi phục giá trị từ storage —
 * một lần đo lại xterm không mang tin gì mới.
 */
export function workspaceLayoutToken(input: {
  readonly activeTab: WorkspaceTabId;
  readonly hasEditor: boolean;
  readonly terminalPercent: number;
}): string {
  const { activeTab, hasEditor, terminalPercent } = input;
  if (!isEditorVisible(activeTab, hasEditor)) {
    return 'terminal-full';
  }
  return `editor-split:${String(clampTerminalPercent(terminalPercent))}`;
}

/**
 * Điều hướng bàn phím theo khuôn `tablist` NGANG của ARIA APG: mũi tên
 * trái/phải có VÒNG LẠI, `Home`/`End` nhảy về hai đầu.
 *
 * Trả `null` khi phím không thuộc khuôn — cùng lý do như `nextTerminalPercentOnKey`.
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
  /** Chiều cao khoang terminal ở tab Editor, tính bằng phần trăm (§Y6). */
  readonly terminalPercent: number;
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
 * tác dụng" chứ không phải một lỗi ai đó đi tìm. Và phần trăm chiều cao thì
 * hoàn toàn vô nghĩa ở bài không có editor.
 *
 * Hậu tố sinh ở đây thay vì bắt call-site truyền hai khoá: một call-site quên
 * là một lần trộn, và trộn thì không có gì báo.
 */
export function workspaceStorageKey(base: string, hasEditor: boolean): string {
  return `${base}:${hasEditor ? 'ide' : 'plain'}`;
}

/**
 * ⚠ Hình dạng lưu ĐÃ ĐỔI ở SỬA ĐỔI 2 (`split` → `terminalPercent`, và
 * `terminal-1` không còn là một tab hợp lệ). Bản ghi cũ vì thế trả `null` và
 * người dùng nhận lại mặc định — đúng ý: một `{"activeTab":"terminal-1"}` đọc
 * theo luật mới là một tab không tồn tại, và im lặng chấp nhận nó sẽ mở bài ở
 * một trạng thái không ai chọn.
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
  const percent = record['terminalPercent'];
  if (!isWorkspaceTab(tab) || typeof percent !== 'number' || !Number.isFinite(percent)) {
    return null;
  }
  return { activeTab: tab, terminalPercent: clampTerminalPercent(percent) };
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
