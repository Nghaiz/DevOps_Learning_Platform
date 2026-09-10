import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { AuthorNewClient } from './author-new-client';

export const metadata: Metadata = {
  title: t('author.meta.new'),
};

/** Vai trò đã do `app/author/layout.tsx` gác (C6). */
export default function AuthorNewPage() {
  return <AuthorNewClient />;
}
