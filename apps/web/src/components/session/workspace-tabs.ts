/**
 * C5 — mô hình tab của khoang làm việc, tách khỏi React.
 *
 * Mọi quyết định "tab nào hiện, phím nào đi đâu, nút tách có bấm được không,
 * lưu vào khoá nào" nằm ở đây dưới dạng hàm THUẦN. `workspace-panel.tsx` chỉ
 * vẽ ra kết quả.
 *
 * Vì sao tách: `apps/web` chạy vitest ở `environment: 'node'` (không jsdom,
 * không RTL — xem chú thích đầu `landmark-contract.test.ts`). Một quyết định
 * nằm lẫn trong thân component ở đây là một quyết định KHÔNG test được. Tách ra
 * là cách duy nhất để các bất biến của C5 có phép kiểm thật, thay vì một dòng
 * "đã kiểm bằng mắt" trong report.
 */

export type WorkspaceTabId = 'editor' | 'terminal-1' | 'terminal-2';

export const EDITOR_TAB = 'editor';

/** Thứ tự hiển thị cố định trên thanh tab. */
export const TERMINAL_TAB_ORDER = ['terminal-1', 'terminal-2'] as const;

export type TerminalTabId = (typeof TERMINAL_TAB_ORDER)[number];

export const WORKSPACE_TAB_LABEL: Readonly<Record<WorkspaceTabId, string>> = {
  editor: 'Editor',
  'terminal-1': 'Terminal 1',
  'terminal-2': 'Terminal 2',
};

export function isTerminalTab(tab: string): tab is TerminalTabId {
  return (TERMINAL_TAB_ORDER as readonly string[]).includes(tab);
}

export function isWorkspaceTab(value: unknown): value is WorkspaceTabId {
  return typeof value === 'string' && (value === EDITOR_TAB || isTerminalTab(value));
}

/**
 * Tab nào ĐÓNG ĐƯỢC.
 *
 * `terminal-1` không đóng được: nó là window đầu của tmux, và đóng nó là kết
 * thúc phiên shell chứ không phải đóng một tab giao diện. `editor` cũng không —
 * bài khai `interface.layout: ide` thì khoang editor là một phần của bài, không
 * phải thứ người học tự thêm vào.
 */
export function isClosableTab(tab: WorkspaceTabId): boolean {
  return tab !== EDITOR_TAB && tab !== 'terminal-1';
}

/**
 * Thứ tự tab trên thanh: Editor (nếu có) rồi các terminal theo
 * `TERMINAL_TAB_ORDER` — KHÔNG theo thứ tự chèn vào `Map`.
 *
 * Cố ý bỏ qua thứ tự của map: nếu Lane F dựng map theo thứ tự khác nhau giữa
 * hai lần render (ví dụ rebuild từ một object sau khi thêm terminal-2), thanh
 * tab sẽ nhảy chỗ dưới tay người dùng. Thứ tự phải là một hằng số, không phải
 * một hệ quả của cách dựng dữ liệu.
 */
export function listWorkspaceTabs(
  hasEditor: boolean,
  terminalTabs: Iterable<string>,
): readonly WorkspaceTabId[] {
  const present = new Set<string>(terminalTabs);
  const tabs: WorkspaceTabId[] = [];
  if (hasEditor) {
    tabs.push(EDITOR_TAB);
  }
  for (const tab of TERMINAL_TAB_ORDER) {
    if (present.has(tab)) {
      tabs.push(tab);
    }
  }
  return tabs;
}

/**
 * Kẹp `activeTab` về một tab CÓ THẬT; `null` khi không còn tab nào.
 *
 * Cần vì `activeTab` do cha điều khiển (C5), và cha có thể đóng đúng cái tab
 * đang hoạt — giữa hai lần render sẽ có một nhịp `activeTab` trỏ vào hư không.
 * Không kẹp thì nhịp đó không vùng nào hiện, và người dùng thấy một khoang
 * trắng ngay sau khi bấm nút `×`.
 */
export function resolveActiveTab(
  requested: WorkspaceTabId,
  tabs: readonly WorkspaceTabId[],
): WorkspaceTabId | null {
  if (tabs.includes(requested)) {
    return requested;
  }
  return tabs[0] ?? null;
}

export interface RegionVisibility {
  readonly editor: boolean;
  readonly terminal: boolean;
}

