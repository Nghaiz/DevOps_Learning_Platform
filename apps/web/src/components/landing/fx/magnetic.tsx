'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from '../motion/gsap';
import { useMotionMode } from '../motion/motion-provider';
import fx from './fx.module.css';

/**
 * Nút "từ tính": con trỏ lại gần thì nút nhích theo, rời đi thì bật về bằng một nhịp đàn hồi.
 * Chỉ bật với con trỏ chính xác (chuột, bút); trên màn hình cảm ứng không có "lại gần", và một
 * nút trượt khỏi ngón tay là một nút bấm trượt.
 */
export function Magnetic({
  children,
  strength = 0.32,
}: {
  readonly children: ReactNode;
  readonly strength?: number;
}) {
  const mode = useMotionMode();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || mode !== 'full') return undefined;
    if (!window.matchMedia('(pointer: fine)').matches) return undefined;
    const toX = gsap.quickTo(element, 'x', { duration: 0.5, ease: 'power3.out' });
    const toY = gsap.quickTo(element, 'y', { duration: 0.5, ease: 'power3.out' });
    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      toX((event.clientX - (rect.left + rect.width / 2)) * strength);
      toY((event.clientY - (rect.top + rect.height / 2)) * strength);
    };
    const onLeave = () => {
      gsap.to(element, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.38)' });
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
      gsap.set(element, { x: 0, y: 0 });
    };
  }, [mode, strength]);

  return (
    <span ref={ref} className={fx.magnetic}>
      {children}
    </span>
  );
}
