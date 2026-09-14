'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { cn } from '@devops-platform/ui';

/**
 * Thanh cuộn ngang VẼ TAY, theo tông của arena.
 *
 * ## Vì sao không dùng thanh cuộn của trình duyệt
 *
 * Chỉ đạo của chủ dự án: *"thêm scroll ngang có màu sắc và hiệu ứng theo theme
 * của game chứ không phải scroll ngang mặc định"*. Thanh mặc định của Chromium
 * trên Windows là một dải xám dày 15px không nhận màu nào của hệ thiết kế, và nó
 * cắt ngang đáy một bảng kính mờ trông như một mảnh vá.
 *
 * ## Vì sao không chỉ dùng hai dải mờ như trước
 *
 * Dải mờ ở hai mép (vẫn giữ, xem `inspector-text-tab.tsx`) trả lời *"còn nội
 * dung bên kia không"* nhưng không trả lời *"còn BAO NHIÊU"* và không cho KÉO.
 * Với khối `describe` rộng gấp ba khung, khác biệt đó là giữa "lăn mò" và "nhìn
 * rồi nhảy tới".
 *
 * ## Nó KHÔNG tự đo
 *
 * Mọi con số tới từ `useHorizontalWheelScroll` — cùng một phép đo mà dải mờ dùng.
 * Đo hai lần ở hai chỗ là mời hai chỗ bất đồng, và triệu chứng sẽ là con trượt
 * chỉ một đằng còn dải mờ chỉ một nẻo.
 */
export interface ThemedHScrollbarProps {
  /** Phần nhìn thấy được trên tổng bề ngang nội dung, 0..1. */
  readonly visibleFraction: number;
  /** Vị trí cuộn hiện tại, 0..1. */
  readonly progress: number;
  readonly onScrollToFraction: (fraction: number) => void;
  readonly label: string;
}

/** Bề dài tối thiểu của con trượt, theo phần trăm khay. Ngắn hơn thì không cầm được. */
const MIN_THUMB_PERCENT = 12;

export function ThemedHScrollbar({
  visibleFraction,
  progress,
  onScrollToFraction,
  label,
}: ThemedHScrollbarProps): ReactElement | null {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  /** Toạ độ x trên khay → vị trí 0..1, đã bù cho bề dài con trượt. */
  const fractionAt = useCallback((clientX: number, thumbPercent: number): number => {
    const track = trackRef.current;
    if (track === null) {
      return 0;
    }
    const rect = track.getBoundingClientRect();
    const thumbWidth = (thumbPercent / 100) * rect.width;
    // Tâm con trượt bám con trỏ, nên khoảng chạy hữu ích hẹp hơn khay đúng một
    // bề dài con trượt. Bỏ bước này thì kéo tới sát mép phải mới ra 100%, và
    // nửa con trượt lòi ra ngoài khay.
    const usable = Math.max(1, rect.width - thumbWidth);
    const x = clientX - rect.left - thumbWidth / 2;
    return Math.min(1, Math.max(0, x / usable));
  }, []);

  const thumbPercent = Math.max(MIN_THUMB_PERCENT, visibleFraction * 100);

  /*
   * Kéo được bắt qua `pointermove` trên WINDOW, không trên con trượt: người dùng
   * kéo nhanh thì con trỏ rời khỏi một dải cao 6px ngay lập tức, và một listener
   * gắn trên chính con trượt sẽ mất dấu giữa chừng.
   */
  useEffect(() => {
    if (!dragging) {
      return;
    }
    const move = (event: globalThis.PointerEvent): void => {
      onScrollToFraction(fractionAt(event.clientX, thumbPercent));
    };
    const stop = (): void => {
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, fractionAt, onScrollToFraction, thumbPercent]);

  // Không tràn ⇒ không có gì để cuộn ⇒ không vẽ gì. Một thanh trượt dài hết khay
  // là một dải màu không mang thông tin.
  if (visibleFraction >= 0.999) {
    return null;
  }

  const onTrackDown = (event: PointerEvent<HTMLDivElement>): void => {
    onScrollToFraction(fractionAt(event.clientX, thumbPercent));
    setDragging(true);
  };

  return (
    <div
      ref={trackRef}
      role="scrollbar"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      onPointerDown={onTrackDown}
      className={cn(
        'group/track relative mt-1 h-1.5 w-full cursor-pointer touch-none rounded-full',
        'bg-border/60 transition-[height] duration-150 hover:h-2.5',
        dragging && 'h-2.5',
      )}
    >
      <span
        aria-hidden
        style={{
          width: `${thumbPercent}%`,
          // `progress` là vị trí trên khoảng CHẠY, nên nhân với phần khay còn
          // lại sau khi trừ bề dài con trượt.
          left: `${progress * (100 - thumbPercent)}%`,
        }}
        /*
         * Sắc của con trượt là `--status-progress`, KHÔNG phải `--primary`.
         *
         * `--primary` của hệ thiết kế này là đỏ (`oklch(… 25)`), và bảng thông
         * số là đúng chỗ màu đỏ đã có một nghĩa cố định: hỏng. Một thanh cuộn đỏ
         * chạy dọc đáy khối `describe` đọc ra như một cảnh báo về nội dung ngay
         * bên trên nó. `--status-progress` là sắc tương tác của arena — cùng màu
         * với đường số liệu trên thanh trên cùng và với khoá YAML — nên nó thuộc
         * về tông của game mà không cướp nghĩa của màu nào.
         */
        className={cn(
          'absolute inset-y-0 rounded-full bg-status-progress/60 transition-colors',
          'shadow-[0_0_8px_var(--status-progress)] group-hover/track:bg-status-progress',
          dragging && 'bg-status-progress',
        )}
      />
    </div>
  );
}
