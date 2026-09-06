/**
 * Bề mặt công khai của vỏ ứng dụng (13.B) cho các lane khác dùng lại.
 *
 * ⚠ `app/layout.tsx` KHÔNG import qua barrel này mà import thẳng từng file:
 * barrel gom cả module `'use client'` lẫn module thuần, và một Server Component
 * chỉ cần một hằng số điểm ngắt sẽ kéo theo cả nhánh client.
 */
export {
  NAV_COLLAPSE_MAX_PX,
  TERMINAL_MIN_WIDTH_PX,
  DESKTOP_TARGET_MIN_PX,
  meetsTerminalWidth,
} from './breakpoints';
export { NarrowScreenNotice } from './narrow-screen-notice';
export { useMinWidth } from './use-min-width';
export { useCapacity, CAPACITY_REFETCH_MS } from './use-capacity';
export type { CapacityState } from './use-capacity';
export { describeCapacity, formatFetchedAt, LOW_CAPACITY_RATIO } from './capacity';
export type { CapacityView, CapacityReading, CapacityTone } from './capacity';
export { useViewer } from './viewer-context';
export { PRIMARY_NAV, userMenuItems, isActiveNav, normalizeRole } from './nav';
export type { NavItem, Viewer, ViewerRole } from './nav';
