/**
 * Phần RIÊNG của game Git trong hệ OJ đa-game — §18.A.5.
 *
 * Khác A.4 ở một điểm quan trọng: K8s là **chuyển chỗ** thứ đã có, còn đây là
 * **mới hoàn toàn** — game Git chưa từng có bài OJ nào. Nên không có hành vi cũ
 * để giữ, và mọi quyết định ở đây là một quyết định thật, phải nói ra lý do.
 *
 * ── BA SAI LỆCH SO VỚI PLAN, CẢ BA ĐỀU CÓ BẰNG CHỨNG ──
 *
 * 1. **`Spec` là `WorldSpec`, không phải `GitRepoSpec`.** Plan §18.A.5 viết
 *    `GitRepoSpec`; cái tên đó KHÔNG tồn tại trong mã. Kiểu thật là `WorldSpec`
 *    (`git/contract.ts:796`) và nó mô tả cả origin lẫn bot chứ không chỉ một
 *    repo, nên tên trong plan còn hẹp hơn thứ nó chỉ vào.
 *
 * 2. ~~**`graphShapeMatches` khai được nhưng dùng KHÔNG được.**~~ ĐÃ GỠ
 *    2026-09-14. Lời khai cũ đúng ở thời điểm viết: vị từ đó so hình dạng DAG
 *    với một **thế giới ĐÍCH**, mà `ProblemBase` không có ô nào chứa cây đích,
 *    nên `grade` buộc phải trả `CE` cho MỌI testcase gọi tới nó — một vị từ hợp
 *    lệ ở bảng từ vựng mà không bao giờ chạy được.
 *
 *    Lead đã sửa tận gốc ở `ae7ed23`: `ProblemBase.targetState?: Spec`. Nay
 *    `grade` nhận `targetState?` và vị từ CHẠY THẬT khi bài có khai. `CE` vẫn
 *    còn, nhưng đã thu hẹp đúng vào ca nó phải nói: bài **dùng**
 *    `graphShapeMatches` mà **không khai** `targetState` — một bài soạn thiếu,
 *    và nó phải ồn ào chứ không lặng lẽ trượt.
 *
 * 3. **Lệnh gõ sai KHÔNG thành `CE` ở bước này.** §18.B.5 mới là chỗ quyết định
 *    chính sách đó, và nó cần một quyết định thật (một lệnh sai giữa chừng rồi
 *    gõ lại đúng có làm hỏng cả lượt không?). Bước A.5 không được tự đặt ra một
 *    chính sách chấm điểm — nó chỉ chuyển engine vào hợp đồng.
 */

import { t } from '@devops-platform/copy';

import type { AuthorField, GameProblemPlugin } from '../core/problem-plugin.ts';
import type { GradeResult, ProblemTopicOption, Testcase } from '../core/problem.ts';
import { problemVerdictOf,
  type ProblemFailureCode,
} from '../core/problem.ts';
import type { GitGameAction } from '../core/run-log.ts';
import type { GitLevel, GitPredicateName, GitWorld, WorldSpec } from './contract.ts';
import { createGitSession } from './engine.ts';
import { GIT_PREDICATE_NAMES, evaluatePredicate } from './predicates.ts';
import { buildWorld } from './world-spec.ts';

// ── Định danh ───────────────────────────────────────────────────────────────

/**
 * Tiền tố mã bài. `GIT`, ba ký tự như `K8S` — không phải sự trùng hợp mà là điều
 * kiện của `PROBLEM_CODE_SUFFIX_DIGITS`: độ dài cố định làm `ORDER BY code` sắp
 * đúng bằng so sánh chuỗi thuần.
 */
export const GIT_PROBLEM_CODE_PREFIX = 'GIT';

/**
 * Seed mà CLIENT dùng khi bắt đầu một bài Git không seedable.
 *
 * ⛔ ĐỔI VAI 2026-09-14 (`ae7ed23`), KHÔNG bị xoá. Trước đó hằng này là mặc định
 * lúc **CHẤM**: `grade` nhận `seed: number | null` và tự điền hằng này khi gặp
 * `null`. Đó là chỗ hỏng — plugin K8s điền `0`, plugin này điền `1`, nên client
 * chơi trên một thế giới đầu còn server phát lại trên một thế giới đầu KHÁC, và
 * mọi lượt nộp HỢP LỆ đều bị từ chối. `Submission.seed` nay là một số THẬT mang
 * theo lượt nộp, nên không phía nào tra hằng lúc chấm nữa.
 *
 * Vai còn lại vẫn cần và vẫn đúng: đây là số client nạp vào `createGitSession`
 * khi mở một bài không seedable, rồi ghi vào `Submission.seed`.
 *
 * ⚠ Giá trị PHẢI là `1`, không phải `0`. `createGitSession` đã lấy `1` làm mặc
 * định của chính nó (`engine.ts:99`, `options.seed ?? 1`). Đặt một số khác ở đây
 * nghĩa là một lượt chơi OJ dựng thế giới KHÁC mọi đường git còn lại của repo —
 * đúng loại lệch mà không ai nghĩ tới khi đi tìm nguyên nhân.
 */
