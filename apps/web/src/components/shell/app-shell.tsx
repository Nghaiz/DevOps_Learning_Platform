'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isImmersiveRoute } from './immersive-routes';
import { Menu, type LucideIcon } from 'lucide-react';
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
import { t } from '@devops-platform/copy';
import { ARC_PATH_D, ARC_STROKE, ARC_VIEWBOX } from '@devops-platform/motion/motif';
import { ZOD_JITLESS_APPLIED } from '../../lib/zod-jitless';
import { PRIMARY_NAV, isActiveNav, userMenuItems, type NavItem, type Viewer } from './nav';
import { NAV_ICONS, USER_MENU_ICONS } from './nav-icons';
import { CapacityIndicator } from './capacity-indicator';
import { CapacityProvider, useCapacity } from './use-capacity';
import { describeProfileCapacity } from './capacity';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import { ViewerProvider } from './viewer-context';

/**
 * Vỏ ứng dụng (13.B, dựng lại ở 16.B) — hợp đồng **C6**.
 *
 * ## Vỏ sở hữu `<main>` — trang KHÔNG được render `<main>` của riêng mình
 *
 * Đây là **hợp đồng**, và nó đã đổi một lần trong Đợt 2 nên đáng ghi lại đầy đủ:
 * bản đầu của vỏ (28dbca4) cố ý chỉ bọc một `<div>`, vì lúc đó cả 17 trang route
 * đều tự render `<main>` và thêm cái thứ hai là trùng landmark. Lane C sau đó
 * viết lại `lessons/labs/playgrounds-client.tsx` (ed8c346, 1c5b333) và **bỏ
 * `<main>`**, hợp lý, vì họ đọc vỏ và cho rằng vỏ cấp landmark. Kết quả tạm
 * thời: ba trang danh mục không có landmark nào.
 *
 * Chốt theo hướng lane C, vì chỉ ở đây mới **bảo đảm được đúng một** `<main>`:
 * một trang không thể biết trang khác làm gì, còn vỏ thì bọc tất cả.
 * `components/session/landmark-contract.test.ts` quét tĩnh việc này.
 *
 * ## Vì sao vỏ nằm ở root layout chứ không ở từng layout route
 *
 * `layout.tsx` của `/lessons`, `/labs`, … thuộc lane C/D/E. Đặt vỏ ở root là
 * cách duy nhất để một lane phát hành điều hướng cho tất cả mà không sửa file
 * của lane khác, và cũng là cách duy nhất để `/` với bốn màn xác thực dùng
 * chung một thanh đầu trang với phần còn lại.
 *
 * ## Nhận diện: cung ellipse hở, không phải một icon terminal
 *
 * Dấu thương hiệu trước 16.B là một ô vuông đặc màu primary với icon `Terminal`
 * của lucide bên trong. Nó không sai, nhưng nó là hình của một công cụ bất kỳ.
 * Design §3 chốt MỘT hình cho cả hệ: vòng ellipse hở của logo PTIT, cũng chính
 * là vòng reconciliation mà nội dung bài học đang dạy. Dùng đúng hình đó ở dấu
 * thương hiệu là chỗ nó phải xuất hiện trước nhất.
 *
 * Vẽ INLINE chứ không nhúng `public/logo-ptit-mark.svg`: ở cỡ 28px thì nét chữ
 * PTIT bên trong biểu tượng không đọc được, nên file logo dành cho chỗ nó đủ
 * lớn (khung bốn màn xác thực). Cung inline dùng `currentColor` nên nó đổi theo
 * theme mà không cần hai file, và không tốn một request nào.
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

  /*
   * §12.3 — route immersive thu vỏ về tối thiểu: KHÔNG thanh đầu trang, KHÔNG
   * thanh cuộn trang, chiều cao khoá đúng một viewport để canvas hoặc terminal
   * tràn hết được.
   *
   * ⛔ Danh sách route nằm ở `immersive-routes.ts` và thuộc quyền lane 16.D.
   * Hai tiền tố `/labs` và `/lessons` ở đó là điều kiện sống của khoang lab:
   * thanh nav toàn cục ăn 56px trên đúng màn hình mà mỗi pixel dọc là một phần
   * của một dòng terminal. Lane 16.B KHÔNG gỡ chúng.
   *
   * Ẩn `ShellHeader` chứ KHÔNG phủ `fixed inset-0 z-50` lên nó: phủ thì header
   * vẫn nằm trong DOM bên dưới, mọi link điều hướng vẫn nhận Tab trong khi mắt
   * không thấy, và phải bẫy focus thủ công để chữa. Ẩn thì hợp đồng "đúng MỘT
   * `<main>`" cũng còn nguyên.
   *
   * Link "Bỏ qua điều hướng" GIỮ LẠI kể cả ở chế độ immersive: không có
   * `ShellHeader` thì nó chỉ còn là đường tắt tới `<main>`, vô hại, và bỏ nó đi
   * sẽ làm phần tử focus được đầu tiên của trang đổi theo route.
   */
  const immersive = isImmersiveRoute(usePathname());

  return (
    <ViewerProvider viewer={viewer}>
      <CapacityProvider enabled={viewer !== null}>
        <div className={cn('flex flex-col', immersive ? 'h-dvh overflow-hidden' : 'min-h-dvh')}>
          <a
            href="#noi-dung"
            className={cn(
              'sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50',
              'focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm',
              'focus:font-medium focus:text-primary-foreground focus:shadow-elevation-2',
            )}
          >
            {t('shell.skip.label')}
          </a>
          {immersive ? null : <ShellHeader viewer={viewer} />}
          {viewer === null || immersive ? null : <CapacityFullBanner />}
          <main
            id="noi-dung"
            tabIndex={-1}
            className={cn(
              'flex min-h-0 flex-1 flex-col outline-none',
              immersive && 'overflow-hidden',
            )}
          >
            {children}
          </main>
        </div>
      </CapacityProvider>
    </ViewerProvider>
  );
}

