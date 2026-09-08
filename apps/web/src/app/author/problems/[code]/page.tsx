import type { Metadata } from 'next';
import { ProblemEditClient } from './problem-edit-client';

export const metadata: Metadata = {
  title: 'Sửa bài tập — DevOps Learning Platform',
};

/**
 * Vai trò đã do `app/author/layout.tsx` gác (C6); quyền trên CHÍNH BÀI NÀY do
 * `problems.byCode` gác ở máy chủ — nó trả `NOT_FOUND` (chứ không `FORBIDDEN`)
 * cho bản nháp của người khác, vì một `FORBIDDEN` xác nhận bài đó tồn tại.
 *
 * `params` là Promise trong Next 16 — `await` chứ không đọc thẳng field.
 */
export default async function AuthorProblemEditPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ProblemEditClient code={code} />;
}
