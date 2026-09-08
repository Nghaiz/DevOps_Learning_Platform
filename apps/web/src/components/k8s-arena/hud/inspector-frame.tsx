'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { X } from 'lucide-react';
import { cn } from '@devops-platform/ui';

/**
 * Khung chung của mọi bảng nổi thuộc lane C.
 *
 * ⚠ Tên file mang tiền tố `inspector-` vì luật sở hữu file của P14 (README §4)
 * chỉ cho lane này tạo file bắt đầu bằng sáu tiền tố đã liệt kê; khung này dùng
 * chung cho inspector, metrics, incidents và nhật ký sự kiện chứ không riêng
 * inspector. Đặt tên theo ranh giới sở hữu là chuyện thà ghi ra còn hơn để người
 * đọc sau tự đoán.
 *
 * ## Ba thứ khung này lo, để bốn bảng không phải nhớ
 *
 * 1. **`pointer-events-auto`.** Lớp HUD bao ngoài đặt `pointer-events: none` để
 *    chuột lọt xuống canvas (hợp đồng, đầu `arena-contract.ts`). Bảng nào nhận
 *    tương tác phải tự bật lại — quên một chỗ là bảng đó không bấm được, và
 *    triệu chứng ("bấm không ăn") không chỉ về nguyên nhân.
 * 2. **Esc đóng.** Nghe trên chính khung chứ không trên `window`: phím tắt toàn
 *    cục là của khung HUD (lane B), và hai chỗ cùng nghe `Escape` sẽ đóng hai
 *    lớp trong một lần bấm. Ở đây Esc chỉ ăn khi tiêu điểm đang NẰM TRONG bảng,
 *    đúng nghĩa "đóng cái tôi đang đứng trong".
 * 3. **Trả tiêu điểm.** Bảng đóng mà tiêu điểm còn nằm trong nó thì con trỏ bàn
 *    phím rơi về `<body>` và người dùng mất dấu giữa trang. Khung nhớ phần tử
 *    đang focus lúc mở rồi trả về đúng chỗ đó lúc gỡ.
 */
export interface PanelFrameProps {
  /** Tiêu đề hiển thị, cũng là tên khả truy của vùng. */
  readonly title: string;
  readonly onClose: () => void;
  /** Nội dung phụ nằm cạnh tiêu đề (bộ lọc, nút thu gọn…). */
  readonly headerExtra?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
  /** Nhãn cho nút đóng, ví dụ `Đóng bảng số liệu`. */
  readonly closeLabel: string;
}

/**
 * Trả tiêu điểm về nơi nó đứng trước khi bảng mở.
 *
 * Chỉ trả khi tiêu điểm ĐANG ở trong bảng lúc gỡ. Nếu người dùng đã tự chuyển
 * sang chỗ khác thì kéo họ ngược lại là cướp tiêu điểm — tệ hơn cả việc không
 * làm gì.
 */
export function useReturnFocus(container: RefObject<HTMLElement | null>): void {
  const previous = useRef<Element | null>(null);

  useEffect(() => {
    previous.current = document.activeElement;
    const node = container.current;
    return () => {
      const restoreTo = previous.current;
      if (node === null || restoreTo === null || !node.contains(document.activeElement)) {
        return;
      }
      if (restoreTo instanceof HTMLElement && restoreTo.isConnected) {
        restoreTo.focus();
      }
    };
  }, [container]);
}

export function PanelFrame({
  title,
  onClose,
  headerExtra,
  className,
  children,
  closeLabel,
}: PanelFrameProps): ReactElement {
  const containerRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useReturnFocus(containerRef);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape') {
        return;
      }
      // Chặn nổi bọt để phím tắt toàn cục không đóng thêm một lớp nữa cùng lúc.
      event.stopPropagation();
      onClose();
    },
    [onClose],
  );

  return (
    <section
      ref={containerRef}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className={cn(
        'pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-lg border border-border',
        'bg-card/95 text-card-foreground shadow-elevation-2 backdrop-blur-sm',
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </h2>
        {headerExtra}
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className={cn(
            'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground',
            'transition-colors hover:bg-muted hover:text-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </header>
      {children}
    </section>
  );
}
