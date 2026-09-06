/**
 * BẢN TÁI HIỆN — luật ĐANG chạy của `catalog-error.tsx`, viết lại thành hàm
 * thuần để bộ test nhìn thấy được. Chưa phải bản sửa.
 */
export type CatalogErrorKind = 'retryable' | 'stale-cursor' | 'unknown';

export interface CatalogErrorAdvice {
  readonly kind: CatalogErrorKind;
  readonly canRetry: boolean;
  readonly canGoFirstPage: boolean;
  readonly hint: string | null;
}

export function describeCatalogError(args: {
  readonly code: string | null | undefined;
  readonly page: number;
}): CatalogErrorAdvice {
  return {
    kind: 'unknown',
    canRetry: true,
    canGoFirstPage: args.page > 1,
    hint:
      args.page > 1
        ? 'Thử lại vẫn lỗi? Mục làm mốc của trang này có thể đã bị gỡ khỏi kho.'
        : null,
  };
}
