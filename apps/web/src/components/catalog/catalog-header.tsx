import type { ReactElement, ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { PageHeader, Pill } from '@devops-platform/ds';
import { catalogLead, catalogNoun, catalogTitle, type CatalogKind } from './catalog-labels';

/**
 * Đầu trang của một trang danh mục: tên, một câu nói trang này dùng để làm gì, và số
 * mục đã xuất bản. Màu của mục đến từ thanh mục con ngay phía trên, không lặp lại ở đây.
 *
 * `count = null` ⇒ không in số. Không có con số đoán: số tới từ máy chủ (tổng đã xuất
 * bản) hoặc từ một danh sách đã tải hết mà không lọc.
 */
export function CatalogHeader(props: {
  readonly kind: CatalogKind;
  readonly count: number | null;
  readonly actions?: ReactNode;
}): ReactElement {
  return (
    <PageHeader
      title={catalogTitle(props.kind)}
      badge={
        props.count === null ? undefined : (
          <Pill tone="acc" className="translate-y-0.5">
            {t('catalog.count.published', { n: props.count, noun: catalogNoun(props.kind) })}
          </Pill>
        )
      }
      lead={catalogLead(props.kind)}
      actions={props.actions}
    />
  );
}
