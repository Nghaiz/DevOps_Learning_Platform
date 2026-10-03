'use client';

import type { ReactElement, ReactNode } from 'react';
import { renderCopy, t } from '@devops-platform/copy';
import { Button } from '@devops-platform/ui';
import { Board, BoardSkeleton } from '../kit';
import { describeTrpcError, trpcErrorCode } from '../../lib/trpc';
import { CatalogEmptyState } from './catalog-empty';
import { CatalogError } from './catalog-error';
import { catalogErrorTitle, catalogNoun, describeResultCount, type CatalogKind } from './catalog-labels';
import type { CatalogPages } from './catalog-pages';
import type { CatalogControls } from './use-catalog-controls';

type ListError = Parameters<typeof describeTrpcError>[0];

/**
 * Bốn trạng thái của một trang danh mục, cộng chân "Xem thêm".
 *
 * - Lượt đầu đang tải ⇒ khung chờ có hình đúng như dòng thật.
 * - Lượt đầu lỗi ⇒ ô lỗi thay chỗ bảng.
 * - Không còn mục nào để hiện ⇒ trạng thái rỗng có việc làm tiếp. Nếu chính ô
 *   tìm lọc sạch phần đã tải mà danh sách còn tiếp, chân Xem thêm VẪN hiện: đó
 *   là cách duy nhất để tìm tiếp.
 * - Có mục ⇒ bảng tuyến, rồi dòng đếm và nút Xem thêm. Lượt tải thêm lỗi thì ô
 *   lỗi nằm ở chân, các mục đã hiện giữ nguyên.
 */
export function CatalogResults(props: {
  readonly kind: CatalogKind;
  readonly pages: CatalogPages<unknown, ListError>;
  /** Số mục đang hiện, SAU ô tìm. */
  readonly shown: number;
  readonly controls: CatalogControls;
  readonly canAuthor: boolean;
  /** Tải lại đúng lượt thứ `index` (0 = lượt đầu). */
  readonly onRetry: (index: number) => void;
  readonly isFetching: (index: number) => boolean;
  /** Các `BoardRow`. */
  readonly children: ReactNode;
}): ReactElement {
  const { pages, controls } = props;

  if (pages.status === 'pending') {
    return <BoardSkeleton label={t('catalog.loading.list')} />;
  }

  if (pages.status === 'error') {
    return (
      <CatalogError
        title={catalogErrorTitle(props.kind)}
        message={describeTrpcError(pages.error)}
        errorCode={trpcErrorCode(pages.error)}
        retrying={props.isFetching(0)}
        page={1}
        onRetry={() => props.onRetry(0)}
        onFirstPage={controls.goFirst}
      />
    );
  }

  const loaded = pages.items.length;
  const footer = (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="font-mono text-sm text-muted-foreground tabular-nums">
          {loaded > 0 &&
            renderCopy(
              describeResultCount({
                kind: props.kind,
                shown: props.shown,
                loaded,
                hasNext: pages.hasNext,
                hasActiveFilter: controls.hasActiveFilter,
                searching: controls.hasSearch,
              }),
            )}
        </p>
        {pages.hasNext && pages.moreError === null && (
          <Button
            variant="outline"
            loading={pages.loadingMore}
            disabled={pages.nextCursor === null}
            onClick={() => controls.goNext(pages.nextCursor)}
          >
            {t('catalog.pager.more')}
          </Button>
        )}
      </div>
      {pages.moreError !== null && (
        <CatalogError
          title={t('catalog.pager.page', { page: pages.moreError.page })}
          message={describeTrpcError(pages.moreError.error)}
          errorCode={trpcErrorCode(pages.moreError.error)}
          retrying={props.isFetching(pages.moreError.index)}
          page={pages.moreError.page}
          onRetry={() => {
            if (pages.moreError !== null) props.onRetry(pages.moreError.index);
          }}
          onFirstPage={controls.goFirst}
        />
      )}
    </div>
  );

  if (props.shown === 0) {
    return (
      <div>
        <CatalogEmptyState
          kind={props.kind}
          page={controls.page}
          hasActiveFilter={controls.hasActiveFilter}
          canAuthor={props.canAuthor}
          query={controls.normalizedSearch}
          loaded={loaded}
          hasNext={pages.hasNext}
          onClearFilters={controls.clearFilters}
          onClearSearch={controls.clearSearch}
          onFirstPage={controls.goFirst}
        />
        {loaded > 0 && footer}
      </div>
    );
  }

  return (
    <div>
      <Board label={t('catalog.board.label', { noun: catalogNoun(props.kind) })}>{props.children}</Board>
      {footer}
    </div>
  );
}
