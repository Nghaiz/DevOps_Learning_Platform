import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { CICD_LEVELS } from '@devops-platform/games';

// Đường dẫn TƯƠNG ĐỐI, không phải `@/components/...`: repo này không khai
// `paths` ở tsconfig nào và không đặt alias webpack, nên dạng `@/` sẽ đỏ ở cả
// typecheck lẫn `next build`.
import { CicdGame } from '../../../components/games/cicd/cicd-game';
import { loadCicdTheory } from '../../../server/games/cicd-theory';

export const metadata: Metadata = {
  title: t('catalog.meta-title.games-cicd'),
  description: t('catalog.games.cicd-meta-description'),
};

/**
 * `/games/cicd` — vỏ route của Xưởng đường ống CI/CD (19.H).
 *
 * Server Component làm hai việc ngoài `metadata`: đọc hai tham số truy vấn, và
 * nạp bài lý thuyết từ đĩa (19.I) — ở server, như `/games/git`, để lúc chơi không
 * có lời gọi backend nào.
 *
 * Không gác auth — game chạy hoàn toàn trong trình duyệt, nên `/games` KHÔNG có
 * trong `PROTECTED_PATHS` của `proxy.ts`.
 *
 * KHÔNG render `main` của riêng nó — vỏ ứng dụng sở hữu landmark đó cho mọi
 * trang (`components/session/landmark-contract.test.ts` quét tĩnh việc này).
 */
export default async function CicdGamePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  /*
   * `?level=` lọc qua CHÍNH tập màn, không qua một danh sách id chép tay: game
   * Git có `GIT_LEVEL_IDS` để lọc mà không kéo dữ liệu màn vào, còn `packages/games`
   * KHÔNG xuất một hằng tương ứng cho CI/CD. Nên phép lọc đọc thẳng `CICD_LEVELS`.
   * Cái giá bằng 0 ở đây: `CicdGame` ngay dưới cũng import đúng hằng ấy, nên nó
   * đã nằm trong bundle của route này rồi.
   */
  const raw = params.level;
  const requested = typeof raw === 'string' && raw.length > 0 ? raw : null;
  const initialLevelId =
    requested !== null && CICD_LEVELS.some((l) => l.id === requested) ? requested : null;

  /*
   * `?problem=` — chế độ làm bài OJ. KHÔNG lọc qua danh sách nào, khác hẳn
   * `?level=` ngay trên: tập màn là một hằng biên dịch nên lọc được tại đây, còn
   * tập bài sống trong CSDL và đi kèm một tầm nhìn theo người xem.
   *
   * ⚠ DÒNG ĐỌC THAM SỐ NGAY DƯỚI LÀ THỨ MỘT Ô GÁC ĐI TÌM BẰNG CÁCH ĐỌC FILE NÀY.
   *
   * `problem-preview-href.ts` khai `cicd: '/games/cicd'`, và ô cuối
   * `author/problems/arena-preview.test.ts` mở CHÍNH file này ra đọc để kiểm lời
   * khai đó — không gì trong `tsc` kiểm được một lời khai như vậy.
   *
   * ⛔ Vì ô đó dò bằng CHUỖI trên toàn văn bản file, đừng viết lại tên tham số ở
   * dạng nguyên văn trong bất kỳ chú thích nào ở đây: một chú thích nhắc tên là
   * đủ để ô gác XANH VĨNH VIỄN kể cả sau khi ai đó gỡ mất phép đọc thật. Đo được
   * 2026-09-15 trên `games/git/page.tsx`: đối chứng dương đầu tiên KHÔNG đỏ, và
   * thứ giữ nó xanh là đúng một chú thích.
   */
  const rawProblem = params.problem;
  const initialProblemCode =
    typeof rawProblem === 'string' && rawProblem.length > 0 ? rawProblem : null;

  const theory = loadCicdTheory();

  return (
    <CicdGame
      key={initialProblemCode ?? initialLevelId ?? 'campaign'}
      initialLevelId={initialLevelId}
      initialProblemCode={initialProblemCode}
      theory={theory}
    />
  );
}
