import type { ReactElement, ReactNode } from 'react';
import { cn } from '@devops-platform/ds';

export type InlineNumTone = 'ink' | 'acc' | 'ok' | 'warn' | 'bad';

const TONE: Readonly<Record<InlineNumTone, string>> = {
  ink: 'text-ink',
  acc: 'text-acc-ink',
  ok: 'text-ok-ink',
  warn: 'text-warn-ink',
  bad: 'text-bad-ink',
};

/**
 * Một con số nằm trong câu của trang quản trị ("còn 18/30 chỗ"): chữ hiển thị, chữ số đều
 * rộng, màu theo nghĩa. Màu không mang nghĩa một mình: câu bao quanh đã nói số đó là gì.
 */
export function InlineNum({ children, tone = 'ink' }: { readonly children: ReactNode; readonly tone?: InlineNumTone }): ReactElement {
  return <span className={cn('font-display font-semibold tabular-nums', TONE[tone])}>{children}</span>;
}
