'use client';

import { useCallback, useMemo, useState } from 'react';
import type { SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { NO_FILTER, hasActiveFilter, type CatalogFilterState } from './catalog-input';
import { FIRST_PAGE, currentCursor, pageNumber, pushCursor, type CursorStack } from '../../lib/cursor-stack';
import { DEFAULT_SORT_KEY } from './catalog-sort';
import { normalizeSearchQuery } from './catalog-search';

export interface CatalogControls {
  readonly filters: CatalogFilterState;
  readonly sortKey: string;
  /** Đúng chữ trong ô tìm, để ô nhập hiện lại được. */
  readonly search: string;
  /** Cùng chữ đó đã gập dấu và gộp khoảng trắng. `''` = không tìm gì. */
  readonly normalizedSearch: string;
  readonly cursor: string | undefined;
  readonly page: number;
  /** CHỈ bộ lọc phía server (độ khó, hạng sandbox). Ô tìm KHÔNG tính vào đây. */
  readonly hasActiveFilter: boolean;
  readonly hasSearch: boolean;
  readonly setDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly setTier: (value: SandboxTierName | 'all') => void;
  readonly setSortKey: (value: string) => void;
  readonly setSearch: (value: string) => void;
  readonly clearSearch: () => void;
  readonly clearFilters: () => void;
  readonly goNext: (nextCursor: string | null) => void;
  readonly goFirst: () => void;
}

/**
 * State dùng chung của năm trang danh mục: bộ lọc + thứ tự + ô tìm + ngăn xếp
 * cursor.
 *
 * ⛔ Bất kỳ thay đổi nào ĐỔI TẬP KẾT QUẢ đều phải trả cursor về đầu. Cursor là
 * `id` của mục cuối trang trước; giữ nó qua một lần đổi bộ lọc thì server vẫn
 * trả về một trang **hợp lệ** (`WHERE id > cursor AND difficulty = …`) nhưng nó
 * là trang giữa của tập mới, dưới nhãn "Trang 1". Không lỗi, không cảnh báo,
 * chỉ là những mục đầu tiên biến mất.
 *
 * Đổi THỨ TỰ thì KHÔNG reset, và **ô tìm cũng không**. Cả hai chạy hoàn toàn ở
 * client trên đúng trang đang có: `catalog-sort.ts` vì server không nhận tham
 * số sắp xếp, `catalog-search.ts` vì server không nhận từ khoá
 * (`listInputSchema` là `.strict()`, gửi thêm một khoá là 400). Tập kết quả
 * không đổi, nên ép người dùng về trang 1 chỉ vì họ gõ một chữ là lấy mất chỗ
 * đang đọc mà không đổi lại được gì.
 *
 * ## `hasActiveFilter` KHÔNG bao gồm ô tìm, và đó là quyết định
 *
 * Hai thứ này khác nhau ở tầng dữ liệu, nên chúng phải khác nhau ở tầng câu
 * chữ: bộ lọc chạy ở server nên "không có mục nào khớp" là câu trả lời về cả
 * kho đã lọc; ô tìm chạy trên trang đang mở nên cùng câu đó chỉ nói được về
 * trang. Gộp hai cờ vào một là ép một trong hai câu nói quá dữ liệu nó có, và
 * `describeCatalogEmpty` mất luôn khả năng phân biệt hai ca.
 */
export function useCatalogControls(): CatalogControls {
  const [filters, setFilters] = useState<CatalogFilterState>(NO_FILTER);
  const [sortKey, setSortKey] = useState<string>(DEFAULT_SORT_KEY);
  const [search, setSearch] = useState<string>('');
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);

  const setDifficulty = useCallback((value: ScenarioDifficulty | 'all') => {
    setFilters((prev) => ({ ...prev, difficulty: value }));
    setStack(FIRST_PAGE);
  }, []);

  const setTier = useCallback((value: SandboxTierName | 'all') => {
    setFilters((prev) => ({ ...prev, tier: value }));
    setStack(FIRST_PAGE);
  }, []);

  const clearSearch = useCallback(() => {
    setSearch('');
  }, []);

  /**
   * Nút "Xoá bộ lọc" dọn CẢ ô tìm.
   *
   * Người dùng bấm nó khi màn hình không có gì, và thứ họ muốn là thấy lại danh
   * sách. Một nút xoá bộ lọc mà để lại từ khoá sẽ giữ nguyên màn hình rỗng và
   * đọc như một nút hỏng. Cursor vẫn về đầu vì phần bộ lọc có đổi tập kết quả.
   */
  const clearFilters = useCallback(() => {
    setFilters(NO_FILTER);
    setSearch('');
    setStack(FIRST_PAGE);
  }, []);

  const goNext = useCallback((nextCursor: string | null) => {
    setStack((prev) => pushCursor(prev, nextCursor));
  }, []);

  const goFirst = useCallback(() => {
    setStack(FIRST_PAGE);
  }, []);

  const normalizedSearch = useMemo(() => normalizeSearchQuery(search), [search]);

  return {
    filters,
    sortKey,
    search,
    normalizedSearch,
    cursor: currentCursor(stack),
    page: pageNumber(stack),
    hasActiveFilter: hasActiveFilter(filters),
    hasSearch: normalizedSearch !== '',
    setDifficulty,
    setTier,
    setSortKey,
    setSearch,
    clearSearch,
    clearFilters,
    goNext,
    goFirst,
  };
}
