'use client';

import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { gsap, registerLandingGsap } from '../motion/gsap';
import fx from './fx.module.css';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const FLIP_STEP = 0.085;

export interface SplitFlapHandle {
  flip(): void;
}

const randomGlyph = (): string => GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));

/**
 * Bảng chữ lật kiểu Solari ở sân ga: mỗi ô lật qua vài ký tự ngẫu nhiên rồi dừng ở ký tự thật,
 * lệch nhịp từ trái sang phải. Chữ đích nằm sẵn trong HTML (server render), nên khi không có JS
 * hoặc ở chế độ giảm chuyển động bảng vẫn đọc đúng; `flip()` chỉ là phần trình diễn.
 */
export function SplitFlap({
  text,
  className,
  ref,
}: {
  readonly text: string;
  readonly className?: string | undefined;
  readonly ref?: Ref<SplitFlapHandle>;
}) {
  const rowRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const chars = Array.from(text.toUpperCase());

  useEffect(() => () => void timelineRef.current?.kill(), []);

  useImperativeHandle(
    ref,
    () => ({
      flip() {
        const row = rowRef.current;
        if (row === null) return;
        registerLandingGsap();
        const glyphs = Array.from(row.querySelectorAll<HTMLElement>('[data-char]'));
        timelineRef.current?.kill();
        const timeline = gsap.timeline();
        glyphs.forEach((glyph, index) => {
          const target = glyph.dataset.char ?? '';
          glyph.textContent = target;
          const flips = 2 + ((index * 7) % 4);
          const start = index * 0.028;
          for (let flip = 0; flip < flips; flip += 1) {
            const at = start + flip * FLIP_STEP;
            const last = flip === flips - 1;
            timeline.to(glyph, { rotateX: -90, duration: FLIP_STEP / 2, ease: 'power1.in' }, at);
            timeline.call(
              () => {
                glyph.textContent = last ? target : randomGlyph();
              },
              [],
              at + FLIP_STEP / 2,
            );
            timeline.to(
              glyph,
              { rotateX: 0, duration: FLIP_STEP / 2, ease: 'power1.out' },
              at + FLIP_STEP / 2,
            );
          }
        });
        timelineRef.current = timeline;
      },
    }),
    [],
  );

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" ref={rowRef} className={fx.flapRow}>
        {chars.map((char, index) =>
          char === ' ' ? (
            <span key={index} className={fx.flapGap} />
          ) : (
            <span key={index} className={fx.flapCell}>
              <span className={fx.flapGlyph} data-char={char}>
                {char}
              </span>
            </span>
          ),
        )}
      </span>
    </span>
  );
}
