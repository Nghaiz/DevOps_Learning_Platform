'use client';

import type { ReactElement } from 'react';
import { Check, CircleDashed, LoaderCircle, PencilLine, TriangleAlert } from 'lucide-react';
import { cn } from '@devops-platform/ui';
import { t, type StaticTextKey } from '@devops-platform/copy';
import type { SaveStatus } from './save-status';

const SAVE_KEYS: Readonly<Record<SaveStatus, StaticTextKey>> = {
  new: 'author.studio.save.new',
  saved: 'author.studio.save.saved',
  unsaved: 'author.studio.save.unsaved',
  saving: 'author.studio.save.saving',
  error: 'author.studio.save.error',
};

/*
 * Chuỗi class viết THẲNG từng cái: Tailwind chỉ sinh luật cho class nó đọc thấy
 * nguyên văn, nên ghép `bg-${tone}` cho ra một ô không màu mà không ai báo.
 */
const TONE: Readonly<Record<SaveStatus, string>> = {
  new: 'border border-border text-muted-foreground',
  saved: 'bg-success/10 text-success',
  unsaved: 'bg-signal text-signal-foreground',
  saving: 'bg-muted text-foreground',
  error: 'bg-destructive/10 text-destructive',
};

const ICON = {
  new: CircleDashed,
  saved: Check,
  unsaved: PencilLine,
  saving: LoaderCircle,
  error: TriangleAlert,
} as const satisfies Record<SaveStatus, unknown>;

/**
 * Ô "Đã lưu / Chưa lưu / Đang lưu" ở đầu trình soạn.
 *
 * `role="status"` để trình đọc màn hình đọc lại khi nó đổi, không cần ai chuyển
 * focus. Chữ luôn đi kèm biểu tượng, nên màu không phải kênh duy nhất mang nghĩa.
 */
export function SaveState({ status }: { readonly status: SaveStatus }): ReactElement {
  const Icon = ICON[status];
  return (
    <span
      role="status"
      data-save-status={status}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 px-2.5 font-mono text-xs font-medium transition-colors duration-200',
        TONE[status],
      )}
    >
      <Icon
        aria-hidden
        className={cn('size-3.5 shrink-0', status === 'saving' && 'motion-safe:animate-spin')}
      />
      {t(SAVE_KEYS[status])}
    </span>
  );
}
