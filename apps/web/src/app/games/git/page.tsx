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

  const theory = loadGitTheory(GIT_LEVEL_IDS);

  return <GitGame theory={theory} initialLevelId={initialLevelId} />;
}
