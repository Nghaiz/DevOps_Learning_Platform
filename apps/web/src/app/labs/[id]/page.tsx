import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { withReturnPath } from '../../login/return-path';
import { LabClient } from './lab-client';

/**
 * Server Component, kiểm auth THẬT (đụng DB). `userId` truyền xuống client vì
 * `session.extend`/`get`/`reap` (dùng chung cho gia hạn/tắt/hỏi trạng thái của một lần
 * thử lab) đều nhận `userId` trong input, xem `use-lab-session.ts`.
 *
 * `readViewerSession` chứ không gọi thẳng `getSession`: vỏ ứng dụng ở root layout đọc
 * cùng hàm đó, `cache()` gộp hai lượt về một lượt đụng DB.
 */
export default async function LabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readViewerSession();
  if (session === null) {
    redirect(withReturnPath('/login', `/labs/${encodeURIComponent(id)}`));
  }
  return <LabClient labId={id} userId={session.user.id} />;
}
