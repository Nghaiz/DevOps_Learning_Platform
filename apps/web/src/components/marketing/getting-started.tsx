import { ArrowDownRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { HomeCta } from '../../app/home-cta';
import { HomeSection } from './home-section';
import styles from './landing.module.css';

export function GettingStarted() {
  return (
    <HomeSection labelledBy="bat-dau" innerClassName={styles.closing}>
      <p className={styles.sectionKicker}>{t('home.start.kicker')}</p>
      <div className={styles.closingHeading}>
        <h2 id="bat-dau" className={styles.closingTitle}>
          {t('home.start.title')}
        </h2>
        <ArrowDownRight size={72} strokeWidth={1} aria-hidden="true" />
      </div>
      <div className={styles.closingActions}>
        <p>{t('home.start.description')}</p>
        <HomeCta />
      </div>
      <div className={styles.closingLine}>
        <span>{t('home.identity.name')}</span>
        <span>{t('home.footer.note')}</span>
      </div>
    </HomeSection>
  );
}
