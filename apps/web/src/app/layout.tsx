import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { appUrl } from '../server/env';
import './globals.css';

const base = appUrl();

export const metadata: Metadata = {
  title: 'DevOps Learning Platform',
  description: 'Nền tảng học DevOps qua lab sandbox',
  // Bỏ hẳn key khi APP_URL chưa đặt, thay vì đoán một origin. `new URL()` trên
  // chuỗi rác ném lỗi ngay lúc build — đúng chỗ để phát hiện, không phải lúc có
  // người share link và thấy og:image trỏ về localhost.
  ...(base === undefined ? {} : { metadataBase: new URL(base) }),
};

/**
 * `nonce` đọc từ header `x-nonce` mà `src/middleware.ts` gắn vào mỗi request (luật 9
 * — CSP `script-src` dùng nonce thay vì `unsafe-inline`). Next tự gắn nonce này vào
 * script inline nó tự chèn khi thấy header CSP có `nonce-...` trên response.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased" data-nonce={nonce}>
        {children}
      </body>
    </html>
  );
}
