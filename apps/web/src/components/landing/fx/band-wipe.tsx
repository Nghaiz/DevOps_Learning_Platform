'use client';

import { useRef, type CSSProperties } from 'react';
import { lineVar, type LineId } from '../content';
import { gsap } from '../motion/gsap';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import fx from './fx.module.css';

/**
 * Chuyển cảnh kiểu motion graphics: một chùm dải màu tuyến metro xiên quét ngang ranh giới khi
 * khu chứa nó trồi lên từ đáy màn hình. Tua theo cuộn, nên cuộn ngược thì dải quét ngược lại.
 * Chỉ trang trí (`aria-hidden`); ở chế độ tĩnh hay giảm chuyển động thì không hiện gì.
 */
export function BandWipe({ lines }: { readonly lines: readonly LineId[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useLandingGSAP(
    () => {
      const root = ref.current;
      if (root === null) return;
      const bands = root.querySelectorAll('[data-band]');
      gsap.fromTo(
        bands,
        { xPercent: -115 },
        {
          xPercent: 115,
          ease: 'none',
          stagger: 0.05,
          scrollTrigger: { trigger: root, start: 'top bottom', end: 'bottom top', scrub: true },
        },
      );
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className={fx.wipe} aria-hidden="true">
      {lines.map((line, index) => (
        <span key={`${line}-${index}`} data-band className={fx.band} style={{ '--line': lineVar(line) } as CSSProperties} />
      ))}
    </div>
  );
}
