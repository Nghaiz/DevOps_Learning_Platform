'use client';

import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, EmptyState } from '@devops-platform/ui';
import { describeCatalogEmpty, renderCopy, type CatalogKind } from './catalog-labels';

/**
 * Trạng thái rỗng của trang danh mục.
 *
 * Câu chữ và lựa chọn hành động là hàm THUẦN (`describeCatalogEmpty`) có test
 * riêng; component này chỉ dịch quyết định đó thành nút/link. Tách ra vì thứ dễ
 * sai ở đây là *nói gì với ai*, và điều đó phải kiểm được mà không cần dựng DOM
 * (`apps/web` chạy vitest ở môi trường node theo mặc định).
 *
 * ## `loaded` khác `0`, và đó là ca mới của 16.C
 *
 * Trước lượt này, "lưới rỗng" chỉ có một nghĩa: server trả về 0 mục. Từ khi có ô
 * tìm, nó có hai nghĩa, và hai nghĩa đó đòi hai câu khác nhau. `loaded` (số mục
 * server trả về TRƯỚC khi ô tìm lọc) là thứ duy nhất phân biệt được chúng, nên
 * nó là prop bắt buộc chứ không phải tuỳ chọn: bỏ sót nó sẽ làm mọi lượt tìm
 * hụt đọc thành "kho chưa có gì".
 */
export function CatalogEmptyState(props: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly canAuthor: boolean;
  /** Từ khoá ĐÃ CHUẨN HOÁ. `''` = ô tìm rỗng. */
  readonly query: string;
  /** Số mục server trả về trang này, TRƯỚC khi ô tìm lọc. */
  readonly loaded: number;
  readonly hasNext: boolean;
  readonly onClearFilters: () => void;
  readonly onClearSearch: () => void;
  readonly onFirstPage: () => void;
}): ReactElement {
  const empty = describeCatalogEmpty({
    kind: props.kind,
    page: props.page,
    hasActiveFilter: props.hasActiveFilter,
    canAuthor: props.canAuthor,
    query: props.query,
    loaded: props.loaded,
    hasNext: props.hasNext,
  });

  let action: ReactNode;
  switch (empty.action.kind) {
    case 'clear-filter':
      action = (
        <Button variant="outline" size="sm" onClick={props.onClearFilters}>
          {t('catalog.action.clear-filter')}
        </Button>
      );
      break;
    case 'clear-search':
      action = (
        <Button variant="outline" size="sm" onClick={props.onClearSearch}>
          {t('catalog.action.clear-search')}
        </Button>
      );
      break;
    case 'first-page':
      action = (
        <Button variant="outline" size="sm" onClick={props.onFirstPage}>
          {t('catalog.action.first-page')}
        </Button>
      );
      break;
    case 'author':
      action = (
        <Button variant="primary" size="sm" asChild>
          <Link href="/author">{t('catalog.action.author')}</Link>
        </Button>
      );
      break;
    case 'browse':
      action = (
        <Button variant="outline" size="sm" asChild>
          <Link href={empty.action.href}>{renderCopy({ key: empty.action.labelKey })}</Link>
        </Button>
      );
      break;
  }

  return (
    <EmptyState
      title={renderCopy(empty.title)}
      description={renderCopy(empty.description)}
      action={action}
    />
  );
}
