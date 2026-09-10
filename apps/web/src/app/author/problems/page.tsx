import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { ProblemListClient } from './problem-list-client';

export const metadata: Metadata = {
  title: t('author.problem.meta.list'),
};

/**
 * Vai trò đã do `app/author/layout.tsx` gác (hợp đồng C6): layout đọc phiên từ
 * DB và đá người học về `/me`. Page này không lặp lại phép kiểm, và cũng không
 * đọc phiên lần nữa — `problems.mine` vốn đã tự lọc theo người gọi.
 */
export default function AuthorProblemsPage() {
  return <ProblemListClient />;
}
