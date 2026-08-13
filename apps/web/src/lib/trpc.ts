import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import type { AppRouter } from '../server/trpc/routers/app-router';

/**
 * F8 — client tRPC cho trình duyệt. `apps/web` trước chặng này chỉ có
 * `@trpc/server`; plan cũ giả định sẵn có.
 *
 * **KHÔNG kèm TanStack Query.** Trang `/session` gọi đúng hai thứ: `session.create`
 * (một mutation, một lần bấm) và `session.get` (chỉ trên đường lỗi của contract
 * §7). Không có danh sách nào để cache, không có refetch-on-focus nào đáng muốn
 * — thêm một tầng cache vào đây là thêm phụ thuộc và thêm một nguồn "dữ liệu cũ"
 * cho một trang mà mọi thứ đều realtime qua WebSocket.
 *
 * `url` là đường TƯƠNG ĐỐI: cùng origin là điều kiện của cookie phiên Better Auth
 * (và của `dlp_sandbox`, xem contract §2). Hardcode absolute URL ở đây là cách
 * chắc chắn nhất để cookie không được gửi ở môi trường thứ hai.
 *
 * KHÔNG truyền `fetch` tuỳ biến. Bản đầu bọc lại để ghi tường minh
 * `credentials: 'same-origin'`, nhưng (a) đó ĐÃ là mặc định của `fetch` nên
 * wrapper không đổi hành vi gì, và (b) `exactOptionalPropertyTypes: true` của
 * repo làm `{...init}` không gán được vào `RequestInit` (`signal?: AbortSignal |
 * undefined` vs `signal: AbortSignal | null`) — tức phải thêm một phép ép kiểu
 * để giữ một dòng không làm gì. Ghi lại ở đây thay cho code: **đổi sang
 * `credentials: 'omit'` sẽ làm MỌI procedure trả UNAUTHORIZED**, và triệu chứng
 * trông y hệt hết phiên đăng nhập.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/api/trpc' })],
});

/**
 * Rút câu tiếng Việt từ lỗi tRPC để hiển thị thẳng cho người dùng.
 *
 * `TRPCClientError` mang `message` do server đặt (`TRPCError({ message })` trong
 * `session.ts`), còn lỗi mạng thì không. Trả về câu chung cho ca thứ hai thay vì
 * để `[object Object]` hay stack trace lọt ra giao diện.
 */
export function describeTrpcError(error: unknown): string {
  if (error instanceof TRPCClientError) {
    const message: unknown = error.message;
    if (typeof message === 'string' && message !== '') {
      return message;
    }
  }
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return 'Không gọi được máy chủ. Kiểm tra kết nối rồi thử lại.';
}

/**
 * Mã lỗi tRPC (`NOT_FOUND`, `FORBIDDEN`, …) của một lỗi phía client, hoặc `null`
 * khi lỗi không đến từ server (mạng đứt, JSON hỏng).
 *
 * Cần tách khỏi `describeTrpcError` vì hai câu hỏi khác nhau: câu kia hỏi "hiện
 * gì cho người dùng", câu này hỏi "có nên bỏ cuộc không" — xem `session-reason.ts`.
 * `error.data` là `unknown` ở kiểu của @trpc/client nên phải đi qua guard chứ
 * không ép kiểu.
 */
export function trpcErrorCode(error: unknown): string | null {
  if (!(error instanceof TRPCClientError)) {
    return null;
  }
  const data: unknown = error.data;
  if (typeof data !== 'object' || data === null || !('code' in data)) {
    return null;
  }
  const code: unknown = (data as { code: unknown }).code;
  return typeof code === 'string' ? code : null;
}
