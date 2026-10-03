import type { ReactElement, ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { PosterHeader } from '../kit';
import { sectionById, type SectionId } from '../shell/nav';
import { catalogLead, catalogNoun, catalogTitle, type CatalogKind } from './catalog-labels';

const SECTION_OF: Readonly<Record<CatalogKind, SectionId>> = {
  lessons: 'learn',
  paths: 'learn',
  quiz: 'learn',
  labs: 'practice',
  playgrounds: 'practice',
};

/**
 * Đầu trang của một trang danh mục: dải màu section, nhãn mono có số mục THẬT,
 * tiêu đề poster, một câu dẫn, thanh chuyển giữa các trang anh em.
 *
 * `count = null` ⇒ nhãn chỉ in tên section. Không có con số đoán: số tới từ máy
 * chủ (tổng đã xuất bản) hoặc từ một danh sách đã tải hết mà không lọc.
 */
export function CatalogPoster(props: {
  readonly kind: CatalogKind;
  readonly count: number | null;
  readonly aside?: ReactNode;
}): ReactElement {
  const section = SECTION_OF[props.kind];
  const label = sectionById(section).label;
  const kicker =
    props.count === null
      ? label
      : t('catalog.kicker', { section: label, n: props.count, noun: catalogNoun(props.kind) });
  return (
    <PosterHeader
      section={section}
      kicker={kicker}
      title={catalogTitle(props.kind)}
      lead={catalogLead(props.kind)}
      aside={props.aside}
    />
  );
}
