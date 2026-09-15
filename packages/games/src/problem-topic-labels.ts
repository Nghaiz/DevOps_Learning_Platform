import type { GameId } from './core/types.ts';
import { PROBLEM_TOPIC_LABELS } from './k8s/problem.ts';
import { GIT_PROBLEM_TOPICS } from './git/problem-topics.ts';

/**
 * Nhãn chủ đề theo GAME — bảng tra cho trang danh mục bài, §18.D.
 *
 * ## Vấn đề nó đóng
 *
 * `ProblemBase.topics` là `string`, và tập đóng nằm ở từng plugin
 * (`GameProblemPlugin.topics`). Từ migration 0015 kho lưu chở được bài của mọi
 * game, nên `/problems` có thể nhận một bài Git mang chủ đề `branching` — mà
 * `PROBLEM_TOPIC_LABELS` (chỉ K8s) tra ra `undefined`. React vẽ `undefined`
 * thành CHỖ TRỐNG: một `Badge` rỗng, không lỗi, không log, không test nào đỏ.
 * Hỏng im lặng là hình dạng tệ nhất, nên món nợ này có tên từ §18.A và đóng ở
 * đây.
 *
 * ## ⛔ Vì sao KHÔNG tra qua `PROBLEM_PLUGINS`, dù đó là phép tra đúng hơn
 *
 * `problemPluginMeta(gameId).topics` cho nhãn chính xác cho mọi game và trang
 * SOẠN BÀI đã đi đường đó. Nhưng `PROBLEM_PLUGINS` nhập `K8S_PROBLEM_PLUGIN` +
 * `GIT_PROBLEM_PLUGIN`, và hai plugin đó nhập `createSession` /
 * `createGitSession` — tức **cả hai engine**. PR #124 (2026-09-14) đo được cái
 * giá: một chunk 369.938 B chứa engine git nằm ở 7/38 route, 5 trong 7 là route
 * `problems`, và nó đẩy `/games/k8s/page` vượt trần `bundle:check`.
 *
 * Nên file này nhập **dữ liệu lá**, không nhập plugin: `k8s/problem.ts` và
 * `git/problem-topics.ts` đều chỉ có mảng + `t()`, không chạm engine nào. Ô gác
 * tĩnh `problem-topic-labels.test.ts` đi theo đồ thị nhập và khẳng định điều đó
 * — nó là cổng DUY NHẤT thấy được, vì `tsc`/`eslint`/`vitest` đều mù với bundle
 * còn `bundle:check` chỉ chạy SAU `next build`.
 *
 * ## Game chưa có tập chủ đề trả về bảng RỖNG, không ném
 *
 * Bốn game còn lại (`pipeline`, `netpol`, `dockerfile`, `cicd`) chưa có plugin
 * bài. Bảng rỗng ⇒ `topicLabel` rơi về chính id, tức màn hình hiện `branching`
 * thay vì một ô trống. Xấu hơn nhãn tiếng Việt, nhưng nó NÓI RA thứ đang có —
 * và một bài của những game đó chưa lưu xuống được (`validate.ts` từ chối game
 * chưa có plugin), nên hôm nay nhánh này không có đường tới.
 */
const TOPIC_LABELS_BY_GAME: Readonly<Record<GameId, Readonly<Record<string, string>>>> = {
  k8s: PROBLEM_TOPIC_LABELS,
  git: Object.fromEntries(GIT_PROBLEM_TOPICS.map((topic) => [topic.id, topic.label])),
  pipeline: {},
  netpol: {},
  dockerfile: {},
  cicd: {},
};

/**
 * Bảng nhãn chủ đề của một game. Không bao giờ `undefined` — game lạ trả bảng
 * rỗng, và người gọi (`topicLabel`) rơi về chính id.
 */
export function problemTopicLabels(gameId: GameId): Readonly<Record<string, string>> {
  return TOPIC_LABELS_BY_GAME[gameId];
}
