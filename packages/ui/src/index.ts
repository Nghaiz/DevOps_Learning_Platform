export { cn } from './cn.ts';
export { Button } from './button.tsx';
export type { ButtonProps, ButtonVariant } from './button.tsx';
export { Card, CardTitle, CardDescription } from './card.tsx';
export { Input } from './input.tsx';

// ── Bài học (P2 / 2.D) ───────────────────────────────────────────────────────
// Đặt ở `packages/ui` chứ không ở `apps/web` vì P4 (Labs + CTF) tái dùng đúng bộ
// này: chúng là component TRÌNH BÀY thuần — không biết tRPC, không biết terminal,
// nhận dữ liệu và callback qua props. Phần có dây nối (gọi API, gõ vào PTY) nằm
// ở `apps/web/src/app/lessons/**` và KHÔNG được kéo xuống đây.
export { ContentView } from './lesson/content-view.tsx';
export type { ContentViewProps } from './lesson/content-view.tsx';
export { SplitPane } from './lesson/split-pane.tsx';
export type { SplitPaneProps } from './lesson/split-pane.tsx';
export { StepNav } from './lesson/step-nav.tsx';
export type { StepNavItem, StepNavProps } from './lesson/step-nav.tsx';
export { ProgressBar } from './lesson/progress-bar.tsx';
export type { ProgressBarProps } from './lesson/progress-bar.tsx';
