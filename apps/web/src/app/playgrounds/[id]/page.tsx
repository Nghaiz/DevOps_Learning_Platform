import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../../server/auth/config';
import { PlaygroundClient } from './playground-client';

/**
 * Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs/[id]`.
 * `userId` truyền xuống vì router `session.*` (gia hạn/kết thúc/hỏi trạng thái)
 * nhận nó trong input.
 */
export default async function PlaygroundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <PlaygroundClient playgroundId={id} userId={session.user.id} />;
}
