import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { readCanAuthor } from '../../components/catalog/viewer-role.server';
import { LessonsClient } from './lessons-client';

export const metadata: Metadata = {
  title: t('catalog.meta-title.lessons'),
};

/**
 * Auth đã do `layout.tsx` gác, nên page này không lặp lại phép kiểm.
 *
 * Nó vẫn ĐỌC phiên — nhưng qua `readCanAuthor`, tức qua cùng
 * `readViewerSession` mà layout dùng, nên `cache()` của React gộp cả hai về một
 * lượt đụng DB. Giá trị này chỉ chọn CÂU CHỮ cho trạng thái rỗng ("mở trang
 * Soạn bài" cho author, một gợi ý học tiếp cho người học); nó không gác quyền
 * gì cả — cổng thật là `authorProcedure` và layout của `/author`.
 */
export default async function LessonsPage() {
  return <LessonsClient canAuthor={await readCanAuthor()} />;
}