/**
 * ⛔ BẤT BIẾN SỐNG-CHẾT của C5 sống ở đây.
 *
 * Hàm này trả về AI ĐANG HIỆN — nó không bao giờ trả về "ai được mount". Mọi
 * vùng luôn mount; panel chỉ đặt thuộc tính `hidden` theo kết quả này. Unmount
 * vùng terminal là đóng WebSocket (mất phiên làm việc của người học); unmount
 * vùng editor là khởi động nguội Theia lại ~20 giây (số đo P6).
 *
 * ## Chỉ có HAI vùng, không phải ba
 *
 * Mọi tab terminal DÙNG CHUNG một vùng. Theo C6 cả phiên chỉ có một WebSocket
 * và một xterm: khi người dùng bấm sang "Terminal 2", tmux đổi window và nội
 * dung mới xuất hiện TRONG CHÍNH cái xterm đang hiện. Ẩn nó đi để hiện một
 * vùng "terminal-2" riêng là ẩn đúng thứ vừa được yêu cầu hiện.
 */
export function computeRegionVisibility(input: {
  readonly hasEditor: boolean;
  readonly hasTerminal: boolean;
  readonly activeTab: WorkspaceTabId | null;
  readonly split: boolean;
}): RegionVisibility {
  const { hasEditor, hasTerminal, activeTab, split } = input;

  // Tách đôi CHỈ có nghĩa khi có cả hai vế. Một `split: true` đọc lại từ
  // localStorage của bài trước (bài đó có editor, bài này không) không được
  // phép làm gì cả.
  const splitOn = split && hasEditor && hasTerminal;

  const editor = hasEditor && (activeTab === EDITOR_TAB || splitOn);
  const terminal = hasTerminal && ((activeTab !== null && isTerminalTab(activeTab)) || splitOn);

  if (!editor && !terminal) {
    // Lưới an toàn: `activeTab` trỏ vào một tab vừa biến mất và cha chưa kịp
    // gọi `onActivate`. Thà hiện sai vùng còn hơn hiện một khoang trắng.
    return { editor: hasEditor, terminal: hasTerminal && !hasEditor };
  }

  return { editor, terminal };
}

/**
 * Điều hướng bàn phím theo khuôn `tablist` NGANG của ARIA APG: mũi tên
 * trái/phải có VÒNG LẠI, `Home`/`End` nhảy về hai đầu.
 *
 * Trả `null` khi phím không thuộc khuôn — call-site dùng `null` để biết KHÔNG
 * được gọi `preventDefault()`. Nuốt mọi phím ở đây sẽ chặn cả `Tab` (đường
 * thoát khỏi thanh tab) lẫn phím tắt của trình duyệt.
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

/**
 * Lý do nút "tách" bị vô hiệu, hoặc `null` khi bấm được.
 *
 * Trả về CÂU CHỮ chứ không phải boolean: một nút disabled không nói lý do là
 * một ngõ cụt — người dùng bấm, không có gì xảy ra, và không có gì để đọc.
 * Chuỗi này đi thẳng vào `title` của nút.
 */
export function splitDisabledReason(hasEditor: boolean, hasTerminal: boolean): string | null {
  if (!hasEditor) {
    // §C6: chế độ tách là "Editor | terminal đang hoạt". Không có Editor thì vế
    // trái không tồn tại — và hai terminal cạnh nhau là BẤT KHẢ với một
    // WebSocket + tmux window, nên đây không phải giới hạn nới ra được sau này.
    return (
      'Bài này không có khoang Editor nên không tách đôi được. ' +
      'Hai terminal cạnh nhau là bất khả: cả phiên chỉ có một kết nối, ' +
      'các tab terminal dùng chung một cửa sổ.'
    );
  }
  if (!hasTerminal) {
    return 'Chưa có terminal nào để đặt cạnh Editor.';
  }
  return null;
}

// ── Ghi nhớ giữa các lần vào ────────────────────────────────────────────────

export interface StoredWorkspaceState {
  readonly activeTab: WorkspaceTabId;
  readonly split: boolean;
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
 * khó thấy hơn tỉ lệ: một `activeTab: 'editor'` lưu từ bài IDE, đọc lại ở bài
 * thường, là một tab KHÔNG TỒN TẠI — `resolveActiveTab` kẹp nó, nên triệu chứng
 * là "tab đã lưu không có tác dụng" chứ không phải một lỗi ai đó đi tìm.
 *
 * Hậu tố sinh ở đây thay vì bắt Lane F truyền hai khoá: một call-site quên là
 * một lần trộn, và trộn thì không có gì báo.
 */
export function workspaceStorageKey(base: string, hasEditor: boolean): string {
  return `${base}:${hasEditor ? 'ide' : 'plain'}`;
}

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
  const split = record['split'];
  if (!isWorkspaceTab(tab) || typeof split !== 'boolean') {
    return null;
  }
  return { activeTab: tab, split };
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
