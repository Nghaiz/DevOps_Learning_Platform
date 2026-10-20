'use client';

import type { ReactNode } from 'react';
import { Command } from 'cmdk';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';
import { Kbd } from './feedback.tsx';

/** Bỏ dấu tiếng Việt và hạ chữ thường, để gõ "bai hoc" vẫn ra "Bài học". */
export function foldVietnamese(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function vietnameseFilter(value: string, search: string, keywords?: string[]): number {
  const haystack = foldVietnamese([value, ...(keywords ?? [])].join(' '));
  const needle = foldVietnamese(search).trim();
  if (needle.length === 0) return 1;
  if (haystack.startsWith(needle)) return 1;
  if (haystack.includes(needle)) return 0.8;
  const words = needle.split(/\s+/);
  return words.every((word) => haystack.includes(word)) ? 0.5 : 0;
}

export interface CommandEntry {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly icon: IconName;
  readonly keywords?: readonly string[];
  /** `data-section` của mục cha, để biểu tượng lấy đúng màu mục. */
  readonly section?: string;
  readonly onSelect: () => void;
}

export interface CommandGroupSpec {
  readonly heading: string;
  readonly entries: readonly CommandEntry[];
}

export interface CommandPaletteProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label: string;
  readonly placeholder: string;
  readonly emptyText: ReactNode;
  readonly groups: readonly CommandGroupSpec[];
  readonly footer?: ReactNode;
}

/**
 * Bảng lệnh (Ctrl K). Mở/đóng KHÔNG có hiệu ứng: đây là thao tác bàn phím lặp lại
 * nhiều lần, hiệu ứng chỉ làm nó chậm đi.
 */
export function CommandPalette({ open, onOpenChange, label, placeholder, emptyText, groups, footer }: CommandPaletteProps) {
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={label}
      filter={vietnameseFilter}
      overlayClassName="fixed inset-0 z-50 bg-overlay/45"
      contentClassName={cn(
        'fixed left-1/2 top-[12vh] z-50 flex w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden',
        'rounded-xl border border-rule bg-paper shadow-pop',
      )}
    >
      <div className="flex items-center gap-3 border-b border-rule px-4">
        <Icon name="search" size={18} className="text-ink-3" />
        <Command.Input
          placeholder={placeholder}
          className="h-12 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="relative max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain p-2">
        <Command.Empty className="px-3 py-8 text-center text-sm text-ink-2">{emptyText}</Command.Empty>
        {groups.map((group) => (
          <Command.Group
            key={group.heading}
            heading={group.heading}
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-3"
          >
            {group.entries.map((entry) => (
              <Command.Item
                key={entry.id}
                value={`${entry.label} ${entry.id}`}
                {...(entry.keywords === undefined ? {} : { keywords: [...entry.keywords] })}
                onSelect={entry.onSelect}
                data-section={entry.section}
                className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-ink data-[selected=true]:bg-acc-tint data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-control"
              >
                <Icon name={entry.icon} size={18} tint="acc" className="text-acc-ink" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{entry.label}</span>
                  {entry.hint === undefined ? null : <span className="truncate text-xs text-ink-3">{entry.hint}</span>}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
      {footer === undefined ? null : (
        <div className="flex items-center gap-4 border-t border-rule px-4 py-2 text-xs text-ink-3">{footer}</div>
      )}
    </Command.Dialog>
  );
}
