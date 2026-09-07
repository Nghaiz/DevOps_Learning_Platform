'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Terminal, type LucideIcon } from 'lucide-react';
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
  Separator,
  cn,
} from '@devops-platform/ui';
import { ZOD_JITLESS_APPLIED } from '../../lib/zod-jitless';
import { PRIMARY_NAV, isActiveNav, userMenuItems, type NavItem, type Viewer } from './nav';
import { NAV_ICONS, USER_MENU_ICONS } from './nav-icons';
import { CapacityIndicator } from './capacity-indicator';
import { CapacityProvider, useCapacity } from './use-capacity';
import { describeCapacity } from './capacity';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { ViewerProvider } from './viewer-context';

/**
 * Vỏ ứng dụng (13.B) — hợp đồng **C6**.
 *
 * ## Vỏ sở hữu `<main>` — trang KHÔNG được render `<main>` của riêng mình
 *
 * Đây là **hợp đồng**, và nó đã đổi một lần trong Đợt 2 nên đáng ghi lại đầy đủ:
 * bản đầu của vỏ (28dbca4) cố ý chỉ bọc một `<div>`, vì lúc đó cả 17 trang route
 * đều tự render `<main>` và thêm cái thứ hai là trùng landmark. Lane C sau đó
 * viết lại `lessons/labs/playgrounds-client.tsx` (ed8c346, 1c5b333) và **bỏ
 * `<main>`** — hợp lý, vì họ đọc vỏ và cho rằng vỏ cấp landmark. Kết quả tạm
 * thời: ba trang danh mục không có landmark nào.
 *
 * Chốt theo hướng lane C, vì chỉ ở đây mới **bảo đảm được đúng một** `<main>`:
 * một trang không thể biết trang khác làm gì, còn vỏ thì bọc tất cả.
 *
 * ⚠ Sáu file còn render `<main>` của riêng chúng (2026-09-06) và phải đổi sang
 * `<div>`/`<section>` — nếu không sẽ có hai landmark `main` lồng nhau, thứ vừa
 * sai HTML vừa làm axe của 13.H kêu: `me/me-client.tsx`,
 * `lessons/[id]/lesson-client.tsx`, `labs/[id]/lab-client.tsx`,
 * `playgrounds/[id]/playground-client.tsx`, `paths/[id]/path-client.tsx`,
 * `quiz/[id]/quiz-client.tsx`. Chúng thuộc lane D1/D2/E — đã ghi vào report cho
 * lead, lane này không tự sửa file của lane khác.
 *
 * ## Vì sao vỏ nằm ở root layout chứ không ở từng layout route
 *
 * `layout.tsx` của `/lessons`, `/labs`, … thuộc lane C/D/E. Đặt vỏ ở root là
 * cách duy nhất để một lane phát hành điều hướng cho tất cả mà không sửa file
 * của lane khác — và cũng là cách duy nhất để `/` với `/login` (chưa đăng nhập)
 * dùng chung một thanh đầu trang với phần còn lại.
 */
export function AppShell({
  viewer,
  children,
}: {
  readonly viewer: Viewer | null;
  readonly children: ReactNode;
}) {
  // Tham chiếu để bundler KHÔNG cắt `lib/zod-jitless` — module đó tắt phép dò
  // `Function("")` của Zod, thứ sinh ra vi phạm `script-src: eval` trên 9 màn
  // hình (đo 2026-09-07). Nó phải chạy TRƯỚC lời `parse` đầu tiên của client,
  // và `AppShell` nằm trong cây của mọi trang nên đây là chỗ sớm nhất chắc chắn.
  void ZOD_JITLESS_APPLIED;

  return (
    <ViewerProvider viewer={viewer}>
      <CapacityProvider enabled={viewer !== null}>
        <div className="flex min-h-dvh flex-col">
          <a
            href="#noi-dung"
            className={cn(
              'sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50',
              'focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground',
            )}
          >
            Bỏ qua điều hướng
          </a>
          <ShellHeader viewer={viewer} />
          {viewer === null ? null : <CapacityFullBanner />}
          <main id="noi-dung" tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none">
            {children}
          </main>
        </div>
      </CapacityProvider>
    </ViewerProvider>
  );
}

