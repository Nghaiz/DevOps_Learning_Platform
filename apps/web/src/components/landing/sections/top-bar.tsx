'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { useViewer } from '../../shell/viewer-context';
import { SECTION_IDS } from '../content';
import { ScrollTrigger } from '../motion/gsap';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import { PtitMark } from '../ptit-mark';
import base from '../landing.module.css';
import styles from './top-bar.module.css';

const ANCHORS = [
  { id: SECTION_IDS.journey, key: 'home.nav.journey' },
  { id: SECTION_IDS.terminal, key: 'home.nav.terminal' },
  { id: SECTION_IDS.modes, key: 'home.nav.modes' },
  { id: SECTION_IDS.paths, key: 'home.nav.paths' },
  { id: SECTION_IDS.games, key: 'home.nav.games' },
] as const;

/** Cuộn xuống quá ngưỡng này thì thanh trên tự thu lên; cuộn lên một chút là hiện lại. */
const HIDE_AFTER_PX = 520;

export function TopBar() {
  const viewer = useViewer();
  const ref = useRef<HTMLElement>(null);

  useLandingGSAP(
    () => {
      const bar = ref.current;
      if (bar === null) return;
      const progress = bar.querySelector<HTMLElement>('[data-progress]');
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => {
          const y = self.scroll();
          bar.dataset.scrolled = y > 24 ? 'true' : 'false';
          bar.dataset.hidden = y > HIDE_AFTER_PX && self.direction === 1 ? 'true' : 'false';
          if (progress !== null) progress.style.transform = `scaleX(${self.progress})`;
        },
      });
    },
    { scope: ref },
  );

  return (
    <header ref={ref} className={styles.bar} data-scrolled="false" data-hidden="false">
      <div className={styles.inner}>
        <a className={styles.brand} href={`#${SECTION_IDS.hero}`} aria-label={t('home.nav.home')}>
          <PtitMark className={styles.mark} />
          <span className={styles.brandText}>{t('home.brand.name')}</span>
        </a>
        <nav className={styles.nav} aria-label={t('home.nav.label')}>
          <ul>
            {ANCHORS.map((anchor) => (
              <li key={anchor.id}>
                <a href={`#${anchor.id}`}>{t(anchor.key)}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.actions}>
          {viewer === null ? (
            <>
              <Link className={styles.signIn} href="/login">
                {t('home.nav.sign-in')}
              </Link>
              <Link className={base.cta} href="/register" data-size="sm">
                {t('home.nav.register')}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </>
          ) : (
            <Link className={base.cta} href="/lessons" data-size="sm">
              {t('home.nav.enter')}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <span className={styles.progress} data-progress aria-hidden="true" />
    </header>
  );
}
