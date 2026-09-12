import { Suspense } from 'react';
import { HomeCta } from './home-cta';
import { Hero } from '../components/marketing/hero';
import { CatalogStats, CatalogStatsSkeleton } from '../components/marketing/catalog-stats';
import { Curriculum } from '../components/marketing/curriculum';
import { ValueProps } from '../components/marketing/value-props';
import { GettingStarted } from '../components/marketing/getting-started';
import { JourneyContinuation, ScrollExperience } from '../components/marketing/scroll-experience';
import styles from '../components/marketing/landing.module.css';

/** AppShell owns the main landmark. Catalog reads stream independently of the opening. */
export default function HomePage() {
  return (
    <div className={styles.page}>
      <ScrollExperience intro={<HomeCta />}>
        <JourneyContinuation kind="terminal">
          <Hero>
            <HomeCta />
          </Hero>
        </JourneyContinuation>
        <JourneyContinuation kind="catalog">
          <Suspense fallback={<CatalogStatsSkeleton />}>
            <CatalogStats />
          </Suspense>
        </JourneyContinuation>
        <JourneyContinuation kind="curriculum">
          <Curriculum />
        </JourneyContinuation>
        <JourneyContinuation kind="practice">
          <ValueProps />
        </JourneyContinuation>
        <JourneyContinuation kind="closing">
          <GettingStarted />
        </JourneyContinuation>
      </ScrollExperience>
    </div>
  );
}
