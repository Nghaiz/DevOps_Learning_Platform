import Link from 'next/link';
import { Button, Card, CardDescription, CardTitle } from '@devops-platform/ui';

/** Landing page — Server Component, không cần tương tác client. */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight">DevOps Learning Platform</h1>
      <p className="text-slate-600">
        Học DevOps qua lab sandbox thật — Kubernetes, containerd, CI/CD — trong một pod
        cô lập dựng riêng cho bạn.
      </p>
      <Card className="w-full text-left">
        <CardTitle>Bắt đầu</CardTitle>
        <CardDescription>Đăng nhập để mở dashboard lab của bạn.</CardDescription>
        <Link href="/login" className="mt-4 inline-block">
          <Button>Đăng nhập</Button>
        </Link>
      </Card>
    </main>
  );
}
