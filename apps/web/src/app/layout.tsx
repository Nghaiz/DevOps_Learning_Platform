import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import './globals.css';

export const metadata = {
  title: 'DevOps Learning Platform',
  description: 'Nền tảng học DevOps qua lab sandbox',
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