/**
 * Dấu thương hiệu: cung ellipse hở của motif, cỡ nét đầy đủ, màu primary.
 *
 * Vẽ `ARC_PATH_D` THẲNG thay vì gọi `arcTrackProps()`: hàm đó ghim
 * `stroke: var(--input)` hoặc `var(--border)` theo §8.5, vì nó mô tả cái RÃNH
 * của một thanh tiến độ. Ở đây cung không phải rãnh của thứ gì, nó là dấu
 * thương hiệu, nên nó lấy `currentColor` và chỗ gọi quyết định màu bằng
 * `text-primary`. Gọi `arcTrackProps` rồi phủ `text-*` lên là một lệnh không có
 * tác dụng, thứ hỏng im lặng và trông như đã làm gì đó.
 */
function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox={ARC_VIEWBOX}
      role="presentation"
      className="size-7 shrink-0 text-primary"
    >
      <path
        d={ARC_PATH_D}
        fill="none"
        stroke="currentColor"
        strokeWidth={ARC_STROKE}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
      bỏ qua bảng theme, nên mỗi chỗ gọi lại tự chọn bậc, đúng thứ ba bậc ngữ
      nghĩa sinh ra để chặn (xem `app/globals.css` khối `--shadow-*`).
    */
    <header
      className={cn('sticky top-0 z-40 border-b border-border bg-background', 'shadow-elevation-1')}
    >
      <div className="flex h-14 items-center gap-2 px-4 min-[769px]:gap-4 min-[769px]:px-6">
        {viewer === null ? null : <MobileNav viewer={viewer} pathname={pathname} />}

        {/*
          Ở 360px thanh đầu trang phải chứa Menu + tên + Giao diện + tài khoản.
          Tên rút thành "DLP" dưới `sm` để bốn thứ đó không đẩy nhau tràn dòng;
          nhãn đầy đủ vẫn nằm trong `sr-only` nên trình đọc màn hình và phép
          kiểm a11y luôn nghe tên sản phẩm, không nghe ba chữ cái.
        */}
        <Link
          href="/"
          className={cn(
            'flex items-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap',
            'text-foreground transition-colors duration-(--motion-fast) hover:text-primary',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <BrandMark />
          <span aria-hidden="true" className="sm:hidden">
            {t('shell.brand.short')}
          </span>
          <span aria-hidden="true" className="hidden sm:inline">
            {t('shell.brand.medium')}
          </span>
          <span className="sr-only">{t('shell.brand.home')}</span>
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
            aria-label={t('shell.nav.aria')}
            /* ≤768px thu vào ngăn kéo (MobileNav). Xem `breakpoints.ts` về việc
               vì sao dùng `min-[769px]:` thay cho `md:`, và `e2e/responsive.spec.ts`
               đo hành vi tại đúng 768/769px. */
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
                <Link href="/login">{t('shell.header.sign-in')}</Link>
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
   * VẮNG MẶT" chứ không phải "được phép là `undefined`", mà `NAV_ICONS[href]`
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
        'relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap',
        // Thời lượng lấy từ thang chuyển động (13.A) thay cho mặc định 150ms
        // của Tailwind, để nav đổi màu cùng nhịp với phần còn lại của giao diện.
        //
        // KHÔNG kèm `motion-reduce:transition-none`: `globals.css` đã khai
        // `prefers-reduced-motion` MỘT LẦN bằng bộ chọn phổ quát + `!important`
        // (`transition-duration: 0.01ms`), và nó thắng cả tiện ích lẫn
        // shorthand. Thêm biến thể ở đây là khai lại cùng một luật ở chỗ thứ
        // hai, và hai nơi rồi sẽ lệch nhau.
        'transition-colors duration-(--motion-fast)',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring',
        /*
          Mục đang mở mang HAI dấu hiệu, không chỉ một: nền `accent` cộng một
          gạch chân màu primary. Chỉ đổi nền là dựa hoàn toàn vào một khác biệt
          màu nhạt, thứ biến mất với người nhìn màu kém và trên máy chiếu lớp
          học. `aria-current="page"` lo phần trình đọc màn hình; gạch chân lo
          phần nhìn.
        */
        active
          ? 'bg-accent text-accent-foreground after:absolute after:inset-x-3 after:bottom-1 after:h-0.5 after:rounded-full after:bg-primary'
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
 * chưa có primitive `Sheet`/`Drawer` và hợp đồng C2 cũng không liệt kê nó; tự
 * viết một bản cục bộ ở `apps/web` sẽ là bản sao thứ hai của cùng hành vi Radix,
 * đúng thứ `docs/design-system.md` §6 cấm. Đã ghi vào report cho lead.
 */
function MobileNav({ viewer, pathname }: { readonly viewer: Viewer; readonly pathname: string }) {
  const [open, setOpen] = useState(false);

  // Ngăn kéo là trạng thái của MỘT màn hình hẹp. Để nó mở qua một lần điều
  // hướng sẽ che mất trang vừa mở, và `DialogClose` chỉ bọc được các liên kết
  // trong ngăn kéo, không bọc được nút Back của trình duyệt.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-8 px-0 min-[769px]:hidden">
          <Menu aria-hidden="true" className="size-4" />
          <span className="sr-only">{t('shell.drawer.open')}</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          'top-0 left-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none',
          'border-y-0 border-l-0 p-0 shadow-elevation-3',
        )}
      >
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle className="flex items-center gap-2">
            <BrandMark />
            {t('shell.drawer.title')}
          </DialogTitle>
        </DialogHeader>
        <nav
          aria-label={t('shell.nav.aria-collapsed')}
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
              gì, và trên màn hẹp đây là nơi DUY NHẤT các mục đó xuất hiện. */}
          <p className="px-3 pt-1 pb-2 text-xs font-medium text-muted-foreground">
            {t('shell.account.group')}
          </p>
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
 * nhỏ không đủ, người học sẽ bấm Bắt đầu rồi mới đọc nó. Dải này chỉ xuất hiện
 * ĐÚNG khi `remaining === 0`, nên nó không phải nhiễu thường trực.
 */
function CapacityFullBanner() {
  const { data } = useCapacity();
  if (data === null) {
    return null;
  }
  // `null` = CHƯA BIẾT còn mấy chỗ (quota không đọc được, hoặc server không
  // khai profile mặc định). Không vẽ dải cảnh báo: "chưa rõ" KHÔNG phải "đã
  // kín", và dựng một cảnh báo hạ tầng từ một 403 RBAC là bịa.
  const reading = describeProfileCapacity(data);
  if (reading === null || reading.tone !== 'full') {
    return null;
  }
  return (
    <div className="border-b border-border px-4 py-2 min-[769px]:px-6">
      <Alert variant="warning">
        <AlertTitle>{t('shell.capacity.full-title')}</AlertTitle>
        <AlertDescription>{reading.detail}</AlertDescription>
      </Alert>
    </div>
  );
}
