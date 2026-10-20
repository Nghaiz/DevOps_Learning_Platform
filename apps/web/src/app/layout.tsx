import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Bricolage_Grotesque, Hanken_Grotesk, Intel_One_Mono } from 'next/font/google';
import { ThemeProvider, Toaster, TooltipProvider } from '@devops-platform/ds';
import { THEME_INIT_SCRIPT } from '@devops-platform/ds/theme-script';
import { t } from '@devops-platform/copy';
import { appUrl } from '../server/env';
import { readRequestSession } from '../server/auth/config';
import { AppShell } from '../components/shell/app-shell';
import { normalizeRole, type Viewer } from '../components/shell/nav';
import './globals.css';
import './practice.css';

const base = appUrl();

export const metadata: Metadata = {
  title: { default: t('shell.brand.title'), template: `%s | ${t('shell.brand.name')}` },
  description: t('common.meta-description'),
  // Bỏ hẳn key khi APP_URL chưa đặt: `new URL()` trên chuỗi rác ném ngay lúc build,
  // đúng chỗ để phát hiện, thay vì og:image trỏ về localhost lúc có người chia sẻ link.
  ...(base === undefined ? {} : { metadataBase: new URL(base) }),
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }] },
  // `app/opengraph-image.tsx` tự gắn og:image; khai thêm ở đây là nguồn sự thật thứ hai.
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: t('shell.brand.name'),
    title: t('shell.brand.title'),
    description: t('common.og-description'),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Bàn phím ảo co vùng nhìn thấy thay vì đè lên dấu nhắc lệnh trong terminal.
  interactiveWidget: 'resizes-content',
  // Trùng `--canvas` của hai theme (oklch 0.987 / 0.185), viết rgb vì meta theme-color
  // chưa được mọi trình duyệt đọc oklch.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'rgb(249, 251, 253)' },
    { media: '(prefers-color-scheme: dark)', color: 'rgb(17, 19, 21)' },
  ],
};

/**
 * Bộ chữ của hệ `ds` (docs/design-system.md): Bricolage Grotesque cho tiêu đề,
 * Hanken Grotesk cho chữ giao diện và chữ đọc, Intel One Mono cho lệnh và mã. Cả ba
 * phải có subset `vietnamese`: thiếu nó thì chữ có dấu rơi về font hệ thống ngay
 * giữa một từ. next/font tự host nên CSP `font-src 'self'` không phải đổi.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ['latin', 'vietnamese'],
  axes: ['opsz'],
  variable: '--font-bricolage',
  display: 'swap',
});

const hanken = Hanken_Grotesk({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-hanken',
  display: 'swap',
});

const intelMono = Intel_One_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600'],
  variable: '--font-intel-mono',
  display: 'swap',
});

/**
 * `nonce` đọc từ header `x-nonce` do `src/proxy.ts` gắn (CSP `script-src` dùng nonce,
 * không `unsafe-inline`). THEME_INIT_SCRIPT đặt class `dark` trước khi vẽ nên phải nằm
 * trong `<head>` và mang cùng nonce.
 *
 * ⛔ Không bao giờ in nonce ra một thuộc tính DOM: CSP còn `style-src 'unsafe-inline'`,
 * nên một lỗ chèn HTML không cần script vẫn dò được nonce qua selector thuộc tính.
 *
 * Vai trò cho vỏ ứng dụng lấy từ session phía server; nó chỉ quyết định ẩn/hiện liên
 * kết. Cổng thật là `layout.tsx` server của từng nhánh được gác.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce') ?? undefined;
  const session = await readRequestSession();
  const viewer: Viewer | null =
    session === null ? null : { name: session.user.name, email: session.user.email, role: normalizeRole(session.user.role) };

  return (
    <html lang="vi" className={`${bricolage.variable} ${hanken.variable} ${intelMono.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <ThemeProvider>
          <TooltipProvider delayDuration={350} skipDelayDuration={250}>
            <AppShell viewer={viewer}>{children}</AppShell>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
