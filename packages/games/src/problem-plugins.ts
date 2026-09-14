/**
 * Bảng đăng ký plugin OJ, và hai hàm tra bảng — §18.A.4 / §18.A.5.
 *
 * Đây là chỗ DUY NHẤT trong cả package biết rằng có nhiều hơn một game có bài
 * tập. Mọi tầng khác (giao diện, máy chủ chấm lại, trang soạn bài) đi qua ba
 * export dưới đây và không bao giờ `import` thẳng một plugin cụ thể — đó chính
 * là điều `core/problem-plugin.ts` đòi khi nó từ chối mô hình `switch (gameId)`
 * rải khắp nơi:
 *
 * > Một `switch` sẽ nằm rải ở tầng UI, tầng chấm, tầng soạn bài, tầng seed [...]
 * > Cái nào sót thì không đỏ, chỉ im lặng rơi vào nhánh `default` của game khác.
 *
 * ⛔ File này nằm ở GỐC `src/`, không nằm trong `core/`, và đó là bắt buộc:
 * `core/` không được biết `ClusterSpec` hay `WorldSpec` (ô nghiệm thu AC-A đo
 * đúng điều đó bằng `grep -n "ClusterSpec" packages/games/src/core/`). Một bảng
 * đăng ký thì theo định nghĩa phải `import` cả hai plugin, nên nó không thể sống
 * trong `core/`.
 */

import type { GameProblemPlugin, ProblemPluginMeta, ProblemPluginRegistry } from './core/problem-plugin.ts';
import type { GradeResult, Testcase } from './core/problem.ts';
import type { GameAction } from './core/run-log.ts';
import type { GameId } from './core/types.ts';
import { GIT_PROBLEM_PLUGIN } from './git/problem-plugin.ts';
import { K8S_PROBLEM_PLUGIN } from './k8s/problem-plugin.ts';

// ── Bảng ────────────────────────────────────────────────────────────────────

/**
 * Hai game có bài tập. Bốn `GameId` còn lại (`pipeline`, `netpol`, `dockerfile`,
 * `cicd`) chưa có engine nên chưa có plugin, và `Partial<Record<...>>` nói ra
 * điều đó ở tầng kiểu: thiếu một khoá là **thiếu một khoá**, không phải một
 * nhánh `default` âm thầm.
 *
 * ── VÌ SAO CÓ MỘT PHÉP ÉP KIỂU Ở ĐÂY, VÀ VÌ SAO NÓ KHÔNG GIẤU GÌ ──
 *
 * `ProblemPluginRegistry` giữ `GameProblemPlugin<never, GameAction>`.
 * `never` làm đúng việc nó phải làm ở các vị trí THAM SỐ (`grade` nhận
 * `initialState`), nhưng `Spec` còn xuất hiện ở một vị trí TRẢ VỀ:
 * `initialSpec(): Spec`. Chiều đó là hiệp biến, nên `() => ClusterSpec` KHÔNG
 * gán được vào `() => never` — không một plugin thật nào gán thẳng vào bảng
 * được, kể cả plugin viết hoàn toàn đúng hợp đồng.
 *
 * Phép ép được đặt ở ĐÚNG MỘT chỗ (đây) thay vì rải ở mỗi chỗ dùng, và nó không
 * che mất gì: `K8S_PROBLEM_PLUGIN` / `GIT_PROBLEM_PLUGIN` vẫn được khai bằng
 * kiểu ĐẦY ĐỦ (`GameProblemPlugin<ClusterSpec, K8sActionShape>`) ở file của
 * chúng, nên mọi sai lệch hợp đồng vẫn đỏ tại nơi sinh ra. Bảng này chỉ dùng cho
 * việc LIỆT KÊ và cho `gradeProblemRun` ngay dưới.
 *
 * ⚠ Đã báo lead: nếu muốn bỏ phép ép này thì tham số của bảng phải là `unknown`
 * chứ không phải `never` (phương thức trong TypeScript so sánh hai chiều, nên
 * `unknown` vẫn nhận được ở vị trí tham số mà KHÔNG cần `any`). Đó là một thay
 * đổi của `core/problem-plugin.ts`, file lead sở hữu.
 */
export const PROBLEM_PLUGINS: ProblemPluginRegistry = {
  k8s: K8S_PROBLEM_PLUGIN as unknown as GameProblemPlugin<never, GameAction>,
  git: GIT_PROBLEM_PLUGIN as unknown as GameProblemPlugin<never, GameAction>,
};

// ── Tra bảng ────────────────────────────────────────────────────────────────

/**
 * Phần plugin đọc được mà không cần biết `Spec` — cho dropdown chọn game, cho
 * cổng kiểm mã bài, cho cổng kiểm chủ đề.
 *
 * `null` (không ném) là đúng ở đây: hỏi "game này có bài tập không" là một câu
 * hỏi HỢP LỆ mà câu trả lời có thể là không. Khác hẳn `gradeProblemRun`, nơi
 * không có plugin nghĩa là một lượt nộp không chấm được.
 */
export function problemPluginMeta(gameId: GameId): ProblemPluginMeta | null {
  return PROBLEM_PLUGINS[gameId] ?? null;
}

