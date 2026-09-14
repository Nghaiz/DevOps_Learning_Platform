import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { HomeSection } from './home-section';
import styles from './landing.module.css';

const PATHS = [
  { id: 'linux', href: '/paths/dlp-path-linux-cho-devops' },
  { id: 'docker', href: '/paths/dlp-path-docker-tu-so-0' },
  { id: 'kubernetes', href: '/paths/dlp-path-kubernetes-can-ban' },
  { id: 'delivery', href: '/paths/dlp-path-tu-container-toi-cum' },
] as const;

/** Routes correspond to the four authored paths in content/paths. */
export function Curriculum() {
  return (
    <HomeSection labelledBy="lo-trinh">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>{t('home.curriculum.kicker')}</p>
          <h2 id="lo-trinh" className={styles.sectionTitle}>
            {t('home.curriculum.title')}
          </h2>
        </div>
        <p className={styles.sectionLede}>{t('home.curriculum.description')}</p>
      </div>
      <ol className={styles.curriculum}>
        {PATHS.map(({ id, href }, index) => (
          <li key={id}>
            <Link href={href} className={styles.curriculumRow}>
              <span className={styles.rowNumber} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className={styles.pathHeading}>
                <span className={styles.pathLevel}>{t(`home.path-level.${id}`)}</span>
                <h3>{t(`home.path-title.${id}`)}</h3>
              </div>
              <p>{t(`home.path-description.${id}`)}</p>
              <ArrowUpRight size={22} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
      <p className={styles.curriculumNote}>{t('home.curriculum.auth-note')}</p>
    </HomeSection>
  );
}
