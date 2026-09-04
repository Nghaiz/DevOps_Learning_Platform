import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../../server/auth/config';
import { PathClient } from './path-client';

/** Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs/[id]`. */
export default async function PathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <PathClient pathId={id} />;
}
