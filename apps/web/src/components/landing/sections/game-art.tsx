import type { GameId } from '../content';
import styles from './games.module.css';

/**
 * Cảnh SVG nhỏ cho từng game, chuyển động bằng CSS keyframe (chạy trên compositor, tự đứng yên
 * dưới prefers-reduced-motion nhờ khối @media chung trong globals.css).
 */
export function GameArt({ id }: { readonly id: GameId }) {
  return (
    <svg
      viewBox="0 0 240 140"
      className={styles.art}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
    >
      {id === 'k8s' ? <K8sArt /> : null}
      {id === 'git' ? <GitArt /> : null}
      {id === 'cicd' ? <CicdArt /> : null}
      {id === 'maze' ? <MazeArt /> : null}
      {id === 'forge' ? <ForgeArt /> : null}
    </svg>
  );
}

const HEPTAGON = Array.from({ length: 7 }, (_, i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 7;
  return `${(120 + Math.cos(angle) * 44).toFixed(1)} ${(66 + Math.sin(angle) * 44).toFixed(1)}`;
});

function K8sArt() {
  return (
    <>
      <g className={styles.spin}>
        <path d={`M${HEPTAGON.join(' L')} Z`} />
        {HEPTAGON.map((point) => (
          <path key={point} d={`M120 66 L${point}`} opacity={0.6} />
        ))}
      </g>
      {[40, 200].map((x, i) => (
        <rect key={x} x={x - 12} y="96" width="24" height="24" className={styles.bob} style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </>
  );
}

function GitArt() {
  return (
    <>
      <path d="M20 96H220" />
      <path d="M70 96C90 96 90 44 120 44H160C190 44 190 96 210 96" className={styles.draw} />
      {[40, 70, 140, 210].map((x) => (
        <rect key={x} x={x - 7} y="89" width="14" height="14" transform={`rotate(45 ${x} 96)`} />
      ))}
      {[120, 160].map((x) => (
        <rect key={x} x={x - 7} y="37" width="14" height="14" transform={`rotate(45 ${x} 44)`} className={styles.pop} />
      ))}
    </>
  );
}

function CicdArt() {
  return (
    <>
      <path d="M16 70H224" opacity={0.4} />
      {[36, 96, 156, 216].map((x, i) => (
        <rect key={x} x={x - 16} y="52" width="32" height="36" className={styles.gate} style={{ animationDelay: `${i * 0.45}s` }} />
      ))}
      <rect x="0" y="64" width="12" height="12" className={styles.packet} />
    </>
  );
}

function MazeArt() {
  return (
    <>
      <path d="M20 20H220V120H20Z M60 20V80 M100 60V120 M140 20V90 M180 50V120 M60 80H100 M140 90H180" opacity={0.7} />
      <rect x="28" y="94" width="10" height="10" className={styles.packetMaze} />
    </>
  );
}

function ForgeArt() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={60 + i * 6} y={28 + i * 18} width={120 - i * 12} height="12" className={styles.layer} style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </>
  );
}
