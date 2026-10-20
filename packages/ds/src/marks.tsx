'use client';

import type { ReactNode } from 'react';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';

// ── Dấu nhận diện ───────────────────────────────────────────────────────────
/**
 * Ô vuông bo mực đậm với dấu nhắc lệnh, con trỏ màu cúc vạn thọ. Con trỏ nhấp nháy
 * khi rê vào logo; lúc thường đứng yên để không kéo mắt khỏi nội dung.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      width={size}
      height={size}
      aria-hidden
      className={cn('group/logo shrink-0', className)}
    >
      <rect x="0" y="0" width="28" height="28" rx="7.5" className="fill-ink" />
      <path
        d="M7.5 9.25l5 4.75-5 4.75"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-canvas"
      />
      <rect x="14.75" y="16.4" width="6.25" height="2.6" rx="1.1" className="fill-[var(--mark)] group-hover/logo:animate-caret" />
    </svg>
  );
}

export function Wordmark({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
    </span>
  );
}

// ── Dải bước (bài học) ──────────────────────────────────────────────────────
export type StepState = 'done' | 'current' | 'todo' | 'failed';

export interface StepItem {
  readonly key: string;
  readonly label: string;
  readonly state: StepState;
}

export interface StepStripProps {
  readonly steps: readonly StepItem[];
  readonly activeKey: string;
  readonly onSelect: (key: string) => void;
  readonly label: string;
  readonly className?: string;
}

/**
 * Các bước của bài thành một hàng ngang trong đầu khoang hướng dẫn. Mỗi bước là
 * một nút: số thứ tự (hoặc dấu xong), nhãn ngắn. Bước đang xem nổi lên; bước đã
 * đạt có dấu xanh. Nhiều bước thì hàng tự cuộn ngang và giữ bước đang xem trong tầm.
 */
export function StepStrip({ steps, activeKey, onSelect, label, className }: StepStripProps) {
  return (
    <ol aria-label={label} className={cn('relative flex items-stretch gap-1 overflow-x-auto [scrollbar-width:none]', className)}>
      {steps.map((step, index) => {
        const active = step.key === activeKey;
        return (
          <li key={step.key} className="shrink-0">
            <button
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => onSelect(step.key)}
              ref={(node) => {
                if (active && node !== null) node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }}
              className={cn(
                'group inline-flex h-8 max-w-[14rem] items-center gap-2 rounded-full border px-2.5 text-sm transition-colors duration-150',
                active
                  ? 'border-acc-mid bg-acc-tint font-medium text-acc-ink'
                  : 'border-transparent text-ink-2 hover:bg-well hover:text-ink',
              )}
            >
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                  step.state === 'done'
                    ? 'bg-ok-solid text-on-solid'
                    : step.state === 'failed'
                      ? 'bg-bad-tint text-bad-ink'
                      : active
                        ? 'bg-acc-solid text-on-solid'
                        : 'bg-well-2 text-ink-2',
                )}
              >
                {step.state === 'done' ? <Icon name="check" size={12} strokeWidth={3} /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ── Nhật ký dựng máy ────────────────────────────────────────────────────────
export type BootState = 'done' | 'active' | 'pending' | 'failed';

export interface BootLine {
  readonly key: string;
  readonly text: ReactNode;
  readonly state: BootState;
  readonly detail?: ReactNode;
}

/**
 * Thay cho vòng xoay khi đang dựng sandbox: từng dòng việc thật, dòng đang chạy có
 * con trỏ nhấp nháy, dòng xong có dấu, dòng hỏng nói lý do. Chữ đơn cách, nền tối
 * như chính terminal sắp mở.
 */
export function BootLog({ lines, title, className }: { lines: readonly BootLine[]; title: ReactNode; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-3 font-mono text-[13px]', className)}>
      <p className="font-sans text-sm font-medium text-ink">{title}</p>
      <ol className="flex flex-col gap-1.5">
        {lines.map((line) => (
          <li key={line.key} className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
              {line.state === 'done' ? (
                <Icon name="check" size={14} strokeWidth={2.5} className="text-ok-ink" />
              ) : line.state === 'failed' ? (
                <Icon name="close" size={14} strokeWidth={2.5} className="text-bad-ink" />
              ) : line.state === 'active' ? (
                <span className="h-3 w-2 animate-caret rounded-[1px] bg-acc-solid" />
              ) : (
                <span className="size-1 rounded-full bg-ink-3" />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  line.state === 'pending' && 'text-ink-3',
                  line.state === 'active' && 'text-ink',
                  line.state === 'done' && 'text-ink-2',
                  line.state === 'failed' && 'text-bad-ink',
                )}
              >
                {line.text}
              </span>
              {line.detail === undefined ? null : <span className="text-xs text-ink-3">{line.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Con dấu kết quả ─────────────────────────────────────────────────────────
/**
 * Kết quả chấm (Đạt / Chưa đạt / Lỗi biên dịch) hiện như một con dấu đóng xuống:
 * phóng nhẹ rồi về cỡ, dấu tích tự vẽ nét. Chỉ chạy một lần khi kết quả mới về.
 */
export function Stamp({
  tone,
  children,
  icon,
  className,
}: {
  tone: 'ok' | 'bad' | 'warn' | 'neutral';
  children: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-ok-mid bg-ok-wash text-ok-ink'
      : tone === 'bad'
        ? 'border-bad-mid bg-bad-wash text-bad-ink'
        : tone === 'warn'
          ? 'border-warn-mid bg-warn-wash text-warn-ink'
          : 'border-rule-2 bg-well text-ink-2';
  const glyph: IconName = icon ?? (tone === 'ok' ? 'check' : tone === 'bad' ? 'close' : tone === 'warn' ? 'warning' : 'dot');
  return (
    <span
      className={cn(
        'inline-flex h-8 animate-stamp items-center gap-1.5 rounded-sm border-[1.5px] px-2.5 font-display text-sm font-semibold',
        toneClass,
        className,
      )}
    >
      {glyph === 'check' || glyph === 'close' ? (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path
            d={glyph === 'check' ? 'M5 12.5l4.5 4.5L19 7.5' : 'M6.5 6.5l11 11M17.5 6.5l-11 11'}
            pathLength={1}
            strokeDasharray="1"
            className="animate-draw"
          />
        </svg>
      ) : (
        <Icon name={glyph} size={18} />
      )}
      {children}
    </span>
  );
}
