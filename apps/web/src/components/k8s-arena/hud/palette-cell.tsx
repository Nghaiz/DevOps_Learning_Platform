'use client';

import type { CSSProperties, ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@devops-platform/ui';
import type { PaletteEntry } from '../arena-contract';
import { RESOURCE_COLOR } from '../shared/resource-identity';
import { RESOURCE_ICON } from './resource-icon';
import { paletteHint } from './palette-entries';

export interface PaletteCellProps {
  readonly entry: PaletteEntry;
  /**
   * Loại này nằm trong `Level.allowedResources` — tức bài học đang xoay quanh nó.
   *
   * ⛔ ĐÂY LÀ MỘT CHỈ DẪN, KHÔNG PHẢI MỘT CÁI KHOÁ. Ô không được đánh dấu vẫn
   * bấm được, vẫn có phím tắt, vẫn tạo được tài nguyên. Xem chú thích của
   * `PaletteEntry` trong hợp đồng về chỉ đạo 2026-09-08.
   */
  readonly featured: boolean;
  readonly onPick: () => void;
}

/**
 * Một ô công cụ. LUÔN bấm được.
 *
 * Bản trước nhận `enabled` và, khi `false`, bỏ hẳn `onClick` rồi hiện dòng *"Bài
 * này chưa mở loại tài nguyên này."*. Chủ dự án bác bỏ hẳn cơ chế đó. Thứ còn
 * lại là một dấu nhấn nhẹ trên các loại bài học đang nói tới — đủ để người mới
 * biết bắt đầu từ đâu, không đủ để chặn ai.
 */
export function PaletteCell({ entry, featured, onPick }: PaletteCellProps): ReactElement {
  const Icon = RESOURCE_ICON[entry.kind];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onPick}
          style={{ '--resource-color': RESOURCE_COLOR[entry.kind] } as CSSProperties}
          className={cn('arena-tool', featured && 'arena-tool-featured')}
        >
          <span className="arena-tool-symbol">
            <Icon className="size-5" strokeWidth={1.65} aria-hidden />
          </span>
          <span className="w-full truncate text-center">{entry.short}</span>
          {entry.hotkey === null ? null : (
            <kbd aria-hidden className="arena-tool-key">
              {entry.hotkey}
            </kbd>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        <span className="font-semibold" style={{ color: RESOURCE_COLOR[entry.kind] }}>
          {entry.full}
        </span>
        {entry.hotkey === null ? null : (
          <span className="ml-1 opacity-70">· phím {entry.hotkey}</span>
        )}
        <p className="mt-1 opacity-90">{paletteHint(entry.kind)}</p>
        {featured ? <p className="mt-1 text-[11px] opacity-80">Bài này xoay quanh nó.</p> : null}
      </TooltipContent>
    </Tooltip>
  );
}
