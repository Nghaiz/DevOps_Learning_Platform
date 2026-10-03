import Link from 'next/link';
import { ArrowUp } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { SECTION_IDS } from '../content';
import { PtitMark } from '../ptit-mark';
import base from '../landing.module.css';
import styles from './footer.module.css';

const LINKS = [
  { href: '/lessons', key: 'home.mode.lesson.tag' },
  { href: '/labs', key: 'home.mode.lab.tag' },
  { href: '/paths', key: 'home.nav.paths' },
  { href: '/playgrounds', key: 'home.mode.playground.tag' },
  { href: '/games', key: 'home.mode.game.tag' },
  { href: '/login', key: 'home.nav.sign-in' },
] as const;

export function Footer() {
  return (
    <footer className={`${base.section} ${base.solid} ${styles.footer}`}>
      <div className={`${base.container} ${styles.inner}`}>
        <div className={styles.brand}>
          <PtitMark className={styles.mark} />
          <div>
            <p className={styles.name}>{t('home.brand.name')}</p>
            <p className={styles.org}>{t('home.brand.org')}</p>
          </div>
        </div>
        <p className={styles.note}>{t('home.footer.note')}</p>
        <nav aria-label={t('home.footer.links')}>
          <ul className={styles.links}>
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{t(link.key)}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.bottom}>
          <p className={styles.stack}>{t('home.footer.stack')}</p>
          <a className={styles.top} href={`#${SECTION_IDS.hero}`}>
            {t('home.footer.top')}
            <ArrowUp size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}
