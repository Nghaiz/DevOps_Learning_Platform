'use client';

import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { Button, EmptyState } from '@devops-platform/ui';
import { describeCatalogEmpty, type CatalogKind } from './catalog-labels';

/**
 * Trạng thái rỗng của trang danh mục.
 *
 * Câu chữ và lựa chọn hành động là hàm THUẦN (`describeCatalogEmpty`) có test
 * riêng — component này chỉ dịch quyết định đó thành nút/link. Tách ra vì thứ
 * dễ sai ở đây là *nói gì với ai*, và điều đó phải kiểm được mà không cần dựng
 * DOM (`apps/web` chạy vitest ở môi trường node, không có jsdom/RTL).
 */
export function CatalogEmptyState(props: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly canAuthor: boolean;
  readonly onClearFilters: () => void;
  readonly onFirstPage: () => void;
}): ReactElement {
  const empty = describeCatalogEmpty({
    kind: props.kind,
    page: props.page,
    hasActiveFilter: props.hasActiveFilter,
    canAuthor: props.canAuthor,
  });

  let action: ReactNode;
  switch (empty.action.kind) {
    case 'clear-filter':
      action = (
        <Button variant="outline" size="sm" onClick={props.onClearFilters}>
          Xoá bộ lọc
        </Button>
      );
      break;
    case 'first-page':
      action = (
        <Button variant="outline" size="sm" onClick={props.onFirstPage}>
          Về đầu danh sách
        </Button>
      );
      break;
    case 'author':
      action = (
        <Button variant="primary" size="sm" asChild>
          <Link href="/author">Mở trang Soạn bài</Link>
        </Button>
      );
      break;
    case 'browse':
      action = (
        <Button variant="outline" size="sm" asChild>
          <Link href={empty.action.href}>{empty.action.label}</Link>
        </Button>
      );
      break;
  }

  return <EmptyState title={empty.title} description={empty.description} action={action} />;
}
