'use client';

/**
 * Khung chung của một lớp phủ trên sân chơi CI/CD (19.D.4.1).
 *
 * Mượn ngôn ngữ thị giác của `k8s-arena/hud/inspector-frame.tsx` (quyết định #2:
 * mượn token + khối, không chép nguyên bảng), và thi hành ĐÚNG hai luật bố cục
 * mà `arena-root.tsx` thi hành:
 *
 * 1. **Vỏ ngoài `pointer-events-none`, từng bảng tự bật `pointer-events-auto`.**
 *    Bỏ luật này thì một `div` trong suốt phủ toàn sân sẽ nuốt mọi cú bấm xuống
 *    cảnh — người chơi bấm vào một node và không có gì xảy ra. Vỏ là việc của
 *    `cicd-level-screen.tsx`; bảng này lo vế thứ hai.
 * 2. **Bảng không tồn tại khi đóng.** `return null`, KHÔNG phải thuộc tính
 *    `hidden`: `hidden` là luật của trình duyệt và THUA bất kỳ class `display`
 *    nào của tác giả (`.flex` chẳng hạn), nên phần tử vẫn hiện và không gì báo.
 *    Lỗi này đã cắn dự án này một lần.
 */

import type { ReactElement, ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';

export interface CicdHudPanelProps {
  readonly title: string;
  /** Đóng bảng. Mọi bảng đều đóng được — đó là hợp đồng, không phải tiện ích. */
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Lớp định vị của bảng (`absolute left-4 top-20 w-80`…). */
  readonly className?: string;
  /** Nút phụ trên thanh tiêu đề của bảng. */
  readonly actions?: ReactNode;
  readonly testId?: string;
  /**
   * Chiều cao tối đa của thân bảng. Mặc định để bảng tự co; bảng nào có nội dung
   * dài thật thì truyền một mức trần và thân sẽ cuộn.
   */
  readonly bodyClassName?: string;
}

export function CicdHudPanel({
  title,
  onClose,
  children,
  className,
  actions,
  testId,
  bodyClassName,
}: CicdHudPanelProps): ReactElement {
  return (
    <section
      className={cn(
        'pointer-events-auto flex animate-rise flex-col overflow-hidden border border-foreground bg-card text-card-foreground shadow-float',
        className,
      )}
      aria-label={title}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      <header className="flex shrink-0 items-center gap-2 bg-ink py-1 pr-1 pl-3 text-ink-foreground">
        <h2 className="min-w-0 flex-1 truncate type-label">
          {title}
        </h2>
        {actions}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('games.cicd.hud.close-panel', { title })}
          className="grid size-8 place-items-center text-ink-foreground/80 transition-colors hover:bg-ink-foreground/10 hover:text-ink-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </header>
      {/*
        `tabIndex={0}` là BẮT BUỘC, không phải trang trí: một vùng `overflow-y-auto`
        không focus được thì người dùng bàn phím không cuộn nó được — nội dung
        dưới nếp gấp là nội dung họ không với tới. axe gác việc này bằng luật
        `scrollable-region-focusable` (mức `serious`), và nó đã đỏ thật trên cả
        hai theme ở lượt e2e 2026-09-17.

        ⚠ Cặp `tabIndex` + `role="group"` + `aria-label` đi cùng nhau. Một phần tử
        nhận tiêu điểm mà không có tên thì trình đọc màn hình chỉ đọc "group", và
        người nghe không biết mình vừa dừng ở đâu — đúng lúc họ cần biết nhất, vì
        có nhiều bảng cùng mở.
      */}
      <div
        tabIndex={0}
        role="group"
        aria-label={title}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-3 py-3',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
