import { t } from '@devops-platform/copy';
import { lineVar, STATION_IDS } from '../content';
import styles from './stage.module.css';

/**
 * Bản đồ tuyến tĩnh, thay cảnh 3D khi người dùng bật giảm chuyển động, khi trình duyệt không có
 * WebGL, mất context, hoặc chunk cảnh tải lỗi. Cùng câu chuyện (sáu tuyến đổ về tuyến đỏ), chỉ
 * không chuyển động và không cần GPU.
 */
export function StaticArt({ visible }: { readonly visible: boolean }) {
  return (
    <svg
      className={styles.art}
      data-visible={visible ? 'true' : 'false'}
      viewBox="0 0 800 600"
      preserveAspectRatio="xMaxYMid slice"
      role="img"
      aria-label={t('home.scene.fallback')}
      fill="none"
      strokeLinecap="square"
      strokeLinejoin="miter"
    >
      {STATION_IDS.map((id, index) => {
        const y = 120 + index * 62;
        const bend = 300 + index * 40;
        return (
          <g key={id} stroke={lineVar(id)}>
            <path d={`M-20 ${y} H${bend} L${bend + 90} ${y + 90} H820`} strokeWidth={6} />
            <rect x={bend + 120} y={y + 80} width="20" height="20" fill="var(--l-bg)" strokeWidth={4} />
          </g>
        );
      })}
      <path d="M-20 70 H260 L340 150 V560 L420 640" stroke="var(--l-red)" strokeWidth={10} />
      {[150, 270, 390, 510].map((y) => (
        <rect key={y} x="328" y={y - 12} width="24" height="24" fill="var(--l-bg)" stroke="var(--l-ink)" strokeWidth={4} />
      ))}
    </svg>
  );
}