function ShellHeader({ viewer }: { readonly viewer: Viewer | null }) {
  const pathname = usePathname();

  return (
    /*
      `shadow-elevation-1` — bậc "nghỉ" của thang nâng nền (13.A). Thanh đầu
      trang dính (`sticky`) trôi ĐÈ LÊN nội dung khi cuộn; trước đây chỉ một
      đường `border-b` phân tách, nên ở giữa trang không đọc ra được thanh này
      nổi trên hay nằm cùng mặt phẳng với nội dung.

      Dạng TIỆN ÍCH, không phải `shadow-[var(--elevation-1)]`: dạng arbitrary
      bỏ qua bảng theme, nên mỗi chỗ gọi lại tự chọn bậc — đúng thứ ba bậc ngữ
      nghĩa sinh ra để chặn (xem `app/globals.css` khối `--shadow-*`).
    */
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border bg-background',
        'shadow-elevation-1',
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4 min-[769px]:gap-4 min-[769px]:px-6">
        {viewer === null ? null : <MobileNav viewer={viewer} pathname={pathname} />}

        {/*
          Ở 360px thanh đầu trang phải chứa Menu + tên + Giao diện + tài khoản.
          Tên rút thành "DLP" dưới `sm` để bốn thứ đó không đẩy nhau tràn dòng —
          nhãn đầy đủ vẫn nằm trong `sr-only` nên trình đọc màn hình và phép
          kiểm a11y luôn nghe "DevOps Learning Platform", không nghe ba chữ cái.
        */}
        <Link
          href="/"
          className={cn(
            'flex items-center gap-2 rounded-md text-sm font-semibold whitespace-nowrap',
            'text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {/* Dấu nhận diện. `aria-hidden` vì tên khả truy cập đã do `sr-only`
              bên dưới cấp — gắn nhãn cho icon nữa là bắt trình đọc màn hình
              đọc hai lần cùng một thứ. */}
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
          >
            <Terminal className="size-4" />
          </span>
          <span aria-hidden="true" className="sm:hidden">
            DLP
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            DevOps Learning
          </span>
          <span className="sr-only">DevOps Learning Platform — về trang chủ</span>
        </Link>

        {/* Ngăn thị giác giữa thương hiệu và điều hướng — thanh cũ để sáu chữ
            trôi cạnh tên sản phẩm nên không đọc ra đâu là nhãn, đâu là mục bấm
            được. `Separator` mặc định `decorative`: không thêm landmark, không
            vào vòng Tab (`e2e/keyboard.spec.ts` cho ngân sách 30 lần Tab). */}
        {viewer === null ? null : (
          <Separator orientation="vertical" className="hidden h-6 min-[769px]:block" />
        )}

        {viewer === null ? null : (
          <nav
            aria-label="Điều hướng chính"
            /* ≤768px thu vào ngăn kéo (MobileNav). Xem `breakpoints.ts` về việc
               vì sao dùng `min-[769px]:` thay cho `md:`. */
            className="hidden min-w-0 flex-1 items-center gap-1 min-[769px]:flex"
          >
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                icon={NAV_ICONS[item.href]}
                pathname={pathname}
              />
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-2">
          {viewer === null ? null : (
            <span className="hidden sm:inline-flex">
              <CapacityIndicator />
            </span>
          )}
          <ThemeToggle />
          {viewer === null ? (
            pathname === '/login' ? null : (
              <Button asChild size="sm">
                <Link href="/login">Đăng nhập</Link>
              </Button>
            )
          ) : (
            <UserMenu viewer={viewer} />
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  item,
  icon: Icon,
  pathname,
  className,
}: {
  readonly item: NavItem;
  /**
   * `undefined` = đường này chưa có icon. `nav-icons.test.ts` gác hai chiều.
   *
   * `| undefined` viết TƯỜNG MINH, không chỉ `?`: `tsconfig` bật
   * `exactOptionalPropertyTypes`, nên `icon?: LucideIcon` nghĩa là "được phép
   * VẮNG MẶT" chứ không phải "được phép là `undefined`" — mà `NAV_ICONS[href]`
   * (dưới `noUncheckedIndexedAccess`) trả ra đúng `LucideIcon | undefined`.
   */
  readonly icon?: LucideIcon | undefined;
  readonly pathname: string;
  readonly className?: string;
}) {
  const active = isActiveNav(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap',
        // Thời lượng lấy từ thang chuyển động (13.A) thay cho mặc định 150ms
        // của Tailwind, để nav đổi màu cùng nhịp với phần còn lại của giao diện.
        //
        // KHÔNG kèm `motion-reduce:transition-none`: `globals.css` đã khai
        // `prefers-reduced-motion` MỘT LẦN bằng bộ chọn phổ quát + `!important`
        // (`transition-duration: 0.01ms`), và nó thắng cả tiện ích lẫn
        // shorthand. Thêm biến thể ở đây là khai lại cùng một luật ở chỗ thứ
        // hai — hai nơi rồi sẽ lệch nhau.
        'transition-colors duration-(--motion-fast)',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {/* Icon ĐI KÈM CHỮ ⇒ `aria-hidden`. Tên khả truy cập phải còn đúng bằng
          `item.label`: `e2e/keyboard.spec.ts` tìm liên kết bằng
          `{ name: item.label, exact: true }`, nên một nhãn thừa trên icon làm
          đỏ cả sáu ô điều hướng bằng bàn phím. */}
      {Icon === undefined ? null : <Icon aria-hidden="true" className="size-4 shrink-0" />}
      {item.label}
    </Link>
  );
}

/**
 * Ngăn kéo điều hướng cho ≤768px.
 *
 * Dựng trên `Dialog` của C2 (Radix Dialog: focus trap, Esc, `aria-modal`, nút
 * đóng đã có sẵn) với lớp ghi đè để nó bám mép trái toàn chiều cao. `packages/ui`
 * chưa có primitive `Sheet`/`Drawer` và hợp đồng C2 cũng không liệt kê nó — tự
 * viết một bản cục bộ ở `apps/web` sẽ là bản sao thứ hai của cùng hành vi Radix,
 * đúng thứ `docs/design-system.md` §6 cấm. Đã ghi vào report cho lead.
 */
function MobileNav({ viewer, pathname }: { readonly viewer: Viewer; readonly pathname: string }) {
  const [open, setOpen] = useState(false);

  // Ngăn kéo là trạng thái của MỘT màn hình hẹp. Để nó mở qua một lần điều
  // hướng sẽ che mất trang vừa mở — và `DialogClose` chỉ bọc được các liên kết
  // trong ngăn kéo, không bọc được nút Back của trình duyệt.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-8 px-0 min-[769px]:hidden">
          <Menu aria-hidden="true" className="size-4" />
          <span className="sr-only">Mở điều hướng</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          'top-0 left-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none',
          'border-y-0 border-l-0 p-0 shadow-xl',
        )}
      >
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Điều hướng</DialogTitle>
        </DialogHeader>
        <nav
          aria-label="Điều hướng chính (thu gọn)"
          className="flex flex-col gap-1 overflow-y-auto p-2"
        >
          {PRIMARY_NAV.map((item) => (
            <DialogClose asChild key={item.href}>
              <NavLink
                item={item}
                icon={NAV_ICONS[item.href]}
                pathname={pathname}
                className="px-3 py-2.5"
              />
            </DialogClose>
          ))}
          <Separator className="my-2" />
          {/* Nhóm thứ hai là TÀI KHOẢN, không phải điều hướng nội dung. Trước
              đây một đường `<hr>` trần ngăn hai nhóm mà không nói nhóm dưới là
              gì — và trên màn hẹp đây là nơi DUY NHẤT các mục đó xuất hiện. */}
          <p className="px-3 pt-1 pb-2 text-xs font-medium text-muted-foreground">Tài khoản</p>
          {userMenuItems(viewer.role).map((item) => (
            <DialogClose asChild key={item.href}>
              <NavLink
                item={item}
                icon={USER_MENU_ICONS[item.href]}
                pathname={pathname}
                className="px-3 py-2.5"
              />
            </DialogClose>
          ))}
          <div className="px-3 py-2">
            <CapacityIndicator />
          </div>
        </nav>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dải cảnh báo khi trần mềm đã kín.
 *
 * AC 13.B: "chạm trần thì báo trước, không để người dùng gặp 429 trần trụi."
 * Badge trên thanh đầu trang là thứ liếc qua; ở trạng thái `full` thì một badge
 * nhỏ không đủ — người học sẽ bấm Bắt đầu rồi mới đọc nó. Dải này chỉ xuất hiện
 * ĐÚNG khi `remaining === 0`, nên nó không phải nhiễu thường trực.
 */
function CapacityFullBanner() {
  const { data } = useCapacity();
  if (data === null) {
    return null;
  }
  const reading = describeCapacity(data);
  if (reading.tone !== 'full') {
    return null;
  }
  return (
    <div className="border-b border-border px-4 py-2 min-[769px]:px-6">
      <Alert variant="warning">
        <AlertTitle>Sandbox đã kín chỗ</AlertTitle>
        <AlertDescription>{reading.detail}</AlertDescription>
      </Alert>
    </div>
  );
}
