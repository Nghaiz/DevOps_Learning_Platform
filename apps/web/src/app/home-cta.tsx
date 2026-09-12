'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { useViewer } from '../components/shell/viewer-context';
import styles from '../components/marketing/landing.module.css';

/** Reuse the session already resolved by the shell. */
export function HomeCta() {
  const viewer = useViewer();
  return (
    <div className={styles.heroActions}>
      <Link className={styles.primaryLink} href={viewer === null ? '/register' : '/lessons'}>
        {viewer === null ? t('home.cta.enter.guest') : t('home.cta.enter.member')}
        <ArrowUpRight size={19} aria-hidden="true" />
      </Link>
      <a href="#lo-trinh" className={styles.textLink}>
        {t('home.cta.paths')}
      </a>
    </div>
  );
}