export const GIT_UNSEEDED_REPLAY_SEED = 1;

/**
 * `GitLevel.id` của level tổng hợp dựng để phát lại. Không bao giờ tới màn hình.
 *
 * `GitLevel.id` đi vào `getLog()` và vào tiến độ lưu ở `localStorage`, nên nó
 * phải KHÁC mọi id level thật (`git-NN-...`) — một `RunLog` sinh ra từ đây mà
 * mang id của một level thật sẽ đọc ra như tiến độ của level đó.
 */
const GIT_PROBLEM_REPLAY_LEVEL_ID = 'git-problem-replay';

// ── Chủ đề ──────────────────────────────────────────────────────────────────

/**
 * Tám chủ đề Git — tập ĐÓNG, cùng lý do đóng như chín chủ đề K8s: một trường tự
 * do đẻ ra "Rebase", "rebase", "nắn lịch sử", "Nan lich su" là bốn mục cho cùng
 * một thứ, và sau vài trăm bài thì không ai gộp lại được. `tags` là chỗ cho phân
 * loại tự do.
 *
 * Tám cái tên này KHÔNG bịa ra: chúng là các mảng kiến thức mà 32 level Git hiện
 * có đang dạy, gom theo ba chương của `GitLevel.chapter` (1 = nắn lịch sử,
 * 2 = làm việc nhóm, 3 = cứu hộ) rồi tách nhỏ những chương quá rộng. Một bài OJ
 * không dạy, nên chủ đề ở đây chỉ để **lọc và chọn bài kế tiếp** — đó là lý do
 * tám chứ không phải ba: ba mục quá thô để chọn bài, hai mươi mục thì không ai
 * lọc nữa.
 *
 * ⚠ Id để TRẦN (`branching`) chứ không gắn tiền tố (`git-branching`), cùng quy
 * ước với chín id của K8s. Chúng không đụng nhau vì cổng kiểm luôn tra theo
 * `gameId` của bài — `core/problem.ts` chốt: *"chủ đề của bài phải nằm trong tập
 * của plugin theo `gameId` của bài"*. Khoá chữ thì PHẢI có tiền tố `git` vì
 * `packages/copy` là một không gian tên phẳng cho cả dự án.
 */
export const GIT_PROBLEM_TOPICS: readonly ProblemTopicOption[] = [
  { id: 'commit', label: t('problem.topic.git.commit') },
  { id: 'branching', label: t('problem.topic.git.branching') },
  { id: 'merging', label: t('problem.topic.git.merging') },
  { id: 'history', label: t('problem.topic.git.history') },
  { id: 'remote', label: t('problem.topic.git.remote') },
  { id: 'collaboration', label: t('problem.topic.git.collaboration') },
  { id: 'conflict', label: t('problem.topic.git.conflict') },
  { id: 'recovery', label: t('problem.topic.git.recovery') },
];

// ── Form soạn `initialState` ────────────────────────────────────────────────

/**
 * Mô tả form cho `WorldSpec`.
 *
 * ⛔ GẦN NHƯ TOÀN BỘ LÀ `json`, và đó là quyết định có chủ ý mà hợp đồng đã dự
 * liệu sẵn: *"một `WorldSpec` của git có cây commit lồng nhau, và ép nó thành
 * widget trực quan sẽ hỏng trước khi hữu ích. Level Builder (§18.E) mới là câu
 * trả lời cho phần đó"* (`core/problem-plugin.ts`).
 *
 * Cụ thể chỗ hỏng: `commits` là một **đồ thị**, không phải một danh sách —
 * `CommitSpec.parents` trỏ tới id của các `CommitSpec` khác trong cùng mảng, và
 * `branches` / `tags` / `head` lại trỏ ngược vào những id đó. Một `kind: 'list'`
 * dựng được ba ô text cho mỗi commit nhưng KHÔNG kiểm được rằng `parents` trỏ
 * tới id có thật, cũng không kiểm được thứ tự tô-pô mà `buildWorld` đòi. Kết quả
 * là một biểu mẫu trông đầy đủ nhưng cho phép soạn ra thế giới không dựng được —
 * tệ hơn hẳn một ô JSON nói thẳng rằng đây là dữ liệu có cấu trúc.
 *
 * `author` là ngoại lệ duy nhất: một chuỗi phẳng, không trỏ vào đâu, nên nó là
 * một ô text thật.
 */
