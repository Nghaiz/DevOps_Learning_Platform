import type { ReactElement } from 'react';
import { notFound } from 'next/navigation';
import { AdminClassDetailClient } from './class-detail-client';

/**
 * `/admin/classes/[classId]` (18.F.2) — sinh viên của một lớp và bảng điểm.
 *
 * Cổng vai trò nằm ở `app/admin/layout.tsx`, bọc mọi đường dưới `/admin`, nên
 * trang này không lặp lại phép kiểm đó.
 *
 * ## Vì sao kiểm dạng `uuid` NGAY Ở ĐÂY
 *
 * `/admin/classes/abc` không phải "lớp không tồn tại" mà là "không phải một id
 * lớp". Để nó đi tiếp thì client sẽ gọi ba procedure, cả ba cùng trả 400 từ
 * Zod, và người dùng nhận ba khối lỗi cho một đường dẫn gõ sai. 404 thật ở đây
 * nói đúng chuyện đang xảy ra, và nó cũng không cho người ngoài một đường dò
 * rẻ tiền vào tầng DB. Cùng khuôn `isProblemCode` ở `/problems/[code]`.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminClassDetailPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}): Promise<ReactElement> {
  const { classId } = await params;
  if (!UUID_RE.test(classId)) {
    notFound();
  }
  return <AdminClassDetailClient classId={classId} />;
}
