import type { ReactElement, ReactNode } from 'react';
import { ARC_STROKE_HAIRLINE, ARC_VIEWBOX, arcTrackProps } from '@devops-platform/motion/motif';

/**
 * Khung chung của một màn hình quản trị.
 *
 * ⛔ KHÔNG dựng `<main>` (hợp đồng **C6bis**): vỏ ứng dụng
 * (`components/shell/app-shell.tsx`) sở hữu landmark đó và bọc mọi trang. Hai
 * `<main>` lồng nhau vừa sai HTML vừa làm axe của 13.H đỏ `landmark-unique`,
 * và `components/session/landmark-contract.test.ts` gác đúng điều này.
 *
 * `<h1>` nằm ở ĐÂY chứ không ở `layout.tsx`: mỗi màn hình cần tiêu đề riêng, và
 * một `<h1>` chung "Quản trị" ở layout sẽ biến tiêu đề thật của trang thành
 * `<h2>`, thứ làm cấu trúc heading (AC 13.H mục 25) mô tả sai nội dung trang.
 *
 * ## Dấu cung ở đầu mỗi màn
 *
 * Design §3 chốt MỘT hình cho cả hệ: vòng ellipse hở của logo PTIT, cũng chính
 * là vòng reconciliation mà nội dung bài học đang dạy. Ở nhánh quản trị nó xuất
 * hiện đúng một lần mỗi màn, ở dạng RÃNH tĩnh (`arcTrackProps`), cỡ nét mảnh
 * nhất trong ba cỡ.
 *
 * Nó là trang trí thuần nên nằm trong khối `aria-hidden`: tiêu đề ngay bên cạnh
 * đã nói đủ, và một hình lặp lại điều chữ vừa nói là nhiễu cho trình đọc màn
 * hình. Vì trang trí, rãnh dùng `--border` chứ không `--input` (§8.5) và miễn
 * trừ tường minh của SC 1.4.11 áp vào nó.
 */
export function AdminSection(props: {
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-1 shrink-0">
            <svg viewBox={ARC_VIEWBOX} className="size-7" role="presentation">
              <path {...arcTrackProps({ width: ARC_STROKE_HAIRLINE })} />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{props.title}</h1>
            <p className="max-w-prose text-sm text-muted-foreground">{props.description}</p>
          </div>
        </div>
        {props.actions}
      </header>
      {props.children}
    </section>
  );
}

/**
 * Ghi chú phạm vi / tự đính chính của một bảng quản trị.
 *
 * `role="status"` chứ không `role="alert"`: đây là thông tin ("trang này chỉ
 * hiện N dòng"), không phải lỗi. `alert` ngắt lời trình đọc màn hình.
 */
export function AdminNote({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}
