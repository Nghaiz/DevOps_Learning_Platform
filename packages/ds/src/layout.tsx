import { forwardRef, type AnchorHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';

/** Khung nội dung: một cột 1200px, lề 16/24/32 theo bề rộng. */
export function Page({ className, children, width = 'wide' }: { className?: string; children: ReactNode; width?: 'wide' | 'text' | 'full' }) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        width === 'wide' && 'max-w-[1200px]',
        width === 'text' && 'max-w-[760px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface PageHeaderProps {
  readonly title: ReactNode;
  readonly lead?: ReactNode;
  readonly actions?: ReactNode;
  /** Dòng nhỏ trên tiêu đề cho trang chi tiết: đường dẫn ngược về danh sách. */
  readonly back?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly size?: 'md' | 'lg';
}

/** Đầu trang: một h1 duy nhất. Không nhãn in hoa phía trên, không số thứ tự. */
export function PageHeader({ title, lead, actions, back, children, className, size = 'md' }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-4 pb-6 pt-8 sm:pt-10', className)}>
      {back === undefined ? null : <div className="-mb-1">{back}</div>}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1
            className={cn(
              'font-display font-semibold tracking-[-0.015em] text-ink',
              size === 'lg' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl',
            )}
          >
            {title}
          </h1>
          {lead === undefined ? null : <p className="max-w-[64ch] text-md text-ink-2">{lead}</p>}
        </div>
        {actions === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/**
 * Liên kết quay lại ở đầu trang chi tiết. `asChild` để bọc `<Link>` của Next: mũi tên
 * chui vào trong thẻ `<a>` của nó.
 */
export const BackLink = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement> & { readonly asChild?: boolean }
>(function BackLink({ className, children, asChild = false, ...rest }, ref) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      ref={ref}
      className={cn('group inline-flex items-center gap-1.5 text-sm text-ink-2 transition-colors hover:text-ink', className)}
      {...rest}
    >
      <Icon name="arrow-left" size={16} className="transition-transform duration-150 group-hover:-translate-x-0.5" />
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : children}
    </Comp>
  );
});

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  readonly title: ReactNode;
  readonly aside?: ReactNode;
  readonly description?: ReactNode;
  readonly level?: 2 | 3;
  readonly icon?: IconName;
}

/** Một khối trong trang: tiêu đề h2 (hoặc h3), phần phụ bên phải, rồi nội dung. */
export function Section({ title, aside, description, level = 2, icon, className, children, ...rest }: SectionProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section className={cn('flex flex-col gap-4', className)} {...rest}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading
            className={cn(
              'flex items-center gap-2 font-display font-semibold text-ink',
              level === 2 ? 'text-xl' : 'text-lg',
            )}
          >
            {icon === undefined ? null : <Icon name={icon} size={20} tint="acc" className="text-acc-ink" />}
            {title}
          </Heading>
          {description === undefined ? null : <p className="max-w-[70ch] text-sm text-ink-2">{description}</p>}
        </div>
        {aside === undefined ? null : <div className="flex shrink-0 items-center gap-2 text-sm">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** Danh sách cặp nhãn / giá trị (thông tin của một đối tượng). */
export function SummaryList({
  items,
  className,
  columns = 1,
}: {
  items: readonly { label: ReactNode; value: ReactNode; key?: string }[];
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <dl className={cn('grid gap-x-8', columns === 2 && 'sm:grid-cols-2', className)}>
      {items.map((item, index) => (
        <div
          key={item.key ?? index}
          className="grid grid-cols-[minmax(7rem,38%)_1fr] items-baseline gap-4 border-b border-rule py-2.5 text-sm"
        >
          <dt className="text-ink-3">{item.label}</dt>
          <dd className="min-w-0 text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Danh sách dòng ──────────────────────────────────────────────────────────

export function RowList({ className, children, label }: { className?: string; children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className={cn('flex flex-col', className)}>
      {children}
    </ul>
  );
}

export interface RowProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Khối nằm dưới mô tả (dải tiến độ, danh sách nhỏ), không bị cắt dòng như mô tả. */
  readonly below?: ReactNode;
  readonly leading?: ReactNode;
  /** Các cột phụ cố định bên phải (độ khó, thời lượng, trạng thái). */
  readonly meta?: ReactNode;
  readonly trailing?: ReactNode;
  readonly topic?: string;
  readonly className?: string;
  /** Link phủ cả dòng: truyền một phần tử `<a>`/`<Link>` đã có `href`, nội dung là tiêu đề. */
  readonly link?: ReactNode;
  readonly current?: boolean;
  readonly dense?: boolean;
}

/**
 * Một dòng của danh sách. Cả dòng bấm được (link phủ qua lớp `::after` của tiêu đề), rê vào
 * thì tiêu đề đổi sang màu mục. Dòng phẳng: chỉ đường kẻ 1px ở đáy, thẳng mép với cột nội dung,
 * không bo góc, không nền, không bóng. Dòng `current` (màn tiếp, bài đang làm) có ô vuông màu
 * mục trước tiêu đề, cùng dấu với mục đang mở trên thanh điều hướng.
 */
export function Row({ title, description, below, leading, meta, trailing, topic, className, link, current = false, dense = false }: RowProps) {
  return (
    <li
      data-topic={topic}
      data-current={current || undefined}
      className={cn(
        'group relative flex items-center gap-4 border-b border-rule transition-colors duration-150',
        dense ? 'py-2.5' : 'py-3.5',
        className,
      )}
    >
      {leading === undefined ? null : <div className="shrink-0">{leading}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-baseline gap-2">
          {current ? <span aria-hidden className="size-2 shrink-0 -translate-y-px self-center bg-acc-solid" /> : null}
          <div
            className={cn(
              'line-clamp-2 min-w-0 font-medium text-ink transition-colors group-hover:text-acc-ink group-data-[current]:text-acc-ink',
              '[&_a]:outline-none [&_a]:after:absolute [&_a]:after:inset-0 [&_a:focus-visible]:after:outline-2 [&_a:focus-visible]:after:outline-focus',
              dense ? 'text-sm' : 'text-base',
            )}
          >
            {link ?? title}
          </div>
        </div>
        {description === undefined ? null : <p className="line-clamp-2 text-sm text-ink-2">{description}</p>}
        {below === undefined ? null : <div className="pt-1.5">{below}</div>}
      </div>
      {meta === undefined ? null : <div className="hidden shrink-0 items-center gap-6 text-sm text-ink-2 md:flex">{meta}</div>}
      {trailing === undefined ? null : <div className="relative z-10 shrink-0">{trailing}</div>}
    </li>
  );
}

/** Một cột phụ có độ rộng cố định trong dòng, để các dòng thẳng cột với nhau. */
export function RowMeta({ children, width = 'w-24', className }: { children: ReactNode; width?: string; className?: string }) {
  return <span className={cn('flex items-center gap-1.5 whitespace-nowrap tabular-nums', width, className)}>{children}</span>;
}

/** Ô biểu tượng chủ đề ở đầu dòng: biểu tượng tô theo màu chủ đề, không có ô nền. */
export function TopicGlyph({ topic, icon, size = 28 }: { topic: string; icon: IconName; size?: number }) {
  return (
    <span data-topic={topic} className="grid place-items-center text-tp-ink">
      <Icon name={icon} size={size} tint="topic" />
    </span>
  );
}
