import type { ReactElement } from 'react';
import { cn } from '../cn.ts';

/**
 * Minh hoạ đầu mục. Vẽ tay trên khung 160×120 bằng nét mực 1.6 và mảng màu của mục
 * (`--acc-*`), cùng ngôn ngữ với bộ biểu tượng. Mọi màu đọc từ token nên tự đổi theo
 * mục và theme. Chuyển động chỉ chạy khi rê vào khối chứa (`group`) và tắt hẳn khi
 * người dùng chọn giảm chuyển động.
 */
export type SectionArtKind = 'learn' | 'practice' | 'judge' | 'games' | 'studio' | 'admin' | 'me';

const INK = 'stroke-ink';
const STROKE = { strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

function Learn() {
  return (
    <>
      <path d="M14 30c19-7 41-6 64 4v72c-23-10-45-11-64-4z" className="fill-acc-tint" />
      <path d="M146 30c-19-7-41-6-64 4v72c23-10 45-11 64-4z" className="fill-paper" />
      <path d="M14 30c19-7 41-6 64 4v72c-23-10-45-11-64-4zM146 30c-19-7-41-6-64 4v72c23-10 45-11 64-4z" className={INK} {...STROKE} />
      <path d="M24 48c13-3 27-2 44 3M24 58c13-3 27-2 44 3M24 68c13-3 27-2 36 2M24 78c10-2 21-2 30 1" className="stroke-acc-mid" {...STROKE} />
      <rect x="90" y="46" width="46" height="36" rx="4" className="fill-[var(--code-bg)]" />
      <path d="M97 57l5 4-5 4" className="stroke-[var(--code-ink)]" {...STROKE} />
      <rect x="106" y="63" width="9" height="3" rx="1" className="fill-[var(--mark)] group-hover:animate-caret" />
      <path d="M121 22v20l5-4 5 4V22" className="fill-[var(--mark)]" />
      <path d="M121 22v20l5-4 5 4V22" className={INK} {...STROKE} />
    </>
  );
}

function Practice() {
  return (
    <>
      <rect x="86" y="30" width="58" height="62" rx="6" className="fill-paper" />
      <rect x="86" y="30" width="58" height="62" rx="6" className={INK} {...STROKE} />
      <path d="M86 46h58" className={INK} {...STROKE} />
      <circle cx="94" cy="38" r="1.6" className="fill-acc-mid" />
      <circle cx="100" cy="38" r="1.6" className="fill-[var(--mark)]" />
      <path d="M95 58l5 4-5 4M105 66h12" className="stroke-acc-ink" {...STROKE} />
      <path d="M95 76h30" className="stroke-acc-mid" {...STROKE} />
      <path d="M46 70h28l9 16a6 6 0 0 1-5.2 9H37.2A6 6 0 0 1 32 86z" className="fill-acc-soft" />
      <path d="M44 22h20M48 22v26L30 82a8 8 0 0 0 7 12h44a8 8 0 0 0 7-12L60 48V22" className={INK} {...STROKE} />
      <g className="transition-transform duration-700 ease-out group-hover:-translate-y-3">
        <circle cx="50" cy="80" r="3" className="fill-paper stroke-ink" strokeWidth={1.4} />
        <circle cx="62" cy="74" r="2.2" className="fill-paper stroke-ink" strokeWidth={1.4} />
        <circle cx="56" cy="62" r="1.8" className="fill-[var(--mark)]" />
      </g>
    </>
  );
}

function Judge() {
  return (
    <>
      <g className="origin-[60px_64px] transition-transform duration-500 ease-out group-hover:-rotate-2">
        <rect x="28" y="18" width="72" height="88" rx="5" className="fill-paper" />
        <rect x="28" y="18" width="72" height="88" rx="5" className={INK} {...STROKE} />
        <path d="M40 36h40M40 48h48M40 60h34M40 72h44M40 84h28" className="stroke-rule-2" {...STROKE} />
        <path d="M80 70l7 7 14-16" className="stroke-ok-solid" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <g className="origin-[118px_76px] transition-transform duration-500 ease-out group-hover:rotate-3">
        <rect x="96" y="58" width="44" height="30" rx="4" transform="rotate(-8 118 73)" className="fill-acc-tint" />
        <rect x="96" y="58" width="44" height="30" rx="4" transform="rotate(-8 118 73)" className="stroke-acc-ink" {...STROKE} />
        <path d="M108 76l6 5 10-12" transform="rotate(-8 118 73)" className="stroke-acc-ink" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <path d="M118 20h12M124 20v6M118 44a10 10 0 1 0 0-.1" className={INK} {...STROKE} />
      <path d="M124 32v5l3 2" className="stroke-acc-ink" {...STROKE} />
    </>
  );
}

function Games() {
  return (
    <>
      <path d="M44 52h72a22 22 0 0 1 21.5 26.7l-3.3 15.6a10.5 10.5 0 0 1-18.6 4.3L109 88H51l-6.6 10.6a10.5 10.5 0 0 1-18.6-4.3l-3.3-15.6A22 22 0 0 1 44 52z" className="fill-acc-tint" />
      <path d="M44 52h72a22 22 0 0 1 21.5 26.7l-3.3 15.6a10.5 10.5 0 0 1-18.6 4.3L109 88H51l-6.6 10.6a10.5 10.5 0 0 1-18.6-4.3l-3.3-15.6A22 22 0 0 1 44 52z" className={INK} {...STROKE} />
      <path d="M50 64v16M42 72h16" className={INK} strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <circle cx="106" cy="66" r="4" className="fill-(--t-kubernetes-mid)" />
      <circle cx="116" cy="76" r="4" className="fill-(--t-git-mid)" />
      <circle cx="96" cy="76" r="4" className="fill-(--t-cicd-mid)" />
      <g className="transition-transform duration-500 ease-out group-hover:-translate-y-2">
        <path d="M70 18l10 5.8v11.6L70 41l-10-5.6V23.8z" className="fill-(--t-kubernetes-tint) stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M86 26l8 4.6v9.2l-8 4.6-8-4.6v-9.2z" className="fill-(--t-cicd-tint) stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
      </g>
    </>
  );
}

function Studio() {
  return (
    <>
      <rect x="22" y="22" width="78" height="82" rx="5" className="fill-paper" />
      <rect x="22" y="22" width="78" height="82" rx="5" className={INK} {...STROKE} />
      <circle cx="36" cy="40" r="5" className="fill-acc-solid" />
      <circle cx="36" cy="62" r="5" className="fill-acc-soft" />
      <circle cx="36" cy="84" r="5" className="fill-acc-tint" />
      <path d="M48 38h36M48 44h22M48 60h30M48 66h18M48 82h26" className="stroke-rule-2" {...STROKE} />
      <g className="origin-[112px_70px] transition-transform duration-500 ease-out group-hover:-translate-x-2 group-hover:translate-y-1">
        <path d="M128 26l12 12-30 44-12 2 2-12z" className="fill-[var(--mark)]" />
        <path d="M128 26l12 12-30 44-12 2 2-12zM122 32l12 12M100 72l8 8" className={INK} {...STROKE} />
      </g>
      <path d="M92 96c8-6 16-6 22 0s14 6 22 0" className="stroke-acc-mid" {...STROKE} />
    </>
  );
}

function Admin() {
  return (
    <>
      <rect x="18" y="24" width="88" height="72" rx="6" className="fill-paper" />
      <rect x="18" y="24" width="88" height="72" rx="6" className={INK} {...STROKE} />
      <path d="M30 44h64M30 60h64M30 76h64" className="stroke-rule-2" {...STROKE} />
      <g className="transition-transform duration-500 ease-out group-hover:translate-x-6">
        <circle cx="46" cy="44" r="5" className="fill-acc-solid" />
      </g>
      <g className="transition-transform duration-500 ease-out group-hover:-translate-x-4">
        <circle cx="76" cy="60" r="5" className="fill-[var(--mark)] stroke-ink" strokeWidth={1.4} />
      </g>
      <circle cx="58" cy="76" r="5" className="fill-acc-soft stroke-ink" strokeWidth={1.4} />
      <circle cx="128" cy="42" r="9" className="fill-acc-tint" />
      <circle cx="128" cy="42" r="9" className={INK} {...STROKE} />
      <path d="M112 78c2-10 8-15 16-15s14 5 16 15" className="fill-acc-tint" />
      <path d="M112 78c2-10 8-15 16-15s14 5 16 15" className={INK} {...STROKE} />
      <path d="M118 96h20" className="stroke-acc-mid" {...STROKE} />
    </>
  );
}

function Me() {
  return (
    <>
      <rect x="20" y="28" width="120" height="70" rx="8" className="fill-acc-wash" />
      <rect x="20" y="28" width="120" height="70" rx="8" className={INK} {...STROKE} />
      <path d="M34 82l18-16 14 10 20-22 18 14 20-18" className="stroke-acc-solid" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="124" cy="50" r="4" className="fill-[var(--mark)] stroke-ink transition-transform duration-500 group-hover:-translate-y-1.5" strokeWidth={1.4} />
      <path d="M34 42h30M34 50h18" className="stroke-acc-mid" {...STROKE} />
    </>
  );
}

const DRAWINGS: Record<SectionArtKind, () => ReactElement> = {
  learn: Learn,
  practice: Practice,
  judge: Judge,
  games: Games,
  studio: Studio,
  admin: Admin,
  me: Me,
};

export function SectionArt({ kind, className, width = 160 }: { kind: SectionArtKind; className?: string; width?: number }) {
  const Drawing = DRAWINGS[kind];
  return (
    <svg
      viewBox="0 0 160 120"
      width={width}
      height={(width * 120) / 160}
      aria-hidden
      focusable="false"
      className={cn('shrink-0 overflow-visible [&_*]:motion-reduce:transition-none', className)}
    >
      <Drawing />
    </svg>
  );
}
