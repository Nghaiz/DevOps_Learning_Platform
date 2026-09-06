import type { Metadata } from 'next';
import { AuthorNewClient } from './author-new-client';

export const metadata: Metadata = {
  title: 'Tạo bài mới — DevOps Learning Platform',
};

/** Vai trò đã do `app/author/layout.tsx` gác (C6). */
export default function AuthorNewPage() {
  return <AuthorNewClient />;
}
