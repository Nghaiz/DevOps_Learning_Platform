import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';

// ── Pill: trạng thái trong dòng ─────────────────────────────────────────────
export type Tone = 'neutral' | 'acc' | 'ok' | 'warn' | 'bad' | 'info' | 'topic';

const PILL_TONE: Record<Tone, string> = {
  neutral: 'bg-well-2 text-ink-2',
  acc: 'bg-acc-tint text-acc-ink',
  ok: 'bg-ok-tint text-ok-ink',
  warn: 'bg-warn-tint text-warn-ink',
  bad: 'bg-bad-tint text-bad-ink',
  info: 'bg-info-tint text-info-ink',
  topic: 'bg-tp-tint text-tp-ink',
};

const DOT_TONE: Record<Tone, string> = {
  neutral: 'bg-ink-3',
  acc: 'bg-acc-solid',
  ok: 'bg-ok-solid',
  warn: 'bg-warn-solid',
  bad: 'bg-bad-solid',
  info: 'bg-info-solid',
  topic: 'bg-tp-solid',
};

export interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: Tone;
  readonly icon?: IconName;
  /** Chấm tròn nhỏ trước chữ, cho trạng thái "đang sống" (đang chạy, đang mở). */
  readonly dot?: boolean;
  readonly live?: boolean;
}

