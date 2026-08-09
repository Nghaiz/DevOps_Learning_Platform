import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Card, CardDescription, CardTitle } from '@devops-platform/ui';
import { getAuth } from '../../server/auth/config';
import { SignOutButton } from './sign-out-button';

/**
 * Server Component — kiểm session THẬT qua `auth.api.getSession` (đụng DB), khác
 * `proxy.ts` chỉ kiểm sự TỒN TẠI của cookie (không đụng DB). Hai lớp: proxy
 * redirect sớm cho UX; page này là nguồn sự thật, chặn cả trường hợp cookie còn
 * nhưng session đã bị revoke ở DB.
 */
export default async function DashboardPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <SignOutButton />
      </div>
      <Card>
        <CardTitle>Chào {session.user.name}</CardTitle>
        <CardDescription>
          Lab sandbox chưa sẵn sàng ở P0 — orchestrator mới có skeleton gRPC
          (trả Unimplemented có chủ ý). Nội dung lesson vào ở P1+.
        </CardDescription>
      </Card>
    </main>
  );
}
