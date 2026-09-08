import type { Metadata } from 'next';
import { ProblemNewClient } from './problem-new-client';

export const metadata: Metadata = {
  title: 'Soạn bài tập mới — DevOps Learning Platform',
};

/** Vai trò đã do `app/author/layout.tsx` gác (C6). */
export default function AuthorProblemNewPage() {
  return <ProblemNewClient />;
}
