import { cache } from 'react';
import { asc, count, eq, inArray } from 'drizzle-orm';
import type { ContentSource } from '@devops-platform/scenario';
import { publishedContentSource } from '../../../server/content/source';
import { getDb } from '../../../server/db/client';
import { learningPathItems, learningPaths, quizzes } from '../../../server/db/schema';
import { GAMES } from '../content';
import type { CountKind, LandingCatalog, LandingPath } from './catalog-shape';

/**
 * Số liệu và lộ trình cho landing, đọc thẳng từ nguồn ĐÃ XUẤT BẢN ở mỗi request.
 *
 * Không nướng số cứng: phiên nội dung (0c) đang viết lại content/, nên số bài sẽ đổi. Mỗi loại
 * đọc độc lập; một loại hỏng chỉ làm ô đó thành `null`, không kéo cả trang xuống.
 *
 * Lộ trình đọc trực tiếp bảng `learning_paths` thay vì gọi `paths.list` của tRPC: procedure đó
 * là `protectedProcedure`, còn landing phục vụ cả khách chưa đăng nhập. Chỉ đọc cột công khai
 * (id, tiêu đề, mô tả, số chặng) của bản `published`, có `LIMIT`, không đụng tiến độ ai.
 */

const PATH_LIMIT = 12;

async function counted(kind: CountKind, read: () => Promise<number>): Promise<number | null> {
  try {
    return await read();
  } catch (error: unknown) {
    console.error(`[landing] count read failed for ${kind}`, error);
    return null;
  }
}

function contentSourceOrNull(): ContentSource | null {
  try {
    return publishedContentSource();
  } catch (error: unknown) {
    console.error('[landing] content source unavailable', error);
    return null;
  }
}

async function publishedQuizCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(quizzes)
    .where(eq(quizzes.state, 'published'));
  return row?.n ?? 0;
}

async function publishedPathCount(): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(learningPaths)
    .where(eq(learningPaths.state, 'published'));
  return row?.n ?? 0;
}

async function publishedPaths(): Promise<readonly LandingPath[]> {
  const db = getDb();
  const rows = await db
    .select({ id: learningPaths.id, title: learningPaths.title, description: learningPaths.description })
    .from(learningPaths)
    .where(eq(learningPaths.state, 'published'))
    .orderBy(asc(learningPaths.id))
    .limit(PATH_LIMIT);
  if (rows.length === 0) return [];
  const items = await db
    .select({ pathId: learningPathItems.pathId })
    .from(learningPathItems)
    .where(
      inArray(
        learningPathItems.pathId,
        rows.map((row) => row.id),
      ),
    );
  const steps = new Map<string, number>();
  for (const item of items) steps.set(item.pathId, (steps.get(item.pathId) ?? 0) + 1);
  return rows.map((row) => ({ ...row, steps: steps.get(row.id) ?? 0 }));
}

async function pathsOrNull(): Promise<readonly LandingPath[] | null> {
  try {
    return await publishedPaths();
  } catch (error: unknown) {
    console.error('[landing] published paths read failed', error);
    return null;
  }
}

export const readLandingCatalog = cache(async (): Promise<LandingCatalog> => {
  const source = contentSourceOrNull();
  const fromSource = (read: (s: ContentSource) => Promise<readonly unknown[]>) => async () => {
    if (source === null) throw new Error('content source unavailable');
    return (await read(source)).length;
  };

  const [lessons, labs, playgrounds, quizCount, pathCount, paths] = await Promise.all([
    counted('lessons', fromSource((s) => s.list())),
    counted('labs', fromSource((s) => s.listLabs())),
    counted('playgrounds', fromSource((s) => s.listPlaygrounds())),
    counted('quizzes', publishedQuizCount),
    counted('paths', publishedPathCount),
    pathsOrNull(),
  ]);

  return {
    counts: {
      lessons,
      labs,
      playgrounds,
      quizzes: quizCount,
      paths: pathCount,
      games: GAMES.filter((game) => game.href !== null).length,
    },
    paths,
  };
});
