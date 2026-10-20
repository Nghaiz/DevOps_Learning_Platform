import type { ReactNode } from 'react';
import { TrpcQueryProvider } from '../../lib/trpc-react';

/**
 * Provider dữ liệu cho cửa sổ terminal riêng (`/session/<id>/terminal`).
 *
 * Thiếu layout này, `terminal-window-client.tsx` gọi `api.me.get` (để lấy màu terminal
 * của hồ sơ) ngoài mọi `QueryClientProvider` và cửa sổ bật ra sập ngay lượt render đầu:
 * nút "Mở terminal ra cửa sổ riêng" chưa từng mở được một cửa sổ dùng được.
 */
export default function SessionLayout({ children }: { children: ReactNode }) {
  return <TrpcQueryProvider>{children}</TrpcQueryProvider>;
}
