import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { withReturnPath } from '../../login/return-path';
import { QuizClient } from './quiz-client';

/** Server Component, kiểm auth THẬT (đụng DB), cùng khuôn `/labs/[id]`. */
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await readViewerSession()) === null) {
    redirect(withReturnPath('/login', `/quiz/${encodeURIComponent(id)}`));
  }
  return <QuizClient quizId={id} />;
}
