import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { readCanAuthor, readViewerSession } from '../../components/catalog/viewer-role.server';
import { QuizClient } from './quiz-client';

export const metadata: Metadata = {
  title: 'Quiz — DevOps Learning Platform',
};

/**
 * Chỉ mục `/quiz` — màn hình MỚI ở 13.C (D12 liệt kê nó trong phạm vi chốt).
 *
 * Trước phase này chỉ có `/quiz/[id]`: bộ câu hỏi tồn tại, `quiz.list` tồn tại,
 * nhưng không có màn hình nào gọi nó — người học chỉ tới được một quiz qua một
 * lộ trình, hoặc qua việc gõ tay id vào thanh địa chỉ.
 *
 * Auth gác Ở ĐÂY chứ không ở `layout.tsx`, đúng khuôn `/paths` và `/labs`:
 * `quiz/layout.tsx` chỉ cấp `TrpcQueryProvider`, còn `/quiz/[id]` tự gọi
 * `getSession` vì nó cần `userId` thật. Gác thêm ở layout sẽ là một lượt đụng
 * DB thứ hai cho mỗi lần mở một quiz.
 */
export default async function QuizIndexPage() {
  const session = await readViewerSession();

  if (session === null) {
    redirect('/login');
  }

  return <QuizClient canAuthor={await readCanAuthor()} />;
}
