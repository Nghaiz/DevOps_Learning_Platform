import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CICD_LEVELS } from '@devops-platform/games';

// Đường dẫn TƯƠNG ĐỐI, không phải `@/components/...`: repo này không khai
// `paths` ở tsconfig nào và không đặt alias webpack, nên dạng `@/` sẽ đỏ ở cả
// typecheck lẫn `next build`.
import { CicdLevelRoute } from '../../../../components/games/cicd/cicd-level-route';
import { loadCicdTheory } from '../../../../server/games/cicd-theory';

/**
 * `/games/cicd/<levelId>` — MỘT màn của Xưởng đường ống CI/CD (19.D).
 *
 * Tách khỏi `/games/cicd` (trang danh mục) vì vỏ ứng dụng quyết định immersive
 * bằng `pathname`, và immersive là điều kiện của AC-D7 (sân chơi > 95% chiều
 * rộng). Lý lẽ đầy đủ ở đầu `components/games/cicd/cicd-level-route.tsx` và
 * trong `components/shell/immersive-routes.ts`.
 *
 * Không gác auth — game chạy hoàn toàn trong trình duyệt, nên `/games` KHÔNG có
 * trong `PROTECTED_PATHS` của `proxy.ts`.
 *
 * KHÔNG render `main` của riêng nó — vỏ ứng dụng sở hữu landmark đó cho mọi
 * trang (`components/session/landmark-contract.test.ts` quét tĩnh việc này).
 */

interface RouteParams {
  readonly params: Promise<{ readonly levelId: string }>;
}

function findLevel(levelId: string) {
  return CICD_LEVELS.find((l) => l.id === levelId);
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { levelId } = await params;
  const level = findLevel(levelId);
  if (level === undefined) return {};
  return { title: `${level.title} — Xưởng đường ống CI/CD` };
}

export default async function CicdLevelPage({ params }: RouteParams) {
  const { levelId } = await params;
  const level = findLevel(levelId);

  /*
   * `notFound()` chứ không chuyển hướng lặng về danh sách màn.
   *
   * Một id sai gần như luôn là đường dẫn gõ nhầm hoặc một liên kết cũ, và đổ
   * người dùng vào danh sách sẽ đọc ra thành "màn tôi lưu đã bị xoá" — họ đi
   * tìm một thứ không mất. 404 nói đúng chuyện đã xảy ra. Cùng lý lẽ nhánh
   * `?problem=` của `../page.tsx` đã ghi cho chế độ làm bài chưa mở.
   */
  if (level === undefined) notFound();

  const theory = loadCicdTheory();

  return (
    <CicdLevelRoute
      level={level}
      theory={theory.find((doc) => doc.frontmatter.id === level.theoryId) ?? null}
    />
  );
}
