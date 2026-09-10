import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthorEditClient } from './author-edit-client';

export const metadata: Metadata = {
  title: t('author.meta.edit'),
};

/**
 * Vai trò đã do `app/author/layout.tsx` gác (C6); quyền trên BÀI NÀY do
 * `assertContentOwner` gác ở mọi procedure. Page chỉ chuyển `id` xuống.
 *
 * `params` là Promise trong Next 16 — `await` chứ không đọc thẳng field.
 */
export default async function AuthorEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AuthorEditClient contentId={id} />;
}
