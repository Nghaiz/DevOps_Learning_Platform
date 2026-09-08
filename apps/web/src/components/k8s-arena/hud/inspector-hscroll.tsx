'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Sai số cho phép khi so vị trí cuộn với hai mép, tính bằng px.
 *
 * ⚠ Đây KHÔNG phải một con số làm đẹp. `scrollWidth` và `clientWidth` là số
 * NGUYÊN đã làm tròn từ bố cục phân số, còn `scrollLeft` là số THỰC. Đo trên
 * `describe` của `pod/api`: cuộn hết cỡ cho `scrollLeft = 398.667` trong khi
 * `scrollWidth - clientWidth = 399`, nên phép so `scrollLeft < max` vẫn đúng ở
 * đúng chỗ đáng lẽ phải là "đã hết".
 *
 * Hậu quả nếu bỏ sai số này, đã đo được cả hai:
 * 1. `preventDefault` chạy vĩnh viễn ⇒ con lăn CHẾT CỨNG trong vùng này, không
 *    cuộn ngang thêm được mà cũng không rơi về hành vi mặc định.
 * 2. Dải mờ mép phải không bao giờ tắt, tức nó nói dối rằng còn nội dung.
 */
const EDGE_TOLERANCE_PX = 1;

export interface HorizontalScrollState {
  /** Gắn vào chính phần tử cuộn được. */
  readonly ref: RefObject<HTMLPreElement | null>;
  /** Còn nội dung khuất bên TRÁI ⇒ vẽ dải mờ mép trái. */
  readonly hasLeft: boolean;
  /** Còn nội dung khuất bên PHẢI. */
  readonly hasRight: boolean;
}

/**
 * Lăn chuột trong vùng này ⇒ cuộn NGANG, và dải mờ báo còn nội dung khuất.
 *
 * Chỉ đạo trực tiếp của chủ dự án (2026-09-08): *"vẫn được phép scroll ngang ở
 * chỗ sidetab bên phải … nhưng hãy làm sao khi hover chuột ở chỗ đó thì khi lăn
 * chuột nó sẽ lăn ngang hộ mình"*. Người dùng không phải giữ Shift, không phải
 * kéo thanh trượt.
 *
 * Ba chi tiết dưới đây là chỗ cách làm ngây thơ hỏng, và cả ba đều hỏng IM LẶNG:
 *
 * 1. **`{ passive: false }` bắt buộc.** React gắn `onWheel` qua hệ sự kiện tổng
 *    hợp của nó, và trình duyệt mặc định coi listener `wheel` là passive —
 *    `preventDefault()` khi đó bị bỏ qua, không lỗi, không cảnh báo. Nên phải
 *    `addEventListener` tay trên chính phần tử.
 * 2. **Cộng `deltaX + deltaY`.** Chuột có con lăn ngang và bàn di chuột vuốt
 *    ngang đều gửi `deltaX` thật. Chỉ đọc `deltaY` thì thao tác vuốt ngang tự
 *    nhiên bị chính tay ta chặn mất.
 * 3. **Chỉ nuốt sự kiện khi CÒN chỗ cuộn theo hướng đó.** `preventDefault` lúc
 *    đã cuộn hết cỡ làm con lăn chết cứng trong vùng này — người dùng kẹt, không
 *    cuộn ngang thêm được mà cũng không rơi xuống hành vi mặc định.
 */
export function useHorizontalWheelScroll(text: string): HorizontalScrollState {
  const ref = useRef<HTMLPreElement>(null);
  const [hasLeft, setHasLeft] = useState(false);
  const [hasRight, setHasRight] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setHasLeft(el.scrollLeft > EDGE_TOLERANCE_PX);
    setHasRight(el.scrollLeft < max - EDGE_TOLERANCE_PX);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }

    const onWheel = (event: WheelEvent): void => {
      const delta = event.deltaX + event.deltaY;
      const max = el.scrollWidth - el.clientWidth;
      if (delta === 0 || max <= 0) {
        return;
      }
      const room =
        delta < 0 ? el.scrollLeft > EDGE_TOLERANCE_PX : el.scrollLeft < max - EDGE_TOLERANCE_PX;
      if (!room) {
        // Hết cỡ ⇒ TRẢ sự kiện lại cho trình duyệt. Nội dung nào dài quá chiều
        // cao bảng sẽ cuộn dọc bằng đúng cú lăn này (thanh trượt vẫn ẩn), nên
        // không có chữ nào bị kẹt ngoài tầm với.
        return;
      }
      event.preventDefault();
      el.scrollLeft = Math.min(max, Math.max(0, el.scrollLeft + delta));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('scroll', measure);
    // Bề rộng bảng kéo được, nên khoảng cuộn đổi mà KHÔNG có sự kiện scroll nào.
    // Thiếu observer này thì dải mờ đứng yên ở giá trị cũ sau mỗi lần kéo mép.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  // Đổi nội dung ⇒ đo lại. `text` trong mảng phụ thuộc chứ không phải một ref:
  // chuyển từ pod này sang pod khác đổi cả bề rộng nội dung lẫn vị trí cuộn.
  useEffect(() => {
    measure();
  }, [measure, text]);

  return { ref, hasLeft, hasRight };
}
