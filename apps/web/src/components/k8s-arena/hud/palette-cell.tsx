'use client';

import type { ReactElement } from 'react';
import { Boxes, Database, Network, Server, Settings } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@devops-platform/ui';
import type { PaletteEntry, PaletteGroup } from '../arena-contract.ts';
import { paletteHint } from './palette-entries.ts';

/**
 * Icon theo NHÓM chứ không theo từng loại.
 *
 * 26 icon riêng nghe hợp lý cho tới lúc vẽ thật: ở bề rộng 64px chỉ còn chỗ cho
 * một hình 16px, và 26 hình 16px khác nhau thì không hình nào đọc được — người
 * chơi quay lại đọc nhãn chữ. Icon theo nhóm thì làm đúng việc icon làm tốt:
 * chia bảng thành năm vùng nhận ra được từ khoé mắt, còn nhãn chữ định danh
 * từng ô.
 */
const GROUP_ICON: Readonly<Record<PaletteGroup, typeof Boxes>> = {
  workload: Boxes,
  network: Network,
  config: Settings,
  storage: Database,
  cluster: Server,
};

export interface PaletteCellProps {
  readonly entry: PaletteEntry;
  /** `false` = level không cho dùng loại này (`Level.allowedResources`). */
  readonly enabled: boolean;
  readonly onPick: () => void;
}

/** Một ô trong bảng tạo tài nguyên. */
export function PaletteCell({ entry, enabled, onPick }: PaletteCellProps): ReactElement {
  const Icon = GROUP_ICON[entry.group];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/*
          `aria-disabled` chứ KHÔNG phải thuộc tính `disabled`, và đây là quyết
          định có đánh đổi rõ ràng: một `<button disabled>` không phát
          pointerenter trên phần lớn trình duyệt và cũng rời khỏi thứ tự Tab —
          tức tooltip giải thích *vì sao* ô này bị chặn sẽ không bao giờ hiện ra,
          đúng lúc nó cần nhất. `aria-disabled` giữ ô ở lại trong luồng bàn phím
          và vẫn báo cho trình đọc màn hình là không dùng được; chặn hành động
          thì làm bằng guard ở `onClick` ngay dưới.
        */}
        <button
          type="button"
          aria-disabled={!enabled}
          onClick={enabled ? onPick : undefined}
          className={cn(
            'relative flex w-13 flex-col items-center gap-0.5 rounded-md border border-transparent px-1 py-1.5',
            'text-[10px] font-medium transition-colors outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring',
            enabled
              ? 'text-foreground hover:border-border hover:bg-accent hover:text-accent-foreground'
              : 'cursor-not-allowed text-muted-foreground opacity-45',
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="w-full truncate text-center">{entry.short}</span>
          {entry.hotkey === null ? null : (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 font-mono text-[9px] leading-none text-muted-foreground"
            >
              {entry.hotkey}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-64">
        <span className="font-semibold">{entry.full}</span>
        {entry.hotkey === null ? null : <span className="ml-1 opacity-70">· phím {entry.hotkey}</span>}
        <p className="mt-1 opacity-90">{paletteHint(entry.kind)}</p>
        {enabled ? null : <p className="mt-1 opacity-90">Bài này chưa mở loại tài nguyên này.</p>}
      </TooltipContent>
    </Tooltip>
  );
}
