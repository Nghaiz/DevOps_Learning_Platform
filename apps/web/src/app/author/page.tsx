import type { Metadata } from 'next';
import { AuthorListClient } from './author-list-client';

export const metadata: Metadata = {
  title: 'Soạn bài — DevOps Learning Platform',
};

/**
 * Vai trò đã do `layout.tsx` gác (hợp đồng C6), nên page này không lặp lại phép
 * kiểm — và cũng không đọc phiên lần nữa: mọi thứ nó cần đều tới từ
 * `authoring.list`, một procedure vốn đã tự lọc theo người gọi.
 */
export default function AuthorPage() {
  return <AuthorListClient />;
}