/** Nền nhạt, chữ đậm cùng sắc. Không co lại, không xuống dòng. */
export function Pill({ tone = 'neutral', icon, dot = false, live = false, className, children, ...rest }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium',
        PILL_TONE[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', DOT_TONE[tone], live && 'animate-breathe')} /> : null}
      {icon === undefined ? null : <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

// ── Kbd ─────────────────────────────────────────────────────────────────────
export function Kbd({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-rule-2 bg-paper px-1 font-mono text-[11px] text-ink-2 shadow-[0_1px_0_var(--rule-2)]',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ── Notice: thông báo trong khối ────────────────────────────────────────────
const NOTICE: Record<'info' | 'ok' | 'warn' | 'bad', { box: string; icon: IconName }> = {
  info: { box: 'bg-info-wash text-info-ink', icon: 'info' },
  ok: { box: 'bg-ok-wash text-ok-ink', icon: 'success' },
  warn: { box: 'bg-warn-wash text-warn-ink', icon: 'warning' },
  bad: { box: 'bg-bad-wash text-bad-ink', icon: 'danger' },
};

export interface NoticeProps {
  readonly tone?: 'info' | 'ok' | 'warn' | 'bad';
  readonly title?: ReactNode;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
  /** `alert` cho lỗi vừa xảy ra do thao tác của người dùng; còn lại để mặc định. */
  readonly role?: 'alert' | 'status';
}

export function Notice({ tone = 'info', title, children, action, className, role }: NoticeProps) {
  const spec = NOTICE[tone];
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-md px-4 py-3 text-sm', spec.box, className)}>
      <Icon name={spec.icon} size={18} className="mt-px" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title === undefined ? null : <p className="font-medium">{title}</p>}
        {children === undefined ? null : <div className="text-ink-2 [&_a]:text-current [&_a]:underline">{children}</div>}
      </div>
      {action === undefined ? null : <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

// ── Empty: khối rỗng giữ khung, một câu và một việc tiếp theo ───────────────
export interface EmptyProps {
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly art?: ReactNode;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}

export function Empty({ title, children, action, art, className, size = 'md' }: EmptyProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex items-center gap-6 rounded-lg bg-acc-wash',
        size === 'sm' ? 'px-5 py-4' : 'px-6 py-7',
        className,
      )}
    >
      {art === undefined ? null : <div className="hidden shrink-0 text-acc-mid sm:block">{art}</div>}
      <div className="flex min-w-0 flex-col items-start gap-2">
        <p className={cn('font-display font-semibold text-ink', size === 'sm' ? 'text-base' : 'text-lg')}>{title}</p>
        {children === undefined ? null : <div className="max-w-[60ch] text-sm text-ink-2">{children}</div>}
        {action === undefined ? null : <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

// ── ErrorBlock: lỗi nằm trong khối bị lỗi ───────────────────────────────────
export interface ErrorBlockProps {
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
  readonly retrying?: boolean;
  /** Lối thoát khác ngoài "Thử lại" (về danh sách, về trang đầu), đứng cạnh nút đó. */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function ErrorBlock({ title, children, onRetry, retryLabel, retrying = false, actions, className }: ErrorBlockProps) {
  const retry =
    onRetry === undefined || retryLabel === undefined ? null : (
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-rule-2 bg-paper px-3 text-sm font-medium text-ink transition-colors hover:bg-well disabled:opacity-60"
      >
        <Icon name="refresh" size={16} className={cn(retrying && 'animate-breathe')} />
        {retryLabel}
      </button>
    );
  return (
    <div role="alert" className={cn('flex flex-wrap items-start gap-3 rounded-lg bg-bad-wash px-5 py-4', className)}>
      <Icon name="unplug" size={20} className="mt-0.5 text-bad-ink" />
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <p className="font-medium text-bad-ink">{title}</p>
        {children === undefined ? null : <div className="text-sm text-ink-2">{children}</div>}
      </div>
      {retry === null && actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2 self-center">
          {retry}
          {actions}
        </div>
      )}
    </div>
  );
}

// ── Skeleton: thanh xám đúng kích thước nội dung thật ───────────────────────
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('rounded-xs bg-well-2 animate-breathe', className)} {...rest} />;
}

/** Khung chờ cho một danh sách dòng: giữ đúng nhịp dòng để không nhảy khi dữ liệu về. */
export function RowsSkeleton({ rows = 5, label, className }: { rows?: number; label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-rule py-4">
          <Skeleton className="size-9 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-[38%]" style={{ width: `${30 + ((index * 17) % 28)}%` }} />
            <Skeleton className="h-3 w-[56%]" style={{ width: `${44 + ((index * 23) % 30)}%` }} />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

// ── Thanh tiến độ ───────────────────────────────────────────────────────────
export interface ProgressLineProps {
  /** 0..1. `null` = chưa biết, vẽ vạch chạy thay vì một con số bịa. */
  readonly value: number | null;
  readonly label: string;
  readonly tone?: 'acc' | 'ok' | 'warn' | 'bad' | 'topic';
  readonly size?: 'xs' | 'sm' | 'md';
  readonly className?: string;
  /** Chữ hiện bên phải ("7/12 bài"). */
  readonly caption?: ReactNode;
  /**
   * `progressbar` cho việc ĐANG chạy tới đích (tải, làm bài); `meter` cho một số đo
   * tại chỗ (điểm, số bước đã đạt). Trình đọc màn hình đọc hai vai này khác nhau.
   */
  readonly role?: 'progressbar' | 'meter';
}

const FILL: Record<NonNullable<ProgressLineProps['tone']>, string> = {
  acc: 'bg-acc-solid',
  ok: 'bg-ok-solid',
  warn: 'bg-warn-solid',
  bad: 'bg-bad-solid',
  topic: 'bg-tp-solid',
};

export function ProgressLine({ value, label, tone = 'acc', size = 'sm', className, caption, role = 'progressbar' }: ProgressLineProps) {
  const height = size === 'xs' ? 'h-1' : size === 'md' ? 'h-2' : 'h-1.5';
  const ratio = value === null ? null : Math.min(1, Math.max(0, value));
  const bar = (
    <div
      role={role}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(ratio === null ? {} : { 'aria-valuenow': Math.round(ratio * 100) })}
      className={cn('relative w-full overflow-hidden rounded-full bg-well-2', height)}
    >
      {ratio === null ? (
        <span className={cn('absolute inset-y-0 left-0 w-1/3 animate-sweep rounded-full', FILL[tone])} />
      ) : ratio === 0 ? null : (
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out', FILL[tone])}
          style={{ width: `${ratio * 100}%` }}
        />
      )}
    </div>
  );
  if (caption === undefined) return <div className={className}>{bar}</div>;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="min-w-0 flex-1">{bar}</div>
      <span className="shrink-0 text-xs tabular-nums text-ink-2">{caption}</span>
    </div>
  );
}

/** Thanh mảnh chạy ở mép trên khi trang hoặc một khối đang tải lại. */
export function LoadingLine({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={cn('pointer-events-none h-0.5 w-full overflow-hidden', className)}>
      <span className="block h-full w-1/3 animate-sweep bg-acc-solid" />
    </div>
  );
}

// ── Segments: tiến độ theo từng phần (bước, nhiệm vụ) ───────────────────────
export type SegmentState = 'done' | 'current' | 'failed' | 'todo';

const SEGMENT: Record<SegmentState, string> = {
  done: 'bg-ok-solid',
  current: 'bg-acc-solid',
  failed: 'bg-bad-solid',
  todo: 'bg-well-2',
};

export function Segments({
  states,
  label,
  className,
}: {
  states: readonly SegmentState[];
  label: string;
  className?: string;
}) {
  const done = states.filter((state) => state === 'done').length;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={states.length}
      aria-valuenow={done}
      className={cn('flex items-center gap-1', className)}
    >
      {states.map((state, index) => (
        <span
          key={index}
          className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', SEGMENT[state])}
        />
      ))}
    </div>
  );
}

// ── Avatar: chữ cái đầu, mỗi người một sắc nhạt cố định ─────────────────────
const AVATAR_TOPICS = ['docker', 'cicd', 'git', 'observability', 'linux', 'networking', 'kubernetes', 'iac'] as const;

export function avatarTopic(seed: string): (typeof AVATAR_TOPICS)[number] {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return AVATAR_TOPICS[hash % AVATAR_TOPICS.length] ?? 'docker';
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const last = words[words.length - 1] ?? '';
  const first = words.length > 1 ? (words[0] ?? '') : '';
  return `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase('vi');
}

export function Avatar({ name, seed, size = 32, className }: { name: string; seed?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-topic={avatarTopic(seed ?? name)}
      className={cn('inline-grid shrink-0 place-items-center rounded-full bg-tp-tint font-medium text-tp-ink', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * Độ khó: các vạch cao dần (ba, hoặc bốn cho kho đề có mức "chuyên sâu"), vạch đã tới
 * tô màu mục, rồi chữ. Chữ luôn đi kèm vì vạch một mình không đọc được bằng trình đọc
 * màn hình.
 */
export function LevelBars({
  level,
  label,
  max = 3,
  className,
}: {
  level: number;
  label: string;
  max?: 3 | 4;
  className?: string | undefined;
}) {
  const steps = max === 4 ? ([1, 2, 3, 4] as const) : ([1, 2, 3] as const);
  const height = max === 4 ? ['h-1.5', 'h-2', 'h-2.5', 'h-3.5'] : ['h-1.5', 'h-2.5', 'h-3.5'];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span aria-hidden="true" className="flex items-end gap-[2px]">
        {steps.map((step, index) => (
          <span
            key={step}
            className={cn('w-[3px] rounded-[1px]', height[index], step <= level ? 'bg-acc-solid' : 'bg-rule-2')}
          />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}
