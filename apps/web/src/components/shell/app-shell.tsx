'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Menu } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  cn,
} from '@devops-platform/ui';
import { t } from '@devops-platform/copy';
import { ZOD_JITLESS_APPLIED } from '../../lib/zod-jitless';
import { isImmersiveRoute } from './immersive-routes';
import {
  PRIMARY_NAV,
  activeNavItem,
  navSectionsFor,
  type NavGroup,
  type Viewer,
} from './nav';
import { NAV_ICONS } from './nav-icons';
import { CapacityIndicator } from './capacity-indicator';
import { CapacityProvider, useCapacity } from './use-capacity';
import { describeProfileCapacity } from './capacity';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { ViewerProvider } from './viewer-context';

/**
 * Vỏ ứng dụng — đọc điều hướng TỪ `PRIMARY_NAV`, không giữ bảng riêng.
 *
 * ⛔ Bản trước (commit 4f6d3ba) khai ba mảng cứng `LEARN`/`LIBRARY`/`STUDIO`
 * ngay trong file này. Hệ quả đo được: `PRIMARY_NAV` không còn nơi nào render,
 * nên ba cổng đứng canh nó (`nav.test.ts`, `nav-icons.test.ts`, và cổng AN NINH
 * `proxy.test.ts`) đo một cấu trúc đã chết, còn chín khoá của `shell.*` thành
 * mồ côi vì vỏ viết chuỗi cứng. Đừng dựng lại bảng cứng ở đây: mỗi mảng cứng
 * trong file này là một cổng bị rút ruột mà không lệnh nào kêu.
 */

/**
 * `data-area` cho CSS — suy từ NHÓM của mục đang mở, không đọc lại `pathname`.
 *
 * Bản trước so `pathname.startsWith('/author')` / `'/admin'` ngay tại đây, tức
 * là chép kiến thức định tuyến sang một chỗ thứ hai. Bảng này là phép ánh xạ
 * thuần trên `NavGroup`, và `Record<NavGroup, …>` bắt khai đủ nhóm ở tầng kiểu.
 */
const AREA_BY_GROUP: Readonly<Record<NavGroup, string>> = {
  learn: 'learn',
  library: 'learn',
  studio: 'studio',
  manage: 'admin',
  account: 'learn',
};

function Brand() {
  return (
    <Link href="/" className="practice-brand" aria-label={t('shell.brand.home')}>
      <span aria-hidden="true">
        <Box size={22} strokeWidth={1.7} />
      </span>
      <div>
        {t('shell.brand.medium')}
        <small>{t('shell.brand.tagline')}</small>
      </div>
    </Link>
  );
}

/**
 * `close` = bản trong ngăn kéo ≤768px: mỗi liên kết bọc `DialogClose` để bấm
 * xong là ngăn kéo đóng, và `<nav>` mang nhãn "thu gọn" để trình đọc màn hình
 * phân biệt được nó với thanh điều hướng cố định (hai `<nav>` cùng tên trong
 * một trang là hai landmark không ai phân biệt nổi).
 */
