'use client';

import type { CSSProperties, ReactElement } from 'react';

/** Hệ toạ độ trong của SVG. Chỉ là đơn vị viewBox — kích thước thật do CSS quyết. */
const VIEW_W = 100;
const VIEW_H = 32;

export interface MetricsChartProps {
  readonly title: string;
  readonly values: readonly number[];
  /**
   * Trần trục tung. `null` ⇒ lấy giá trị lớn nhất trong dữ liệu.
   *
   * CPU và bộ nhớ có trần cố định 1 (chúng là tỉ lệ), nên trần cố định giữ cho
   * hai đồ thị so sánh được với nhau và với chính chúng qua thời gian. Số pod
   * không có trần tự nhiên nên phải co theo dữ liệu — và đó cũng là lý do hai
   * loại không dùng chung một quy tắc.
   */
  readonly max: number | null;
  readonly format: (value: number) => string;
  /** Token màu, dạng `var(--success)`. KHÔNG mã màu cứng — nền sáng/tối đổi theo. */
  readonly colorToken: string;
}

/**
 * Đồ thị đường vẽ bằng SVG thuần.
 *
 * Không kéo thư viện biểu đồ vào: ba đường gấp khúc không trục, không chú giải,
 * không tương tác là khoảng 40 dòng hình học — còn một thư viện là hàng trăm KB
 * bundle nằm chung với một cảnh 3D vốn đã nặng.
 *
 * `role="img"` kèm `aria-label` mang SỐ chứ không mang hình: một đường gấp khúc
 * không đọc được, nên phần khả truy phải nói giá trị hiện tại và khoảng dao động
 * — đó là thứ người ta thật sự đọc đồ thị để biết.
 */
export function MetricsChart({
  title,
  values,
  max,
  format,
  colorToken,
}: MetricsChartProps): ReactElement {
  const latest = values.at(-1) ?? 0;
  const lowest = values.length === 0 ? 0 : Math.min(...values);
  const highest = values.length === 0 ? 0 : Math.max(...values);
  const ceiling = max ?? Math.max(highest, 1);

  const stroke: CSSProperties = { stroke: colorToken };
  const fill: CSSProperties = { fill: colorToken };

  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{title}</span>
        <span className="font-mono text-foreground">{format(latest)}</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${String(VIEW_W)} ${String(VIEW_H)}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: hiện tại ${format(latest)}, thấp nhất ${format(lowest)}, cao nhất ${format(highest)} trong ${String(values.length)} mẫu gần đây.`}
        className="h-20 w-full shrink-0 rounded-md bg-muted"
      >
        {/* Vạch giữa: mốc đọc nhanh "đang trên hay dưới nửa trần". */}
        <line
          x1={0}
          y1={VIEW_H / 2}
          x2={VIEW_W}
          y2={VIEW_H / 2}
          strokeWidth={0.4}
          strokeDasharray="2 2"
          className="stroke-border"
        />
        {values.length >= 2 ? (
          <polyline
            points={pointsOf(values, ceiling)}
            fill="none"
            strokeWidth={1.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={stroke}
          />
        ) : null}
        {/* Một mẫu duy nhất không tạo được đoạn thẳng — chấm một điểm để đồ thị
            không trông như đang hỏng trong vài giây đầu sau khi mở bảng. */}
        {values.length === 1 ? (
          <circle cx={VIEW_W} cy={heightOf(latest, ceiling)} r={1.2} style={fill} />
        ) : null}
      </svg>
    </figure>
  );
}

function heightOf(value: number, ceiling: number): number {
  const ratio = ceiling === 0 ? 0 : Math.min(1, Math.max(0, value / ceiling));
  return VIEW_H - 2 - ratio * (VIEW_H - 4);
}

/** Mẫu mới nhất luôn nằm sát mép phải — mắt tìm "bây giờ" ở đó. */
function pointsOf(values: readonly number[], ceiling: number): string {
  const step = VIEW_W / (values.length - 1);
  return values
    .map((value, index) => `${String(index * step)},${String(heightOf(value, ceiling))}`)
    .join(' ');
}
