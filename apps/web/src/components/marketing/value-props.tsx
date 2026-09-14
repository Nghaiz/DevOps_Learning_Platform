import { t } from '@devops-platform/copy';
import { HomeSection } from './home-section';
import styles from './landing.module.css';

const HIGHLIGHTS = ['sandbox', 'grading', 'progress', 'local'] as const;

export function ValueProps() {
  return (
    <HomeSection labelledBy="thuc-hanh" tone="muted">
      <div className={styles.practiceLayout}>
        <div className={styles.practiceIntro}>
          <p className={styles.sectionKicker}>{t('home.practice.kicker')}</p>
          <h2 id="thuc-hanh" className={styles.sectionTitle}>
            {t('home.practice.title')}
          </h2>
          <p className={styles.sectionLede}>{t('home.practice.description')}</p>
          <p className={styles.practiceAside}>{t('home.practice.aside')}</p>
        </div>
        <dl className={styles.practiceList}>
          {HIGHLIGHTS.map((id, index) => (
            <div key={id} className={styles.practiceRow}>
              <dt>
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {t(`home.value-title.${id}`)}
              </dt>
              <dd>{t(`home.value-body.${id}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </HomeSection>
  );
}
