import { GAME_IDS, problemTopicLabels, type GameId } from '@devops-platform/games';
import { t } from '@devops-platform/copy';

/**
 * Bộ chọn GAME của kho đề.
 *
 * ## Nó làm hai việc
 *
 * 1. Thu hẹp danh sách về bài của một game: `buildProblemListInput` gửi lựa chọn
 *    thành `filter.gameId`, và `problemFilterSchema` của `problems.list` nhận khoá đó.
 * 2. Đổi từ vựng chủ đề hiện dưới nó: chủ đề là của TỪNG game (`branching` chỉ Git
 *    có), nên khối chủ đề đi theo game đang chọn.
 *
 * ## "Tất cả game" là mặc định, và khối chủ đề ẨN ở đó
 *
 * Kho chở bài của nhiều game, nên trang mở ra phải thấy được mọi đề. Ở "Tất cả",
 * khối chủ đề không gộp phẳng các bộ từ vựng: id chủ đề để TRẦN (xem quy ước ở
 * `git/problem-topics.ts`), nên ngày hai game trùng một id thì một ô đã đánh dấu
 * trong rổ chung không còn nói được nó thuộc game nào. Ẩn khối đi làm chỗ nhập nhằng
 * đó không dựng được.
 *
 * ## Liên kết cũ đọc bằng `k8s`
 *
 * `/problems?topic=workload` có từ trước khi có "Tất cả" và không mang `game`. Đọc
 * nó bằng "Tất cả" là bỏ chủ đề trong im lặng; đọc bằng `k8s` (`LEGACY_TOPIC_GAME`)
 * giữ nguyên bộ lọc người ta đã gửi cho nhau.
 */

/** Tên hiển thị theo game. `null` = game chưa có từ vựng chủ đề nào để chọn. */
const GAME_NAMES: Readonly<Record<GameId, string | null>> = {
  k8s: t('problem.oj.game.k8s'),
  git: t('problem.oj.game.git'),
  pipeline: null,
  netpol: null,
  dockerfile: null,
  /*
   * 19.H. Tên đi TRƯỚC từ vựng chủ đề, và thứ tự đó là chủ ý.
   *
   * `PROBLEM_FILTER_GAMES` đòi CẢ tên lẫn từ vựng, nên khai tên khi
   * `problemTopicLabels('cicd')` còn rỗng KHÔNG làm game hiện ra ở bộ chọn — nó
   * chỉ làm cho ngày từ vựng tới, không ai phải nhớ quay lại đây. Chiều ngược
   * lại mới là chiều hỏng im lặng: có từ vựng mà thiếu tên thì game biến mất
   * khỏi bộ chọn và đọc ra y hệt "game này chưa có chủ đề" (ô đầu của
   * `problem-game.test.ts` gác đúng vế đó).
   */
  cicd: t('problem.oj.game.cicd'),
};

/**
 * Id chủ đề của một game, theo thứ tự khai.
 *
 * Đọc qua `problemTopicLabels` chứ không qua `PROBLEM_PLUGINS`: bảng plugin kéo
 * cả hai engine vào bundle của mọi route `problems` (PR #124 đo được một chunk
 * 369.938 B ở 7/38 route). `engine-leak.test.ts` là cổng gác chuyện đó.
 *
 * ⚠ Dựa vào thứ tự khoá của `Object.keys`. Với khoá chuỗi không phải số, thứ tự
 * đó là thứ tự CHÈN theo đặc tả, nên nó tất định — cả hai bảng nguồn đều dựng
 * từ một mảng có thứ tự. Đường sạch hơn là một hàm `problemTopicIds` mở ra từ
 * barrel, nhưng `packages/games/src/index.ts` do lead giữ.
 */
export function topicIdsFor(gameId: GameId): readonly string[] {
  return Object.keys(problemTopicLabels(gameId));
}

export function topicLabelsFor(gameId: GameId): Readonly<Record<string, string>> {
  return problemTopicLabels(gameId);
}

/*
 * `topicsFilterable` và `filterableTopicsFor` TỪNG ở đây và đã bị GỠ 2026-09-15,
 * cùng lượt nới `ProblemFilter.topics` sang `ProblemTopicId`.
 *
 * Cả hai chỉ tồn tại vì một khoảng trống: hợp đồng lọc khai `readonly
 * ProblemTopic[]` (union đóng chín chủ đề K8s), nên `'branching'` của game Git
 * không gán vào đó được và khối lọc phải tự KHOÁ cho mọi game không phải K8s.
 * Khoảng trống đóng thì chúng hết việc — `topicIdsFor` một mình là đủ.
 *
 * Ghi lại thay vì xoá sạch, vì một hàm biến mất không để lại dấu sẽ được ai đó
 * viết lại khi họ gặp cùng câu hỏi "chủ đề game này lọc được không". Câu trả lời
 * từ nay là: được, mọi game.
 */

/** Game có mặt trong bộ chọn: có từ vựng chủ đề VÀ có tên để hiện. */
export const PROBLEM_FILTER_GAMES: readonly GameId[] = GAME_IDS.filter(
  (gameId) => GAME_NAMES[gameId] !== null && topicIdsFor(gameId).length > 0,
);

/**
 * Bộ chọn game có thêm "Tất cả" (bản dựng lại 2026-10): kho đề nhiều game thì mặc định
 * phải là nhìn được mọi đề. Ở "Tất cả", khối chủ đề ẨN đi chứ không gộp phẳng các bộ
 * từ vựng: chủ đề là của từng game (`branching` chỉ Git có), và một rổ chung sẽ không
 * nói được ô đã chọn thuộc game nào.
 */
export type ProblemGameChoice = GameId | 'all';

export const ALL_GAMES = 'all' as const;

/**
 * Game cho liên kết CŨ: `/problems?topic=workload` có từ trước khi có "Tất cả", không
 * mang tham số `game`, và chủ đề của nó là của K8s. Đọc nó bằng `k8s` giữ nguyên bộ
 * lọc; đọc bằng "Tất cả" thì chủ đề bị bỏ trong im lặng.
 */
export const LEGACY_TOPIC_GAME: GameId = 'k8s';

export function gameName(gameId: GameId): string {
  return GAME_NAMES[gameId] ?? gameId;
}

/**
 * Giá trị `game` đọc từ URL. Giá trị lạ rơi về mặc định — LỌC ĐẦU VÀO, cùng
 * luật với `keepKnown` ở `problem-query.ts`: URL là thứ người ta gõ tay, nên
 * một giá trị lạ là dữ liệu hỏng chứ không phải lỗi chương trình, và hậu quả
 * nhìn thấy được ngay trên màn hình (bộ chọn hiện game mặc định).
 */
export function parseGame(raw: string | null, hasTopics = false): ProblemGameChoice {
  const known = PROBLEM_FILTER_GAMES.find((gameId) => gameId === raw);
  if (known !== undefined) return known;
  return hasTopics ? LEGACY_TOPIC_GAME : ALL_GAMES;
}
