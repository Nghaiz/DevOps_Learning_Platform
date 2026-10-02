import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { redirect } from 'next/navigation';
import { readCanAuthor, readViewerSession } from '../../components/catalog/viewer-role.server';
import { readCatalogCounts } from '../../components/marketing/catalog-stats.server';
import { PlaygroundsClient } from './playgrounds-client';

export const metadata: Metadata = {
  title: t('catalog.meta-title.playgrounds'),
};

/** Server Component, kiểm auth THẬT (đụng DB), cùng khuôn `/labs`. */
export default async function PlaygroundsPage() {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  const [canAuthor, counts] = await Promise.all([readCanAuthor(), readCatalogCounts()]);
  return <PlaygroundsClient canAuthor={canAuthor} total={counts.playgrounds} />;
}
