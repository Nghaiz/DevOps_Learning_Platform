export { cn } from './cn.ts';

// ── Theme (D2 / C1) ──────────────────────────────────────────────────────────
export { ThemeProvider, useTheme, THEME_STORAGE_KEY, THEME_INIT_SCRIPT } from './theme/theme-provider.tsx';
export type { ThemeChoice, ThemeProviderProps } from './theme/theme-provider.tsx';

// ── Primitive form/action ───────────────────────────────────────────────────
export { Button } from './button.tsx';
export type { ButtonProps, ButtonVariant, ButtonSize } from './button.tsx';
export { Input } from './input.tsx';
export type { InputProps } from './input.tsx';
export { Textarea } from './textarea.tsx';
export type { TextareaProps } from './textarea.tsx';
export { Label } from './label.tsx';
export type { LabelProps } from './label.tsx';
export { Badge } from './badge.tsx';
export type { BadgeProps, BadgeVariant } from './badge.tsx';

// ── Card ─────────────────────────────────────────────────────────────────────
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card.tsx';

// ── Overlay (Radix) ──────────────────────────────────────────────────────────
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog.tsx';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs.tsx';
export { Select, SelectValue, SelectGroup, SelectTrigger, SelectContent, SelectItem } from './select.tsx';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './dropdown-menu.tsx';
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from './tooltip.tsx';

// ── Form controls (Radix) ────────────────────────────────────────────────────
export { Switch } from './switch.tsx';
export { Checkbox } from './checkbox.tsx';
export { RadioGroup, RadioGroupItem } from './radio-group.tsx';

// ── Toast ────────────────────────────────────────────────────────────────────
export { Toaster, useToast } from './toast.tsx';
export type { ToastOptions, ToastVariant } from './toast.tsx';

// ── Trạng thái / bố cục ──────────────────────────────────────────────────────
export { Alert, AlertTitle, AlertDescription } from './alert.tsx';
export type { AlertProps, AlertVariant } from './alert.tsx';
export { Skeleton } from './skeleton.tsx';
export { Spinner } from './spinner.tsx';
export type { SpinnerProps, SpinnerSize } from './spinner.tsx';
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from './table.tsx';
export { CursorPager } from './cursor-pager.tsx';
export type { CursorPagerProps } from './cursor-pager.tsx';
export { EmptyState } from './empty-state.tsx';
export type { EmptyStateProps } from './empty-state.tsx';
export { ErrorState } from './error-state.tsx';
export type { ErrorStateProps } from './error-state.tsx';
export { Separator, Kbd } from './separator.tsx';

// ── Bài học (P2 / 2.D) ───────────────────────────────────────────────────────
// Đặt ở `packages/ui` chứ không ở `apps/web` vì P4 (Labs + CTF) tái dùng đúng bộ
// này: chúng là component TRÌNH BÀY thuần — không biết tRPC, không biết terminal,
// nhận dữ liệu và callback qua props. Phần có dây nối (gọi API, gõ vào PTY) nằm
// ở `apps/web/src/app/lessons/**` và KHÔNG được kéo xuống đây.
/*
 * `MarkdownView` mở export 2026-09-08 cho `Level.teaching.primer` của Kubernetes
 * Game. Lane E render primer bằng đoạn văn + backtick tự viết vì component này
 * chưa mở, nên **bold, danh sách, liên kết hiện ra dưới dạng ký tự thô**.
 *
 * Lối thoát kia — dùng `ContentView` — sẽ kéo `@devops-platform/scenario` vào
 * một route CỐ Ý không gọi backend lần nào. Đổi một AC lấy một tiện nghi là sai
 * hướng, nên mở đúng thứ nhỏ hơn.
 */
export { MarkdownView } from './lesson/markdown-view.tsx';
export type { MarkdownViewProps } from './lesson/markdown-view.tsx';
export { ContentView } from './lesson/content-view.tsx';
export type { ContentViewProps } from './lesson/content-view.tsx';
export { SCROLL_REGION_FOCUS } from './lesson/scroll-region.ts';
export { SplitPane } from './lesson/split-pane.tsx';
export type { SplitPaneProps } from './lesson/split-pane.tsx';
export { StepNav } from './lesson/step-nav.tsx';
export type { StepNavItem, StepNavProps } from './lesson/step-nav.tsx';
export { ProgressBar } from './lesson/progress-bar.tsx';
export type { ProgressBarProps } from './lesson/progress-bar.tsx';
