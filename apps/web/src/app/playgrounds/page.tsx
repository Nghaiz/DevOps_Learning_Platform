import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../server/auth/config';
import { PlaygroundsClient } from './playgrounds-client';

export const metadata: Metadata = {
  title: 'Sân chơi — DevOps Learning Platform',
};

/** Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs` và `/dashboard`. */
export default async function PlaygroundsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <PlaygroundsClient />;
}
