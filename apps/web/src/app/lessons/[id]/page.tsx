import { LessonClient } from './lesson-client';

/**
 * Auth đã do `lessons/layout.tsx` gác (và `proxy.ts` gác lớp ngoài). Page này chỉ
 * gỡ `params` — Next 16 trả `params` dưới dạng Promise.
 *
 * ⚠ Bản 2026-09-08 còn giải PROFILE ở đây bằng `profileForCapabilities`, để nhãn
 * "còn N chỗ" nói về đúng bài đang mở. Nó chạy, nhưng là lượt đọc nội dung THỨ
 * HAI cho cùng một trang (client vẫn gọi `lessons.get`) — gần như miễn phí với
 * bài trên đĩa, nhưng là một truy vấn thật mỗi lần mở trang với bài soạn trên
 * DB. `lessons.get` nay trả thẳng `profile` trong payload, nên chỗ này không
 * cần đọc nội dung nữa.
 */
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonClient scenarioId={id} />;
}
