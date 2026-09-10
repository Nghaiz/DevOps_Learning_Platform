import type { ReactElement, ReactNode } from 'react';
import { ARC_STROKE_HAIRLINE, ARC_VIEWBOX, arcTrackProps } from '@devops-platform/motion/motif';

/**
 * Đầu trang của `/me` và `/settings`.
 *
 * ⛔ KHÔNG dựng `<main>` (hợp đồng **C6bis**): vỏ ứng dụng
 * (`components/shell/app-shell.tsx`) sở hữu landmark đó và bọc mọi route. Hai
 * `<main>` lồng nhau vừa sai HTML vừa làm axe của 13.H đỏ `landmark-unique`, và
 * `components/session/landmark-contract.test.ts` quét tĩnh mã nguồn để chặn tái
 * phát.
 *
 * ## Dấu cung xuất hiện ĐÚNG MỘT LẦN mỗi màn
 *
 * Design §3 chốt một hình cho cả hệ: vòng ellipse hở của logo PTIT, cũng chính
 * là vòng reconciliation mà nội dung bài học đang dạy. Ở đây nó ở dạng RÃNH
 * tĩnh (`arcTrackProps`), cỡ nét mảnh nhất trong ba cỡ, và chỉ ở đầu trang.
 *
 * Ba `<h2>` của `/me` và ba thẻ của `/settings` KHÔNG mang cung, và đó là một
 * quyết định chứ không phải một chỗ bỏ sót: một hình lặp lại ở đầu mọi khối là
 * đúng cái nhịp "câu, rồi cú chốt" mà lượt rà văn phong của dự án này gọi tên.
 * 16.F đặt một cung mỗi màn quản trị; lane này theo cùng nhịp đó.
 *
 * ## Vì sao cung KHÔNG mang tiến độ ở đây
 *
 * `arcProgressProps` có sẵn và trông rất hợp cho thẻ lộ trình. Nhưng thẻ đó đã
 * có `ProgressBar` của `packages/ui`, thứ mang `role="progressbar"` cùng bộ
 * `aria-valuenow/min/max` đã được 858 ô của gói gác. Thay nó bằng một cung tự
 * dựng nghĩa là tự viết một control aria trong glob của lane với phủ test THẤP
 * HƠN thứ nó thay. Cung ở đây vì vậy là trang trí thuần và nằm trong khối
 * `aria-hidden`: tiêu đề ngay bên cạnh đã nói đủ, và một hình lặp lại điều chữ
 * vừa nói là nhiễu cho trình đọc màn hình.
 *
 * Vì trang trí, rãnh dùng `--border` chứ không `--input` (§8.5), và miễn trừ
 * tường minh của SC 1.4.11 cho ranh giới trang trí áp vào nó.
 */
export function MePageHeader(props: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
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
      {props.action}
    </header>
  );
}

/**
 * Một khối của `/me`, mỗi khối trả lời đúng một câu hỏi.
 *
 * `aria-labelledby` trỏ vào `<h2>` chứ không `aria-label`: chuỗi tiêu đề đã
 * hiện trên màn hình, và nhân đôi nó vào một thuộc tính là hai nguồn chữ cho
 * cùng một nhãn.
 */
export function MeSection(props: {
  readonly id: string;
  readonly title: string;
  readonly badge?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-labelledby={props.id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={props.id} className="text-lg font-medium tracking-tight text-foreground">
          {props.title}
        </h2>
        {props.badge}
      </div>
      {props.children}
    </section>
  );
}

/**
 * Bảng nào cũng vào khối cuộn ngang của RIÊNG nó.
 *
 * Ba bảng của lane mang id phiên đầy đủ (36 ký tự) và tiêu đề lab/quiz do tác
 * giả đặt. Ở 390px chúng đẩy cả trang trôi ngang, thứ ô nghiệm thu 16.I mục 4
 * cấm. Bọc ở đây thay vì ở `packages/ui/src/table.tsx` vì gói đó ngoài glob của
 * lane, và đổi nó là quyết định ảnh hưởng mọi lane.
 */
export function MeTableScroll({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="w-full overflow-x-auto">{children}</div>;
}
