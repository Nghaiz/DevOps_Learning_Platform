import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../../lib/trpc-react';

/**
 * Layout của hệ bài tập OJ — chỉ để cấp client tRPC + cache.
 *
 * ⚠ KHÔNG gác auth ở đây. Hai trang bên dưới đều tự gọi `readViewerSession`
 * (memo hoá bằng `cache()` theo từng request), nên thêm một lượt gác ở layout
 * là thêm một lượt đụng DB cho mỗi lần mở trang mà không chặn thêm được gì —
 * cùng lý lẽ đã ghi ở `labs/layout.tsx`.
 *
 * Cần cache dùng chung vì `viewerStatus` xuất hiện ở HAI nơi: cột trạng thái
 * trong bảng `/problems` và phần đầu `/problems/[code]`. Nộp bài xong mà không
 * `invalidate` được cả hai thì quay ra danh sách vẫn thấy "Chưa động tới" cho
 * bài vừa giải — loại lỗi người dùng báo còn dev không tái hiện được.
 */
export default function ProblemsLayout({ children }: { readonly children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
