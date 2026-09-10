import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthorListClient } from './author-list-client';

export const metadata: Metadata = {
  title: t('author.meta.list'),
};

/**
 * Vai trò đã do `layout.tsx` gác (hợp đồng C6), nên page này không lặp lại phép
 * kiểm — và cũng không đọc phiên lần nữa: mọi thứ nó cần đều tới từ
 * `authoring.list`, một procedure vốn đã tự lọc theo người gọi.
 */
export default function AuthorPage() {
  return <AuthorListClient />;
}
