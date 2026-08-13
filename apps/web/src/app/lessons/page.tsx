import type { Metadata } from 'next';
import { LessonsClient } from './lessons-client';

export const metadata: Metadata = {
  title: 'Bài học — DevOps Learning Platform',
};

/**
 * Auth đã do `layout.tsx` gác, nên page này không lặp lại phép kiểm — lặp lại sẽ
 * là hai lượt `getSession` (hai lượt đụng DB) cho mỗi lần mở trang.
 */
export default function LessonsPage() {
  return <LessonsClient />;
}
