import type { ReactNode } from 'react';
import { LINE_IDS, TopicBadge } from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { staggerStyle } from '../kit/page';

/**
 * Khung dùng chung của BỐN màn xác thực: `/login`, `/register`,
 * `/forgot-password`, `/reset-password`.
 *
 * Bản dựng lại PTIT (design-brief §0, §2): màn chia đôi, KHÔNG có thẻ nổi. Trái
 * là poster đỏ PTIT cao hết màn hình, phải là form đặt thẳng trên nền giấy.
 *
 * ## Vì sao nó nằm trong `components/shell/**`
 *
 * Nó là vỏ, không phải nội dung. Bốn màn là bốn thư mục route rời nhau; khung
 * sống trong một thư mục route thì ba màn kia phải import ngược vào đó, và cây
 * phụ thuộc đọc ra là "đăng ký phụ thuộc đăng nhập", điều không đúng.
 *
 * ## KHÔNG `'use client'`, KHÔNG `<main>`
 *
 * Khung chỉ dựng bố cục và chữ tĩnh, nên là Server Component; bốn form bên trong
 * tự khai `'use client'`. Vỏ ứng dụng (`app-shell.tsx`) sở hữu `<main>` duy nhất,
 * và `components/session/landmark-contract.test.ts` quét tĩnh việc đó.
 *
 * `flex-1` chứ không `min-h-screen`: `<main>` đã cao đúng phần còn lại của khung
 * nhìn, cộng thêm `min-h-screen` là sinh thanh cuộn dọc cho một trang không có
 * gì để cuộn.
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
    <div className="grid flex-1 lg:grid-cols-2">
      <AuthPoster />
      <div className="flex flex-col justify-center bg-background px-5 py-12 md:px-8 lg:px-16 lg:py-16">
        <div className="mx-auto w-full max-w-md animate-rise">
          <h1 className="type-display text-balance">{title}</h1>
          <p className="mt-3 type-lead text-muted-foreground">{description}</p>
          <div className="mt-10">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Poster trái: dấu PTIT, một câu nói nền tảng làm gì, và hàng mã tuyến chủ đề.
 *
 * Ẩn dưới `lg`: ở màn hẹp nó đẩy form xuống dưới nếp gấp, và một lời giới thiệu
 * đứng trên ô mật khẩu là thứ người ta cuộn qua chứ không đọc.
 *
 * Logo dùng file thật `public/logo-ptit-mark.svg`, đặt trên ô vuông giấy: dấu
 * PTIT là đỏ, để thẳng trên nền đỏ thì nó biến mất. `<img>` chứ không
 * `next/image` vì SVG qua `next/image` cần bật `dangerouslyAllowSVG` cho cả ứng
 * dụng. `alt=""`: tên sản phẩm đã có ngay bên cạnh, đọc hai lần là thừa.
 *
 * Hàng mã tuyến là trang trí (`aria-hidden`): nó nói bằng màu rằng mỗi chủ đề
 * là một tuyến, nhưng không khẳng định số bài nào.
 */
function AuthPoster() {
  return (
    <div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:gap-12 lg:px-12 lg:py-14 xl:px-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-hatch opacity-[0.14]" />
      <div className="relative flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center bg-card">
          <img src="/logo-ptit-mark.svg" alt="" aria-hidden="true" width={39} height={48} className="h-11 w-auto" />
        </span>
        <p className="type-label">{t('shell.brand.name')}</p>
      </div>
      <div className="relative">
        <p className="type-poster text-balance">{t('auth.frame.headline')}</p>
        <p className="mt-6 max-w-md type-lead">{t('auth.frame.body')}</p>
      </div>
      <ul aria-hidden="true" className="relative flex flex-wrap gap-2">
        {LINE_IDS.map((line, index) => (
          <li key={line} className="stagger animate-rise" style={staggerStyle(index)}>
            <TopicBadge line={line} />
          </li>
        ))}
      </ul>
    </div>
  );
}
