import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { readCanAuthor } from '../../components/catalog/viewer-role.server';
import { readCatalogCounts } from '../../components/catalog/catalog-counts.server';
import { LessonsClient } from './lessons-client';

export const metadata: Metadata = {
  title: t('catalog.meta-title.lessons'),
};

/**
 * Auth đã do `layout.tsx` gác, nên page này không lặp lại phép kiểm.
 *
 * Nó vẫn ĐỌC phiên, qua `readCanAuthor` (cùng `readViewerSession` mà layout
 * dùng, `cache()` gộp hai lời gọi về một lượt đụng DB). Giá trị đó chỉ chọn CÂU
 * CHỮ cho trạng thái rỗng; cổng quyền thật là `authorProcedure`.
 *
 * `readCatalogCounts` cấp tổng số bài đã xuất bản cho nhãn đầu trang. Nó trả
 * `null` khi không đọc được kho, và lúc đó nhãn chỉ in tên section.
 */
export default async function LessonsPage() {
  const [canAuthor, counts] = await Promise.all([readCanAuthor(), readCatalogCounts()]);
  return <LessonsClient canAuthor={canAuthor} total={counts.lessons} />;
}
