'use client';

import type { ReactElement } from 'react';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, ErrorState } from '@devops-platform/ui';
import { describeCatalogError } from './catalog-error-kind';

/**
 * Lỗi tải danh sách danh mục.
 *
 * ## ⛔ Lỗi giữa chừng KHÔNG được làm mất chỗ đang đọc
 *
 * Component này không đụng tới ngăn xếp cursor, và `onRetry` của cả năm client
 * là `query.refetch()`, tức nạp lại ĐÚNG input cũ, cùng mốc. Đó là hành vi đúng
 * và nó có test giữ (`catalog-error-kind.test.ts`, nhóm thứ hai): reset về trang
 * 1 chính là thứ biến một sự cố tạm thời thành mất chỗ đang đọc.
 *
 * Cái sai ở bản trước không nằm ở cursor mà nằm ở LỜI KHUYÊN: hễ `page > 1` là
 * nói "Mục làm mốc của trang này có thể đã bị gỡ khỏi kho", cho MỌI loại lỗi. Từ
 * khi `compositeContentSource` ném thay vì trả trang rỗng kèm 200
 * (`0ec4f8a`/`2cb5593`), lớp lỗi hay gặp nhất ở đây là `SERVICE_UNAVAILABLE`, và
 * với nó câu đó vừa sai nguyên nhân vừa mời người dùng bấm đúng cái nút phá hoại
 * nhất. Quyết định "nói gì, mở lối nào" nằm ở `describeCatalogError` (hàm thuần,
 * có test); component chỉ dịch nó ra DOM.
 *
 * ## `errorCode` là tuỳ chọn, và nhánh thiếu nó phải an toàn
 *
 * Thiếu mã lỗi thì rơi về nhánh `unknown`: không chẩn đoán bừa, không bỏ nút Thử
 * lại. Năm client hiện đã truyền `errorCode={trpcErrorCode(query.error)}`, nên
 * nhánh này là lối lùi chứ không phải đường đi thường ngày.
 */
export function CatalogError(props: {
  readonly title: string;
  readonly message: string;
  readonly retrying: boolean;
  readonly page: number;
  readonly onRetry: () => void;
  readonly onFirstPage: () => void;
  /** `trpcErrorCode(query.error)`. `null` = lỗi mạng; bỏ trống = chưa đo được. */
  readonly errorCode?: string | null | undefined;
}): ReactElement {
  const advice = describeCatalogError({ code: props.errorCode, page: props.page });

  // Spread có điều kiện, không `onRetry={... : undefined}`: repo bật
  // `exactOptionalPropertyTypes`, nên truyền tường minh `undefined` vào một prop
  // khai `onRetry?: () => void` là lỗi kiểu, không phải "bỏ prop".
  const retry = advice.canRetry ? { onRetry: props.onRetry, retrying: props.retrying } : {};

  return (
    <div className="flex flex-col items-center gap-3">
      <ErrorState title={props.title} message={props.message} className="w-full" {...retry} />

      {advice.hint !== null && (
        <p className="max-w-(--measure) text-sm text-muted-foreground">
          {renderCopy(advice.hint)}
          {advice.canGoFirstPage && (
            <>
              {' '}
              <Button variant="link" size="sm" onClick={props.onFirstPage} className="px-0">
                {t('catalog.action.first-page')}
              </Button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
