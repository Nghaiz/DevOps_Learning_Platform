import { cache } from 'react';
import { count, eq } from 'drizzle-orm';
import { getDb } from '../../server/db/client';
import { learningPaths, problems } from '../../server/db/schema';
import { readCatalogCounts } from '../catalog/catalog-counts.server';

export interface HubCounts {
  readonly lessons: number | null;
  readonly labs: number | null;
  readonly playgrounds: number | null;
  readonly quizzes: number | null;
  readonly paths: number | null;
  readonly problems: number | null;
}

async function safeCount(label: string, read: () => Promise<number>): Promise<number | null> {
  try {
    return await read();
  } catch (error: unknown) {
    // Một con số đọc lỗi hiện thành "chưa đếm được", không bao giờ thành 0.
    console.error(`[hub] không đọc được số ${label}`, error);
    return null;
  }
}

/** Số nội dung đã xuất bản cho các trang tổng quan. `null` = không đọc được, KHÔNG phải 0. */
export const readHubCounts = cache(async (): Promise<HubCounts> => {
  const [catalog, paths, problemCount] = await Promise.all([
    readCatalogCounts(),
    safeCount('lộ trình', async () => {
      const [row] = await getDb().select({ n: count() }).from(learningPaths).where(eq(learningPaths.state, 'published'));
      return row?.n ?? 0;
    }),
    safeCount('bài tập', async () => {
      const [row] = await getDb().select({ n: count() }).from(problems).where(eq(problems.state, 'published'));
      return row?.n ?? 0;
    }),
  ]);
  return { ...catalog, paths, problems: problemCount };
});
