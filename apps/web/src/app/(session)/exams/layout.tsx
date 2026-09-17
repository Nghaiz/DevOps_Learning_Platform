import type { ReactNode } from 'react';

import { TrpcQueryProvider } from '../../../lib/trpc-react';

/**
 * Layout của chế độ thi (§18.G) , chỉ để cấp client tRPC + cache.
 *
 * ⛔ Thiếu file này là một lỗi 500, không phải một thiếu sót thẩm mỹ, và nó là
 * loại lỗi mà KHÔNG cổng nhanh nào bắt được: `tsc` sạch, `eslint` sạch, 2315 ô
 * vitest xanh, `next build` xanh , rồi lượt quét axe đầu tiên trả
 * `/exams , HTTP 500` với `Unable to find tRPC Context`. Cả hai client bên dưới
 * gọi `api.*.useQuery`, và hook đó cần một provider ở trên nó trong cây React.
 *
 * `(session)` là một route GROUP, không phải một đoạn URL, và nó không có
 * layout riêng , mỗi nhánh dưới nó tự cấp provider (`problems/layout.tsx` là
 * tiền lệ). Đó là lý do một thư mục mới trong nhóm này không thừa hưởng gì cả.
 *
 * ⚠ KHÔNG gác auth ở đây. Hai trang bên dưới đều tự gọi `readViewerSession`
 * (memo hoá bằng `cache()` theo từng request), nên thêm một lượt gác ở layout
 * là thêm một lượt đụng DB cho mỗi lần mở trang mà không chặn thêm được gì ,
 * cùng lý lẽ đã ghi ở `problems/layout.tsx` và `labs/layout.tsx`.
 *
 * Cần cache DÙNG CHUNG vì trạng thái một lượt thi xuất hiện ở HAI nơi: huy hiệu
 * trong danh sách `/exams` và đồng hồ ở `/exams/[examId]`. Nộp bài xong mà
 * không `invalidate` được cả hai thì quay ra danh sách vẫn thấy "Đang làm" cho
 * kỳ thi vừa nộp , đúng loại lỗi người dùng báo còn dev không tái hiện được.
 */
export default function ExamsLayout({ children }: { readonly children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
