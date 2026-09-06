'use client';

import { Badge, Skeleton, Tooltip, TooltipContent, TooltipTrigger, cn } from '@devops-platform/ui';
import { describeCapacity, formatFetchedAt, type CapacityTone } from './capacity';
import { useCapacity } from './use-capacity';

/**
 * Màu chấm trạng thái theo thang `--status-*` của 13.A.
 *
 * ## Vì sao màu chuyển từ NỀN badge sang CHẤM
 *
 * Bản cũ tô cả badge theo mức (`secondary` / `warning` / `destructive`). Nó
 * đọc ra là một nhãn đổi màu, không đọc ra là một CHỈ BÁO SỨC CHỨA — và ở mức
 * bình thường, `secondary` xám khiến "Còn 20 chỗ" trôi lẫn vào thanh nav.
 *
 * Nay badge luôn `outline` (chữ `--foreground` trên `--background`: 19.79 sáng
 * / 18.96 tối) và MÀU nằm ở chấm. Đo trên đúng giá trị token đã hạ cánh ở
 * `globals.css`, ngưỡng đồ hoạ 3.0:
 *
 * | chấm trên `--background` | sáng | tối |
 * |---|---|---|
 * | `--status-done` | 5.44 | 7.96 |
 * | `--status-progress` | 5.43 | 7.32 |
 * | `--status-locked` | 5.44 | 7.41 |
 *
 * ## KHÔNG phân biệt bằng riêng màu
 *
 * `describeCapacity` đã cho ba câu chữ khác hẳn nhau — "Còn N chỗ", "Chỉ còn N
 * chỗ", "Hết chỗ" — nên người không phân biệt được màu vẫn đọc ra mức từ chính
 * nhãn. Chấm là lớp thứ hai, không phải lớp duy nhất.
 *
 * ## Mức `full` mất nền đỏ thì có nhẹ đi không
 *
 * Không: khi `tone === 'full'`, vỏ ứng dụng còn dựng `CapacityFullBanner` —
 * một `Alert` chạy hết chiều ngang ngay dưới thanh nav, nói cả việc phải làm
 * tiếp. Cảnh báo được nâng cấp lên banner chứ không bị gỡ.
 */
const TONE_DOT: Record<CapacityTone, string> = {
  ok: 'bg-status-done',
  low: 'bg-status-progress',
  full: 'bg-status-locked',
};

/**
 * "Còn N chỗ" trên thanh điều hướng (13.B mục 7).
 *
 * Hiện ở VỎ chứ không chỉ cạnh nút Bắt đầu, vì AC đòi báo TRƯỚC khi người dùng
 * chạm 429 — mà lúc họ nhìn thấy nút Bắt đầu thì đã đi hết một chuỗi chọn bài.
 */
export function CapacityIndicator() {
  const { data, error, loading } = useCapacity();

  if (data === null) {
    if (loading) {
      return <Skeleton className="h-6 w-24 rounded-md" />;
    }
    if (error === null) {
      return null;
    }
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline">Chưa đọc được sức chứa</Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {error} Số chỗ trống sẽ tự hiện lại khi máy chủ trả lời; nếu vẫn trống sau vài
          phút, tải lại trang.
        </TooltipContent>
      </Tooltip>
    );
  }

  const reading = describeCapacity(data);
  const at = formatFetchedAt(data.fetchedAt);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="gap-1.5">
          {/* Chấm thuần đồ hoạ: nhãn ngay bên cạnh đã nói đủ mức, nên gắn thêm
              nhãn cho nó là bắt trình đọc màn hình nghe hai lần. */}
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', TONE_DOT[reading.tone])}
          />
          {reading.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>{reading.detail}</p>
        {at === null ? null : <p className="mt-1 text-xs opacity-80">Đọc lúc {at}.</p>}
        {error === null ? null : (
          <p className="mt-1 text-xs opacity-80">
            Số liệu có thể đã cũ — lượt đọc gần nhất lỗi: {error}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
