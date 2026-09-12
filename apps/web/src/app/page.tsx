import { Suspense } from 'react';
import { HomeCta } from './home-cta';
import { Hero } from '../components/marketing/hero';
import { CatalogStats, CatalogStatsSkeleton } from '../components/marketing/catalog-stats';
import { Curriculum } from '../components/marketing/curriculum';
import { ValueProps } from '../components/marketing/value-props';
import { GettingStarted } from '../components/marketing/getting-started';

/** AppShell owns the main landmark. Catalog reads stream independently of the opening. */
export default function HomePage() {
  return (
    <div className="flex w-full flex-col">
      <Hero>
        <HomeCta />
      </Hero>
      <Suspense fallback={<CatalogStatsSkeleton />}>
        <CatalogStats />
      </Suspense>
      <Curriculum />
      <ValueProps />
      <GettingStarted />
    </div>
  );
}
