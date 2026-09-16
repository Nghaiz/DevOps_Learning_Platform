import type { ProblemTopicOption } from './core/problem.ts';
import type { GameId } from './core/types.ts';
import { PROBLEM_TOPIC_LABELS } from './k8s/problem.ts';
import { GIT_PROBLEM_TOPICS } from './git/problem-topics.ts';

/**
 * Tám chủ đề của game CI/CD. Tập ĐÓNG — `CICD_PROBLEM_PLUGIN.topics` trỏ thẳng
 * vào đây, nên đây cũng là thứ biên ghi đối chiếu khi lưu một bài.
 *
 * ⛔ SỐNG Ở FILE NÀY, không ở `cicd/problem-plugin.ts`, và chiều nhập là MỘT
 * CHIỀU: plugin nhập từ đây, đây không bao giờ nhập ngược. Lý do nằm nguyên
 * trong khối chú thích ngay dưới — `cicd/problem-plugin.ts` nhập `evaluate()`,
 * tức cả engine CI/CD, và file này thì bị mọi route `/problems` kéo theo. Đặt
 * ngược lại là lặp lại đúng PR #124: một chunk engine nằm ở 7/38 route và đẩy
 * một trang vượt trần `bundle:check`. Ô gác tĩnh
 * `apps/web/src/app/(session)/problems/engine-leak.test.ts` nay liệt kê cả
 * `cicd/problem-plugin.ts` lẫn `cicd/engine.ts`, nên chiều ngược lại là đỏ chứ
 * không phải một lời dặn.
 *
 * ── VÌ SAO ĐÚNG TÁM, VÀ VÌ SAO LÀ TÁM CÁI NÀY ──
 *
 * Suy từ 14 level chương CI đang có, mỗi level rơi vào đúng một nhóm: `graph`
 * (C01, C02, C05) · `scheduling` (C03) · `critical-path` (C04) · `cache`
 * (C06–C08) · `flaky` (C09, C11) · `retry` (C10) · `fan-out` (C12, C13) ·
 * `tradeoff` (C14). Một tập chủ đề bịa ra từ đầu sẽ có ô không bài nào rơi vào
 * (bộ lọc hiện một mục luôn rỗng) và thiếu ô cho thứ đã có thật.
 *
 * ⚠ Id để TRẦN, không mang tiền tố `cicd-`. Tập đã đóng THEO GAME rồi — biên
 * ghi đối chiếu `topics` của bài với plugin theo `gameId` của chính bài — nên
 * tiền tố chỉ làm id dài ra mà không thêm một phép phân biệt nào. Cùng quy ước
 * với `GIT_PROBLEM_TOPICS`.
 *
 * ⚠ Nhãn là chuỗi tiếng Việt THẲNG, không qua `t()`: khoá chữ cho game này chưa
 * tồn tại trong `packages/copy`, và `t()` trả CHUỖI RỖNG cho khoá chưa có — tức
 * tám ô lọc không nhãn, trông y hệt một lỗi render. `problem-plugins.test.ts`
 * khẳng định nhãn không rỗng, nên chỗ này không im lặng hỏng được.
 */
export const CICD_PROBLEM_TOPICS: readonly ProblemTopicOption[] = [
  { id: 'graph', label: 'Đồ thị phụ thuộc' },
  { id: 'scheduling', label: 'Xếp lịch trên máy chạy' },
  { id: 'critical-path', label: 'Đường găng' },
  { id: 'cache', label: 'Khoá cache' },
  { id: 'flaky', label: 'Đỏ giả' },
  { id: 'retry', label: 'Thử lại' },
  { id: 'fan-out', label: 'Quạt ra và gom lại' },
  { id: 'tradeoff', label: 'Đánh đổi ba trục' },
];

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
 * Ba game còn lại (`pipeline`, `netpol`, `dockerfile`) chưa có plugin bài —
 * `cicd` đã rời khỏi danh sách đó ở §19.H. Bảng rỗng ⇒ `topicLabel` rơi về
 * chính id, tức màn hình hiện `branching`
 * thay vì một ô trống. Xấu hơn nhãn tiếng Việt, nhưng nó NÓI RA thứ đang có —
 * và một bài của những game đó chưa lưu xuống được (`validate.ts` từ chối game
 * chưa có plugin), nên hôm nay nhánh này không có đường tới.
 */
const TOPIC_LABELS_BY_GAME: Readonly<Record<GameId, Readonly<Record<string, string>>>> = {
  k8s: PROBLEM_TOPIC_LABELS,
  git: Object.fromEntries(GIT_PROBLEM_TOPICS.map((topic) => [topic.id, topic.label])),
  cicd: Object.fromEntries(CICD_PROBLEM_TOPICS.map((topic) => [topic.id, topic.label])),
  pipeline: {},
  netpol: {},
  dockerfile: {},
};

/**
 * Bảng nhãn chủ đề của một game. Không bao giờ `undefined` — game lạ trả bảng
 * rỗng, và người gọi (`topicLabel`) rơi về chính id.
 */
export function problemTopicLabels(gameId: GameId): Readonly<Record<string, string>> {
  return TOPIC_LABELS_BY_GAME[gameId];
}
