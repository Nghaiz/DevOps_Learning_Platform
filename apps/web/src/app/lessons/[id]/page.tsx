import { LessonClient } from './lesson-client';

/**
 * Auth đã do `lessons/layout.tsx` gác (và `proxy.ts` gác lớp ngoài). Page này chỉ
 * gỡ `params` — Next 16 trả `params` dưới dạng Promise.
 */
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonClient scenarioId={id} />;
}
