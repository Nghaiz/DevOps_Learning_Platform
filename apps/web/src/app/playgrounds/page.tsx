import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readCanAuthor, readViewerSession } from '../../components/catalog/viewer-role.server';
import { PlaygroundsClient } from './playgrounds-client';

export const metadata: Metadata = {
  title: 'Sân chơi — DevOps Learning Platform',
};

/** Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs`. */
export default async function PlaygroundsPage() {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  return <PlaygroundsClient canAuthor={await readCanAuthor()} />;
}
