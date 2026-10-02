import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { redirect } from 'next/navigation';
import { readCanAuthor, readViewerSession } from '../../components/catalog/viewer-role.server';
import { readCatalogCounts } from '../../components/marketing/catalog-stats.server';
import { QuizClient } from './quiz-client';

export const metadata: Metadata = {
  title: t('catalog.meta-title.quiz'),
};

/**
 * Chỉ mục `/quiz`. Auth gác Ở ĐÂY chứ không ở `layout.tsx`, đúng khuôn `/paths`
 * và `/labs`: `/quiz/[id]` tự gọi `getSession` vì nó cần `userId` thật, nên gác
 * thêm ở layout là một lượt đụng DB thứ hai cho mỗi lần mở một bộ câu hỏi.
 */
export default async function QuizIndexPage() {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  const [canAuthor, counts] = await Promise.all([readCanAuthor(), readCatalogCounts()]);
  return <QuizClient canAuthor={canAuthor} total={counts.quizzes} />;
}
