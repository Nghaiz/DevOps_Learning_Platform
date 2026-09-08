import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { ProblemsClient } from './problems-client';

export const metadata: Metadata = {
  title: 'Bài tập — DevOps Learning Platform',
  description: 'Danh sách bài tập Kubernetes có lọc theo độ khó, chủ đề, tag và trạng thái của bạn.',
};

/**
 * Server Component — kiểm auth THẬT (đụng DB), cùng khuôn `/labs` và `/paths`:
 * `proxy.ts` chỉ kiểm SỰ TỒN TẠI của cookie, còn trang này là nguồn sự thật nên
 * nó chặn được cả ca cookie còn nhưng phiên đã bị thu hồi ở DB.
 *
 * ⚠ `/problems` CHƯA có trong `PROTECTED_PATHS` của `proxy.ts` — file đó ngoài
 * vùng sở hữu của lane này. Thiếu nó chỉ làm mất lượt chuyển hướng SỚM (người
 * chưa đăng nhập tải trang rồi mới bị đẩy về `/login`), không mở ra lỗ nào: cổng
 * thật là dòng `redirect` dưới đây cộng `protectedProcedure` ở tầng tRPC.
 *
 * `<Suspense>` là bắt buộc chứ không phải cẩn thận thừa: `ProblemsClient` đọc
 * `useSearchParams`, và Next từ chối dựng một cây có hook đó mà không có ranh
 * giới suspense bao ngoài.
 */
export default async function ProblemsPage() {
  if ((await readViewerSession()) === null) {
    redirect('/login');
  }

  return (
    <Suspense fallback={null}>
      <ProblemsClient />
    </Suspense>
  );
}
