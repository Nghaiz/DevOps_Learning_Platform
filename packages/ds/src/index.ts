/**
 * Hệ thiết kế `ds` — bản dựng lại giao diện 2026-10. Tài liệu: docs/design-system.md.
 *
 * `sideEffects: false`: barrel này chỉ re-export, nên route nào không dùng một
 * component thì bundler bỏ nó đi. Phần nặng (react-markdown) nằm ở subpath
 * `@devops-platform/ds/content`, không ở đây.
 */
export { cn } from './cn.ts';
export { Icon, GLYPHS, isIconName, type IconName, type IconProps, type IconTint } from './icons/index.ts';
export { ThemeProvider, useTheme } from './theme/theme-provider.tsx';
export { THEME_INIT_SCRIPT, THEME_STORAGE_KEY, isThemeChoice, type ThemeChoice, type ResolvedTheme } from './theme/theme-script.ts';
export { Button, IconButton, buttonVariants, type ButtonProps, type IconButtonProps } from './button.tsx';
export {
  Input,
  Textarea,
  Label,
  Field,
  Checkbox,
  Switch,
  RadioGroup,
  Radio,
  RadioItem,
  type InputProps,
  type TextareaProps,
  type FieldProps,
  type CheckboxProps,
  type SwitchProps,
  type RadioProps,
} from './form.tsx';
export {
  Select,
  SelectValue,
  SelectGroup,
  SelectTrigger,
  SelectContent,
  SelectItem,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuLabel,
  MenuSeparator,
  MenuGroup,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverClose,
  TooltipProvider,
  Tip,
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogActions,
  ConfirmDialog,
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  DialogPrimitive,
  type ConfirmDialogProps,
  type DialogContentProps,
  type SheetContentProps,
  type TipProps,
} from './overlay.tsx';
export { Tabs, TabsList, TabsTrigger, TabsContent, Segmented, Chip, type SegmentedOption, type ChipProps } from './tabs.tsx';
export {
  Pill,
  Kbd,
  Notice,
  Empty,
  ErrorBlock,
  Skeleton,
  RowsSkeleton,
  ProgressLine,
  LoadingLine,
  Segments,
  Avatar,
  avatarTopic,
  initialsOf,
  LevelBars,
  type Tone,
  type SegmentState,
} from './feedback.tsx';
export { Page, PageHeader, BackLink, Section, SummaryList, RowList, Row, RowMeta, TopicGlyph, type RowProps } from './layout.tsx';
export { Table, THead, TBody, TR, TH, TD } from './table.tsx';
export { Pager, type PagerProps } from './pager.tsx';
export { Toaster, toast } from './toast.tsx';
export { LogoMark, Wordmark, StepStrip, BootLog, Stamp, type StepItem, type StepState, type BootLine, type BootState } from './marks.tsx';
export { PaneGroup, Pane, PaneHandle, useDefaultLayout, useGroupRef, usePanelRef } from './panes.tsx';
export { CommandPalette, foldVietnamese, type CommandEntry, type CommandGroupSpec } from './command.tsx';
export { SectionArt, GameArt, EmptyArt, type SectionArtKind, type GameArtKind, type EmptyArtKind } from './art/index.ts';
