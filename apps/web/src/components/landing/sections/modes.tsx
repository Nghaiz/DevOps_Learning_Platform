'use client';

import { useRef, type CSSProperties, type PointerEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { lineVar, MODES, SECTION_IDS, type ModeId } from '../content';
import { BandWipe } from '../fx/band-wipe';
import { EASE_OUT, gsap, ScrollTrigger } from '../motion/gsap';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import base from '../landing.module.css';
import { ModePicto, POD_START, POD_TARGETS } from './mode-picto';
import styles from './modes.module.css';


function pictoTimeline(card: HTMLElement, id: ModeId): gsap.core.Timeline {
  const timeline = gsap.timeline({ repeat: -1, repeatDelay: 1.2, paused: true });
  const find = (selector: string) => Array.from(card.querySelectorAll(selector));
  if (id === 'lesson') {
    timeline.fromTo(find('[data-tick]'), { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.45, stagger: 0.42, ease: EASE_OUT });
    timeline.to(find('[data-tick]'), { drawSVG: '0%', duration: 0.3, delay: 1 });
  } else if (id === 'lab') {
    timeline.fromTo(find('[data-typing]'), { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.1, ease: 'steps(12)' });
    timeline.fromTo(
      find('[data-stamp]'),
      { scale: 0, rotate: -40, transformOrigin: '50% 50%' },
      { scale: 1, rotate: 0, duration: 0.5, ease: 'back.out(2.4)' },
    );
    timeline.to(find('[data-stamp]'), { scale: 0, duration: 0.25, delay: 1.1 });
  } else if (id === 'playground') {
    timeline.to(find('[data-cursor]'), { opacity: 0, duration: 0.01, repeat: 5, yoyo: true, repeatDelay: 0.35 });
    timeline.to(find('[data-cube]'), { y: -6, duration: 0.8, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0);
  } else {
    find('[data-pod]').forEach((pod, index) => {
      const target = POD_TARGETS[index] ?? { x: 0, y: 0 };
      timeline.fromTo(
        pod,
        { x: POD_START.x - target.x, y: POD_START.y - target.y, opacity: 0 },
        { x: 0, y: 0, opacity: 1, duration: 0.7, ease: 'power3.inOut' },
        index * 0.45,
      );
    });
    timeline.to(find('[data-pod]'), { opacity: 0, duration: 0.3, delay: 0.9 });
  }
  return timeline;
}

export function Modes() {
  const ref = useRef<HTMLElement>(null);

  useLandingGSAP(
    () => {
      const section = ref.current;
      if (section === null) return undefined;
      const cards = Array.from(section.querySelectorAll<HTMLElement>('[data-mode]'));
      gsap.fromTo(
        cards,
        { clipPath: 'inset(100% 0% 0% 0%)', y: 60 },
        {
          clipPath: 'inset(0% 0% 0% 0%)',
          y: 0,
          duration: 1.1,
          ease: EASE_OUT,
          stagger: 0.12,
          scrollTrigger: { trigger: section, start: 'top 72%', once: true },
        },
      );
      const detach = cards.map((card) => {
        const id = card.dataset.mode as ModeId;
        const timeline = pictoTimeline(card, id);
        ScrollTrigger.create({
          trigger: card,
          start: 'top bottom',
          end: 'bottom top',
          onToggle: (self) => (self.isActive ? timeline.play() : timeline.pause()),
        });
        const fast = () => timeline.timeScale(2);
        const slow = () => timeline.timeScale(1);
        card.addEventListener('pointerenter', fast);
        card.addEventListener('pointerleave', slow);
        return () => {
          card.removeEventListener('pointerenter', fast);
          card.removeEventListener('pointerleave', slow);
        };
      });
      return () => detach.forEach((off) => off());
    },
    { scope: ref },
  );

  /* Đèn chiếu theo con trỏ: chỉ ghi hai biến CSS, phần vẽ là radial-gradient trong stylesheet. */
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  return (
    <section
      ref={ref}
      id={SECTION_IDS.modes}
      data-testid="landing-modes"
      className={`${base.section} ${base.solid} ${styles.section}`}
    >
      <BandWipe lines={['red', 'linux', 'git', 'docker', 'k8s', 'cicd', 'prod']} />
      <div className={base.container}>
        <header className={styles.header}>
          <div>
            <p className={base.kicker}>{t('home.modes.kicker')}</p>
            <h2 className={base.h2}>{t('home.modes.title')}</h2>
          </div>
          <div>
            <p className={base.lede}>{t('home.modes.lede')}</p>
            <p className={styles.engine}>
              <span aria-hidden="true" />
              {t('home.modes.engine')}
            </p>
          </div>
        </header>
        <ul className={styles.grid}>
          {MODES.map((mode, index) => (
            <li
              key={mode.id}
              data-mode={mode.id}
              className={styles.card}
              style={{ '--line': lineVar(mode.line) } as CSSProperties}
              onPointerMove={onPointerMove}
            >
              <span className={styles.index} aria-hidden="true">{`0${index + 1}`}</span>
              <div className={styles.picto}>
                <ModePicto id={mode.id} />
              </div>
              <p className={styles.tag}>{t(`home.mode.${mode.id}.tag`)}</p>
              <h3 className={styles.title}>{t(`home.mode.${mode.id}.title`)}</h3>
              <p className={styles.body}>{t(`home.mode.${mode.id}.body`)}</p>
              <Link className={styles.link} href={mode.href}>
                {t(`home.mode.${mode.id}.cta`)}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
