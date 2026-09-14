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
 * 2. **`graphShapeMatches` khai được nhưng dùng KHÔNG được.** Vị từ đó so hình
 *    dạng DAG với một **thế giới ĐÍCH** (`GitLevel.target`), mà `ProblemBase`
 *    chỉ có `initialState` — không có ô nào cho cây đích. Nó vẫn nằm trong
 *    `predicateNames` vì hợp đồng đòi danh sách đó khớp hai chiều với hiện thực,
 *    nhưng `grade` trả `CE` kèm câu nói rõ khi một testcase gọi tới nó. Xem khối
 *    chú thích ở `gradeGitProblem` về lý do `CE` chứ không phải để nó lặng lẽ
 *    trượt.
 *
 * 3. **Lệnh gõ sai KHÔNG thành `CE` ở bước này.** §18.B.5 mới là chỗ quyết định
 *    chính sách đó, và nó cần một quyết định thật (một lệnh sai giữa chừng rồi
 *    gõ lại đúng có làm hỏng cả lượt không?). Bước A.5 không được tự đặt ra một
 *    chính sách chấm điểm — nó chỉ chuyển engine vào hợp đồng.
 */

import { t } from '@devops-platform/copy';

import type { AuthorField, GameProblemPlugin } from '../core/problem-plugin.ts';
import type { GradeResult, ProblemTopicOption, Testcase } from '../core/problem.ts';
import { problemVerdictOf } from '../core/problem.ts';
import type { GitGameAction } from '../core/run-log.ts';
import type { GitLevel, GitPredicateName, GitWorld, WorldSpec } from './contract.ts';
import { createGitSession } from './engine.ts';
import { GIT_PREDICATE_NAMES, evaluatePredicate } from './predicates.ts';

// ── Định danh ───────────────────────────────────────────────────────────────

/**
 * Tiền tố mã bài. `GIT`, ba ký tự như `K8S` — không phải sự trùng hợp mà là điều
 * kiện của `PROBLEM_CODE_SUFFIX_DIGITS`: độ dài cố định làm `ORDER BY code` sắp
 * đúng bằng so sánh chuỗi thuần.
 */
export const GIT_PROBLEM_CODE_PREFIX = 'GIT';

/**
 * Seed dùng khi bài KHÔNG seedable (`seed === null`).
 *
 * `1` chứ không phải `0`, và có lý do cụ thể: `createGitSession` đã lấy `1` làm
 * mặc định của chính nó (`engine.ts:99`, `options.seed ?? 1`). Đặt một số khác ở
 * đây nghĩa là một lượt chấm OJ dựng thế giới KHÁC mọi đường git còn lại của
 * repo — đúng loại lệch mà không ai nghĩ tới khi đi tìm nguyên nhân.
 *
 * Vì sao phải export: client chấm tại chỗ và server chấm lại bắt buộc nạp CÙNG
 * một số. Hai bên lệch seed là hai thế giới đầu khác nhau trước cả lệnh đầu
 * tiên, và mọi lượt nộp hợp lệ đều bị từ chối.
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
 * Vị từ cần một thế giới ĐÍCH, thứ mà bài OJ không có chỗ để khai.
 *
 * Giữ thành một hằng chứ không viết thẳng chuỗi trong `if`: test khoá được nó,
 * và ngày `ProblemBase` có ô cho cây đích thì chỗ phải sửa là một, không phải ba.
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
 * `target` để `undefined`: không có cây đích, và `PREDICATES_NEEDING_TARGET` ở
 * trên là chỗ chuyện đó được nói ra thành lời thay vì âm thầm trượt.
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

function compileError(reason: string): GradeResult {
  return { verdict: 'CE', passed: [], total: 0, failedReason: reason };
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
 * - **Vị từ cần cây đích** (`graphShapeMatches`) — `evaluatePredicate` trả
 *   `false` khi `target === null`, tức là testcase đó không bao giờ qua được.
 *   Đây chính xác là hình dạng lỗi mà `development-principles.md` §"Errors Over
 *   Silent Fallbacks" cấm: một nhánh trả giá trị hợp lệ để che một điều kiện
 *   không thoả được.
 *
 * Hành động `hint` được BỎ QUA có chủ ý: nó không đụng tới repo (`engine.ts:228`
 * chỉ sửa `hintsRevealed` và dòng output), và level tổng hợp ở đây có
 * `hints: []` nên `revealHint` sẽ tự thoát sớm. Bỏ qua tường minh nói ra điều
 * đó thay vì dựa vào một phép kiểm biên ở nơi khác. Điểm trừ vì mở gợi ý tính từ
 * `Submission.hintsRevealed`, không tính từ đây.
 */
export function gradeGitProblem(input: {
  readonly initialState: WorldSpec;
  readonly actions: readonly GitGameAction[];
  readonly testcases: readonly Testcase[];
  readonly seed: number | null;
}): GradeResult {
  const { initialState, actions, testcases, seed } = input;

  if (testcases.length === 0) {
    return compileError('bài chưa có testcase nào nên không chấm được');
  }

  const known: readonly string[] = GIT_PREDICATE_NAMES;
  for (const testcase of testcases) {
    if (!known.includes(testcase.check)) {
      return compileError(`testcase "${testcase.id}" gọi vị từ không tồn tại: "${testcase.check}"`);
    }
    if ((PREDICATES_NEEDING_TARGET as readonly string[]).includes(testcase.check)) {
      return compileError(
        `vị từ "${testcase.check}" cần một cây đích, mà bài OJ không khai được cây đích`,
      );
    }
  }

  let world: GitWorld;
  try {
    const session = createGitSession({
      level: replayLevel(initialState),
      seed: seed ?? GIT_UNSEEDED_REPLAY_SEED,
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
      if (evaluatePredicate(world, null, testcase.check as GitPredicateName, testcase.args)) {
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
