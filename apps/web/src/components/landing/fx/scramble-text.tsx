'use client';

import { useEffect, useRef } from 'react';
import { gsap, registerLandingGsap } from '../motion/gsap';
import { useMotionMode } from '../motion/motion-provider';

/** Bộ ký tự xáo: toàn ký hiệu terminal, để khi xáo trông như máy đang in ra chứ không như lỗi font. */
export const SCRAMBLE_CHARS = '01<>/_$#{}[]=+*';

/**
 * Chữ tự xáo rồi hiện ra mỗi khi `trigger` đổi giá trị (đổi ga, đổi trạng thái pod, khu vừa lộ
 * vào màn hình). Trình đọc màn hình chỉ nghe bản `sr-only` đã ổn định, không nghe từng khung xáo.
 */
export function ScrambleText({
  text,
  trigger,
  className,
  duration = 0.9,
}: {
  readonly text: string;
  /** Mỗi lần giá trị này đổi (và `!== false`), chữ xáo lại một lượt. */
  readonly trigger: string | number | boolean;
  readonly className?: string | undefined;
  readonly duration?: number;
}) {
  const mode = useMotionMode();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    if (mode !== 'full' || trigger === false) {
      element.textContent = text;
      return undefined;
    }
    registerLandingGsap();
    const tween = gsap.to(element, {
      duration,
      ease: 'none',
      scrambleText: { text, chars: SCRAMBLE_CHARS, revealDelay: duration * 0.35, speed: 0.6 },
    });
    return () => {
      tween.kill();
      element.textContent = text;
    };
  }, [mode, text, trigger, duration]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" ref={ref}>
        {text}
      </span>
    </span>
  );
}
