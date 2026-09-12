import type { ReactNode } from 'react';
import { ARC_PATH_D, ARC_STROKE_HEAVY, ARC_VIEWBOX } from '@devops-platform/motion/motif';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';

/**
 * Khung dùng chung của BỐN màn xác thực: `/login`, `/register`,
 * `/forgot-password`, `/reset-password`.
 *
 * ## Vì sao nó nằm trong `components/shell/**`
 *
 * Nó là vỏ, không phải nội dung: cùng loại với `NarrowScreenNotice`, thứ cũng
 * sống ở đây với đúng lý lẽ đó (ba câu khác nhau cho cùng một tình huống là ba
 * câu sẽ trôi khỏi nhau). Bốn màn xác thực là bốn thư mục route rời nhau, nên
 * nếu khung sống trong một trong bốn thì ba màn kia phải import ngược vào thư
 * mục của màn thứ tư, và cây phụ thuộc đọc ra là "đăng ký phụ thuộc đăng nhập",
 * điều không đúng. `components/shell/**` là thư mục dùng chung duy nhất mà lane
 * 16.B sở hữu.
 *
 * ## KHÔNG `'use client'`
 *
 * Khung là Server Component: nó chỉ dựng bố cục và chữ tĩnh. Bốn form bên trong
 * tự khai `'use client'` cho phần của chúng. Đặt `'use client'` ở đây sẽ kéo cả
 * cột trái, cả logo, cả bốn tiêu đề sang bundle trình duyệt mà không đổi lại
 * được gì.
 *
 * ## KHÔNG render `<main>`
 *
 * Vỏ ứng dụng (`app-shell.tsx`) sở hữu landmark đó và bọc mọi trang. Hai
 * `<main>` lồng nhau vừa sai HTML vừa làm axe kêu `landmark-unique`, và
 * `components/session/landmark-contract.test.ts` quét tĩnh việc này.
 *
 * ## Cột trái: chỗ DUY NHẤT bốn màn này nói nền tảng làm gì
 *
 * Người nhận một liên kết đăng nhập thường không đi qua trang chủ. Cột trái ẩn
 * dưới 769px vì ở đó nó đẩy form xuống dưới nếp gấp, và một lời giới thiệu đứng
 * trên ô mật khẩu là thứ người ta cuộn qua chứ không đọc.
 *
 * Logo dùng file thật `public/logo-ptit-mark.svg` chứ không phải cung inline:
 * ở cỡ 48px nét chữ PTIT bên trong biểu tượng đọc được, nên đây đúng là chỗ
 * biểu tượng đầy đủ có nghĩa. `<img>` chứ không `next/image`: ảnh SVG qua
 * `next/image` cần bật `dangerouslyAllowSVG` ở cấu hình chung, một quyết định
 * ảnh hưởng mọi lane để đổi lấy đúng một tài sản tĩnh 9KB.
 *
 * `alt=""` cộng `aria-hidden`: chính file SVG đã mang `role="img"` và một
 * `<title>`, nhưng khi nhúng qua `<img>` thì `alt` mới là thứ quyết định, và
 * tên sản phẩm đã do `shell.brand.*` trên thanh đầu trang cấp. Một nhãn nữa ở
 * đây là bắt trình đọc màn hình nghe hai lần cùng một thứ.
 */
export function AuthFrame({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid flex-1 min-[769px]:grid-cols-2">
      <AuthBrandPanel />
      <div className="flex items-center justify-center px-4 py-12 min-[769px]:px-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle as="h1">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Cột trái: logo, một câu về nền tảng, và cung ellipse làm hình chìm.
 *
 * Cung dùng `ARC_STROKE_HEAVY` và màu `--primary` ở độ mờ thấp: nó là hình
 * nền, không phải một control, nên SC 1.4.11 không áp và nó không cần đạt
 * ngưỡng 3:1. Chữ nằm trên `--muted` với `--foreground`, cặp đã có trong bảng
 * contrast của `p16-tokens.md`.
 */
function AuthBrandPanel() {
  return (
    <div
      className={cnPanel}
      /* Trang trí thuần: hai câu bên trong là chữ THẬT và phải đọc được, nên
         KHÔNG `aria-hidden` cả khối. Chỉ cung nền mang `aria-hidden`. */
    >
      <svg
        aria-hidden="true"
        viewBox={ARC_VIEWBOX}
        role="presentation"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute -right-1/4 bottom-0 h-[120%] text-primary opacity-10"
      >
        <path
          d={ARC_PATH_D}
          fill="none"
          stroke="currentColor"
          strokeWidth={ARC_STROKE_HEAVY}
          strokeLinecap="round"
        />
      </svg>
      <div className="relative flex max-w-sm flex-col gap-5">
        <img
          src="/logo-ptit-mark.svg"
          alt=""
          aria-hidden="true"
          width={39}
          height={48}
          className="h-12 w-auto"
        />
        <p className="text-sm font-medium tracking-wide text-muted-foreground">
          {t('shell.brand.name')}
        </p>
        <p className="text-3xl leading-tight font-semibold tracking-tight text-foreground">
          {t('auth.frame.headline')}
        </p>
        <p className="text-base text-muted-foreground">{t('auth.frame.body')}</p>
      </div>
    </div>
  );
}

/**
 * Lớp của cột trái, tách ra hằng số chỉ để dòng JSX ở trên đọc được.
 *
 * `hidden` cộng `min-[769px]:flex` chứ không `md:flex`: hợp đồng điểm ngắt của
 * lane này là 768/769, và `e2e/responsive.spec.ts` đo hành vi tại đúng hai số
 * đó. Dùng `md:` ở đây là đưa một điểm ngắt thứ hai (Tailwind mặc định 768) vào
 * cùng một vỏ, và hai số gần nhau thì lệch một pixel không ai thấy cho tới lúc
 * một ô e2e đỏ.
 */
const cnPanel = [
  'relative hidden overflow-hidden border-r border-border bg-muted',
  'min-[769px]:flex min-[769px]:flex-col min-[769px]:justify-center',
  'min-[769px]:px-10 min-[769px]:py-16',
].join(' ');
