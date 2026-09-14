'use client';

import type { ReactElement } from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { cn } from './cn.ts';

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface ToastOptions {
  readonly title: string;
  readonly description?: string;
  readonly variant?: ToastVariant;
}

/**
 * ⚠ ĐỘNG CƠ ĐỔI TỪ Radix Toast SANG `sonner`, và MỘT CHỖ HỢP ĐỒNG KHÔNG THI
 * CÔNG ĐƯỢC — ghi ở đây thay vì im lặng đi đường vòng.
 *
 * `phase-16.md` 16.A.4 dặn: chạy
 * `npx shadcn add https://goey-toast.vercel.app/r/goey-toaster.json` để "đưa mã
 * vào repo", rồi chỉnh token màu; và "KHÔNG cài `goey-toast` qua npm". Registry
 * đó trả 200 thật, nhưng NỘI DUNG nó trả về không làm được điều 16.A.4 giả
 * định. Đọc nguyên văn `r/goey-toaster.json` (2026-09-10):
 *
 *   "dependencies": ["goey-toast", "framer-motion"],
 *   files[0].content:  import { GooeyToaster as GooeyToasterPrimitive, gooeyToast }
 *                        from "goey-toast"
 *                      import "goey-toast/styles.css"
 *
 * Tức registry item KHÔNG vendor mã toast — nó là một shim 15 dòng re-export,
 * và toàn bộ công việc của nó là PHỤ THUỘC vào gói npm `goey-toast`. Chạy
 * `shadcn add` sẽ (a) ghi ra một file import thẳng `goey-toast`, và (b) gọi
 * package manager cài `goey-toast` + `framer-motion` — đúng cái 16.A.4 cấm.
 * Hai câu của 16.A.4 mâu thuẫn nhau, không phải mâu thuẫn giữa plan và mã.
 *
 * `sonner@2.0.8` là thứ lead ghim CHÍNH XÁC vào `packages/ui/package.json` cho
 * lane này, nên nó là ý định gần nhất còn thi công được: cùng họ (goey-toast
 * chính là một sonner-alike), có stacking + swipe + `toast.promise`, và tự tiêm
 * stylesheet bằng `createElement('style')` (đo trong `dist/index.mjs`) nên
 * KHÔNG cần `import './styles.css'` — quan trọng vì một import CSS từ
 * `packages/ui` sẽ kéo theo cấu hình cho cả vitest lẫn Next.
 *
 * ── Vì sao `unstyled` + `toast.custom` ────────────────────────────────────
 * `toastOptions.unstyled` gỡ lớp trình bày mặc định của sonner (nền/viền/chữ
 * của nó) nhưng GIỮ các luật `[data-sonner-toast]` lo định vị và xếp chồng —
 * thứ duy nhất ta thật sự cần ở thư viện. Nội dung thì `toast.custom` cho ta
 * tự dựng, nên mọi màu đi qua class ngữ nghĩa và §9 (cấm màu trần) không có
 * chỗ nào để thủng: nếu dùng biến thể dựng sẵn của sonner thì màu đến từ
 * `--normal-bg`/`--error-bg` của CHÍNH nó, tức một hệ token thứ hai chạy song
 * song với `globals.css`.
 */

/** Ngắn hơn mặc định 4s của sonner: 5s là con số bản Radix đang dùng, giữ nguyên. */
const TOAST_DURATION_MS = 5000;

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'border-border bg-card text-card-foreground',
  success: 'border-transparent bg-success text-success-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground',
};

/**
 * Icon theo biến thể — WCAG 1.4.1 (Use of Color): "đã lưu" và "lỗi" không được
 * phân biệt CHỈ bằng màu nền. `default` cố ý không có icon: nó không mang một
 * kết quả nào để mà vẽ.
 *
 * `aria-hidden` vì tiêu đề toast đã nói đủ; để icon lộ ra là thêm một node vô
 * nghĩa vào vùng `aria-live`, thứ trình đọc màn hình sẽ đọc thành tiếng.
 */
const VARIANT_ICON: Partial<Record<ToastVariant, ReactElement>> = {
  success: <CircleCheck aria-hidden="true" className="size-4 shrink-0" />,
  destructive: <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />,
};

