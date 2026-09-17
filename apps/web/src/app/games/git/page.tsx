import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { GIT_LEVEL_IDS } from '@devops-platform/games';

// Đường dẫn TƯƠNG ĐỐI, không phải `@/components/...`: repo này không khai
// `paths` ở tsconfig nào và không đặt alias webpack, nên dạng `@/` sẽ đỏ ở cả
// typecheck lẫn `next build`.
import { GitGame } from '../../../components/games/git/git-game';
import { loadGitTheory } from '../../../server/games/git-theory';

export const metadata: Metadata = {
  title: t('catalog.meta-title.games-git'),
  description: t('catalog.games.git-meta-description'),
};

/**
 * `/games/git` — vỏ route của Phòng thí nghiệm Git.
 *
 * Server Component làm đúng HAI việc: gắn `metadata`, và **đọc 32 bài lý thuyết
 * từ đĩa một lần** rồi truyền xuống dưới dạng prop.
 *
 * ⛔ Việc thứ hai là thứ giữ ô nghiệm thu AC-2 (**0 lời gọi backend trong lúc
 * chơi**, đo bằng Playwright network trace). Nạp bài giảng qua tRPC lúc người
 * chơi mở panel sẽ phá đúng ô đó, và nó phá theo cách khó thấy: một request duy
 * nhất, xảy ra vài phút sau khi trang tải, ở một tương tác mà không ai nghĩ là
 * "lúc chơi".
 *
 * Không gác auth — game chạy hoàn toàn trong trình duyệt và tiến độ nằm ở
 * `localStorage`, nên `/games` KHÔNG có trong `PROTECTED_PATHS` của `proxy.ts`.
 *
 * KHÔNG render `main` của riêng nó — vỏ ứng dụng sở hữu landmark đó cho mọi
 * trang (`components/session/landmark-contract.test.ts` quét tĩnh việc này).
 */
export default async function GitGamePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.level;
  const requested = typeof raw === 'string' && raw.length > 0 ? raw : null;
  const initialLevelId =
    requested !== null && (GIT_LEVEL_IDS as readonly string[]).includes(requested)
      ? requested
      : null;

  /*
   * `?problem=` — chế độ làm bài OJ. KHÔNG lọc qua một danh sách nào, khác hẳn
   * `?level=` ngay trên: tập level là một hằng biên dịch nên lọc được tại đây, còn
   * tập bài sống trong DB và đi kèm một tầm nhìn theo người xem (bài `draft` không
   * hiện với người học, kể cả khi biết URL). Mã sai rơi xuống `problems.byCode` và
   * nhận `NOT_FOUND` ở đúng chỗ cổng tầm nhìn đang đứng.
   *
   * ⚠ DÒNG ĐỌC THAM SỐ NGAY DƯỚI LÀ THỨ MỘT Ô GÁC ĐI TÌM BẰNG CÁCH ĐỌC FILE NÀY.
   *
   * `arena-preview.test.ts` mở chính `page.tsx` của mọi route được khai trong
   * `problemPreviewHref` và đòi thấy phép đọc tham số đó — không gì trong `tsc` kiểm
   * được một lời khai như vậy.
   *
   * ⛔ Vì ô đó dò bằng CHUỖI trên toàn văn bản file, đừng viết lại tên tham số ở
   * dạng nguyên văn trong bất kỳ chú thích nào ở đây: một chú thích nhắc tên là đủ để
   * ô gác XANH VĨNH VIỄN kể cả sau khi ai đó gỡ mất phép đọc thật. Đo được
   * 2026-09-15: đối chứng dương đầu tiên KHÔNG đỏ, và thứ giữ nó xanh là đúng một
   * chú thích vừa viết ở đây.
   */
  const rawProblem = params.problem;
  const initialProblemCode =
    typeof rawProblem === 'string' && rawProblem.length > 0 ? rawProblem : null;

  const theory = loadGitTheory(GIT_LEVEL_IDS);

  return (
    <GitGame
      key={`${initialProblemCode ?? initialLevelId ?? 'campaign'}-${params.mode === 'builder' ? 'builder' : 'play'}`}
      theory={theory}
      initialLevelId={initialLevelId}
      initialProblemCode={initialProblemCode}
      initialBuilderOpen={params.mode === 'builder'}
    />
  );
}
