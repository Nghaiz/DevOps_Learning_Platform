'use client';

import { Suspense, use, useRef } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { useViewer } from '../../shell/viewer-context';
import { SECTION_IDS } from '../content';
import { hasAnyCount, type CountKind, type LandingCatalog } from '../data/catalog-shape';
import { KineticText } from '../fx/kinetic-text';
import { Magnetic } from '../fx/magnetic';
import { Odometer } from '../fx/odometer';
import { gsap, ScrollTrigger } from '../motion/gsap';
import { useMotionMode } from '../motion/motion-provider';
import { landingStore } from '../motion/store';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import base from '../landing.module.css';
import styles from './hero.module.css';

const HERO_STATS: readonly CountKind[] = ['lessons', 'labs', 'paths', 'games'];

export function Hero({ catalog }: { readonly catalog: Promise<LandingCatalog> }) {
  const viewer = useViewer();
  const mode = useMotionMode();
  const ref = useRef<HTMLElement>(null);

  useLandingGSAP(
    () => {
      const hero = ref.current;
      if (hero === null) return;
      ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom top',
        onUpdate: (self) => {
          landingStore.heroOut = self.progress;
        },
        onToggle: (self) => {
          landingStore.visible.hero = self.isActive || self.progress === 0;
        },
      });
      /*
        Tiêu đề co bề ngang (trục wdth của Archivo, 112 xuống 72) và trôi lên khi hero cuộn
        đi: kinetic type gắn thẳng vào vị trí cuộn, không phải một hiệu ứng chạy một lần.
      */
      gsap
        .timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } })
        .to(hero.querySelector('[data-hero-title]'), { '--wdth': 72, yPercent: -18, ease: 'none' }, 0)
        .to(hero.querySelector('[data-hero-copy]'), { autoAlpha: 0, y: -60, ease: 'none' }, 0)
        .to(hero.querySelector('[data-hero-cue]'), { autoAlpha: 0, ease: 'none', duration: 0.3 }, 0);
    },
    { scope: ref },
  );

  return (
    <section
      ref={ref}
      id={SECTION_IDS.hero}
      data-testid="landing-hero"
      className={`${base.section} ${styles.hero}`}
    >
      <div className={`${base.container} ${styles.inner}`}>
        <p className={styles.eyebrow}>
          <span className={styles.live} aria-hidden="true" />
          {t('home.hero.eyebrow')}
        </p>
        <h1 className={styles.title} data-hero-title>
          <span className={styles.lineA}>
            <KineticText text={t('home.hero.title-a')} delayMs={80} />
          </span>
          <span className={styles.lineB}>
            <KineticText
              text={t('home.hero.title-b')}
              delayMs={360}
              charClassName={styles.charTone}
            />
          </span>
        </h1>
        <div className={styles.copy} data-hero-copy>
          <p className={styles.lede}>{t('home.hero.lede')}</p>
          <div className={styles.actions}>
            <Magnetic>
              <Link
                className={base.cta}
                href={viewer === null ? '/register' : '/lessons'}
                data-testid="landing-cta-primary"
              >
                {viewer === null ? t('home.hero.cta-guest') : t('home.hero.cta-member')}
                <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
            </Magnetic>
            <a className={base.ghost} href={`#${SECTION_IDS.journey}`}>
              {t('home.hero.cta-tour')}
              <ArrowDownRight size={19} aria-hidden="true" />
            </a>
          </div>
          {viewer === null ? <p className={styles.note}>{t('home.hero.note')}</p> : null}
          {mode === 'reduced' ? <p className={styles.note}>{t('home.scene.reduced')}</p> : null}
        </div>
      </div>
      <div className={`${base.container} ${styles.bottom}`}>
        <Suspense fallback={<StatsSkeleton />}>
          <HeroStats catalog={catalog} />
        </Suspense>
        <p className={styles.cue} data-hero-cue aria-hidden="true">
          {t('home.hero.scroll')}
          <span className={styles.cueTrack}>
            <span className={styles.cueDot} />
          </span>
        </p>
      </div>
    </section>
  );
}

function StatsSkeleton() {
  return <div className={styles.stats} aria-hidden="true" data-skeleton />;
}

function HeroStats({ catalog }: { readonly catalog: Promise<LandingCatalog> }) {
  const { counts } = use(catalog);
  if (!hasAnyCount(counts)) return <StatsSkeleton />;
  return (
    <dl className={styles.stats} aria-label={t('home.hero.stats')}>
      {HERO_STATS.map((kind) => {
        const value = counts[kind];
        return (
          <div key={kind} className={styles.stat}>
            <dt className={styles.statLabel}>{t(`home.stat.${kind}`)}</dt>
            <dd className={styles.statValue}>
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
