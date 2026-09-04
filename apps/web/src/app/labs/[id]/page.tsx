import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../../server/auth/config';
import { LabClient } from './lab-client';

/**
 * Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/session` và
 * `/dashboard`. `userId` truyền xuống client vì `session.extend`/`get`/`reap`
 * (dùng chung cho gia hạn/kết thúc/hỏi trạng thái của một lần thử lab) đều nhận
 * `userId` trong input — xem `use-lab-session.ts`.
 */
export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <LabClient labId={id} userId={session.user.id} />;
}
