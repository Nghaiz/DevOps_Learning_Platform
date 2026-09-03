import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuth } from '../../server/auth/config';
import { LabsClient } from './labs-client';

export const metadata: Metadata = {
  title: 'Lab — DevOps Learning Platform',
};

/**
 * Server Component — kiểm auth THẬT qua `auth.api.getSession` (đụng DB), cùng
 * khuôn với `/dashboard` và `/session`: `proxy.ts` chỉ kiểm SỰ TỒN TẠI của
 * cookie, page này là nguồn sự thật, chặn cả ca cookie còn nhưng session đã bị
 * revoke ở DB. `LabsClient` không cần `userId` (danh sách không mở phiên nào).
 */
export default async function LabsPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });

  if (session === null) {
    redirect('/login');
  }

  return <LabsClient />;
}
