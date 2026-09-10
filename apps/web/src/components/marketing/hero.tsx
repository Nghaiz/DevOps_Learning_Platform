import type { ReactNode } from 'react';
import { Terminal } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { HomeSection } from './home-section';

/**
 * Dải mở đầu trang chủ.
 *
 * Câu tiêu đề giữ NGUYÊN VĂN qua cả lượt chuyển sang `packages/copy`. Nó nói
 * đúng thứ nền tảng làm và không có gì để cải thiện; thay đổi ở đây thuần là
 * SỨC NẶNG THỊ GIÁC: cỡ chữ nhảy từ `text-3xl/4xl` lên `text-3xl/5xl`, thêm
 * một nhãn nhỏ phía trên, và cả dải đặt trên nền `--muted` có kẻ đáy nên nó
 * đọc ra là một khối chứ không phải phần trên của một cột chữ trôi.
 *
 * Dải này là phần tử LCP của trang, và nó phải giữ vai trò đó: cảnh 3D ở dải
 * dưới chỉ gắn sau khi `IntersectionObserver` báo đã vào tầm nhìn cộng một lượt
 * `requestIdleCallback`, nên nó không bao giờ tranh chỗ với khối chữ này.
 *
 * `children` là chỗ cắm nút hành động. Nút đó (`app/home-cta.tsx`) là Client
 * Component vì nó đọc `useViewer()`, còn dải này thuần server — nhận qua slot
 * thay vì import thẳng giữ đúng chiều phụ thuộc (`components/` không import
 * ngược lên `app/`) và giữ dải này không phải `'use client'`.
 */
export function Hero({ children }: { readonly children: ReactNode }) {
  return (
    <HomeSection innerClassName="flex flex-col gap-6 py-14 min-[769px]:py-20">
      {/* Nhãn dẫn. Icon `aria-hidden` vì nó đi kèm chữ ngay bên cạnh. */}
      <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
        <Terminal aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        {t('home.hero.eyebrow')}
      </p>

      <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance text-foreground min-[769px]:text-5xl">
        {t('home.hero.title')}
      </h1>

      <p className="max-w-2xl text-base text-pretty text-muted-foreground min-[769px]:text-lg">
        {t('home.hero.lede')}
      </p>

      {children}

      <p className="max-w-2xl text-sm text-muted-foreground">{t('home.hero.scroll-hint')}</p>
    </HomeSection>
  );
}
