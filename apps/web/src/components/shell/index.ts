/**
 * Bề mặt công khai của vỏ ứng dụng (13.B) cho các lane khác dùng lại.
 *
 * ⚠ `app/layout.tsx` KHÔNG import qua barrel này mà import thẳng từng file:
 * barrel gom cả module `'use client'` lẫn module thuần, và một Server Component
 * chỉ cần một hằng số điểm ngắt sẽ kéo theo cả nhánh client.
 */
export { useCapacity, CAPACITY_REFETCH_MS } from './use-capacity';
export type { CapacityState } from './use-capacity';
export {
  describeCapacity,
  describeProfileCapacity,
  readProfileCapacity,
  formatFetchedAt,
  DEFAULT_PROFILE,
  LOW_CAPACITY_RATIO,
} from './capacity';
export type {
  CapacityView,
  ProfileCapacityView,
  ProfileCapacity,
  CapacityReading,
  CapacityTone,
} from './capacity';
export { useViewer } from './viewer-context';
export {
  PRIMARY_NAV,
  SECTION_HUBS,
  userMenuItems,
  sectionsFor,
  sectionById,
  activeSection,
  NAV_SECTIONS,
  isActiveNav,
  activeNavItem,
  normalizeRole,
} from './nav';
export type {
  NavItem,
  PrimaryNavItem,
  SectionId,
  NavSectionDef,
  NavAudience,
  Viewer,
  ViewerRole,
} from './nav';
