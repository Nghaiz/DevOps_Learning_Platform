/**
 * C5 — khung phiên dùng chung (`phase-13-exec.md` §2).
 *
 * ⛔ HỢP ĐỒNG ĐÔNG CỨNG kể từ commit này: bốn lane đợt 2b (D2 · E · F · G) viết
 * theo đúng các tên và prop dưới đây. Thấy hợp đồng sai thì BÁO LEAD, không tự
 * đổi — một chữ ký đổi âm thầm ở đây là bốn lane biên dịch được nhưng chạy sai.
 */
export { SessionControls } from './session-controls.tsx';
export type { SessionActions, SessionControlsProps } from './session-controls.tsx';

export { TerminalPane } from './terminal-pane.tsx';
export type { TerminalPaneProps } from './terminal-pane.tsx';

export { useResolvedTerminalTheme } from './use-resolved-terminal-theme';

// Bố cục "nội dung cạnh terminal" + cách nó gập lại dưới `TERMINAL_MIN_WIDTH_PX`
// (13.B mục 8). Thêm 2026-09-07: hai trang có split (lesson, lab) cần đúng một
// quyết định gập, và bản chép thứ hai là bản sẽ trôi.
export { WorkspaceSplit } from './workspace-split.tsx';
export type { WorkspaceSplitProps } from './workspace-split.tsx';

// C5 — khoang phải kiểu KillerCoda: tab ở trên, mỗi lúc một tab chiếm trọn.
// Thay cho `SplitPane` LỒNG mà bố cục `ide` từng dùng (màn chia ba, editor còn
// ~1/3 bề rộng). ⛔ Bất biến của nó: mọi tab giữ MOUNTED, ẩn bằng `hidden` —
// đọc chú thích đầu `workspace-panel.tsx` trước khi sửa.
export { WorkspacePanel } from './workspace-panel.tsx';
export type { WorkspacePanelProps } from './workspace-panel.tsx';
export {
  EDITOR_TAB,
  TERMINAL_TAB_ORDER,
  WORKSPACE_TAB_LABEL,
  isClosableTab,
  isTerminalTab,
  listWorkspaceTabs,
  workspaceStorageKey,
} from './workspace-tabs';
export type { TerminalTabId, WorkspaceTabId } from './workspace-tabs';

// C6 — chuỗi điều khiển tmux. Người tiêu thụ gọi qua
// `session.terminal?.sendInput(tmuxSelectForTab(tab) ?? '')`; ⛔ đừng rải `\x02`.
export {
  TMUX_WINDOW_BY_TAB,
  tmuxNewWindowAt,
  tmuxSelectForTab,
  tmuxSelectWindow,
} from './tmux-control';

// Kênh "vùng của bạn đang hiện hay ẩn" + hệ quả `fit()` của nó (C3).
// `TerminalPane` đã tự dùng — Lane F KHÔNG cần gọi gì thêm.
export {
  WorkspaceRegionVisibleProvider,
  useFitOnReveal,
  useWorkspaceRegionVisible,
} from './workspace-visibility.tsx';

// Khung khoang + trạng thái phiên dùng chung cho màn hình học. Bốn trình học
// vẽ cùng một thanh nhãn và cùng một viên trạng thái, nên chúng sống ở đây
// chứ không ở từng route — ba bản chép tay của khối C5 cũ đã lệch nhau một
// lần rồi (playground thiếu nhãn TTL, lab thiếu tooltip hardCap).
export { PaneHeader } from './pane-header.tsx';
export type { PaneHeaderProps } from './pane-header.tsx';
export { PhaseIcon, SessionStatusPill, phaseToneClass } from './session-status.tsx';
export type { PhaseIconProps, SessionStatusPillProps } from './session-status.tsx';

// Phần phụ trợ — không nằm trong C5 nhưng bốn lane tiêu thụ đều cần, và chép
// tay chúng ở mỗi trang là cách bốn trang bắt đầu nói bốn thứ khác nhau về
// cùng một pha phiên.
export { SESSION_PHASE_LABEL, phaseBadgeVariant, TTL_URGENT_MS, TTL_VISIBLE_MS } from './session-phase';
export { describeCapacity } from './capacity';
export type { CapacityHint, CapacitySnapshot, CapacityTone } from './capacity';
export { IDE_BOOT_TIMEOUT_MS, IDE_LAYOUT, ideSessionUrl, shouldShowIdePane } from './ide-layout';
export { resolveTerminalTheme } from './terminal-theme';
export { ShellFallbackNotice } from './shell-fallback-notice.tsx';
export type { ShellFallbackNoticeProps } from './shell-fallback-notice.tsx';
export { resolveShellFallbackNotice } from './shell-fallback';
export type { ShellFallbackInput } from './shell-fallback';
