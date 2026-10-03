import type { CSSProperties, ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import type { PlayableGameId } from './game-facts';

/**
 * Tranh của ba game, vẽ bằng ngôn ngữ bảng tuyến: ray thẳng, ga vuông, nhãn mono.
 *
 * Nét và mảng đều là `currentColor`, nên tranh lấy đúng màu chữ của khối tuyến
 * nó nằm trong (chữ trên nền `bg-line-*`). Không gradient, không phát sáng.
 * Phần "toa tàu" (`data-art-train`) trượt dọc ray khi rê chuột vào cả dải game
 * (`group-hover`), và đứng yên với người đã bật giảm chuyển động.
 *
 * Chuỗi trong tranh (`main`, `feature`, `build`, `node-1`) là định danh kỹ thuật
 * vẽ trên sơ đồ, không phải câu chữ giao diện: tranh `aria-hidden` toàn bộ.
 */

const TRAIN =
  'transition-transform duration-500 ease-out group-hover:translate-x-[var(--art-shift)] motion-reduce:transition-none';

function K8sArt(): ReactElement {
  const nodes = [40, 180, 320];
  return (
    <>
      <text x="40" y="34" className="font-mono" fontSize="12" fill="currentColor" opacity=".8">
        control-plane
      </text>
      <rect x="40" y="44" width="400" height="8" fill="currentColor" opacity=".35" />
      {nodes.map((x, n) => (
        <g key={x}>
          <rect x={x + 54} y="52" width="12" height="44" fill="currentColor" opacity=".35" />
          <rect x={x} y="96" width="120" height="124" fill="none" stroke="currentColor" strokeWidth="4" />
          <text x={x + 10} y="116" className="font-mono" fontSize="11" fill="currentColor">
            {`node-${String(n + 1)}`}
          </text>
          {[0, 1, 2, 3].map((slot) => {
            const px = x + 14 + (slot % 2) * 50;
            const py = 132 + Math.floor(slot / 2) * 42;
            const broken = n === 1 && slot === 2;
            const empty = n === 2 && slot === 3;
            if (empty) return null;
            return broken ? (
              <g key={slot}>
                <rect
                  x={px}
                  y={py}
                  width="42"
                  height="32"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="5 4"
                />
                <path d={`M${px + 13} ${py + 8}l16 16m0 -16l-16 16`} stroke="currentColor" strokeWidth="3" />
              </g>
            ) : (
              <rect key={slot} x={px} y={py} width="42" height="32" fill="currentColor" />
            );
          })}
        </g>
      ))}
      <rect x="40" y="256" width="400" height="10" fill="currentColor" />
      {nodes.map((x) => (
        <rect key={x} x={x + 50} y="220" width="20" height="36" fill="currentColor" opacity=".55" />
      ))}
      <g data-art-train className={TRAIN}>
        <rect x="52" y="246" width="56" height="30" fill="currentColor" />
        <rect x="60" y="254" width="40" height="8" className="fill-[var(--art-window)]" />
      </g>
    </>
  );
}

function GitArt(): ReactElement {
  return (
    <>
      <path d="M30 214H450" stroke="currentColor" strokeWidth="12" />
      <path d="M140 214L220 134H330L410 214" fill="none" stroke="currentColor" strokeWidth="12" opacity=".55" />
      <path d="M250 214L300 264H450" fill="none" stroke="currentColor" strokeWidth="6" strokeDasharray="10 8" opacity=".5" />
      {[
        { x: 70, y: 214 },
        { x: 140, y: 214 },
        { x: 250, y: 214 },
        { x: 410, y: 214 },
        { x: 240, y: 134 },
        { x: 310, y: 134 },
      ].map((station) => (
        <rect
          key={`${String(station.x)}-${String(station.y)}`}
          x={station.x - 15}
          y={station.y - 15}
          width="30"
          height="30"
          className="fill-[var(--art-window)]"
          stroke="currentColor"
          strokeWidth="6"
        />
      ))}
      <text x="40" y="250" className="font-mono" fontSize="13" fill="currentColor">
        main
      </text>
      <text x="226" y="112" className="font-mono" fontSize="13" fill="currentColor">
        feature
      </text>
      <text x="330" y="292" className="font-mono" fontSize="12" fill="currentColor" opacity=".7">
        reflog
      </text>
      <g data-art-train className={TRAIN}>
        <rect x="330" y="160" width="58" height="24" fill="currentColor" />
        <text x="338" y="177" className="font-mono" fontSize="12" fontWeight="700" fill="var(--art-window)">
          HEAD
        </text>
        <path d="M352 184l6 10 6 -10z" fill="currentColor" />
      </g>
    </>
  );
}

function CicdArt(): ReactElement {
  const job = (x: number, y: number, label: string, done = true): ReactElement => (
    <g key={label}>
      <rect
        x={x}
        y={y}
        width="88"
        height="40"
        fill={done ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="4"
      />
      <text
        x={x + 10}
        y={y + 25}
        className="font-mono"
        fontSize="12"
        fill={done ? 'var(--art-window)' : 'currentColor'}
      >
        {label}
      </text>
    </g>
  );
  return (
    <>
      <path d="M128 110H160V70H192M160 110V150H192" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M280 70H312V110H344M280 150H312V110" fill="none" stroke="currentColor" strokeWidth="4" />
      {job(40, 90, 'build')}
      {job(192, 50, 'test')}
      {job(192, 130, 'lint')}
      {job(344, 90, 'package', false)}
      <rect x="40" y="236" width="400" height="10" fill="currentColor" opacity=".45" />
      {[
        { x: 70, label: 'dev' },
        { x: 220, label: 'staging' },
        { x: 380, label: 'prod' },
      ].map((env) => (
        <g key={env.label}>
          <rect x={env.x - 14} y="227" width="28" height="28" className="fill-[var(--art-window)]" stroke="currentColor" strokeWidth="6" />
          <text x={env.x - 18} y="284" className="font-mono" fontSize="12" fill="currentColor">
            {env.label}
          </text>
        </g>
      ))}
      <path d="M384 154V210" stroke="currentColor" strokeWidth="4" strokeDasharray="6 6" opacity=".6" />
      <g data-art-train className={TRAIN}>
        <rect x="88" y="221" width="40" height="40" fill="currentColor" />
        <path d="M98 241l7 7 14 -15" fill="none" stroke="var(--art-window)" strokeWidth="4" />
      </g>
    </>
  );
}

/** Màu ô cửa: khoét lại đúng màu nền tuyến, nên ga đọc ra là ga rỗng trên ray. */
const WINDOW: Readonly<Record<PlayableGameId, string>> = {
  k8s: 'var(--line-k8s)',
  git: 'var(--line-git)',
  cicd: 'var(--line-cicd)',
};

const ART: Readonly<Record<PlayableGameId, () => ReactElement>> = {
  k8s: K8sArt,
  git: GitArt,
  cicd: CicdArt,
};

export function GameArt({
  game,
  className,
}: {
  readonly game: PlayableGameId;
  readonly className?: string;
}): ReactElement {
  const Art = ART[game];
  return (
    <svg
      viewBox="0 0 480 300"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={cn('[--art-shift:120px]', className)}
      style={{ '--art-window': WINDOW[game] } as CSSProperties}
    >
      <Art />
    </svg>
  );
}
