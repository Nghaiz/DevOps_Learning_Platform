'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ContentTopic, SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
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
  /** Mọi cursor đã yêu cầu, theo thứ tự. Phần tử 0 là `undefined` (lượt đầu). */
  readonly cursors: CursorStack;
  /** Số lượt tải đã yêu cầu, đếm từ 1. */
  readonly page: number;
  /** CHỈ bộ lọc phía server. Ô tìm KHÔNG tính vào đây. */
  readonly hasActiveFilter: boolean;
  readonly hasSearch: boolean;
  readonly isSorted: boolean;
  readonly setTopic: (value: ContentTopic | 'all') => void;
  readonly setDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly setTier: (value: SandboxTierName | 'all') => void;
  readonly setSortKey: (value: string) => void;
  readonly setSearch: (value: string) => void;
  readonly clearSearch: () => void;
  readonly clearFilters: () => void;
  /** Xem thêm: tải lượt kế tiếp bằng `nextCursor` mà lượt cuối vừa trả. */
  readonly goNext: (nextCursor: string | null) => void;
  /** Về lại một lượt đầu duy nhất. */
  readonly goFirst: () => void;
}

/**
 * State dùng chung của năm trang danh mục: bộ lọc + thứ tự + ô tìm + ngăn xếp
 * cursor của các lượt "Xem thêm".
 *
 * ⛔ Bất kỳ thay đổi nào ĐỔI TẬP KẾT QUẢ đều phải trả ngăn xếp về một lượt đầu.
 * Cursor là `id` của mục cuối lượt trước; giữ nó qua một lần đổi bộ lọc thì máy
 * chủ vẫn trả một lượt **hợp lệ** nhưng là phần giữa của tập mới. Không lỗi,
 * không cảnh báo, chỉ là những mục đầu tiên biến mất.
 *
 * Đổi THỨ TỰ và gõ ô tìm thì KHÔNG reset: cả hai chạy ở client trên phần đã tải
 * (máy chủ không nhận tham số sắp xếp lẫn từ khoá), tập kết quả không đổi.
 *
 * `hasActiveFilter` KHÔNG bao gồm ô tìm: bộ lọc chạy ở server nên "không khớp" là
 * câu về cả kho đã lọc, còn ô tìm chỉ nói về phần đã tải.
 */
export function useCatalogControls(): CatalogControls {
  const [filters, setFilters] = useState<CatalogFilterState>(NO_FILTER);
  const [sortKey, setSortKey] = useState<string>(DEFAULT_SORT_KEY);
  const [search, setSearch] = useState<string>('');
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);

  const setTopic = useCallback((value: ContentTopic | 'all') => {
    setFilters((prev) => ({ ...prev, topic: value }));
    setStack(FIRST_PAGE);
  }, []);

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
   * Nút "Xoá bộ lọc" dọn CẢ ô tìm: người dùng bấm nó khi màn hình không có gì,
   * và thứ họ muốn là thấy lại danh sách.
   */
  const clearFilters = useCallback(() => {
    setFilters(NO_FILTER);
    setSearch('');
    setStack(FIRST_PAGE);
  }, []);

  /**
   * Bấm Xem thêm hai lần trước khi lượt kia về sẽ đẩy CÙNG một cursor hai lần,
   * tức hai lượt trùng nhau và hai mục cùng `key`. Cursor trùng với đỉnh ngăn
   * xếp thì bỏ qua.
   */
  const goNext = useCallback((nextCursor: string | null) => {
    setStack((prev) => (nextCursor !== null && currentCursor(prev) === nextCursor ? prev : pushCursor(prev, nextCursor)));
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
    cursors: stack,
    page: pageNumber(stack),
    hasActiveFilter: hasActiveFilter(filters),
    hasSearch: normalizedSearch !== '',
    isSorted: sortKey !== DEFAULT_SORT_KEY,
    setTopic,
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
