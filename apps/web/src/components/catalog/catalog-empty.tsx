'use client';

import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, Empty, EmptyArt } from '@devops-platform/ds';
import { describeCatalogEmpty, type CatalogKind } from './catalog-labels';

/**
 * Trạng thái rỗng của danh mục: thứ đang thiếu + một việc làm tiếp. Câu chữ và hành
 * động chọn ở `describeCatalogEmpty` (hàm thuần, có test); file này chỉ nối hành động
 * vào nút và chọn hình minh hoạ hợp với ca rỗng.
 */
export function CatalogEmptyState(props: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly hasActiveFilter: boolean;
  readonly canAuthor: boolean;
  readonly query: string;
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
        <Button variant="secondary" icon="close" onClick={props.onClearFilters}>
          {t('catalog.action.clear-filter')}
        </Button>
      );
      break;
    case 'clear-search':
      action = (
        <Button variant="secondary" icon="close" onClick={props.onClearSearch}>
          {t('catalog.action.clear-search')}
        </Button>
      );
      break;
    case 'first-page':
      action = (
        <Button variant="secondary" icon="refresh" onClick={props.onFirstPage}>
          {t('catalog.action.first-page')}
        </Button>
      );
      break;
    case 'author':
      action = (
        <Button variant="primary" icon="pen" asChild>
          <Link href="/studio">{t('catalog.action.author')}</Link>
        </Button>
      );
      break;
    case 'browse':
      action = (
        <Button variant="secondary" asChild>
          <Link href={empty.action.href}>{renderCopy({ key: empty.action.labelKey })}</Link>
        </Button>
      );
      break;
  }

  const art = empty.action.kind === 'clear-filter' || empty.action.kind === 'clear-search' ? 'search' : 'nothing';
  return (
    <Empty art={<EmptyArt kind={art} width={110} />} title={renderCopy(empty.title)} action={action}>
      {renderCopy(empty.description)}
    </Empty>
  );
}
