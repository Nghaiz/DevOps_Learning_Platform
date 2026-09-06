'use client';

import type { ReactElement } from 'react';
import { Button, ErrorState } from '@devops-platform/ui';
import { describeCatalogError } from './catalog-error-kind';

/**
 * Lỗi tải danh sách danh mục.
 *
 * ## ⛔ Lỗi giữa chừng KHÔNG được làm mất chỗ đang đọc
 *
 * Component này không đụng tới ngăn xếp cursor, và `onRetry` của cả năm client
 * là `query.refetch()` — nạp lại ĐÚNG input cũ, cùng mốc. Đó là hành vi đúng và
 * nó có test giữ (`catalog-error-kind.test.ts`, nhóm thứ hai): reset về trang 1
 * chính là thứ biến một sự cố tạm thời thành mất chỗ đang đọc.
 *
 * Cái sai ở bản trước không nằm ở cursor mà nằm ở LỜI KHUYÊN: hễ `page > 1` là
 * nói "Mục làm mốc của trang này có thể đã bị gỡ khỏi kho — về đầu danh sách",
 * cho MỌI loại lỗi. Từ khi `compositeContentSource` ném thay vì trả trang rỗng
 * kèm 200 (`0ec4f8a`/`2cb5593`), lớp lỗi hay gặp nhất ở đây là
 * `SERVICE_UNAVAILABLE` — và với nó, câu đó vừa sai nguyên nhân vừa mời người
 * dùng bấm đúng cái nút phá hoại nhất. Quyết định "nói gì, mở lối nào" giờ nằm
 * ở `describeCatalogError` (hàm thuần, có test) — component chỉ dịch nó ra DOM.
 *
 * ## `errorCode` là tuỳ chọn, và nhánh thiếu nó phải an toàn
 *
 * Năm client (`app/{lessons,labs,playgrounds,paths,quiz}/*-client.tsx`) hiện
 * truyền `message={describeTrpcError(query.error)}` chứ chưa truyền mã lỗi, và
 * năm file đó nằm NGOÀI đường sở hữu của lane này. Nên prop này để tuỳ chọn:
 * thiếu nó thì rơi về nhánh `unknown` — không chẩn đoán bừa, không bỏ nút Thử
 * lại. Chỉ một dòng `errorCode={trpcErrorCode(query.error)}` ở mỗi client là
 * mở khoá phần phân loại chính xác (patch đề xuất ghi trong report).
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
        <p className="text-sm text-muted-foreground">
          {advice.hint}
          {advice.canGoFirstPage && (
            <>
              {' '}
              <Button variant="link" size="sm" onClick={props.onFirstPage} className="px-0">
                Về đầu danh sách
              </Button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
