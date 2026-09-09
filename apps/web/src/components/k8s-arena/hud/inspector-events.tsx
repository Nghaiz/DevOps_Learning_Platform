'use client';

import { type ReactElement } from 'react';
import { AlertTriangle, Info, XCircle } from 'lucide-react';
import type { EventView } from '@devops-platform/games';
import { cn } from '@devops-platform/ui';
import { EVENT_LEVEL_LABEL } from './inspector-types.ts';

export interface InspectorEventsProps {
  /**
   * Sự kiện của đúng object đang chọn — `InspectorPanel` lọc theo `involvedUid`
   * trước khi truyền xuống.
   */
  readonly events: readonly EventView[];
  /** Tick hiện tại của cụm, để tính "cách đây bao lâu". */
  readonly tick: number;
}

/**
 * Biểu tượng + màu của từng mức.
 *
 * Bản trước phân biệt ba mức CHỈ bằng màu chữ. Hai hệ quả: người mù màu đọc ba
 * mức thành một, và ở cỡ chữ 12px trên nền tối thì `text-muted-foreground` với
 * `text-warning` gần như cùng độ sáng. Thêm biểu tượng là thêm một kênh thứ hai
 * cho cùng thông tin, và đó là điều kiện tối thiểu của một dấu hiệu trạng thái.
 */
const LEVEL_STYLE: Readonly<
  Record<
    EventView['level'],
    {
      readonly icon: typeof Info;
      readonly dot: string;
      readonly text: string;
      readonly rail: string;
    }
  >
> = {
  info: {
    icon: Info,
    dot: 'bg-muted-foreground/50',
    text: 'text-muted-foreground',
    rail: 'text-muted-foreground/60',
  },
  warning: {
    icon: AlertTriangle,
    dot: 'bg-warning',
    text: 'text-foreground',
    rail: 'text-warning',
  },
  error: {
    icon: XCircle,
    dot: 'bg-destructive',
    text: 'text-foreground',
    rail: 'text-destructive',
  },
};

/** `t12 · 4 tick trước`. Tick là đơn vị thời gian DUY NHẤT engine có. */
function ago(tick: number, now: number): string {
  const delta = Math.max(0, now - tick);
  if (delta === 0) return 'vừa xong';
  return `${delta} tick trước`;
}

/**
 * Tab Sự kiện — dòng thời gian, mới nhất lên trên.
 *
 * ## Vì sao là dòng thời gian có trục, không phải một danh sách gạch đầu dòng
 *
 * Sự kiện của Kubernetes chỉ có nghĩa khi đọc theo THỨ TỰ: `Scheduled` →
 * `Pulling` → `Failed` kể một câu chuyện mà ba dòng rời rạc không kể được. Bản
 * trước là một `<ol>` phẳng, mỗi dòng một cỡ chữ, phân biệt mức chỉ bằng màu —
 * nhìn vào không thấy đâu là chuỗi liên tiếp, đâu là chỗ mọi thứ bắt đầu hỏng.
 *
 * Trục dọc bên trái nối các mốc lại; mốc nào là cảnh báo hay lỗi thì chấm đổi
 * màu VÀ đổi biểu tượng, nên chỗ hỏng nổi lên ngay cả khi lướt nhanh.
 *
 * Đếm theo mức ở đầu bảng trả lời câu hỏi đầu tiên người ta hỏi khi mở tab này —
 * *"có lỗi nào không"* — mà không phải cuộn hết danh sách.
 */
export function InspectorEvents({ events, tick }: InspectorEventsProps): ReactElement {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-8 text-center">
        <Info aria-hidden className="size-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">Chưa có sự kiện nào gắn với tài nguyên này.</p>
        <p className="text-[11px] text-muted-foreground/70">
          Sự kiện xuất hiện khi cụm làm gì đó với nó — xếp lịch, kéo image, khởi động lại.
        </p>
      </div>
    );
  }

  const newestFirst = [...events].reverse();
  const errors = events.filter((event) => event.level === 'error').length;
  const warnings = events.filter((event) => event.level === 'warning').length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-muted-foreground">{events.length} sự kiện</span>
        {errors === 0 ? null : (
          <span className="flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-medium text-destructive">
            <XCircle aria-hidden className="size-3" />
            {errors} lỗi
          </span>
        )}
        {warnings === 0 ? null : (
          <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">
            <AlertTriangle aria-hidden className="size-3" />
            {warnings} cảnh báo
          </span>
        )}
      </div>

      <ol className="relative flex flex-col">
        {/* Trục dọc. `aria-hidden` vì nó là đường kẻ, không phải nội dung. */}
        <span aria-hidden className="absolute top-2 bottom-2 left-1.25 w-px bg-border" />
        {newestFirst.map((event, index) => {
          const style = LEVEL_STYLE[event.level];
          const Icon = style.icon;
          return (
            // Khoá gồm cả chỉ số: hai sự kiện cùng tick với cùng nội dung là chuyện
            // bình thường (hai container của một pod hỏng cùng lúc vì cùng nguyên
            // nhân), và khoá trùng sẽ làm React bỏ hẳn dòng thứ hai.
            <li
              key={`${String(event.tick)}-${String(index)}-${event.message}`}
              className="relative flex gap-2.5 py-1.5 pl-0"
            >
              <span
                aria-hidden
                className={cn(
                  'relative z-10 mt-1 size-2.75 shrink-0 rounded-full ring-2 ring-card',
                  style.dot,
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <Icon aria-hidden className={cn('size-3 shrink-0 translate-y-0.5', style.rail)} />
                  <span className="sr-only">{EVENT_LEVEL_LABEL[event.level]}:</span>
                  <p className={cn('min-w-0 flex-1 wrap-break-word text-xs', style.text)}>
                    {event.message}
                  </p>
                </div>
                <p className="mt-0.5 pl-4.5 font-mono text-[10px] text-muted-foreground/70">
                  t{event.tick} · {ago(event.tick, tick)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