/**
 * Game chưa có plugin chấm bài.
 *
 * ⛔ Một lớp lỗi RIÊNG, không phải `Error` trần, và không phải một `GradeResult`
 * rỗng. `development-principles.md` §"Errors Over Silent Fallbacks" là lý do
 * trực tiếp: trả `{ verdict: 'WA', passed: [], total: 0 }` cho một game chưa có
 * plugin sẽ đọc ra trên màn hình là **"bạn sai 0/0"** cho mọi lượt nộp, và không
 * ai lần ra được vì không có gì hỏng cả. Một lớp lỗi có tên thì bắt riêng được
 * ở tầng điểm cuối và trả một mã HTTP nói đúng chuyện gì đã xảy ra.
 */
export class UnknownProblemGameError extends Error {
  readonly gameId: GameId;

  constructor(gameId: GameId) {
    super(`game "${gameId}" chưa có plugin chấm bài`);
    // `name` phải đặt tay: `class X extends Error` để lại `name === 'Error'` sau
    // khi biên dịch, nên `error.name` ở chỗ bắt sẽ nói sai tên lớp.
    this.name = 'UnknownProblemGameError';
    this.gameId = gameId;
  }
}

/**
 * Chấm một lượt nộp bằng plugin của `gameId`.
 *
 * Đây là đường mà CẢ client lẫn máy chủ gọi — một hàm, hai phía. Đó không phải
 * chuyện gọn gàng: §18.C so verdict hai bên, và nếu hai bên chấm bằng hai đoạn
 * mã khác nhau thì một lệch nhau chỉ nói về hai hàm chứ không nói gì về lượt
 * chơi.
 *
 * ── VÌ SAO `initialState` LÀ `unknown` ──
 *
 * Cố ý, và nó là sự thật chứ không phải một chỗ bỏ lỏng: bảng đăng ký giữ nhiều
 * plugin có `Spec` khác nhau, nên tại chỗ tra bảng ta THẬT SỰ không biết kiểu.
 * Che nó bằng `any` sẽ tắt luôn phép kiểm ở mọi chỗ gọi; để `unknown` thì chỗ
 * gọi buộc phải có ý thức về việc mình đang truyền cái gì. Phép ép nằm BÊN
 * TRONG, sau khi đã tra plugin theo `gameId`.
 *
 * ── BA ĐẦU RA, BA NGHĨA KHÁC NHAU ──
 *
 * | Tình huống | Đầu ra | Vì sao |
 * |---|---|---|
 * | Không có plugin cho `gameId` | **ném** `UnknownProblemGameError` | lỗi cấu hình/lập trình, không phải lỗi bài hay lỗi người làm |
 * | Nhật ký chứa action của game khác | `CE` kèm câu nói rõ | dữ liệu hỏng: lượt chơi không chạy tới nơi |
 * | Bài hoặc lượt chơi có vấn đề | `CE` / `WA` / `AC` từ plugin | plugin quyết |
 *
 * Phép kiểm `gameId` của từng action ở đây chứ không ở trong plugin là có lý do:
 * plugin K8s khai `A = K8sActionShape`, nên bên trong nó `action.gameId` LUÔN là
 * `'k8s'` ở tầng kiểu và phép kiểm đó sẽ là mã chết. Chỉ ở đây — nơi kiểu thật
 * sự rộng (`GameAction`) — phép kiểm mới có nghĩa. Đây đúng là ca mà
 * `core/verify.ts:sessionReplayEngine` đã ghi lại: một action Git lọt vào reducer
 * K8s rơi vào nhánh `default` và biến mất KHÔNG một tiếng động, cho ra một trạng
 * thái thiếu và một verdict đổ lỗi cho người chơi.
 */
export function gradeProblemRun(input: {
  readonly gameId: GameId;
  readonly initialState: unknown;
  readonly actions: readonly GameAction[];
  readonly testcases: readonly Testcase[];
  readonly seed: number | null;
}): GradeResult {
  const { gameId, initialState, actions, testcases, seed } = input;

  const plugin = PROBLEM_PLUGINS[gameId];
  if (plugin === undefined) {
    throw new UnknownProblemGameError(gameId);
  }

  for (const action of actions) {
    if (action.gameId !== gameId) {
      return {
        verdict: 'CE',
        passed: [],
        total: 0,
        failedReason: `nhật ký chứa hành động của game "${action.gameId}" nhưng bài thuộc game "${gameId}"`,
      };
    }
  }

  /*
   * Ép kiểu SAU khi đã tra plugin — đúng chỗ hợp đồng chỉ định.
   *
   * Phép ép này không kiểm được rằng `initialState` đúng là `Spec` của plugin,
   * và không có cách nào kiểm mà không chép một bộ xác thực cho từng game vào
   * đây. Nó KHÔNG im lặng: mọi plugin bọc phần phát lại trong `try/catch` và trả
   * `CE` kèm câu nói rõ, nên một spec sai loại hiện ra thành một verdict `CE`
   * đọc được chứ không phải một ngoại lệ không ai bắt.
   */
  const grade = plugin.grade as (input: {
    readonly initialState: unknown;
    readonly actions: readonly GameAction[];
    readonly testcases: readonly Testcase[];
    readonly seed: number | null;
  }) => GradeResult;

  return grade({ initialState, actions, testcases, seed });
}
