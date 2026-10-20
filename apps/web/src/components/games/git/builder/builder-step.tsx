/**
 * Một bước của Builder: số hiệu vuông màu tuyến Git, tên bước, câu dẫn, nội dung.
 *
 * ## Vì sao không dùng thẳng `Split`/`Section` của kit
 *
 * Builder sống trong bảng công cụ bên phải màn sandbox, rộng khoảng 430px trên
 * màn desktop. `Split` của kit chia cột theo breakpoint của VIEWPORT, nên ở
 * desktop nó sẽ ép cột nhãn và cột nội dung vào 430px đó; `Section` mang nhịp
 * dọc của một trang (`py-12 md:py-16`). Bước ở đây giữ đúng ngôn ngữ của hai
 * mẫu đó (số hiệu, nhãn mono, đường kẻ mảnh) ở cỡ một bảng công cụ.
 *
 * Bước 11 (lưu bài tập) mang màu đỏ PTIT thay cho cam Git: đó là chỗ DUY NHẤT
 * của Builder chạm máy chủ, và đỏ là màu của trạm kiểm (design-brief §1).
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { cn } from '@devops-platform/ui';

/**
 * Nền cam của tuyến Git cho nút chính của một bước. Đè lên biến thể `primary`
 * của `Button`; `cn` (tailwind-merge) bỏ `bg-primary` đi nên không có hai nền.
 */
export const GIT_FILL = 'bg-line-git text-line-git-foreground hover:brightness-95';

export type StepAccent = 'git' | 'primary';

const ACCENT: Record<StepAccent, string> = {
  git: 'bg-line-git text-line-git-foreground',
  primary: 'bg-primary text-primary-foreground',
};

export interface BuilderStepProps {
  /** Thứ tự hiện trên màn, in thành `01`, `02`... và làm nhịp xuất hiện lệch. */
  readonly index: number;
  /** Id của tiêu đề, để `<section aria-labelledby>` có tên. */
  readonly id: string;
  readonly title: string;
  readonly lead?: string;
  readonly leadTestId?: string;
  readonly accent?: StepAccent;
  readonly testId?: string;
  readonly children: ReactNode;
}

export function BuilderStep({
  index,
  id,
  title,
  lead,
  leadTestId,
  accent = 'git',
  testId,
  children,
}: BuilderStepProps): ReactElement {
  return (
    <section
      aria-labelledby={id}
      data-testid={testId}
      className="stagger flex animate-rise flex-col gap-4 border-t border-border pt-5"
      style={{ '--i': index } as CSSProperties}
    >
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'flex size-9 shrink-0 items-center justify-center font-mono text-sm font-medium tabular-nums',
            ACCENT[accent],
          )}
        >
          {String(index).padStart(2, '0')}
        </span>
        <h2 id={id} className="type-title min-w-0 text-foreground">
          {title}
        </h2>
      </header>
      {lead !== undefined && (
        <p data-testid={leadTestId} className="text-sm leading-relaxed text-muted-foreground">
          {lead}
        </p>
      )}
      {children}
    </section>
  );
}
