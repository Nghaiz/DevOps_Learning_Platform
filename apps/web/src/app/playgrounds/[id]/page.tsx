import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { withReturnPath } from '../../login/return-path';
import { PlaygroundClient } from './playground-client';

/**
 * Server Component, kiểm auth THẬT (đụng DB), cùng khuôn `/labs/[id]`. `userId` truyền
 * xuống vì router `session.*` (gia hạn/tắt/hỏi trạng thái) nhận nó trong input.
 */
export default async function PlaygroundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readViewerSession();
  if (session === null) {
    redirect(withReturnPath('/login', `/playgrounds/${encodeURIComponent(id)}`));
  }
  return <PlaygroundClient playgroundId={id} userId={session.user.id} />;
}
