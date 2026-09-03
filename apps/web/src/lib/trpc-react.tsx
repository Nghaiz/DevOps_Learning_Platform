'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/trpc/routers/app-router';

/**
 * Client tRPC + cache — ban đầu cho trụ cột bài học (P2 / 2.D), P8 dùng LẠI
 * nguyên vẹn cho `/labs` và `/playgrounds` (cùng lý lẽ: danh sách có cursor,
 * `getAttempt` cần cache dùng chung với thẻ trạng thái, mutation cần
 * `invalidate` thay vì tự truyền hàm refetch xuống ba tầng component). Tên
 * `LessonsProvider` cũ đã đổi thành `TrpcQueryProvider` vì nó không còn riêng
 * cho lessons — hành vi bên trong KHÔNG đổi.
 *
 * ## Vì sao ở đây CÓ TanStack Query trong khi `/session` thì KHÔNG
 *
 * `lib/trpc.ts` lập luận (đúng) rằng `/session` không cần cache: hai lời gọi,
 * một lần bấm, và mọi thứ realtime đi qua WebSocket. Trang bài học vi phạm cả ba
 * tiền đề đó:
 *
 * - `progress` xuất hiện ở HAI nơi — thẻ bài trong `/lessons` và thanh tiến độ
 *   trong `/lessons/[id]`. `checkStep` sửa nó. Không có cache dùng chung thì hai
 *   màn hình cùng một sự thật trôi khỏi nhau, và triệu chứng ("quay ra danh sách
 *   thấy tiến độ cũ") là loại lỗi người dùng báo còn dev không tái hiện được.
 * - Danh sách bài có phân trang bằng cursor — đúng hình dạng của `useInfiniteQuery`.
 * - `invalidate` sau mutation là thứ thay cho việc tự truyền hàm refetch xuống
 *   ba tầng component.
 *
 * Hai client cùng tồn tại KHÔNG phải trùng lặp: chúng là hai chiến lược đọc dữ
 * liệu cho hai loại trang, và `lib/trpc.ts` giữ nguyên để `/session` không phải
 * gánh một tầng cache nó không dùng.
 *
 * ## KHÔNG có transformer — cố ý, và phải giữ khớp
 *
 * `lib/trpc.ts` không khai `transformer`, nên server cũng không. Thêm superjson
 * chỉ ở một trong hai client là cách chắc chắn để một nửa số procedure vỡ lúc
 * chạy trong khi typecheck vẫn xanh. Hệ quả cần nhớ: **không procedure nào được
 * trả `bigint` hay `Date` thô** — `toJsonSession` đã đổi sang chuỗi ISO vì lý do
 * này.
 */
export const api = createTRPCReact<AppRouter>();

export function TrpcQueryProvider({ children }: { children: ReactNode }) {
  // `useState(() => …)` chứ không phải hằng ở module scope: một QueryClient dùng
  // chung giữa các request trên server sẽ rò cache của người dùng này sang người
  // dùng khác. Đây là lỗi bảo mật, không phải lỗi hiệu năng — và nó không lộ ra
  // ở dev một tab.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Nội dung bài học được nướng vào image, bất biến trong vòng đời tiến
            // trình. Tiến độ thì không — nhưng nó chỉ đổi bởi chính mutation của
            // người dùng, và mutation đó `invalidate` tường minh. 30s là mức chặn
            // refetch dồn dập khi chuyển step qua lại.
            staleTime: 30_000,
            // Lỗi tRPC ở đây phần lớn là 401/404/PRECONDITION_FAILED — retry chúng
            // chỉ làm người dùng chờ lâu hơn để nhận cùng một câu trả lời.
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const [trpcClient] = useState(() =>
    api.createClient({ links: [httpBatchLink({ url: '/api/trpc' })] }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
