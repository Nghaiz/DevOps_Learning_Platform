import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { ProblemNewClient } from './problem-new-client';

export const metadata: Metadata = {
  title: t('author.problem.meta.new'),
};

/** Vai trò đã do `app/author/layout.tsx` gác (C6). */
export default function AuthorProblemNewPage() {
  return <ProblemNewClient />;
}
