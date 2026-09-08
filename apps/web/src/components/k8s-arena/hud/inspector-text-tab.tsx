'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@devops-platform/ui';

/** Bao lâu nút giữ trạng thái "Đã chép" trước khi trở lại. */
const COPIED_MS = 2000;

export interface InspectorTextTabProps {
  /** Nội dung thuần văn bản — YAML hoặc khối `describe`. */
  readonly text: string;
  /** Tên khả truy của vùng cuộn, ví dụ `YAML của pod/web`. */
  readonly label: string;
  readonly copyLabel: string;
}

/**
 * Khối văn bản đơn sắc có nút chép — dùng cho cả tab YAML lẫn tab Mô tả.
 *
 * `<pre>` chứ không phải một cây `<div>` tô màu cú pháp: nội dung phải chép ra
 * được NGUYÊN VẸN và phải đọc được tuần tự bằng trình đọc màn hình. Tô màu ở đây
 * đổi cả hai thứ đó lấy một thứ trang trí. (Cùng lập luận với bản cũ, giữ lại
 * nguyên vẹn vì nó vẫn đúng.)
 */
export function InspectorTextTab({ text, label, copyLabel }: InspectorTextTabProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dọn hẹn giờ lúc gỡ. Không dọn thì `setCopied` chạy trên component đã unmount
  // mỗi lần người dùng chép rồi bỏ chọn ngay — React 19 không cảnh báo nữa, nên
  // rò rỉ này im lặng hoàn toàn.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  const copy = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => {
          setCopied(false);
        }, COPIED_MS);
      } catch {
        // Clipboard bị chính sách trình duyệt từ chối (không phải https, hoặc
        // người dùng chặn). Giữ nguyên nhãn nút: báo "đã chép" khi chưa chép
        // được là nói dối, còn ném lỗi ra thì làm sập cả bảng vì một tiện nghi.
        setCopied(false);
      }
    })();
  }, [text]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={copy}>
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? 'Đã chép' : copyLabel}
        </Button>
      </div>
      {/*
        `tabIndex={0}` trên vùng cuộn là YÊU CẦU của a11y (axe
        `scrollable-region-focusable`), không phải tuỳ chọn: khối không focus
        được thì người chỉ dùng bàn phím không cuộn tới được phần dưới của nó —
        mà phần dưới của một khối `describe` chính là chỗ Events nằm.
      */}
      <pre
        aria-label={label}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {text}
      </pre>
    </div>
  );
}
