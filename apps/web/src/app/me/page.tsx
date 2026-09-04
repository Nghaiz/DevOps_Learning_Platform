import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../server/auth/config';
import { MeClient } from './me-client';

export const metadata: Metadata = {
  title: 'Của tôi — DevOps Learning Platform',
};

/** Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs`. */
export default async function MePage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <MeClient />;
}
