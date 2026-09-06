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

// Phần phụ trợ — không nằm trong C5 nhưng bốn lane tiêu thụ đều cần, và chép
// tay chúng ở mỗi trang là cách bốn trang bắt đầu nói bốn thứ khác nhau về
// cùng một pha phiên.
export { SESSION_PHASE_LABEL, phaseBadgeVariant, TTL_URGENT_MS, TTL_VISIBLE_MS } from './session-phase';
export { describeCapacity } from './capacity';
export type { CapacityHint, CapacitySnapshot, CapacityTone } from './capacity';
export { IDE_BOOT_TIMEOUT_MS, IDE_LAYOUT, ideSessionUrl, shouldShowIdePane } from './ide-layout';
export { resolveTerminalTheme } from './terminal-theme';