export const GIT_AUTHOR_FIELDS: readonly AuthorField[] = [
  {
    kind: 'json',
    path: 'commits',
    label: t('problem.git-spec.commits'),
    help: t('problem.git-spec.commits-help'),
    required: false,
  },
  {
    kind: 'json',
    path: 'branches',
    label: t('problem.git-spec.branches'),
    help: t('problem.git-spec.branches-help'),
    required: false,
  },
  {
    kind: 'json',
    path: 'tags',
    label: t('problem.git-spec.tags'),
    required: false,
  },
  {
    kind: 'json',
    path: 'head',
    label: t('problem.git-spec.head'),
    help: t('problem.git-spec.head-help'),
    required: false,
  },
  {
    kind: 'json',
    path: 'worktree',
    label: t('problem.git-spec.worktree'),
    help: t('problem.git-spec.worktree-help'),
    required: false,
  },
  {
    kind: 'json',
    path: 'staged',
    label: t('problem.git-spec.staged'),
    help: t('problem.git-spec.staged-help'),
    required: false,
  },
  {
    kind: 'json',
    path: 'origin',
    label: t('problem.git-spec.origin'),
    help: t('problem.git-spec.origin-help'),
    required: false,
  },
  {
    kind: 'json',
    path: 'bots',
    label: t('problem.git-spec.bots'),
    help: t('problem.git-spec.bots-help'),
    required: false,
  },
  {
    kind: 'text',
    path: 'author',
    label: t('problem.git-spec.author'),
    help: t('problem.git-spec.author-help'),
    required: false,
  },
];

// ── Chấm ────────────────────────────────────────────────────────────────────

/**
 * Vị từ chỉ chạy được khi bài khai `targetState`.
 *
 * Ngày `ProblemBase` có ô cho cây đích đã tới (`ae7ed23`), nên hằng này không
 * còn là danh sách "vị từ không dùng được" mà là danh sách **điều kiện tiên
 * quyết**: gọi một tên trong đây mà bài không khai `targetState` là một bài soạn
 * thiếu, và `gradeGitProblem` trả `CE` kèm câu nói rõ.
 *
 * Vẫn giữ thành một hằng chứ không viết thẳng chuỗi trong `if`: test khoá được
 * nó, và ngày có vị từ thứ hai cần cây đích thì chỗ phải sửa là một.
 */
const PREDICATES_NEEDING_TARGET: readonly GitPredicateName[] = ['graphShapeMatches'];

/**
 * `GitLevel` tổng hợp, chỉ để engine chạy. KHÔNG bao giờ tới màn hình.
 *
 * ⚠ `allowedCommands: null` chứ KHÔNG phải `[]`. Hai giá trị mang nghĩa NGƯỢC
 * NHAU: `null` = cho dùng mọi lệnh, `[]` = cấm mọi lệnh. `git/contract.ts:951`
 * ghi rõ cái bẫy này và nói nó "đã cắn một lần ở `k8s/problem.ts`" — viết `[]` ở
 * đây làm mọi lượt chấm trượt trong im lặng, vì một lệnh bị chặn không phải một
 * lỗi phát lại.
 *
 * `objectives: []` là đúng nghĩa: bài OJ chấm bằng `testcases`, chạy thẳng trên
 * thế giới cuối. Đi vòng qua `objectives` sẽ kéo theo `required` — thứ mà
 * `Testcase` cố ý KHÔNG có (`core/problem.ts` giải thích vì sao).
 *
 * ⚠ `target` để `undefined` NGAY CẢ KHI bài có khai `targetState`, và đó không
 * phải một chỗ bỏ sót. `createGitSession` dựng cây đích vào một biến nội bộ
 * (`buildTarget`, `engine.ts:93`) mà `GitEngineSession` KHÔNG có hàm nào trả ra,
 * nên điền vào đây chỉ tốn một lượt `buildWorld` thứ hai mà `gradeGitProblem`
 * không đọc được. Phiên này cũng có `objectives: []` nên không có gì bên trong
 * engine dùng tới `target`. Bộ chấm tự dựng cây đích bằng ĐÚNG một lệnh
 * `buildWorld(targetState, seed)` — cùng biểu thức, cùng seed, cùng kết quả.
 */
