'use client';

import type { ReactElement } from 'react';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, ErrorBlock } from '@devops-platform/ds';
import { describeCatalogError } from './catalog-error-kind';

/**
 * Ô lỗi của danh mục: câu của máy chủ, nút Thử lại khi thử lại có ích, và một câu
 * phụ khi lỗi rơi vào giữa chừng (lượt tải thêm thứ 2 trở đi).
 *
 * `page` là số thứ tự của LƯỢT bị lỗi. Lượt 1 lỗi thì cả danh sách chưa có gì; lượt
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
  return (
    <ErrorBlock
      title={props.title}
      {...(advice.canRetry ? { onRetry: props.onRetry, retryLabel: t('common.action.retry'), retrying: props.retrying } : {})}
    >
      <span className="block">{props.message}</span>
      {advice.hint === null ? null : (
        <span className="mt-1 block">
          {renderCopy(advice.hint)}
          {advice.canGoFirstPage ? (
            <>
              {' '}
              <Button variant="link" size="sm" onClick={props.onFirstPage}>
                {t('catalog.action.first-page')}
              </Button>
            </>
          ) : null}
        </span>
      )}
    </ErrorBlock>
  );
}
