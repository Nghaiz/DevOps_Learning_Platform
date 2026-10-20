/**
 * Khung phiên dùng chung của ba trình học (lesson, lab, playground).
 *
 * ⛔ Bất biến của khoang làm việc: terminal KHÔNG đổi node cha và KHÔNG unmount
 * trong suốt một phiên, dù đổi tab, đổi bố cục hay đổi bề rộng cửa sổ. `hidden`
 * để nguyên node tại chỗ (chỉ thôi được vẽ); đổi cha hay bỏ khỏi cây là đóng
 * WebSocket của người học mà không lỗi nào bắn. Đọc chú thích đầu
 * `workspace-panel.tsx` trước khi sửa.
 */
export { SessionControls } from './session-controls.tsx';
export type { SessionActions, SessionControlsProps } from './session-controls.tsx';

export { TerminalPane } from './terminal-pane.tsx';
export type { TerminalPaneProps } from './terminal-pane.tsx';

export { useResolvedTerminalTheme } from './use-resolved-terminal-theme';

export { WorkspaceSplit, nextWideEnough, STACK_BELOW_PX, UNSTACK_FROM_PX } from './workspace-split.tsx';
export type { WorkspaceSplitProps } from './workspace-split.tsx';

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

// Kênh "hình học khoang terminal vừa đổi" + hệ quả `fit()` của nó.
export {
  WorkspaceLayoutProvider,
  useFitOnLayoutChange,
  useWorkspaceLayout,
} from './workspace-layout.tsx';

// Thanh 48px + dải thông báo của màn thực hành.
export { WorkspaceBar } from './workspace-bar.tsx';
export type { WorkspaceBarProps } from './workspace-bar.tsx';
export { NoticeStrip } from './notice-strip.tsx';
export type { PracticeNotice } from './notice-strip.tsx';

export { PhaseIcon, SessionStatusPill, phaseToneClass } from './session-status.tsx';
export type { PhaseIconProps, SessionStatusPillProps } from './session-status.tsx';

// Cổng nút Kiểm tra / nút chạy lệnh, lớp phủ theo pha, bàn giao cửa sổ riêng.
export { checkBlockedReason, execBlockedReason } from './practice-gates';
export type { CheckGateInput, ExecGateInput } from './practice-gates';
export { resolveTerminalOverlay, overlayActionLabel } from './terminal-overlay';
export type { OverlayAction, OverlayInput, TerminalOverlay } from './terminal-overlay';
export { useTerminalHandoff, useWindowHandoff, terminalWindowUrl } from './terminal-handoff';
export type { HandoffState, TerminalHandoff, WindowHandoff } from './terminal-handoff';
export { contentViewLabels, stepNavLabels } from './practice-labels';

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
export { IdePane } from './ide-pane.tsx';
export type { IdePaneProps } from './ide-pane.tsx';

// Danh sách nhiệm vụ, NĂM trạng thái nhìn được (`infra` tách khỏi `failed`).
export { TaskChecklist } from './task-checklist.tsx';
export type { TaskChecklistItem, TaskChecklistProps } from './task-checklist.tsx';
export { countByVisualState, outcomeKind, resolveTaskVisualState } from './task-state';
export type { StoredTaskState, TaskOutcomeKind, TaskVisualState } from './task-state';
export { resolveTerminalTheme } from './terminal-theme';
export { resolveShellFallbackNotice } from './shell-fallback';
export type { ShellFallbackInput } from './shell-fallback';