function replayLevel(setup: WorldSpec): GitLevel {
  return {
    id: GIT_PROBLEM_REPLAY_LEVEL_ID,
    chapter: 1,
    title: '',
    mission: '',
    brief: '',
    difficulty: 'basic',
    setup,
    allowedCommands: null,
    objectives: [],
    hints: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
    theoryId: null,
    solutionCommands: [],
    altSolutionCommands: [],
    par: 0,
  };
}

function compileError(
  reason: string,
  code: ProblemFailureCode = 'phat-lai-loi',
): GradeResult {
  return { verdict: 'CE', passed: [], total: 0, failedReason: reason, failedCode: code };
}

/**
 * Phát lại nhật ký rồi chấm từng testcase trên thế giới CUỐI.
 *
 * ⛔ Hàm thuần và tất định — cùng ràng buộc và cùng lý do như bản K8s. Engine
 * Git đã có năm test riêng cho đúng chuyện này (`git/determinism.test.ts` +
 * `determinism.jsdom.test.ts`) và cổng CI `scripts/check-git-determinism.mjs`
 * gác phần grep, nên chỗ duy nhất có thể làm hỏng bất biến là chính file này:
 * không `Date.now()`, không `Math.random()`, không lặp trên `Set`/`Map`.
 *
 * ── VÌ SAO HAI TÌNH HUỐNG DƯỚI LÀ `CE` ──
 *
 * `CE` nghĩa là *"lượt chơi không chạy tới nơi, nên `passed`/`total` không nói
 * lên gì"*. Cả hai đều là **bài soạn hỏng**, không phải người làm sai, và cả hai
 * nếu im lặng sẽ cho ra một bài KHÔNG AI GIẢI ĐƯỢC mà không ai biết tại sao —
 * một testcase vĩnh viễn đỏ trông y hệt một lời giải sai:
 *
 * - **Vị từ không có trong `GIT_PREDICATE_NAMES`** — tác giả gõ nhầm tên.
 * - **Vị từ cần cây đích mà bài KHÔNG khai `targetState`** (`graphShapeMatches`)
 *   — `evaluatePredicate` trả `false` khi `target === null`, tức là testcase đó
 *   không bao giờ qua được. Đây chính xác là hình dạng lỗi mà
 *   `development-principles.md` §"Errors Over Silent Fallbacks" cấm: một nhánh
 *   trả giá trị hợp lệ để che một điều kiện không thoả được.
 *
 *   ⚠ Phép kiểm này hẹp đi từ `ae7ed23` và phải giữ đúng bề rộng đó: bài CÓ khai
 *   `targetState` thì vị từ chạy thật, không `CE`. Nới ra thành "mọi lần gọi
 *   `graphShapeMatches` đều `CE`" là quay lại đúng chỗ hỏng cũ (một vị từ khai
 *   được nhưng dùng không được); siết vào thành "im lặng trả `false`" là quay
 *   lại chỗ hỏng còn tệ hơn (một bài không ai giải được, không ai biết vì sao).
 *
 * Hành động `hint` được BỎ QUA có chủ ý: nó không đụng tới repo (`engine.ts:228`
 * chỉ sửa `hintsRevealed` và dòng output), và level tổng hợp ở đây có
 * `hints: []` nên `revealHint` sẽ tự thoát sớm. Bỏ qua tường minh nói ra điều
 * đó thay vì dựa vào một phép kiểm biên ở nơi khác. Điểm trừ vì mở gợi ý tính từ
 * `Submission.hintsRevealed`, không tính từ đây.
 */
