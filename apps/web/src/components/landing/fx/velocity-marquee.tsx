'use client';

import { useRef } from 'react';
import { gsap, ScrollTrigger } from '../motion/gsap';
import { landingStore } from '../motion/store';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import fx from './fx.module.css';

const BASE_SECONDS = 38;

/**
 * Hai hàng chữ chạy ngược chiều nhau. Cuộn càng nhanh chữ chạy càng gấp và nghiêng theo hướng
 * cuộn; đổi chiều cuộn thì chữ đổi chiều chạy. Ngoài màn hình thì dừng hẳn, không chạy ngầm.
 */
export function VelocityMarquee({ words, label }: { readonly words: readonly string[]; readonly label: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLandingGSAP(
    () => {
      const root = ref.current;
      if (root === null) return undefined;
      const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-marquee-row]'));
      const tweens = rows.map((row, index) =>
        index % 2 === 0
          ? gsap.fromTo(row, { xPercent: 0 }, { xPercent: -50, duration: BASE_SECONDS, ease: 'none', repeat: -1 })
          : gsap.fromTo(row, { xPercent: -50 }, { xPercent: 0, duration: BASE_SECONDS, ease: 'none', repeat: -1 }),
      );
      const skewers = rows.map((row) => gsap.quickTo(row, 'skewX', { duration: 0.45, ease: 'power3.out' }));
      let direction = 1;
      const tick = () => {
        const velocity = landingStore.velocity;
        if (velocity > 0.4) direction = 1;
        else if (velocity < -0.4) direction = -1;
        const speed = direction * (1 + Math.min(Math.abs(velocity) * 0.18, 7));
        tweens.forEach((tween) => tween.timeScale(speed));
        const skew = Math.max(-12, Math.min(12, velocity * -0.35));
        skewers.forEach((skewTo) => skewTo(skew));
      };
      const trigger = ScrollTrigger.create({
        trigger: root,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => {
          if (self.isActive) {
            tweens.forEach((tween) => tween.resume());
            gsap.ticker.add(tick);
          } else {
            tweens.forEach((tween) => tween.pause());
            gsap.ticker.remove(tick);
          }
        },
      });
      if (!trigger.isActive) tweens.forEach((tween) => tween.pause());
      return () => gsap.ticker.remove(tick);
    },
    { scope: ref },
  );

  const sequence = [...words, ...words];
  return (
    <div ref={ref} className={fx.marquee} role="group" aria-label={label}>
      <p className="sr-only">{words.join(', ')}</p>
      {[0, 1].map((row) => (
        <div key={row} aria-hidden="true" className={fx.marqueeViewport}>
          <div data-marquee-row className={fx.marqueeRow} data-outline={row === 1 ? '' : undefined}>
            {sequence.map((word, index) => (
              <span key={`${word}-${index}`} className={fx.marqueeWord}>
                {word}
                <span className={fx.marqueeDot} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
