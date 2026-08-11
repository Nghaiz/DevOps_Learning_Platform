import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../../server/auth/config';
import { SessionClient } from './session-client';

/**
 * F7 — trang `/session`.
 *
 * Server Component kiểm auth THẬT qua `auth.api.getSession` (đụng DB), cùng khuôn
 * hai lớp với `/dashboard`: `proxy.ts` chỉ kiểm SỰ TỒN TẠI của cookie (rẻ, chạy
 * mọi request), page này là nguồn sự thật và chặn cả ca cookie còn nhưng session
 * đã bị revoke ở DB.
 *
 * `userId` truyền xuống client vì `session.create`/`get`/`extend` đều nhận
 * `userId` trong input (luật 1 — `assertOwnerOrAdmin` so nó với `ctx.user.id`).
 * Không rò gì: đó là id của chính người đang đăng nhập, và server vẫn tự kiểm
 * chứ không tin giá trị client gửi lên.
 */
export default async function SessionPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <SessionClient userId={session.user.id} />;
}
