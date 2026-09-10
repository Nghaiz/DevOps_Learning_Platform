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

// §Y1/§Y4 — khoang phải kiểu KillerCoda: MỘT terminal, hiện ở CẢ HAI tab (neo
// đáy ~40% ở tab Editor, toàn khoang ở tab Terminal). ⛔ Bất biến của nó:
// terminal KHÔNG đổi cha và KHÔNG BAO GIỜ bị ẩn — đọc chú thích đầu
// `workspace-panel.tsx` trước khi sửa.
export { WorkspacePanel } from './workspace-panel.tsx';
export type { WorkspacePanelProps } from './workspace-panel.tsx';
export {
  EDITOR_TAB,
  TERMINAL_TAB,
  WORKSPACE_TAB_LABEL,
  listWorkspaceTabs,
  workspaceStorageKey,
} from './workspace-tabs';
export type { WorkspaceTabId } from './workspace-tabs';

// Kênh "hình học khoang terminal vừa đổi" + hệ quả `fit()` của nó (§C3/§Y1).
// `TerminalPane` đã tự dùng — trang tiêu thụ KHÔNG cần gọi gì thêm.
export {
  WorkspaceLayoutProvider,
  useFitOnLayoutChange,
  useWorkspaceLayout,
} from './workspace-layout.tsx';

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
export { describeCapacity, DEFAULT_PROFILE } from './capacity';
export type {
  CapacityHint,
  CapacitySnapshot,
  CapacityTone,
  KnownCapacityHint,
  ProfileCapacity,
  ProfileCapacityView,
  UnknownCapacityHint,
} from './capacity';
export { IDE_BOOT_TIMEOUT_MS, IDE_LAYOUT, ideSessionUrl, shouldShowIdePane } from './ide-layout';
// P16 / 16.D.3 — chuyển từ `app/lessons/[id]/ide-pane.tsx` sang đây. Bài nào
// bật IDE là quyết định NỘI DUNG, không phải quyết định kiến trúc, nên lab
// phải với tới được nó. `WorkspacePanel` không đổi một dòng: nó vốn chỉ nhận
// `editor?: ReactNode`.
export { IdePane } from './ide-pane.tsx';
export type { IdePaneProps } from './ide-pane.tsx';

// P16 / 16.D.4 — danh sách kiểm nhiệm vụ, NĂM trạng thái nhìn được. `infra`
// (lượt chấm không chạy được) tách khỏi `failed` (bài làm chưa đạt): trước đó
// hai thứ vẽ ra cùng một viên badge, và một ô "chưa đạt" bảo người học đi sửa
// bài làm trong khi thứ hỏng là cụm.
export { TaskChecklist } from './task-checklist.tsx';
export type { TaskChecklistItem, TaskChecklistProps } from './task-checklist.tsx';
export { countByVisualState, outcomeKind, resolveTaskVisualState } from './task-state';
export type { StoredTaskState, TaskOutcomeKind, TaskVisualState } from './task-state';
export { resolveTerminalTheme } from './terminal-theme';
export { ShellFallbackNotice } from './shell-fallback-notice.tsx';
export type { ShellFallbackNoticeProps } from './shell-fallback-notice.tsx';
export { resolveShellFallbackNotice } from './shell-fallback';
export type { ShellFallbackInput } from './shell-fallback';
