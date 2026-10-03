'use client';

import { Suspense, use, useRef } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Gamepad2 } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { useViewer } from '../../shell/viewer-context';
import { SECTION_IDS } from '../content';
import { COUNT_KINDS, hasAnyCount, type LandingCatalog } from '../data/catalog-shape';
import { BandWipe } from '../fx/band-wipe';
import { KineticText } from '../fx/kinetic-text';
import { Magnetic } from '../fx/magnetic';
import { Odometer } from '../fx/odometer';
import { EASE_OUT, gsap, ScrollTrigger } from '../motion/gsap';
import { landingStore } from '../motion/store';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import base from '../landing.module.css';
import styles from './closing.module.css';

const LOOP_SEPARATOR = ' · ';

export function Closing({ catalog }: { readonly catalog: Promise<LandingCatalog> }) {
  const viewer = useViewer();
  const ref = useRef<HTMLElement>(null);
  const loop = t('home.closing.loop').split(LOOP_SEPARATOR);

  useLandingGSAP(
    () => {
      const section = ref.current;
      if (section === null) return undefined;
      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'top top',
        onUpdate: (self) => {
          landingStore.closingIn = self.progress;
        },
      });
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          landingStore.closing = self.progress;
        },
      });
      const chars = section.querySelectorAll('[data-kinetic-char]');
      gsap.fromTo(
        chars,
        { yPercent: 70, rotate: 9, opacity: 0.02 },
        {
          yPercent: 0,
          rotate: 0,
          opacity: 1,
          duration: 1.1,
          ease: EASE_OUT,
          stagger: 0.025,
          scrollTrigger: { trigger: section, start: 'top 60%', once: true },
        },
      );
      /* Tám chặng của vòng lặp sáng lần lượt; chỉ chạy khi khu đang trên màn hình. */
      const pulse = gsap.fromTo(
        section.querySelectorAll('[data-loop-word]'),
        { opacity: 0.18 },
        {
          opacity: 1,
          stagger: { each: 0.12, repeat: -1, yoyo: true },
          duration: 0.6,
          ease: 'sine.inOut',
          paused: true,
        },
      );
      ScrollTrigger.create({
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => {
          landingStore.visible.closing = self.isActive;
          if (self.isActive) pulse.play();
          else pulse.pause();
        },
      });
      return () => {
        landingStore.visible.closing = false;
      };
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      id={SECTION_IDS.closing}
      data-testid="landing-closing"
      className={`${base.section} ${styles.closing}`}
    >
      <BandWipe lines={['observe', 'iac', 'k8s', 'docker', 'prod', 'obs', 'linux']} />
      <div className={`${base.container} ${styles.inner}`}>
        <p className={styles.loop} aria-hidden="true">
          {loop.map((word) => (
            <span key={word} data-loop-word>
              {word}
            </span>
          ))}
        </p>
        <h2 className={styles.title}>
          <span className={styles.titleA}>
            <KineticText text={t('home.closing.title-a')} play="manual" />
          </span>
          <span className={styles.titleB}>
            <KineticText text={t('home.closing.title-b')} play="manual" />
          </span>
        </h2>
        <p className={`${base.lede} ${styles.lede}`}>{t('home.closing.lede')}</p>
        <div className={styles.actions}>
          <Magnetic>
            <Link className={base.cta} href={viewer === null ? '/register' : '/lessons'}>
              {viewer === null ? t('home.closing.cta-guest') : t('home.closing.cta-member')}
              <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
          </Magnetic>
          <Link className={base.ghost} href="/games">
            {t('home.closing.cta-games')}
            <Gamepad2 size={19} aria-hidden="true" />
          </Link>
        </div>
        <Suspense fallback={null}>
          <ClosingStats catalog={catalog} />
        </Suspense>
      </div>
    </section>
  );
}

function ClosingStats({ catalog }: { readonly catalog: Promise<LandingCatalog> }) {
  const { counts } = use(catalog);
  if (!hasAnyCount(counts)) return null;
  return (
    <dl className={styles.stats}>
      {COUNT_KINDS.map((kind) => {
        const value = counts[kind];
        return (
          <div key={kind} className={styles.stat}>
            <dt>{t(`home.stat.${kind}`)}</dt>
            <dd>
              {value === null ? (
                <>
                  <span aria-hidden="true">{t('home.stat.unknown')}</span>
                  <span className="sr-only">{t('home.stat.unknown-sr')}</span>
                </>
              ) : (
                <Odometer value={value} />
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