function Navigation({
  viewer,
  close = false,
}: {
  readonly viewer: Viewer | null;
  readonly close?: boolean;
}) {
  const pathname = usePathname();
  const active = activeNavItem(pathname, PRIMARY_NAV);
  return (
    <nav
      className="practice-navigation"
      aria-label={close ? t('shell.nav.aria-collapsed') : t('shell.nav.aria')}
    >
      {navSectionsFor(viewer).map((section) => (
        <section key={section.group}>
          <h2>{section.label}</h2>
          {section.items.map((item) => {
            const Icon = NAV_ICONS[item.icon];
            const isActive = active?.href === item.href;
            const link = (
              <Link
                href={item.href}
                className={cn('practice-nav-item', isActive && 'is-active')}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
            return close ? (
              <DialogClose asChild key={item.href}>
                {link}
              </DialogClose>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </section>
      ))}
    </nav>
  );
}

function MobileNavigation({ viewer }: { readonly viewer: Viewer | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className="practice-mobile-trigger"
          aria-label={t('shell.drawer.open')}
        >
          <Menu size={21} aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="practice-mobile-drawer">
        <DialogHeader>
          <DialogTitle>{t('shell.drawer.title')}</DialogTitle>
        </DialogHeader>
        <Navigation viewer={viewer} close />
      </DialogContent>
    </Dialog>
  );
}

export function AppShell({
  viewer,
  children,
}: {
  readonly viewer: Viewer | null;
  readonly children: ReactNode;
}) {
  void ZOD_JITLESS_APPLIED;
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);
  const auth = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);
  /*
    Tính trên TOÀN BỘ `PRIMARY_NAV`, kể cả mục người xem này không thấy: đây là
    nhãn của trang đang mở, không phải một mục đang sáng. Việc đánh dấu
    `is-active` thì chạy trên tập đã lọc vai trò ở `Navigation`, nên một mục bị
    ẩn không bao giờ sáng lên được.
  */
  const active = activeNavItem(pathname, PRIMARY_NAV);
  return (
    <ViewerProvider viewer={viewer}>
      <CapacityProvider enabled={viewer !== null}>
        <div
          className={cn(
            'practice-shell',
            immersive && 'practice-immersive',
            auth && 'practice-auth',
          )}
          data-area={AREA_BY_GROUP[active?.group ?? 'learn']}
        >
          <a href="#noi-dung" className="practice-skip">
            {t('shell.skip.label')}
          </a>
          {!immersive && (
            <>
              {!auth && (
                <aside className="practice-sidebar" aria-label={t('shell.sidebar.aria')}>
                  <Brand />
                  <Navigation viewer={viewer} />
                  <div className="practice-sidebar-bottom">
                    <span className="practice-status-dot" aria-hidden="true" />{' '}
                    {t('shell.sidebar.tagline')}
                  </div>
                </aside>
              )}
              <header className="practice-topbar">
                <div className="practice-topbar-title">
                  {!auth && <MobileNavigation viewer={viewer} />}
                  {auth ? (
                    <Brand />
                  ) : (
                    <>
                      {/*
                        Hai biến thể độ dài của tên sản phẩm, đổi chỗ ở đúng
                        `NAV_COLLAPSE_MAX_PX` (768, `breakpoints.ts`).

                        ⚠ Việc ẩn/hiện thuộc về `practice.css` (lane CSS sở
                        hữu): hai tên class dưới đây là chỗ để nó bám vào. Lớp
                        Tailwind đi kèm chỉ là bản TẠM cho tới khi luật CSS
                        đó có mặt, và nó KHÔNG đá nhau khi luật tới: quy tắc
                        không-layer của `practice.css` thắng utility layer,
                        nên CSS luôn là tầng quyết định. Gỡ hai lớp Tailwind
                        ngay khi `practice.css` khai xong.

                        `min-[769px]:`/`max-[768px]:` chứ KHÔNG `md:`: `md:` là
                        `min-width: 768px`, tức ở đúng 768px cả hai cùng hiện.
                      */}
                      <span className="practice-brand-medium max-[768px]:hidden">
                        {t('shell.brand.medium')}
                      </span>
                      <span className="practice-brand-short min-[769px]:hidden">
                        {t('shell.brand.short')}
                      </span>
                      {active !== null && (
                        <>
                          <span aria-hidden="true">/</span>
                          <strong>{active.label}</strong>
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="practice-topbar-actions">
                  {viewer && (
                    <span className="practice-capacity">
                      <CapacityIndicator />
                    </span>
                  )}
                  <ThemeToggle />
                  {viewer ? (
                    <UserMenu viewer={viewer} />
                  ) : (
                    <Button asChild size="sm">
                      <Link href="/login">{t('shell.header.sign-in')}</Link>
                    </Button>
                  )}
                </div>
              </header>
            </>
          )}
          <main id="noi-dung" tabIndex={-1} className="practice-main">
            {viewer && !immersive && <CapacityFullBanner />}
            {children}
          </main>
        </div>
      </CapacityProvider>
    </ViewerProvider>
  );
}

function CapacityFullBanner() {
  const { data } = useCapacity();
  if (data === null) return null;
  const reading = describeProfileCapacity(data);
  if (reading === null || reading.tone !== 'full') return null;
  return (
    <div className="px-6 py-3">
      <Alert variant="warning">
        <AlertTitle>{t('shell.capacity.full-title')}</AlertTitle>
        <AlertDescription>{reading.detail}</AlertDescription>
      </Alert>
    </div>
  );
}
