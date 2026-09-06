'use client';

import { useCallback, useState } from 'react';
import type { SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { NO_FILTER, hasActiveFilter, type CatalogFilterState } from './catalog-input.ts';
import { FIRST_PAGE, currentCursor, pageNumber, pushCursor, type CursorStack } from './catalog-cursor.ts';
import { DEFAULT_SORT_KEY } from './catalog-sort.ts';

export interface CatalogControls {
  readonly filters: CatalogFilterState;
  readonly sortKey: string;
  readonly cursor: string | undefined;
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly setDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly setTier: (value: SandboxTierName | 'all') => void;
  readonly setSortKey: (value: string) => void;
  readonly clearFilters: () => void;
  readonly goNext: (nextCursor: string | null) => void;
  readonly goFirst: () => void;
}

/**
 * State dùng chung của năm trang danh mục: bộ lọc + thứ tự + ngăn xếp cursor.
 *
 * ⛔ Bất kỳ thay đổi nào ĐỔI TẬP KẾT QUẢ đều phải trả cursor về đầu. Cursor là
 * `id` của mục cuối trang trước; giữ nó qua một lần đổi bộ lọc thì server vẫn
 * trả về một trang **hợp lệ** (`WHERE id > cursor AND difficulty = …`) nhưng
 * nó là trang giữa của tập mới, dưới nhãn "Trang 1". Không lỗi, không cảnh
 * báo, chỉ là những mục đầu tiên biến mất.
 *
 * Đổi THỨ TỰ thì KHÔNG reset — sắp xếp diễn ra hoàn toàn ở client trên đúng
 * trang đang có (xem `catalog-sort.ts`), tập kết quả không đổi, và ép người
 * dùng về trang 1 chỉ vì họ đổi cách xếp là mất chỗ đang đọc mà không đổi lại
 * được gì.
 */
export function useCatalogControls(): CatalogControls {
  const [filters, setFilters] = useState<CatalogFilterState>(NO_FILTER);
  const [sortKey, setSortKey] = useState<string>(DEFAULT_SORT_KEY);
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);

  const setDifficulty = useCallback((value: ScenarioDifficulty | 'all') => {
    setFilters((prev) => ({ ...prev, difficulty: value }));
    setStack(FIRST_PAGE);
  }, []);

  const setTier = useCallback((value: SandboxTierName | 'all') => {
    setFilters((prev) => ({ ...prev, tier: value }));
    setStack(FIRST_PAGE);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(NO_FILTER);
    setStack(FIRST_PAGE);
  }, []);

  const goNext = useCallback((nextCursor: string | null) => {
    setStack((prev) => pushCursor(prev, nextCursor));
  }, []);

  const goFirst = useCallback(() => {
    setStack(FIRST_PAGE);
  }, []);

  return {
    filters,
    sortKey,
    cursor: currentCursor(stack),
    page: pageNumber(stack),
    hasActiveFilter: hasActiveFilter(filters),
    setDifficulty,
    setTier,
    setSortKey,
    clearFilters,
    goNext,
    goFirst,
  };
}
