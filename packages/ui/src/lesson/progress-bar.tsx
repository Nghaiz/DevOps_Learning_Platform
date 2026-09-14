import type { ReactElement } from 'react';
import { ARC_VIEWBOX, arcProgressProps, arcTrackProps } from '@devops-platform/motion/motif';
import { cn } from '../cn.ts';

export interface ProgressBarProps {
  readonly value: number;
  readonly max: number;
  readonly label?: string;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Tiến trình hoàn thành bài học — **một cung theo nét quét, không phải thanh
 * thẳng** (design §3).
 *
 * ## Hợp đồng aria giữ NGUYÊN, chỉ HÌNH đổi
 *
 * Lane 16.H đã từ chối thay component này bằng một cung tự dựng, và lý do đó
 * vẫn đúng: `role="progressbar"` cùng bộ `aria-valuenow/min/max` ở đây đang
 * được 858 ô của `packages/ui` gác, còn một control aria mới viết trong glob
 * khác sẽ có phủ test THẤP HƠN thứ nó thay. Nên bản này không thay control —
 * nó giữ y nguyên phần tử mang `role`, `aria-label`, và cả ba `aria-value*`,
 * rồi chỉ đổi thứ vẽ BÊN TRONG từ một `<div>` co giãn bề rộng sang hai `<path>`
 * của motif. Mọi ô test cũ được CHUYỂN khẳng định sang hình mới, không ô nào
 * bị xoá.
 *
 * ## `aria-label` là bắt buộc, không phải trang trí (axe `aria-progressbar-name`)
 *
 * Lượt e2e ngày 2026-09-06 trên cụm thật bắt lỗi mức **serious** ở đúng đây:
 * `role="progressbar"` không có tên khả truy cập, nên trình đọc màn hình đọc ra
 * một "progress bar" trống — người dùng biết CÓ một thanh tiến độ nhưng không
 * biết nó đo cái gì. `label` chỉ là chữ nằm CẠNH cung, không phải tên của nó:
 * quan hệ đó không tồn tại với AT trừ khi được nối tường minh.
 *
 * Dùng `aria-label` chứ không `aria-labelledby`: nối bằng id đòi `useId()`, mà
 * hook thì kéo cả file sang `'use client'` cho một component thuần trình bày.
 * Chữ có lặp lại một lần với AT — đổi lại là một tên luôn có mặt, kể cả khi
 * caller không truyền `label`.
 *
 * ## Vì sao con số phần trăm `aria-hidden`
 *
 * `aria-valuenow`/`aria-valuemax` đã đủ để AT tự đọc ra phần trăm. Để con số
 * hiện lên cây a11y nữa là bắt người dùng nghe cùng một thông tin hai lần.
 * Nó ở đây cho MẮT: "còn bao xa" phải đọc được trong một cái liếc.
 *
 * ## Cung CHẠY hay NHẢY — chưa đo được ở tầng này
 *
 * `arcProgressProps` phát ra `stroke-dashoffset: calc(1 - var(--p))` kèm
 * `transition: stroke-dashoffset …` (hợp đồng §8.3 quy định ĐÚNG dạng
 * `calc()` đó). `--p` là custom property **chưa đăng ký** qua
 * `@property`, và một custom property chưa đăng ký nội suy theo kiểu
 * `discrete`. Câu hỏi thật là: khi `--p` nhảy rời rạc, `stroke-dashoffset` —
 * một thuộc tính CÓ transition được — có nội suy giữa hai giá trị `calc()` đã
 * tính ra không, hay nhảy theo? jsdom không có CSSOM thật nên tầng này KHÔNG
 * trả lời được; ô đo thuộc 16.I trên trình duyệt thật.
 *
 * Nếu đo ra là NHẢY, đường lùi đã sẵn và không đụng gì tới hình học:
 * `dashOffsetAt(p)` của cùng file đó trả số thô, đặt thẳng vào
 * `strokeDashoffset` thì transition chắc chắn chạy. ⛔ KHÔNG đổi trước khi đo —
 * hợp đồng ghi dạng `calc()` là bắt buộc.
 *
 * Lượt vẽ ĐẦU không cần lo: `--p` đã có sẵn trong HTML server render, không có
 * giá trị trước đó để nội suy từ, nên cung hiện ra ở đúng vị trí thay vì chạy
 * từ 0 lúc mở trang. (Vì vậy `arcProgressProps({ transition: false })` — cờ
 * dành cho ca đó — không dùng ở đây: dùng nó sẽ đòi biết "đây có phải lượt
 * render đầu không", tức đòi `useState`, tức `'use client'`.)
 */
export function ProgressBar(props: ProgressBarProps): ReactElement {
  const { value, max, label } = props;
  // `max <= 0` là dữ liệu chưa sẵn sàng (ví dụ danh sách bước chưa tải xong).
  // Chia cho 0 ra `NaN`, và `clampProgress` của motif ép `NaN` về **0** chứ
  // không phải 1 — một tiến độ KHÔNG BIẾT không được phép đọc ra là ĐÃ XONG.
  // Ép về 0 ngay tại đây thì cả con số phần trăm lẫn cung cùng nói một điều.
  const percent = max > 0 ? clampPercent((value / max) * 100) : 0;
  // Suy tại chỗ dùng, KHÔNG thêm prop `tone`: trạng thái "xong" đã nằm trọn
  // trong `value`/`max` mà caller truyền, và một prop thứ ba nói lại cùng điều
  // đó chỉ tạo chỗ cho hai nguồn sự thật lệch nhau.
  const complete = max > 0 && value >= max;

  return (
    <div className="flex w-full items-center gap-3">
      <div
        role="progressbar"
        aria-label={label ?? 'Tiến độ bài học'}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        className="shrink-0"
      >
        {/*
          ⛔ Đúng MỘT `style` chạy lúc runtime, y như bản trước — không thêm cái
          thứ hai. Mỗi thuộc tính `style` inline là một lý do nữa để CSP phải
          giữ `style-src 'unsafe-inline'`. Bản trước là bề rộng `%`; bản này là
          `--p` + `stroke-dashoffset` của cung, cả hai do `arcProgressProps`
          phát ra trong CÙNG một object. Rãnh (`arcTrackProps`) không có style
          nào. Màu thì diễn đạt được bằng class nên nó ở `className`.

          Rãnh dùng `role: 'control'` chứ không mặc định `'decorative'`: cung
          này CHÍNH LÀ một control đọc được, nên SC 1.4.11 áp vào nó và rãnh
          phải là `--input` (3.50 sáng / 3.49 tối), không phải `--border` (1.30).
        */}
        <svg
          viewBox={ARC_VIEWBOX}
          aria-hidden="true"
          className={cn('size-12', complete ? 'text-status-done' : 'text-status-progress')}
        >
          <path {...arcTrackProps({ role: 'control' })} />
          <path {...arcProgressProps({ p: percent / 100 })} />
        </svg>
      </div>

      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
        {label !== undefined && <span className="truncate text-xs text-muted-foreground">{label}</span>}
        <span
          aria-hidden="true"
          className={cn(
            'ml-auto shrink-0 text-xs font-semibold tabular-nums',
            complete ? 'text-status-done' : 'text-muted-foreground',
          )}
        >
          {Math.round(percent)}%
        </span>
      </div>
    </div>
  );
}
