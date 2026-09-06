import type { ReactNode } from 'react';
import { cn } from '@devops-platform/ui';

/**
 * Khung dùng chung cho mọi dải nội dung ở trang chủ.
 *
 * Tồn tại vì bốn dải đều cần đúng một chuỗi class container
 * (`mx-auto w-full max-w-6xl px-4 py-12 min-[769px]:px-6 min-[769px]:py-16`).
 * Chép nó bốn lần là bảo đảm bốn bản sẽ lệch nhau ở lần sửa thứ hai — và lệch
 * container là thứ đọc ra ngay: bốn dải không thẳng mép nhau.
 *
 * ## `tone="muted"` — nền `--muted`, đã đo contrast
 *
 * Dải nền xám là cách rẻ nhất để trang chủ có NHỊP thay vì một cột chữ dài.
 * Chữ trên nền đó đã đo trên giá trị token SAU 95efe1f (lượt lane nền thêm
 * chroma 0.012 vào nhánh tối — nên số cũ đo trước đó không dùng lại được):
 *
 * | cặp | sáng | tối | ngưỡng |
 * |---|---|---|---|
 * | `--foreground` / `--muted` | 18.15 | 14.48 | 4.5 |
 * | `--muted-foreground` / `--muted` | 6.94 | 5.83 | 4.5 |
 * | `--primary` / `--muted` | 4.74 | 5.23 | 3.0 (đồ hoạ) |
 *
 * Phép đo dùng đường oklch → sRGB (gamma) → độ chói của WCAG; đối chứng của nó
 * ra đúng ba mốc đã biết của repo: trắng/đen = 21.00, `--primary`/`--background`
 * = 5.17 (sáng) và 6.85 (tối), `--primary`/`--card` tối = 6.20 — trùng khít
 * những con số `packages/ui/src/theme/tokens.contract.test.ts` tự ghi.
 *
 * `--muted-foreground` / `--muted` vốn đã nằm trong `TEXT_PAIRS` của file test
 * đó; hai cặp còn lại là MỚI và không thêm khẳng định vào đó được (file thuộc
 * lane nền), nên số đo ghi ngay đây.
 */
export function HomeSection({
  tone = 'plain',
  labelledBy,
  innerClassName,
  children,
}: {
  readonly tone?: 'plain' | 'muted';
  /** `id` của tiêu đề dải — bỏ trống cho dải không có tiêu đề (hero). */
  readonly labelledBy?: string;
  readonly innerClassName?: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        // `last:border-b-0` — dải cuối không kẻ một đường ngang lửng lơ ở đáy
        // trang. Các dải là con TRỰC TIẾP của khung trang, kể cả dải nằm trong
        // `<Suspense>` (Suspense không sinh phần tử DOM nào), nên `:last-child`
        // vẫn trỏ đúng dải cuối.
        'border-b border-border last:border-b-0',
        tone === 'muted' ? 'bg-muted' : 'bg-background',
      )}
    >
      <div
        className={cn(
          'mx-auto w-full max-w-6xl px-4 py-12 min-[769px]:px-6 min-[769px]:py-16',
          innerClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
