'use client';

import { useEffect, useRef } from 'react';
import type { StationId } from '../content';
import { EASE_OUT, gsap, registerLandingGsap } from '../motion/gsap';
import { useMotionMode } from '../motion/motion-provider';

/**
 * Sáu pictogram nét mảnh trên lưới 24×24, dùng làm đích cho MorphSVG: terminal, nhánh git,
 * container, bánh lái bảy nan, đường ống ba stage, địa cầu. Mỗi hình là MỘT path nhiều subpath
 * để plugin nội suy được giữa chúng; góc vuông cho khớp ngôn ngữ thị giác của app.
 */
export const STATION_GLYPHS: Readonly<Record<StationId, string>> = {
  linux: 'M2 4H22V20H2Z M6 9L10 12L6 15 M12 16H18',
  git: 'M6 3V21 M6 15C6 10 18 13 18 7 M16 5H20V9H16Z M4 17H8V21H4Z',
  docker: 'M3 7.5L12 3L21 7.5V16.5L12 21L3 16.5Z M3 7.5L12 12L21 7.5 M12 12V21',
  k8s: 'M12 2.5L19.4 6.1L21.3 14.1L16.1 20.6H7.9L2.7 14.1L4.6 6.1Z M12 12L12 2.5 M12 12L19.4 6.1 M12 12L21.3 14.1 M12 12L16.1 20.6 M12 12L7.9 20.6 M12 12L2.7 14.1 M12 12L4.6 6.1',
  cicd: 'M2 9H7V15H2Z M9.5 9H14.5V15H9.5Z M17 9H22V15H17Z M7 12H9.5 M14.5 12H17',
  prod: 'M12 3A9 9 0 1 1 11.99 3Z M3 12H21 M12 3C15.5 6 15.5 18 12 21 M12 3C8.5 6 8.5 18 12 21',
};

/** Một icon biến hình sang hình của ga đang đứng mỗi khi đổi ga. */
export function IconMorph({
  station,
  className,
}: {
  readonly station: StationId;
  readonly className?: string | undefined;
}) {
  const mode = useMotionMode();
  const ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    const path = ref.current;
    if (path === null) return undefined;
    if (mode !== 'full') {
      path.setAttribute('d', STATION_GLYPHS[station]);
      return undefined;
    }
    registerLandingGsap();
    const tween = gsap.to(path, { morphSVG: STATION_GLYPHS[station], duration: 0.75, ease: EASE_OUT });
    return () => {
      tween.kill();
    };
  }, [mode, station]);

  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        ref={ref}
        d={STATION_GLYPHS.linux}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
    </svg>
  );
}
