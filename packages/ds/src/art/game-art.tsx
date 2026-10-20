import type { ReactElement } from 'react';
import { cn } from '../cn.ts';

/**
 * Minh hoạ cho từng game ở trang chọn game. Khung 200×120, màu lấy theo chủ đề của
 * game (`--t-*`). Rê vào hàng chứa (`group`) thì một chi tiết nhỏ chuyển động: pod
 * nhảy lên, nhánh git mọc thêm commit, kiện hàng trôi qua cổng kiểm.
 */
export type GameArtKind = 'k8s' | 'git' | 'cicd' | 'netpol' | 'dockerfile';

const S = { strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

function hex(cx: number, cy: number, r: number): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join('L')}z`;
}

function K8s() {
  const cells: [number, number, string][] = [
    [62, 46, 'fill-(--t-kubernetes-tint)'],
    [90, 46, 'fill-(--t-kubernetes-soft)'],
    [118, 46, 'fill-(--t-kubernetes-tint)'],
    [76, 70, 'fill-(--t-kubernetes-soft)'],
    [104, 70, 'fill-paper'],
    [132, 70, 'fill-(--t-kubernetes-tint)'],
    [48, 70, 'fill-(--t-kubernetes-tint)'],
  ];
  return (
    <>
      {cells.map(([cx, cy, fill], index) => (
        <path key={index} d={hex(cx, cy, 15)} className={cn(fill, 'stroke-ink')} strokeWidth={1.6} strokeLinejoin="round" />
      ))}
      <g className="transition-transform duration-500 ease-out group-hover:-translate-y-2.5">
        <path d={hex(104, 70, 15)} className="fill-(--t-kubernetes-solid) stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx="104" cy="70" r="4.5" className="stroke-on-solid" strokeWidth={1.8} fill="none" />
        <path d="M104 62v3.5M104 74.5V78M96.6 66l3 1.8M108.4 72.2l3 1.8M96.6 74l3-1.8M108.4 67.8l3-1.8" className="stroke-on-solid" {...S} strokeWidth={1.6} />
      </g>
      <path d="M40 96h120" className="stroke-rule-2" {...S} />
      <circle cx="160" cy="34" r="3" className="fill-[var(--mark)]" />
    </>
  );
}

function Git() {
  return (
    <>
      <path d="M30 78h40c14 0 18-30 34-30h22" className="stroke-(--t-git-mid)" {...S} strokeWidth={3} />
      <path d="M30 78h140" className="stroke-ink" {...S} strokeWidth={3} />
      <path d="M126 48c14 0 18 30 30 30" className="stroke-(--t-git-mid)" {...S} strokeWidth={3} />
      {[44, 70, 112, 170].map((cx) => (
        <circle key={cx} cx={cx} cy="78" r="7" className="fill-paper stroke-ink" strokeWidth={2} />
      ))}
      {[104, 126].map((cx) => (
        <circle key={cx} cx={cx} cy="48" r="7" className="fill-(--t-git-tint) stroke-(--t-git-ink)" strokeWidth={2} />
      ))}
      <circle cx="156" cy="78" r="7" className="fill-(--t-git-solid) stroke-ink" strokeWidth={2} />
      <g className="opacity-0 transition-[opacity,transform] duration-500 ease-out group-hover:-translate-y-1 group-hover:opacity-100">
        <circle cx="148" cy="48" r="7" className="fill-(--t-git-tint) stroke-(--t-git-ink)" strokeWidth={2} strokeDasharray="3 3" />
      </g>
      <path d="M150 58l6 13" className="stroke-rule-2" {...S} />
      <path d="M160 24h22l-5 6 5 6h-22z" className="fill-[var(--mark)] stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M160 24v22" className="stroke-ink" {...S} />
    </>
  );
}

function Cicd() {
  return (
    <>
      <path d="M22 86h158" className="stroke-ink" {...S} strokeWidth={2} />
      {[34, 58, 82, 106, 130, 154].map((x) => (
        <circle key={x} cx={x} cy="92" r="3" className="fill-paper stroke-ink" strokeWidth={1.4} />
      ))}
      <path d="M108 86V40a16 16 0 0 1 32 0v46" className="stroke-ink" {...S} strokeWidth={1.8} />
      <rect x="117" y="30" width="14" height="9" rx="3" className="fill-(--t-cicd-solid)" />
      <path d="M121 34.5l2.2 2.2 4.2-4.4" className="stroke-on-solid" {...S} strokeWidth={1.6} />
      <g className="transition-transform duration-[900ms] ease-out group-hover:translate-x-12">
        <rect x="44" y="60" width="26" height="26" rx="3" className="fill-(--t-cicd-tint) stroke-ink" strokeWidth={1.6} />
        <path d="M44 70h26M57 60v10" className="stroke-(--t-cicd-ink)" {...S} />
      </g>
      <rect x="150" y="62" width="24" height="24" rx="3" className="fill-(--t-cicd-soft) stroke-ink" strokeWidth={1.6} />
      <rect x="14" y="66" width="20" height="20" rx="3" className="fill-paper stroke-ink" strokeWidth={1.6} />
    </>
  );
}

function Netpol() {
  return (
    <>
      <rect x="40" y="18" width="120" height="84" rx="6" className="fill-(--t-networking-wash) stroke-ink" strokeWidth={1.6} />
      <path d="M60 18v26M60 64v38M84 44h36M100 18v26M100 64h40M140 44v20M84 64v20M120 84h20" className="stroke-ink" {...S} strokeWidth={2.4} />
      <path d="M50 30v24h24v32h40V72h34" className="stroke-(--t-networking-mid)" {...S} strokeWidth={2} strokeDasharray="4 5" />
      <circle cx="50" cy="30" r="5" className="fill-(--t-networking-solid)" />
      <circle cx="148" cy="72" r="5" className="fill-[var(--mark)] stroke-ink" strokeWidth={1.4} />
    </>
  );
}

function Dockerfile() {
  return (
    <>
      {[0, 1, 2, 3].map((index) => (
        <rect
          key={index}
          x={64 - index * 4}
          y={78 - index * 16}
          width={72 + index * 8}
          height="14"
          rx="3"
          className={cn('stroke-ink', index === 3 ? 'fill-(--t-docker-soft)' : 'fill-(--t-docker-tint)')}
          strokeWidth={1.6}
        />
      ))}
      <path d="M44 96h112" className="stroke-ink" {...S} strokeWidth={2} />
      <g className="origin-[150px_40px] transition-transform duration-500 ease-out group-hover:-rotate-12">
        <path d="M146 22l16 16-6 6-16-16z" className="fill-[var(--mark)] stroke-ink" strokeWidth={1.6} strokeLinejoin="round" />
        <path d="M150 34l-20 22" className="stroke-ink" {...S} strokeWidth={2.4} />
      </g>
    </>
  );
}

const DRAWINGS: Record<GameArtKind, () => ReactElement> = { k8s: K8s, git: Git, cicd: Cicd, netpol: Netpol, dockerfile: Dockerfile };

export function GameArt({ kind, className, width = 200 }: { kind: GameArtKind; className?: string; width?: number }) {
  const Drawing = DRAWINGS[kind];
  return (
    <svg viewBox="0 0 200 120" width={width} height={(width * 120) / 200} aria-hidden focusable="false" className={cn('shrink-0 overflow-visible', className)}>
      <Drawing />
    </svg>
  );
}
