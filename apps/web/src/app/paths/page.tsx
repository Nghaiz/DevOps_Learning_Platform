import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readCanAuthor, readViewerSession } from '../../components/catalog/viewer-role.server';
import { PathsClient } from './paths-client';

export const metadata: Metadata = {
  title: 'Lộ trình — DevOps Learning Platform',
};

/** Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs`. */
export default async function PathsPage() {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  return <PathsClient canAuthor={await readCanAuthor()} />;
}
