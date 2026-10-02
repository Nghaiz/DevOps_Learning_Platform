import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { LINE_CLASSES, LineMarker, Skeleton, cn, type LineMarkerState } from '@devops-platform/ui';
import type { TopicLine } from '../../lib/topic-line';
import { staggerStyle } from './page';

/**
 * Bảng tuyến kiểu bảng giờ tàu (design-brief §4.3): danh sách mặc định của mọi
 * trang. Mỗi dòng là MỘT liên kết/nút: số thứ tự, dấu tuyến, tên + một dòng phụ,
 * thông tin mono, trạng thái, mũi tên. Rê vào thì màu tuyến quét từ trái sang.
 */
export function Board({
  label,
  children,
  className,
}: {
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <ol aria-label={label} className={cn('border-y border-border', className)}>
      {children}
    </ol>
  );
}

const TINT: Readonly<Record<TopicLine, string>> = {
  linux: 'var(--line-linux)',
  docker: 'var(--line-docker)',
  k8s: 'var(--line-k8s)',
  git: 'var(--line-git)',
  cicd: 'var(--line-cicd)',
  net: 'var(--line-net)',
  obs: 'var(--line-obs)',
  sec: 'var(--line-sec)',
  iac: 'var(--line-iac)',
  ink: 'var(--foreground)',
};

export function lineTint(line: TopicLine): string {
  return TINT[line];
}

/** Dấu tuyến: ô vuông màu tuyến, hoặc ô mực khi chưa xác định tuyến. */
export function StationMarker({
  line,
  state = 'todo',
  className,
}: {
  readonly line: TopicLine;
  readonly state?: LineMarkerState | undefined;
  readonly className?: string | undefined;
}) {
  if (line === 'ink') {
    return <span aria-hidden="true" className={cn('inline-block size-3 shrink-0 border-2 border-foreground', className)} />;
  }
  return <LineMarker line={line} state={state} className={className} />;
}

export interface BoardRowProps {
  readonly href?: string;
  readonly onClick?: () => void;
  readonly index?: number;
  readonly line?: TopicLine;
  readonly lineState?: LineMarkerState;
  readonly title: ReactNode;
  readonly sub?: ReactNode;
  readonly meta?: ReactNode;
  readonly state?: ReactNode;
  readonly disabled?: boolean;
  /** Vị trí trong danh sách, cho hiệu ứng vào trang lần lượt. */
  readonly order?: number;
}

export function BoardRow({
  href,
  onClick,
  index,
  line = 'ink',
  lineState,
  title,
  sub,
  meta,
  state,
  disabled = false,
  order = 0,
}: BoardRowProps) {
  const body = (
    <>
      {index !== undefined && (
        <span className="w-10 shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
          {String(index).padStart(2, '0')}
        </span>
      )}
      <StationMarker line={line} state={lineState} className="mt-1.5 self-start md:mt-0 md:self-center" />
      <span className="min-w-0 flex-1">
        <span className="block type-title">{title}</span>
        {sub && <span className="mt-1 block text-sm text-muted-foreground">{sub}</span>}
        {meta && <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 md:hidden">{meta}</span>}
      </span>
      {meta && <span className="hidden shrink-0 flex-wrap items-center justify-end gap-x-5 md:flex">{meta}</span>}
      {state && <span className="shrink-0">{state}</span>}
      {!disabled && <ArrowRight data-row-arrow className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
    </>
  );
  const rowClass = cn(
    'flex w-full items-start gap-4 px-2 py-5 text-left md:items-center md:px-4',
    disabled ? 'opacity-60' : 'interactive-row',
  );
  return (
    <li className="stagger animate-rise border-b border-border last:border-b-0" style={staggerStyle(order, TINT[line])}>
      {href && !disabled ? (
        <Link href={href} className={rowClass}>
          {body}
        </Link>
      ) : onClick && !disabled ? (
        <button type="button" onClick={onClick} className={rowClass}>
          {body}
        </button>
      ) : (
        <div className={rowClass} aria-disabled={disabled || undefined}>
          {body}
        </div>
      )}
    </li>
  );
}

/** Một mẩu thông tin mono trong dòng: nhãn nhỏ + giá trị. */
export function BoardMeta({ label, children }: { readonly label?: string; readonly children: ReactNode }) {
  return (
    <span className="flex items-baseline gap-1.5 text-sm">
      {label && <span className="type-label text-muted-foreground">{label}</span>}
      <span className="font-mono tabular-nums">{children}</span>
    </span>
  );
}

/** Khung chờ có hình đúng như một dòng thật, không phải spinner. */
export function BoardSkeleton({ rows = 6, label }: { readonly rows?: number; readonly label: string }) {
  return (
    <ol aria-label={label} aria-busy="true" className="border-y border-border">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-4 border-b border-border px-4 py-5 last:border-b-0">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="size-3" />
          <span className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </span>
          <Skeleton className="hidden h-4 w-40 md:block" />
        </li>
      ))}
    </ol>
  );
}

export function lineFillClass(line: TopicLine): string {
  return line === 'ink' ? 'bg-ink text-ink-foreground' : LINE_CLASSES[line].fill;
}