interface ToastCardProps extends ToastOptions {
  readonly onDismiss: () => void;
}

function ToastCard({ title, description, variant = 'default', onDismiss }: ToastCardProps): ReactElement {
  return (
    <div
      data-slot="toast"
      data-variant={variant}
      className={cn(
        // §5: toast là một mặt nổi cỡ card ⇒ bậc `lg`. §6: chồng lên nội dung
        // trang như popover/dialog ⇒ bậc nâng nền 3, và `border` là lớp bảo
        // hiểm cho Windows High Contrast (nơi `box-shadow` bị bỏ hẳn).
        'grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-3 rounded-lg border p-4 shadow-elevation-3',
        VARIANT_CLASSES[variant],
      )}
    >
      {VARIANT_ICON[variant] ?? <span aria-hidden="true" />}
      <div className="grid gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description !== undefined && <p className="text-sm opacity-90">{description}</p>}
      </div>
      {/*
        `ring-current` chứ không `ring-ring`: nút đóng nằm TRÊN mặt toast đã tô
        đặc, và `--ring` (= `--primary`, đỏ) cạnh `bg-destructive` chỉ được
        1.06:1 sáng / 1.50:1 tối — vòng focus vô hình đúng trên cái toast báo
        lỗi. `ring-offset` cũng SAI ở đây chứ không phải thiếu: khe offset sẽ
        mang màu NỀN TRANG, thứ không hề kề nút này.

        `currentColor` là `text-{variant}-foreground` do `VARIANT_CLASSES` đặt ở
        thẻ cha, và cả ba cặp đó đã được `TEXT_PAIRS` gác ở ≥4.5:1. Đây là cơ
        chế thứ hai của bảng miễn trừ §1.7 trong `p16-tokens.md`.
      */}
      <button
        type="button"
        aria-label="Đóng thông báo"
        onClick={onDismiss}
        className={cn(
          'rounded-sm opacity-70 outline-none hover:opacity-100',
          'transition-opacity duration-[var(--motion-fast)] ease-out',
          'focus-visible:ring-2 focus-visible:ring-current',
        )}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/**
 * Gọi được từ BẤT KỲ component nào — không cần đứng trong cây con của
 * `<Toaster>`. Hàng đợi của sonner là module-scope, cùng mô hình singleton như
 * bản Radix trước đó, nên 18 nơi gọi hiện tại không phải đổi một dòng.
 *
 * Giữ hình dạng `{ toast }` (một hook trả về object) thay vì export thẳng hàm
 * `toast`: đó là chữ ký `C2` mà bảy lane sau đang tiêu thụ, và
 * `exports.contract.test.ts` gác nó ở cả tầng kiểu lẫn tầng runtime.
 */
export function useToast(): { toast(options: ToastOptions): void } {
  return {
    toast(options: ToastOptions): void {
      sonnerToast.custom(
        (id) => <ToastCard {...options} onDismiss={() => sonnerToast.dismiss(id)} />,
        { duration: TOAST_DURATION_MS },
      );
    },
  };
}

/** Đặt DUY NHẤT một lần ở app shell (`apps/web/src/app/layout.tsx`). */
export function Toaster(): ReactElement {
  return (
    <SonnerToaster
      position="bottom-right"
      duration={TOAST_DURATION_MS}
      /*
       * `unstyled: true` — xem khối đầu file. Lớp `w-full` ở đây chứ không ở
       * `ToastCard`: sonner đặt bề rộng lên `<li>` bọc ngoài, và thẻ con phải
       * lấp đầy nó, nếu không toast co lại theo nội dung và mép phải nhảy theo
       * từng thông báo.
       */
      toastOptions={{ unstyled: true, classNames: { toast: 'w-full' } }}
      /*
       * `aria-live` mặc định của sonner là `polite`, đúng cho toast: nó KHÔNG
       * được ngắt lời người dùng đang gõ. Toast lỗi nghiêm trọng cần ngắt lời
       * thì dùng `ErrorState` (`role="alert"`), không phải toast — cùng ranh
       * giới bảng §4a đã khai.
       */
      visibleToasts={4}
    />
  );
}
