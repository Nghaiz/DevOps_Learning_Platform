'use client';

import type { ReactElement } from 'react';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, ErrorState } from '@devops-platform/ui';
import { describeCatalogError } from './catalog-error-kind';

/**
 * Ô lỗi của danh mục: câu của máy chủ, nút Thử lại khi thử lại có ích, và một
 * câu phụ khi lỗi rơi vào giữa chừng (lượt tải thêm thứ 2 trở đi).
 *
 * `page` là số thứ tự của LƯỢT bị lỗi. Lượt 1 lỗi thì cả bảng chưa có gì; lượt
 * sau lỗi thì các mục đã hiện vẫn ở trên, và câu phụ nói rõ điều đó.
 */
export function CatalogError(props: {
  readonly title: string;
  readonly message: string;
  readonly retrying: boolean;
  readonly page: number;
  readonly onRetry: () => void;
  readonly onFirstPage: () => void;
  readonly errorCode?: string | null | undefined;
}): ReactElement {
  const advice = describeCatalogError({ code: props.errorCode, page: props.page });
  const retry = advice.canRetry ? { onRetry: props.onRetry, retrying: props.retrying } : {};

  return (
    <div className="flex flex-col gap-3">
      <ErrorState title={props.title} message={props.message} className="w-full" {...retry} />
      {advice.hint !== null && (
        <p className="max-w-2xl text-sm text-muted-foreground">
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
