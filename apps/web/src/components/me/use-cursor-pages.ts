'use client';

import { useCallback, useState } from 'react';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../catalog/catalog-cursor';

/**
 * Ngăn xếp cursor cho MỘT danh sách trên `/me`. Trang này có bốn danh sách phân
 * trang độc lập (phiên đang mở, tiến độ bài học, lịch sử lab, lịch sử quiz),
 * nên state cursor phải là một hook gọi được bốn lần — không phải bốn cặp
 * `useState` chép tay.
 *
 * ⛔ **KHÔNG `useInfiniteQuery`.** Nó nhét `direction` vào input, mọi schema là
 * `.strict()`, và request THẬT của trình duyệt trả 400 trong khi test mức API
 * vẫn xanh (đo 2026-08-13 — xem chú thích đầy đủ ở `app/lessons/lessons-client.tsx`).
 * Đường đúng là `useQuery` + cursor thủ công + `CursorPager`.
 *
 * Phần TÍNH TOÁN mượn nguyên `components/catalog/catalog-cursor.ts` thay vì
 * chép lại: đó là bốn hàm thuần, không mang khái niệm nào của danh mục, và bản
 * chép thứ hai sẽ trôi ở đúng chỗ khó thấy nhất (`pushCursor(stack, null)` —
 * đẩy `null` vào làm trang sau nạp lại trang 1 dưới nhãn "trang N").
 * ⚠ Chỗ đúng cho module đó là `apps/web/src/lib/`, nhưng `lib/**` không thuộc
 * path sở hữu của lane E — đã ghi vào report kèm đề xuất dời.
 */
export interface CursorPages {
  /** Cursor để nạp trang đang xem; `undefined` = trang 1. */
  readonly cursor: string | undefined;
  readonly page: number;
  /** `null` = server nói đã hết ⇒ đứng yên (xem `pushCursor`). */
  readonly goNext: (nextCursor: string | null) => void;
  readonly goFirst: () => void;
}

export function useCursorPages(): CursorPages {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);

  const goNext = useCallback((nextCursor: string | null) => {
    setStack((prev) => pushCursor(prev, nextCursor));
  }, []);

  const goFirst = useCallback(() => {
    setStack(FIRST_PAGE);
  }, []);

  return { cursor: currentCursor(stack), page: pageNumber(stack), goNext, goFirst };
}
