'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, cn } from '@devops-platform/ui';
import { tokenizeDescribe, type DescribeTokenKind } from '../shared/describe-highlight';
import { HIDDEN_SCROLL_BOTH } from './inspector-frame.tsx';
import { useHorizontalWheelScroll } from './inspector-hscroll.tsx';
import { ThemedHScrollbar } from './themed-hscrollbar.tsx';

/**
 * Loại mẩu → lớp màu.
 *
 * Token ngữ nghĩa, không hex — `check-design-tokens.mjs` chặn màu cứng, và bảng
 * này phải đổi theo theme cùng phần còn lại của bảng thông số.
 */
const DESCRIBE_CLASS: Readonly<Record<DescribeTokenKind, string>> = {
  heading: 'text-foreground font-semibold',
  label: 'text-status-progress',
  value: 'text-foreground',
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-destructive font-semibold',
  punctuation: 'text-muted-foreground',
  plain: 'text-foreground',
};

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
 * ## Vì sao `whitespace-pre` chứ không bẻ dòng
 *
 * Bản trước đổi sang `whitespace-pre-wrap` để diệt thanh cuộn ngang. Chủ dự án
 * bác: cuộn ngang ở bảng này ĐƯỢC PHÉP, vì `kubectl describe` và YAML là nội
 * dung căn cột, và bẻ dòng phá đúng cái thẳng hàng làm chúng đọc được. Thứ bị
 * cấm là THANH TRƯỢT hiện ra, không phải khả năng cuộn.
 *
 * ## Tô màu, mà vẫn chép ra nguyên vẹn
 *
 * Bản trước từ chối tô màu với lý do: nội dung phải chép ra được NGUYÊN VẸN và
 * phải đọc tuần tự được bằng trình đọc màn hình. Cả hai lý do đều đúng — nhưng
 * chúng chỉ loại trừ việc THAY `<pre>` bằng một cây widget, không loại trừ việc
 * bọc từng mẩu chữ trong `<span>`.
 *
 * Vẫn là một `<pre>` duy nhất, vẫn đúng từng ký tự (`describe-highlight.ts` có
 * một ô kiểm chỉ để gác điều đó), nên `Ctrl+C` và trình đọc màn hình thấy đúng
 * cùng một chuỗi như trước. Cái thêm vào chỉ là `className` trên các `<span>`.
 *
 * Và nó không phải trang trí: `describe` là chỗ người học đi tìm chữ
 * `CrashLoopBackOff` giữa bốn mươi dòng căn cột. Một khối đơn sắc bắt họ đọc
 * tuần tự; một chữ đỏ thì đập vào mắt.
 */
export function InspectorTextTab({ text, label, copyLabel }: InspectorTextTabProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { ref, hasLeft, hasRight, visibleFraction, progress, scrollToFraction } =
    useHorizontalWheelScroll(text);
  const lines = tokenizeDescribe(text);

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
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {copied ? 'Đã chép' : copyLabel}
        </Button>
      </div>

      {/* `relative` để hai dải mờ neo vào đúng mép khối cuộn, không neo vào tab. */}
      <div className="relative min-h-0 flex-1">
        {/*
          `tabIndex={0}` trên vùng cuộn là YÊU CẦU của a11y (axe
          `scrollable-region-focusable`), không phải tuỳ chọn: khối không focus
          được thì người chỉ dùng bàn phím không cuộn tới được phần dưới của nó —
          mà phần dưới của một khối `describe` chính là chỗ Events nằm, tức chỗ
          câu trả lời cho "vì sao pod của tôi mãi Pending".
        */}
        <pre
          ref={ref}
          aria-label={label}
          tabIndex={0}
          className={cn(
            'h-full rounded-md bg-muted p-2 font-mono text-xs whitespace-pre text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            HIDDEN_SCROLL_BOTH,
          )}
        >
          {lines.map((tokens, index) => (
            // Chỉ số dòng là khoá ổn định duy nhất — một dòng `describe` không
            // có danh tính nào khác, và hai dòng giống hệt nhau là chuyện thường.
            // eslint-disable-next-line react/no-array-index-key
            <span key={index} className="block">
              {tokens.map((token, position) => (
                // eslint-disable-next-line react/no-array-index-key
                <span key={position} className={DESCRIBE_CLASS[token.kind]}>
                  {token.text}
                </span>
              ))}
              {'\n'}
            </span>
          ))}
        </pre>

        {/*
          Dải mờ thay cho thanh trượt đã ẩn. Đây KHÔNG phải trang trí: thanh trượt
          là thứ duy nhất nói "còn nội dung bên kia", nên ẩn nó mà không bù lại là
          giấu mất một nửa khối describe khỏi người dùng — họ không có lý do nào
          để thử lăn chuột.

          `aria-hidden` + `pointer-events-none`: trình đọc màn hình đọc tuần tự cả
          `<pre>` nên không bao giờ bị khuất, và dải mờ không được chặn cú lăn
          chuột mà nó đang mời gọi.
        */}
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-6 rounded-l-md bg-linear-to-r from-muted to-transparent transition-opacity',
            hasLeft ? 'opacity-100' : 'opacity-0',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-md bg-linear-to-l from-muted to-transparent transition-opacity',
            hasRight ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>

      {/*
        Thanh cuộn ngang của arena, không phải của trình duyệt. Dải mờ ở trên trả
        lời "còn nội dung bên kia không"; thanh này trả lời "còn bao nhiêu" và
        cho KÉO tới thẳng chỗ cần — với khối describe rộng gấp ba khung thì đó là
        khác biệt giữa lăn mò và nhìn rồi nhảy tới.
      */}
      <ThemedHScrollbar
        visibleFraction={visibleFraction}
        progress={progress}
        onScrollToFraction={scrollToFraction}
        label={`Cuộn ngang ${label}`}
      />
    </div>
  );
}
