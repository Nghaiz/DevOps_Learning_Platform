import type { ReactNode } from 'react';
import { ArrowDown, Terminal } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { LabPreview } from './lab-preview';
import styles from './landing.module.css';

/** Product-first opening: the visual is a working, explicitly illustrative demo. */
export function Hero({ children }: { readonly children: ReactNode }) {
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <p className={styles.eyebrow}>
        <Terminal size={17} aria-hidden="true" />
        {t('home.hero.eyebrow')}
      </p>
      <div className={styles.heroHeading}>
        <h1 id="home-title" className={styles.heroTitle}>
          {t('home.hero.title')}
          <span>{t('home.hero.title-accent')}</span>
        </h1>
        <div className={styles.heroIntroduction}>
          <p className={styles.heroLede}>{t('home.hero.lede')}</p>
          {children}
          <p className={styles.heroFootnote}>{t('home.hero.footnote')}</p>
        </div>
      </div>
      <LabPreview />
      <div className={styles.heroBottom}>
        <p>{t('home.hero.preview-note')}</p>
        <a href="#lo-trinh" className={styles.textLink}>
          {t('home.hero.scroll-hint')}
          <ArrowDown size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