export function gradeGitProblem(input: {
  readonly initialState: WorldSpec;
  readonly targetState?: WorldSpec;
  readonly actions: readonly GitGameAction[];
  readonly testcases: readonly Testcase[];
  readonly seed: number;
}): GradeResult {
  const { initialState, targetState, actions, testcases, seed } = input;

  if (testcases.length === 0) {
    // Mã RIÊNG, không dùng `phat-lai-loi` mặc định: đây không phải lỗi phát lại
    // (chưa phát lại gì cả), và `total === 0` một mình KHÔNG tách được ba nguyên
    // nhân — xem `PROBLEM_FAILURE_CODES`. Mã sai ở đây làm cột thứ ba mất đúng
    // cái khả năng nó sinh ra để có.
    return compileError('bài chưa có testcase nào nên không chấm được', 'chua-co-testcase');
  }

  const known: readonly string[] = GIT_PREDICATE_NAMES;
  for (const testcase of testcases) {
    if (!known.includes(testcase.check)) {
      return compileError(`testcase "${testcase.id}" gọi vị từ không tồn tại: "${testcase.check}"`);
    }
    if (
      targetState === undefined &&
      (PREDICATES_NEEDING_TARGET as readonly string[]).includes(testcase.check)
    ) {
      return compileError(
        `vị từ "${testcase.check}" cần một cây đích, mà bài này không khai "targetState"`,
      );
    }
  }

  let world: GitWorld;
  /*
   * Cây đích, dựng bằng CÙNG seed với thế giới đầu.
   *
   * Cùng seed là bắt buộc chứ không phải cho gọn: `buildWorld` nuôi RNG của bot
   * từ seed, nên hai seed khác nhau cho hai cây đích khác nhau — và một cây đích
   * lệch làm `graphShapeMatches` trượt trên một lời giải ĐÚNG. `engine.ts:93`
   * (`buildTarget`) dựng đích bằng đúng biểu thức này, cũng bằng đúng seed của
   * phiên; đây là chỗ thứ hai phải khớp với nó.
   *
   * `null` (không phải `undefined`) vì đó là thứ `evaluatePredicate` nhận.
   */
  let target: GitWorld | null = null;
  if (targetState !== undefined) {
    /*
     * `try` RIÊNG, không gộp vào khối phát lại ngay dưới. Một `targetState` soạn
     * hỏng và một nhật ký chạy hỏng là hai chuyện khác nhau, và gộp lại thì câu
     * `CE` nói "phát lại nhật ký lỗi" cho một lượt chơi chưa hề được phát lại —
     * người đọc đi tìm sai chỗ ngay từ dòng đầu.
     */
    try {
      target = buildWorld(targetState, seed);
    } catch (error) {
      return compileError(`cây đích của bài dựng không được: ${errorText(error)}`);
    }
  }

  try {
    const session = createGitSession({
      level: replayLevel(initialState),
      seed,
      // Phát lại không bao giờ hoàn tác, nên một ngăn xếp 50 khung là bộ nhớ giữ
      // lại mà không ai đọc. `replayGitLog` đã dùng đúng giá trị này.
      undoDepth: 0,
    });
    for (const action of actions) {
      if (action.kind === 'command') {
        session.run(action.command);
      }
    }
    world = session.getWorld();
  } catch (error) {
    return compileError(`phát lại nhật ký lỗi: ${errorText(error)}`);
  }

  const passed: string[] = [];
  for (const testcase of testcases) {
    try {
      if (evaluatePredicate(world, target, testcase.check as GitPredicateName, testcase.args)) {
        passed.push(testcase.id);
      }
    } catch (error) {
      return compileError(`testcase "${testcase.id}" chấm lỗi: ${errorText(error)}`);
    }
  }

  return {
    verdict: problemVerdictOf(passed.length, testcases.length),
    passed,
    total: testcases.length,
    failedReason: null,
    failedCode: null,
  };
}

/** Xem chú thích cùng tên ở `k8s/problem-plugin.ts` — `catch` nhận `unknown`. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ── Plugin ──────────────────────────────────────────────────────────────────

/**
 * Plugin Git. `seedSpec` cố ý VẮNG MẶT — cùng lời khai như bản K8s.
 *
 * `core/problem-plugin.ts` chốt: thiếu `seedSpec` nghĩa là **mọi bài Git buộc
 * phải `seedable: false`**. Hôm nay đúng như vậy — `buildWorld(spec, seed)` nhận
 * seed nhưng dựng cùng một thế giới từ cùng một spec; seed chỉ nuôi RNG của bot
 * chứ không sinh ra một đề khác. Khai một `seedSpec` trả thẳng `base` sẽ là lời
 * nói dối tệ hơn nhiều so với vắng mặt: cổng §18.G.3 cho kỳ thi `per-student`
 * chạy, và mỗi sinh viên nhận **cùng một đề** trong khi hệ thống khai là đề riêng.
 */
export const GIT_PROBLEM_PLUGIN: GameProblemPlugin<WorldSpec, GitGameAction> = {
  gameId: 'git',
  codePrefix: GIT_PROBLEM_CODE_PREFIX,
  topics: GIT_PROBLEM_TOPICS,
  predicateNames: GIT_PREDICATE_NAMES,
  initialSpec: () => ({
    // Một commit gốc trên `main` — thế giới nhỏ nhất mà `buildWorld` dựng được
    // và người soạn nhìn vào là hiểu ngay phải thêm gì. Hàm chứ không phải hằng
    // dùng chung: hai tab soạn bài cùng trỏ vào một object thì sửa tab này đổi
    // luôn tab kia.
    commits: [{ id: 'c1', message: 'khoi tao du an', changes: { 'README.md': 'Du an mau' } }],
    branches: { main: 'c1' },
    head: 'main',
  }),
  authorFields: GIT_AUTHOR_FIELDS,
  grade: gradeGitProblem,
};
