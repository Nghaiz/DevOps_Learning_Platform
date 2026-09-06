'use client';

import { Badge, Skeleton, Tooltip, TooltipContent, TooltipTrigger, type BadgeVariant } from '@devops-platform/ui';
import { describeCapacity, formatFetchedAt, type CapacityTone } from './capacity';
import { useCapacity } from './use-capacity';

const TONE_VARIANT: Record<CapacityTone, BadgeVariant> = {
  ok: 'secondary',
  low: 'warning',
  full: 'destructive',
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
        <Badge variant={TONE_VARIANT[reading.tone]}>{reading.label}</Badge>
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
