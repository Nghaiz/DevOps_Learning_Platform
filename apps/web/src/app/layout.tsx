import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Be_Vietnam_Pro } from 'next/font/google';
import { THEME_INIT_SCRIPT, ThemeProvider, Toaster, TooltipProvider } from '@devops-platform/ui';
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
 * D3 — Be Vietnam Pro là font DUY NHẤT dùng cho `--font-sans` (xem globals.css
 * `@theme inline`). subsets `latin` + `vietnamese` là bắt buộc: thiếu
 * `vietnamese` thì các glyph có dấu nặng/ngã/ơ/ư KHÔNG nằm trong font đã tải,
 * trình duyệt fallback sang font hệ thống cho riêng những ký tự đó — chữ vỡ
 * NGAY GIỮA một từ. ⛔ KHÔNG Poppins — Poppins không phủ bảng chữ tiếng Việt.
 *
 * `next/font/google` tự host font (không gọi Google Fonts lúc runtime), nên
 * CSP `font-src 'self'` (`apps/web/src/server/security/headers.ts`) không
 * cần đổi gì.
 */
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

/**
 * `nonce` đọc từ header `x-nonce` mà `src/proxy.ts` gắn vào mỗi request (luật 9
 * — CSP `script-src` dùng nonce thay vì `unsafe-inline`). Next tự gắn nonce này vào
 * script inline nó tự chèn khi thấy header CSP có `nonce-...` trên response.
 *
 * `THEME_INIT_SCRIPT` (D2/C1, `packages/ui`) đặt class `dark` trên `<html>`
 * TRƯỚC PAINT — phải nằm trong `<head>`, mang CÙNG nonce, và chạy TRƯỚC khi
 * React hydrate `<body>` để không nháy màu (FOUC) giữa theme sáng/tối.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="vi" className={beVietnamPro.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased" data-nonce={nonce}>
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
