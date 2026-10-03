/**
 * Gộp các lượt tải của một danh sách "Xem thêm" thành MỘT trạng thái để vẽ.
 *
 * Danh sách tải thêm theo cursor bằng `useQueries` (một query cho mỗi cursor
 * trong ngăn xếp), KHÔNG bằng `useInfiniteQuery`: cái sau tự chèn `direction`
 * vào input và mọi input list của repo là `.strict()` (xem `catalog-input.ts`).
 *
 * Hàm thuần để test được không cần React: nó chỉ đọc bốn field mà mọi kết quả
 * query đều có.
 */
export interface PageQueryLike<T, E> {
  readonly data?: { readonly items: readonly T[]; readonly nextCursor?: string | null | undefined } | undefined;
  readonly error: E | null;
  readonly isPending: boolean;
  readonly isError: boolean;
}

export type CatalogPages<T, E> =
  | { readonly status: 'pending' }
  | { readonly status: 'error'; readonly error: E }
  | {
      readonly status: 'success';
      readonly items: readonly T[];
      readonly nextCursor: string | null;
      readonly hasNext: boolean;
      /** Đang chờ lượt tải thêm cuối cùng. */
      readonly loadingMore: boolean;
      /** Lượt tải thêm bị lỗi: `index` là vị trí trong ngăn xếp, `page` đếm từ 1. */
      readonly moreError: { readonly error: E; readonly index: number; readonly page: number } | null;
    };

/**
 * Lượt đầu quyết định trạng thái của cả trang (đang tải / lỗi). Từ lượt thứ hai,
 * lỗi hay chờ chỉ gắn vào CHÂN danh sách: các mục đã hiện không được biến mất
 * vì một lượt tải thêm hỏng.
 *
 * `nextCursor` lấy từ lượt CUỐI CÙNG đã về; lượt sau nó còn đang chờ hay lỗi thì
 * chưa có cursor mới, và nút Xem thêm phải chờ chứ không đẩy lại cursor cũ.
 */
export function combineCatalogPages<T, E>(results: readonly PageQueryLike<T, E>[]): CatalogPages<T, E> {
  const first = results[0];
  if (first === undefined || first.isPending) {
    return { status: 'pending' };
  }
  if (first.isError || first.data === undefined) {
    return { status: 'error', error: first.error as E };
  }

  const items: T[] = [];
  let nextCursor: string | null = null;
  let loadingMore = false;
  let moreError: { readonly error: E; readonly index: number; readonly page: number } | null = null;

  for (const [index, result] of results.entries()) {
    if (result.data !== undefined && !result.isError) {
      items.push(...result.data.items);
      nextCursor = result.data.nextCursor ?? null;
      continue;
    }
    if (result.isError) {
      moreError = { error: result.error as E, index, page: index + 1 };
    } else {
      loadingMore = true;
    }
    break;
  }

  const settled = !loadingMore && moreError === null;
  return {
    status: 'success',
    items,
    nextCursor,
    hasNext: nextCursor !== null || !settled,
    loadingMore,
    moreError,
  };
}
