import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { readViewerSession } from '../../components/catalog/viewer-role.server';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Layout của trụ cột bài học.
 *
 * Hai việc, và cả hai đều CỐ Ý nằm ở layout thay vì ở từng page:
 *
 * 1. **Auth thật** (đụng DB) cho MỌI đường dưới `/lessons`, gồm cả
 *    `/lessons/<id>`. `proxy.ts` cũng gác, nhưng nó chỉ kiểm sự TỒN TẠI của
 *    cookie — layout này là lớp bắt được cookie còn mà session đã bị thu hồi.
 * 2. **Provider tRPC + cache** chỉ bọc nhánh này. Đặt ở root layout sẽ đẩy một
 *    ranh giới client lên mọi trang, kể cả `/` và `/login` — hai trang hiện là
 *    Server Component thuần và không có lý do gì phải tải TanStack Query.
 *
 * ⚠ Phiên đọc qua `readViewerSession` (memo hoá bằng `cache()` của React) chứ
 * KHÔNG gọi thẳng `getAuth().api.getSession`. `page.tsx` cũng cần phiên — để
 * biết người xem có soạn được bài không, thứ quyết định câu chữ của trạng thái
 * rỗng — và chỉ khi cả hai đi qua đúng hàm đó thì hai lời gọi mới gộp về MỘT
 * lượt đụng DB. Gọi thẳng ở một trong hai chỗ là quay lại hai lượt, âm thầm,
 * vì kết quả vẫn đúng.
 */
export default async function LessonsLayout({ children }: { children: ReactNode }) {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
