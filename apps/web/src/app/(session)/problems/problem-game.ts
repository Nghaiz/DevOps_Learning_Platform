import { GAME_IDS, PROBLEM_TOPICS, problemTopicLabels, type GameId, type ProblemTopic } from '@devops-platform/games';
import { t } from '@devops-platform/copy';

/**
 * Bộ chọn GAME của khối lọc chủ đề — §18 khối 6.
 *
 * ## Điều khiển này LÀM gì, và cố ý KHÔNG làm gì
 *
 * Nó đổi **từ vựng chủ đề** hiện dưới nó. Nó **không** lọc danh sách bài theo
 * game, và đó là một ranh giới có lý do đo được chứ không phải một thiếu sót:
 * `ProblemFilter` (hợp đồng, `packages/games/src/k8s/problem.ts:244`) không có
 * trường `gameId`, và schema đầu vào của `problems.list` khai `.strict()` —
 * đo 2026-09-15, `problemFilterSchema.safeParse({ gameId: 'git' })` trả
 * `unrecognized_keys`. Một bộ chọn hứa lọc bài mà chỉ đổi được từ vựng là một
 * điều khiển NÓI DỐI; câu `catalog.problems.game-hint` vì thế nói đúng một vế.
 *
 * Thực tế nó vẫn thu hẹp danh sách, chỉ là gián tiếp: chủ đề `branching` chỉ có
 * trên bài Git, nên chọn nó ra đúng tập bài Git. Khác nhau ở chỗ phép thu hẹp
 * đến từ chủ đề người dùng chọn, không đến từ một mệnh đề game mà máy chủ không
 * có.
 *
 * ## ⛔ VÌ SAO KHÔNG có trạng thái "mọi game"
 *
 * Chủ dự án đã bác bản gộp phẳng mười bảy chủ đề. Nghĩa còn lại của "mọi game"
 * là *tắt luôn phép lọc chủ đề* — một mục trong danh sách mà việc duy nhất của
 * nó là vô hiệu hoá chính khối bên dưới. Nó cũng mở ra một chỗ nhập nhằng thật:
 * id chủ đề để TRẦN (`branching`, không phải `git-branching`, xem quy ước ở
 * `git/problem-topics.ts`), nên ngày đầu tiên hai game trùng một id thì một ô
 * đã đánh dấu trong rổ "mọi game" không còn nói được nó thuộc game nào. Bộ chọn
 * một-game-một-lúc làm chỗ nhập nhằng đó **không dựng được**, chứ không phải
 * chỉ tránh nó.
 *
 * ## Game mặc định là `k8s`, và lý do KHÔNG phải "vì nó có trước"
 *
 * Mọi bài trong kho hôm nay đều là K8s (`PROBLEMS_SEED` mười bài `K8S-*`; chưa
 * có seed bài Git nào). Nhưng lý do nặng hơn là LIÊN KẾT ĐÃ GỬI ĐI: một
 * `/problems?topic=workload` người ta đã dán cho nhau không mang tham số
 * `game`, nên game mặc định quyết định chủ đề đó còn sống hay bị lọc bỏ lúc
 * đọc lại. Mặc định `k8s` giữ nguyên MỌI liên kết cũ; mặc định `git` hay "mọi
 * game" sẽ làm chúng mở ra với ô đánh dấu trống — mất bộ lọc, không báo gì.
 */

/** Tên hiển thị theo game. `null` = game chưa có từ vựng chủ đề nào để chọn. */
const GAME_NAMES: Readonly<Record<GameId, string | null>> = {
  k8s: t('catalog.problems.game.k8s'),
  git: t('catalog.problems.game.git'),
  pipeline: null,
  netpol: null,
  dockerfile: null,
  cicd: null,
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

/**
 * Chủ đề của game này có ĐI QUA được hợp đồng lọc không.
 *
 * ⛔ Đây là chỗ khối 6 đang bị chặn, và chặn ở tầng KIỂU chứ không phải tầng
 * chạy: `ProblemFilter.topics` khai `readonly ProblemTopic[]`, mà `ProblemTopic`
 * là union đóng chín chủ đề K8s. `'branching'` không gán vào đó được, nên không
 * có cách nào gửi nó đi mà không nói dối `tsc`. Máy chủ nói cùng một câu — đo
 * 2026-09-15, `problemFilterSchema.safeParse({ topics: ['branching'] })` trả
 * `invalid_value` kèm nguyên chín lựa chọn hợp lệ.
 *
 * Cả hai chỗ đều NGOÀI vùng sở hữu của lane này (`k8s/problem.ts` là hợp đồng;
 * `server/problems/list-input.ts` là lane B). Nên thay vì ép một phép ép kiểu,
 * khối lọc tự KHOÁ lại và nói ra trên màn hình — xem `catalog.problems.game-locked`.
 *
 * Ô ghim ở `problem-game.test.ts` làm `tsc` ĐỎ đúng lúc hợp đồng được nới, để
 * không ai phải nhớ quay lại đây.
 */
export function topicsFilterable(gameId: GameId): boolean {
  const ids = topicIdsFor(gameId);
  return ids.length > 0 && ids.every((id) => (PROBLEM_TOPICS as readonly string[]).includes(id));
}

/**
 * Chủ đề của game này ở dạng hợp đồng CHỞ ĐƯỢC.
 *
 * Lọc từ `PROBLEM_TOPICS` chứ không ép kiểu danh sách của game: `filter` trên
 * một mảng đã đúng kiểu cho ra `ProblemTopic[]` mà không cần một dòng `as` nào,
 * và một phép ép kiểu ở đây chính là thứ sẽ đẩy `'branching'` xuống máy chủ để
 * nhận về 400.
 *
 * ⚠ Hệ quả: thứ tự đến từ `PROBLEM_TOPICS`, không từ từ vựng của game. Hôm nay
 * chỉ `k8s` đi qua nhánh này nên hai thứ tự trùng nhau. Khi hợp đồng nới, hàm
 * này biến mất cùng `topicsFilterable`.
 */
export function filterableTopicsFor(gameId: GameId): readonly ProblemTopic[] {
  const ids = new Set(topicIdsFor(gameId));
  return PROBLEM_TOPICS.filter((id) => ids.has(id));
}

/** Game có mặt trong bộ chọn: có từ vựng chủ đề VÀ có tên để hiện. */
export const PROBLEM_FILTER_GAMES: readonly GameId[] = GAME_IDS.filter(
  (gameId) => GAME_NAMES[gameId] !== null && topicIdsFor(gameId).length > 0,
);

/** Xem khối đầu file về việc vì sao mặc định là `k8s` chứ không phải "mọi game". */
export const DEFAULT_PROBLEM_GAME: GameId = 'k8s';

export function gameName(gameId: GameId): string {
  return GAME_NAMES[gameId] ?? gameId;
}

/**
 * Giá trị `game` đọc từ URL. Giá trị lạ rơi về mặc định — LỌC ĐẦU VÀO, cùng
 * luật với `keepKnown` ở `problem-query.ts`: URL là thứ người ta gõ tay, nên
 * một giá trị lạ là dữ liệu hỏng chứ không phải lỗi chương trình, và hậu quả
 * nhìn thấy được ngay trên màn hình (bộ chọn hiện game mặc định).
 */
export function parseGame(raw: string | null): GameId {
  return PROBLEM_FILTER_GAMES.find((gameId) => gameId === raw) ?? DEFAULT_PROBLEM_GAME;
}
