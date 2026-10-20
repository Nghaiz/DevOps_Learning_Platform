import type { ReactElement } from 'react';
import { cn } from '../cn.ts';

/** Minh hoạ nhỏ cho khối rỗng, lỗi và trang không tìm thấy. Khung 96×72. */
export type EmptyArtKind = 'nothing' | 'search' | 'offline' | 'done' | 'locked' | 'lost' | 'waiting';

const S = { strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

function Nothing() {
  return (
    <>
      <path d="M18 36l10-18h40l10 18v22a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z" className="fill-acc-tint" />
      <path d="M18 36l10-18h40l10 18v22a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4zM18 36h18l4 7h16l4-7h18" className="stroke-ink" {...S} />
      <circle cx="48" cy="12" r="2" className="fill-[var(--mark)]" />
    </>
  );
}

function Search() {
  return (
    <>
      <path d="M14 22h34M14 32h24M14 42h30M14 52h18" className="stroke-rule-2" {...S} />
      <circle cx="60" cy="38" r="16" className="fill-acc-tint" />
      <circle cx="60" cy="38" r="16" className="stroke-ink" {...S} />
      <path d="M72 50l12 12" className="stroke-ink" {...S} strokeWidth={2.6} />
      <path d="M54 36c1.5-4 4.5-6 8-6" className="stroke-paper" {...S} />
    </>
  );
}

function Offline() {
  return (
    <>
      <path d="M10 46h18M68 26h18" className="stroke-ink" {...S} />
      <path d="M28 38h10a6 6 0 0 1 6 6v4a6 6 0 0 1-6 6H28z" className="fill-acc-tint stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M38 41h6M38 51h6" className="stroke-ink" {...S} />
      <path d="M68 18H58a6 6 0 0 0-6 6v4a6 6 0 0 0 6 6h10z" className="fill-bad-tint stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M46 30l4-4M50 38l4 2M44 22l2-5" className="stroke-bad-solid" {...S} />
    </>
  );
}

function Done() {
  return (
    <>
      <path d="M10 60c12-10 26-14 42-14s28 4 34 14" className="fill-acc-tint" />
      <path d="M10 60c12-10 26-14 42-14s28 4 34 14" className="stroke-ink" {...S} />
      <path d="M50 46V12" className="stroke-ink" {...S} />
      <path d="M50 13h24l-6 7 6 7H50z" className="fill-[var(--mark)] stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
    </>
  );
}

function Locked() {
  return (
    <>
      <rect x="28" y="30" width="40" height="32" rx="5" className="fill-acc-tint" />
      <rect x="28" y="30" width="40" height="32" rx="5" className="stroke-ink" {...S} />
      <path d="M36 30v-7a12 12 0 0 1 24 0v7M48 42v8" className="stroke-ink" {...S} />
    </>
  );
}

function Lost() {
  return (
    <>
      <rect x="10" y="10" width="76" height="52" rx="6" className="fill-[var(--code-bg)]" />
      <path d="M10 22h76" className="stroke-white/15" {...S} />
      <circle cx="18" cy="16" r="1.6" className="fill-bad-mid" />
      <circle cx="24" cy="16" r="1.6" className="fill-[var(--mark)]" />
      <path d="M20 34l5 4-5 4" className="stroke-[var(--code-ink)]" {...S} />
      <path d="M31 42h10" className="stroke-[var(--code-dim)]" {...S} />
      <path d="M58 32a6 6 0 1 1 8 5.6c-1.2.5-2 1.6-2 2.9V42M64 48h.01" className="stroke-[var(--mark)]" {...S} strokeWidth={2} />
    </>
  );
}

function Waiting() {
  return (
    <>
      <path d="M32 12h32M32 60h32M36 12c0 12 12 15 12 24s-12 12-12 24M60 12c0 12-12 15-12 24s12 12 12 24" className="stroke-ink" {...S} />
      <path d="M40 56c1.5-6 8-9 8-14 0 5 6.5 8 8 14z" className="fill-acc-soft" />
      <path d="M44 22h8" className="stroke-acc-mid" {...S} />
    </>
  );
}

const DRAWINGS: Record<EmptyArtKind, () => ReactElement> = {
  nothing: Nothing,
  search: Search,
  offline: Offline,
  done: Done,
  locked: Locked,
  lost: Lost,
  waiting: Waiting,
};

export function EmptyArt({ kind, className, width = 96 }: { kind: EmptyArtKind; className?: string; width?: number }) {
  const Drawing = DRAWINGS[kind];
  return (
    <svg viewBox="0 0 96 72" width={width} height={(width * 72) / 96} aria-hidden focusable="false" className={cn('shrink-0 overflow-visible', className)}>
      <Drawing />
    </svg>
  );
}
