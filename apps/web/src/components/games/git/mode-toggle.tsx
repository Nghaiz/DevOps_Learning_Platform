'use client';

/**
 * Nút `[2D] / [3D]` ở THANH TRÊN (17.B.6).
 *
 * ⛔ **Không giấu trong cài đặt.** Đây là một câu trong plan, và nó có lý do:
 * 2D là chế độ NGANG HÀNG (design §2.3), mà một lựa chọn ngang hàng nằm sau hai
 * cú bấm thì trên thực tế không phải lựa chọn — nó là một tuỳ chọn dự phòng, và
 * người cần nó nhất (người dùng trình đọc màn hình, người đi in báo cáo) là
 * người ít có khả năng đi tìm nhất.
 *
 * ⛔ **Đợt này 3D CHƯA CÓ, và nút 3D vẫn hiện — ở trạng thái disabled.** Ẩn nó
 * đi rồi hiện lại khi 17.K xong là HAI lần đổi giao diện cho cùng một tính
 * năng: lần đầu người dùng học rằng chỉ có một chế độ, lần sau họ phải học lại.
 * Một nút xám kèm chữ "sắp có" nói đúng sự thật ngay từ đầu và không phải dạy
 * lại lần nào.
 *
 * ⚠ `disabled` trên `<button>` làm nó **biến mất khỏi thứ tự Tab**, nên lời giải
 * thích "sắp có" sẽ không tới được người dùng bàn phím. Dùng `aria-disabled`
 * cộng chặn `onClick`: nút vẫn focus được, vẫn đọc ra được, mà bấm không làm gì.
 * Đây là khuôn của WAI-ARIA cho nút "vô hiệu nhưng cần giải thích", không phải
 * một chỗ lách.
 */

import { type ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@devops-platform/ui';
import {
  RENDERER_MODES,
  rendererModeReasonText,
  type RendererMode,
  type ResolvedMode,
} from '../shared/renderer-mode.ts';

const MODE_TEXT: Readonly<Record<RendererMode, { readonly short: string; readonly full: string }>> =
  {
    '2d': { short: '2D', full: 'Sơ đồ 2D' },
    '3d': { short: '3D', full: 'Cảnh 3D' },
  };

export interface ModeToggleProps {
  readonly resolved: ResolvedMode;
  /** Chế độ nào bấm được. Đợt này `['2d']`; 17.K xong thì thành `['2d','3d']`. */
  readonly enabled: readonly RendererMode[];
  readonly onChange: (mode: RendererMode) => void;
}

export function ModeToggle({ resolved, enabled, onChange }: ModeToggleProps): ReactElement {
  /*
   * `TooltipProvider` ngay tại đây, dù thanh trên đã có một cái bọc ngoài.
   *
   * `Tooltip.Root` của Radix NÉM khi không tìm thấy provider nào, nên một
   * component tự bọc thì dùng được ở mọi chỗ — kể cả trong test, kể cả nếu lane
   * HUD sau này đặt nó ngoài thanh trên. Provider lồng nhau là hợp lệ ở Radix
   * và cái trong cùng thắng, nên không có tác dụng phụ nào.
   */
  return (
    <TooltipProvider delayDuration={300}>
      <div
        className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
        role="group"
        aria-label="Chế độ hiển thị đồ thị"
      >
        {RENDERER_MODES.map((mode) => {
          const usable = enabled.includes(mode);
          const active = resolved.mode === mode;
          const text = MODE_TEXT[mode];
          const why = usable
            ? active
              ? rendererModeReasonText(resolved)
              : `Chuyển sang ${text.full}.`
            : `${text.full} sắp có. Bản 2D là chế độ đầy đủ, không phải bản rút gọn.`;

          return (
            <Tooltip key={mode}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-disabled={!usable}
                  aria-label={`${text.full}${usable ? '' : ' — sắp có'}`}
                  title={why}
                  onClick={() => {
                    if (usable && !active) onChange(mode);
                  }}
                  className={cn(
                    'flex h-6 min-w-9 items-center justify-center rounded-sm px-1.5 font-mono text-[11px] font-semibold',
                    'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                    !usable
                      ? 'cursor-not-allowed text-muted-foreground/70'
                      : active
                        ? 'bg-background text-foreground shadow-elevation-1'
                        : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {text.short}
                </button>
              </TooltipTrigger>
              <TooltipContent>{why}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
