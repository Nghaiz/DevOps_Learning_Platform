import {
  ALL_KINDS,
  CICD_UNSEEDED_REPLAY_SEED,
  createGitSession,
  gradeCicdProblem,
  createSession,
  problemDifficultyToLevelDifficultyLossy,
  scoreProblemRun,
  sessionReplayEngine,
  verifyRun,
  type GitEngineSession,
  type GitLevel,
  type GitObjective,
  type GitPredicateName,
  type CicdGameAction,
  type CicdProblemSpec,
  type K8sSession,
  type ClusterSpec,
  type GameId,
  type Level,
  type ReplayEngine,
  type RunLog,
  type RunResult,
  type RunTally,
  type VerifyResult,
  type WorldSpec,
} from '@devops-platform/games';
import type { StoredProblem } from './dto';

/*
 * ⛔ TÁI XUẤT, không khai lại — `problemDifficultyToLevelDifficultyLossy` chuyển
 * nhà sang `packages/games/src/core/problem.ts` ngày 2026-09-17 (xem chú thích
 * tại chỗ khai mới về BỐN bản sao trước đó).
 *
 * Giữ tên xuất ra ở đây vì `replay.test.ts` và hai chỗ dùng trong file này đã
 * trỏ vào nó; một lượt đổi import ở mọi call-site không mua được gì.
 */
export { problemDifficultyToLevelDifficultyLossy } from '@devops-platform/games';

/**
 * Dựng bộ phát lại cho một bài OJ.
 *
 * Đây là chỗ chống gian lận thực sự nằm: điểm KHÔNG bao giờ lấy từ lời khai của
 * client, mà từ việc chạy lại `RunLog` qua đúng reducer đã chạy trên máy người
 * chơi. Muốn có 1000 điểm thì phải đính kèm một chuỗi action thật sự dẫn tới
 * 1000 điểm — tức là phải chơi thật. Xem `packages/games/src/core/verify.ts`.
 */

/**
 * `RunLog.levelId` của một lượt làm bài OJ là `problem.code`.
 *
 * Hợp đồng `RunLog` chỉ có `levelId` vì nó sinh ra cho `Level`; bài OJ chạy trên
 * CÙNG engine nên nó tái dùng ô đó. `sessionReplayEngine` ném khi hai bên lệch,
 * và `submit.ts` kiểm trước để trả một câu nói được thay vì một `phat-lai-loi`
 * chung chung.
 */
export function expectedLogLevelId(problem: StoredProblem): string {
  return problem.code;
}


/**
 * `Problem` → `Level` tổng hợp, đủ để `createSession` chạy.
 *
 * Ba field mang nghĩa thật với engine: `id`, `initialState`, `objectives` —
 * `session.ts` và `reducer.ts` không đọc gì khác từ `Level` (kiểm bằng grep
 * 2026-09-08, và `replay.test.ts` giữ điều đó khỏi trôi).
 *
 * ⚠ `allowedResources` rơi về `ALL_KINDS` khi bài không giới hạn, KHÔNG rơi về
 * `[]`. Hai giá trị đó mang nghĩa NGƯỢC NHAU: `null` của `Problem` nghĩa là "cho
 * dùng mọi loại", còn `[]` của `Level` nghĩa là "cấm mọi loại". Hôm nay engine
 * không đọc field ấy khi phát lại (kiểm bằng grep 2026-09-08), nên viết sai chưa
 * hại — nhưng ngày nào nó bắt đầu chặn theo danh sách này, `[]` sẽ làm mọi lượt
 * phát lại của mọi bài "không giới hạn" trượt, im lặng, vì một action bị chặn
 * không phải một lỗi.
 *
 * `teaching` rỗng là đúng nghĩa chứ không phải chỗ giữ chỗ: một `Problem` theo
 * định nghĩa là bài KHÔNG dạy (`problem.ts` mở đầu bằng đúng bảng phân vai đó).
 */
export function problemAsLevel(problem: StoredProblem): Level {
  /*
   * ⛔ CHỐT NARROW K8s. `Level` là kiểu của game K8s, nên hàm này chỉ đúng
   * với bài K8s — và từ 18.A kho lưu chở được bài của game khác.
   *
   * Ném thay vì ép im lặng: `StoredProblem.initialState` là `unknown` (kiểu
   * đúng phụ thuộc `gameId` — xem `dto.ts`), nên một `as ClusterSpec` không
   * kiểm gì sẽ đưa một `WorldSpec` của Git xuống reducer K8s. Triệu chứng khi
   * đó là `phat-lai-loi` giữa lượt chấm, tức một lỗi CẤU HÌNH đọc ra thành "bộ
   * mô phỏng hỏng". Ném ở đây nói đúng tên vấn đề.
   */
  if (problem.gameId !== 'k8s') {
    throw new Error(
      `problemAsLevel chỉ dựng được Level của K8s, nhưng bài "${problem.code}" thuộc game "${problem.gameId}"`,
    );
  }
  return {
    id: expectedLogLevelId(problem),
    chapter: 0,
    title: problem.title,
    // `mission` là dòng nhiệm vụ một câu mà giao diện hiện thường trực. Bài OJ
    // không có ô riêng cho nó — cả đề bài NẰM ở `statement` — nên dùng tiêu đề,
    // thứ vốn đã là một câu nói người chơi phải làm được gì. Không ghép một
    // chuỗi mới ở đây: `Level` tổng hợp này chỉ tồn tại để phát lại, không bao
    // giờ tới màn hình, nên một câu bịa ra sẽ là dữ liệu không ai đọc.
    mission: problem.title,
    brief: problem.statement,
    difficulty: problemDifficultyToLevelDifficultyLossy(problem.difficulty),
    initialState: problem.initialState as ClusterSpec,
    allowedResources: problem.allowedResources ?? ALL_KINDS,
    /*
     * `required: true` cho MỌI testcase — quyết định #20 được thi hành, không
     * phải một giá trị điền cho đủ: *"Objective = testcase"*, và
     * `core/problem.ts` § `Testcase` bỏ `required` vì *"một testcase thì luôn
     * chặn — đó là nghĩa của `AC`"*.
     *
     * ⚠ ĐỔI NGHĨA với dữ liệu CŨ: một bài soạn trước 18.B có mục tiêu
     * thưởng (`required: false`) thì từ nay mục tiêu đó CHẶN. Thông tin
     * `required` đã mất ở biên đọc (`problemTestcases` không chở nó sang
     * `Testcase`), nên đây không phải chỗ khôi phục được — nó là chỗ ghi lại
     * rằng nó đã mất.
     */
    objectives: problem.testcases.map((testcase) => ({
      id: testcase.id,
      label: testcase.label,
      check: testcase.check,
      ...(testcase.args === undefined ? {} : { args: testcase.args }),
      required: true,
    })),
    hints: problem.hints.map((hint) => hint.text),
    parMoves: problem.parMoves ?? 0,
    teaches: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
  };
}

/**
 * Hàm chấm điểm truyền vào bộ phát lại.
 *
 * Toàn bộ công thức nằm ở `scoreProblemRun` của `packages/games` — MỘT hàm dùng
 * chung cho cả client lẫn máy chủ. Đó không phải chuyện gọn gàng: điểm chỉ được
 * công nhận khi phát lại ra ĐÚNG con số client đã khai, nên hai bản sao của công
 * thức nghĩa là mọi lượt chơi hợp lệ đều trượt xác minh, và triệu chứng
 * (`khong-khop`) đọc y hệt như người chơi sửa dữ liệu.
 *
 * Việc còn lại ở đây chỉ là ghép đúng đầu vào:
 *
 * - `objectivesMet` khử trùng bằng `Set` — `ProblemScoreInput` đòi id KHÁC NHAU,
 *   và một engine trả trùng sẽ đẩy tỉ lệ vượt 100% mà không ai thấy.
 * - `revealedHintIds` đóng lại (closure) từ tập đã tính trước khi phát lại, nên
 *   hai lần phát lại cùng một nhật ký nhận cùng một số trừ — phát lại phải tất
 *   định, nếu không `verifyRun` sẽ báo `engine-khong-tat-dinh`.
 * - `parMoves` truyền thẳng `null`; hàm dùng chung tự xử lý.
 */
export function problemScoreRun(
  problem: StoredProblem,
  revealedHintIds: readonly string[],
): (status: { readonly objectivesMet: readonly string[] }, tally: RunTally) => number {
  return (status, tally) =>
    scoreProblemRun({
      objectivesMet: new Set(status.objectivesMet).size,
      objectivesTotal: problem.testcases.length,
      movesUsed: tally.commandsUsed,
      parMoves: problem.parMoves,
      hints: problem.hints,
      revealedHintIds,
    });
}

export function problemReplayEngine(
  problem: StoredProblem,
  revealedHintIds: readonly string[],
): ReplayEngine<K8sSession> {
  return sessionReplayEngine(
    createSession,
    problemAsLevel(problem),
    problemScoreRun(problem, revealedHintIds),
  );
}

// ── Đường Git ───────────────────────────────────────────────────────────────

/**
 * `Problem` → `GitLevel` tổng hợp, đủ để `createGitSession` chạy — §18.C cho
 * game thứ hai.
 *
 * ⛔ HÀM RIÊNG, không phải một nhánh nới rộng của `problemAsLevel`. Khối chú
 * thích của hàm kia nói rõ vì sao nó NÉM thay vì ép im lặng: một `WorldSpec` của
 * Git ép qua `as ClusterSpec` xuống reducer K8s cho ra `phat-lai-loi` giữa lượt
 * chấm, tức một lỗi CẤU HÌNH đọc ra thành "bộ mô phỏng hỏng". Lời ném đó vẫn
 * đúng và phải giữ; thứ thiếu là đường thứ hai, không phải một cái kiểu rộng hơn.
 *
 * ## `id` là `problem.code`, y như bên K8s — và đó là một RÀNG BUỘC, không phải
 * một lựa chọn thẩm mỹ
 *
 * `GitEngineSession.getLog()` trả `levelId: level.id`, `verifyRun` so
 * `log.levelId` với `claimed.levelId`, và `init` dưới đây ném khi nhật ký thuộc
 * level khác. Ba chỗ đó chỉ khớp nhau nếu client mở bài OJ bằng một `GitLevel`
 * mang đúng `problem.code`. Đây là nửa máy chủ của hợp đồng mà nửa client phải
 * theo — xem báo cáo lane 18.C.
 *
 * ⚠ `GIT_PROBLEM_REPLAY_LEVEL_ID` của `git/problem-plugin.ts` KHÔNG dùng được ở
 * đây, và hai chỗ không mâu thuẫn: bộ chấm theo testcase (`gradeGitProblem`)
 * chạy vị từ thẳng trên thế giới cuối nên `level.id` của nó không bao giờ bị ai
 * đọc; đường xác minh này thì ngược lại, `level.id` LÀ khoá so. Cả hai vẫn thoả
 * lời dặn gốc — khác mọi id thật `git-NN-` nên không mồ côi tiến độ của ai.
 *
 * ## `chapter: 1`, không phải `0`
 *
 * `GitLevel.chapter` là union `1 | 2 | 3` (`git/contract.ts`), khác `Level` của
 * K8s vốn nhận số bất kỳ và được điền `0` để nói "không thuộc chương nào". Ở đây
 * `0` không biểu diễn được, nên `1` là giá trị hợp lệ nhỏ nhất — và nó vô hại
 * vì `chapter` chỉ dùng để nhóm level trên màn chọn bài, còn level này không bao
 * giờ tới màn hình.
 *
 * ## `check` ép sang `GitPredicateName` mà KHÔNG kiểm lại tên
 *
 * Cố ý, và nó không mở lỗ nào: `evaluatePredicate` là một `switch` không có
 * nhánh `default`, nên một tên lạ rơi ra ngoài và trả `undefined` — tức objective
 * không bao giờ đạt, **y hệt ở cả hai phía**, vì client chạy đúng engine này.
 * Hai bên khớp nhau thì `verifyRun` vẫn `da-xac-minh`, rồi `gradeGitProblem` —
 * chỗ DUY NHẤT giữ cổng tên vị từ — trả `CE` kèm câu gọi đúng tên testcase gõ
 * sai. Chép cổng ấy sang đây là dựng bản sao thứ hai của cùng một luật, và bản
 * sao sẽ trôi.
 *
 * `required: true` cho mọi testcase, cùng lý lẽ đã ghi ở `problemAsLevel`:
 * quyết định #20 — *"Objective = testcase"*, và một testcase thì luôn chặn.
 */
export function problemAsGitLevel(problem: StoredProblem): GitLevel {
  if (problem.gameId !== 'git') {
    throw new Error(
      `problemAsGitLevel chỉ dựng được GitLevel, nhưng bài "${problem.code}" thuộc game "${problem.gameId}"`,
    );
  }
  const objectives: readonly GitObjective[] = problem.testcases.map((testcase) => ({
    id: testcase.id,
    label: testcase.label,
    check: testcase.check as GitPredicateName,
    ...(testcase.args === undefined ? {} : { args: testcase.args }),
    required: true,
  }));
  return {
    id: expectedLogLevelId(problem),
    chapter: 1,
    title: problem.title,
    mission: problem.title,
    brief: problem.statement,
    difficulty: problemDifficultyToLevelDifficultyLossy(problem.difficulty),
    setup: problem.initialState as WorldSpec,
    /*
     * ⚠ Trải CÓ ĐIỀU KIỆN. `exactOptionalPropertyTypes: true` phân biệt "không
     * có khoá" với "có khoá, giá trị `undefined`", và `createGitSession` đọc
     * `level.target === undefined` để quyết dựng cây đích hay không
     * (`buildTarget`, `engine.ts:93`). Viết thẳng `target: problem.targetState`
     * hôm nay chạy đúng nhưng đỏ ở `tsc` — và nếu lọt thì nó là chỗ một phép
     * kiểm `'target' in level` tương lai trả lời sai.
     */
    ...(problem.targetState === undefined ? {} : { target: problem.targetState as WorldSpec }),
    /*
     * ⚠ `null` chứ KHÔNG phải `[]`. Hai giá trị mang nghĩa NGƯỢC NHAU: `null` =
     * cho dùng mọi lệnh, `[]` = cấm mọi lệnh. `git/contract.ts:951` ghi rõ cái
     * bẫy này và nói nó đã cắn một lần ở `k8s/problem.ts` — viết `[]` ở đây làm
     * MỌI lượt phát lại trượt trong im lặng, vì một lệnh bị chặn không phải một
     * lỗi phát lại, chỉ là một lệnh không có tác dụng.
     *
     * Bài OJ chưa có ô nào khai danh sách lệnh cho phép. Ngày nó có thì chỗ sửa
     * là đây, và giá trị rơi về phải vẫn là `null`.
     */
    allowedCommands: null,
    objectives,
    /*
     * Chỉ chở TEXT của gợi ý. `revealHint(index)` kiểm `index < level.hints.length`
     * rồi thoát sớm, nên độ DÀI mới là thứ có nghĩa ở đây — một nhật ký mở gợi ý
     * thứ 3 của bài phải mở được đúng 3 gợi ý khi phát lại, nếu không thì
     * `status.hintsRevealed` lệch. Điểm trừ vì gợi ý thì tính riêng ở
     * `problemScoreRun`, từ HỢP của nhật ký và bảng `problem_hint_reveals`.
     */
    hints: problem.hints.map((hint) => hint.text),
    // Rỗng là đúng nghĩa, không phải chỗ giữ chỗ: một `Problem` theo định nghĩa
    // là bài KHÔNG dạy. Cùng lời khai như `problemAsLevel`.
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
    theoryId: null,
    /*
     * Rỗng, và đây là chỗ duy nhất `GitLevel` mất thông tin so với một level
     * thật: `solutionCommands`/`altSolutionCommands` là dữ liệu của ô nghiệm thu
     * AC-8/AC-9, mà bài OJ không khai lời giải mẫu ở đâu cả. Không bịa: một mảng
     * rỗng đọc ra đúng "bài này không có lời giải mẫu", còn một chuỗi lệnh bịa ra
     * sẽ làm `checkSolvable` báo xanh cho một bài chưa ai chứng minh là giải được.
     */
    solutionCommands: [],
    altSolutionCommands: [],
    par: problem.parMoves ?? 0,
  };
}

/**
 * Adapter phát lại của game Git — anh em của `sessionReplayEngine` bên K8s.
 *
 * ## Vì sao nó ở `apps/web` chứ không ở `packages/games/src/git/replay-engine.ts`
 *
 * Chỗ ĐÚNG của nó là bên kia, cạnh `k8s/replay-engine.ts`, và khối chú thích đầu
 * file đó đã vạch sẵn hình dạng: *"giao diện ở `core/` (`ReplayEngine`), hiện
 * thực cụ thể ở package của từng game"*. Nó không nằm ở đó vì một ràng buộc
 * PHÂN CÔNG, không phải một lập luận kiến trúc: `packages/games/package.json` chỉ
 * mở đúng subpath `"."`, nên một file mới dưới `git/` chỉ dùng được sau khi
 * `packages/games/src/index.ts` export nó — mà file ấy lead giữ. Ghi ra đây để
 * lần dọn sau biết đây là món nợ có tên, không phải một chỗ đặt tuỳ tiện.
 *
 * ## Không có `dispose`
 *
 * `K8sSession` giữ một vòng lặp thời gian nên bản kia bắt buộc phải dọn.
 * `GitEngineSession` không giữ tài nguyên sống nào — thời gian của nó là
 * `world.logicalTime`, nhích bởi lệnh chứ không bởi đồng hồ tường. Khai một
 * `dispose` rỗng ở đây sẽ là một lời hứa không có nội dung.
 *
 * ## `project` trả `getWorld()`, không phải `getView()`
 *
 * `getView()` là hình chiếu ĐỂ VẼ: nó bốc ra đúng thứ màn hình cần và bỏ phần
 * còn lại. So hai lần phát lại trên nó thì mọi khác biệt nằm ngoài khung nhìn
 * (`origin`, PR, reflog, stash, `logicalTime`) sẽ đi qua mà không ai thấy — tức
 * phép kiểm `engine-khong-tat-dinh` mù dần đúng theo cách `k8s/replay-engine.ts`
 * cảnh báo. `getWorld()` LÀ mô hình đầy đủ của game này, nên nó là chỗ so đúng.
 */
export function gitProblemReplayEngine(
  problem: StoredProblem,
  revealedHintIds: readonly string[],
): ReplayEngine<GitEngineSession> {
  const level = problemAsGitLevel(problem);
  const scoreRun = problemScoreRun(problem, revealedHintIds);
  return {
    init: (levelId, seed) => {
      // Nhật ký thuộc level khác thì phát lại vô nghĩa — ném để thành
      // `phat-lai-loi` (lỗi của ta / của dữ liệu), chứ không âm thầm chấm sai.
      if (levelId !== level.id) {
        throw new Error(`nhật ký thuộc level "${levelId}" nhưng được phát lại trên "${level.id}"`);
      }
      // `undoDepth: 0` — phát lại không bao giờ hoàn tác, nên một ngăn xếp 50
      // khung `GitWorld` là bộ nhớ giữ lại mà không ai đọc. `replayGitLog` và
      // `gradeGitProblem` đều dùng đúng giá trị này.
      return createGitSession({ level, seed, undoDepth: 0 });
    },
    reduce: (session, action) => {
      /*
       * Thu hẹp CÓ KIỂM, cùng lý lẽ `sessionReplayEngine` đã ghi cho chiều kia:
       * một action K8s lọt vào đây mà không bị chặn sẽ rơi qua nhánh `hint` rồi
       * gọi `revealHint(action.index)` — một `index` `undefined` thoát sớm KHÔNG
       * một tiếng động, và phát lại ra trạng thái thiếu. Ném thì `verifyRun` bắt
       * thành `phat-lai-loi`, đúng ô "lỗi của ta hoặc của dữ liệu, KHÔNG phải
       * bằng chứng gian lận".
       */
      if (action.gameId !== 'git') {
        throw new Error(`nhật ký của game "${action.gameId}" không phát lại được trên engine Git`);
      }
      if (action.kind === 'command') {
        session.run(action.command);
      } else {
        session.revealHint(action.index);
      }
      return session;
    },
    objectivesMet: (session) => session.getStatus().objectivesMet,
    score: (session, tally) => scoreRun(session.getStatus(), tally),
    project: (session) => session.getWorld(),
  };
}

// ── Đường CI/CD ─────────────────────────────────────────────────────────────

/**
 * Trạng thái phát lại của game CI/CD: **chính chuỗi action, chưa diễn giải**.
 *
 * ⛔ Đây KHÔNG phải một chỗ lười. Hai game trước tích luỹ một thế giới qua từng
 * lệnh, nên `reduce` của chúng phải chạy engine từng bước. Game này thì mỗi lượt
 * nộp là một bản YAML ĐỘC LẬP — bản sau THAY bản trước, không áp lên nó — và
 * `gradeCicdProblem` đã khai điều đó thành luật: nó chấm hành động `evaluate`
 * CUỐI CÙNG và bỏ qua phần còn lại.
 *
 * Nên một `reduce` chạy engine từng bước ở đây sẽ mô phỏng N-1 lượt mà không ai
 * đọc kết quả, và tệ hơn: nó tạo ra một bản diễn giải THỨ HAI của cùng một nhật
 * ký, cạnh bản của `gradeCicdProblem`. Hai bản sẽ trôi, và chỗ trôi là "máy chủ
 * chấm ra một verdict, máy chủ xác minh ra một verdict khác" — người giải đúng
 * bị từ chối, và không lệnh nào nói vì sao.
 */
interface CicdReplayState {
  readonly levelId: string;
  readonly actions: readonly CicdGameAction[];
}

/**
 * Adapter phát lại của game CI/CD — 19.J.
 *
 * ⛔ KHE ĐÃ ĐÓNG, và nó từng CÂM. Trước đợt này `verifyProblemRun` không có
 * nhánh `'cicd'`, nên mọi lượt nộp bài CI/CD ném `UnsupportedReplayGameError` →
 * 500. Chú thích ở `verifyProblemRun` hứa rằng một ô test *"khẳng định mọi
 * `GameId` có plugin chấm thì cũng phải có adapter phát lại"* sẽ bắt được điều
 * đó — ô đó KHÔNG TỒN TẠI (kiểm 2026-09-17: chỉ có một ô ném trên `'pipeline'`,
 * một game không có plugin). `cicd-replay.test.ts` là ô thật, và nó suy từ
 * `PROBLEM_PLUGINS` chứ không chép tay danh sách game.
 *
 * `objectivesMet` gọi THẲNG `gradeCicdProblem` — cùng hàm mà `gradeProblemRun`
 * gọi ở đường chấm. Một bản diễn giải thứ hai là chỗ hai đường trôi khỏi nhau.
 */
export function cicdProblemReplayEngine(
  problem: StoredProblem,
  revealedHintIds: readonly string[],
): ReplayEngine<CicdReplayState> {
  const scoreRun = problemScoreRun(problem, revealedHintIds);
  return {
    init: (levelId, seed) => {
      /*
       * Bài OJ không đứng sau level nào, nên `levelId` của nhật ký PHẢI là mã
       * bài. Lệch ⇒ ném để thành `phat-lai-loi` (lỗi dữ liệu), chứ không âm thầm
       * chấm một nhật ký thuộc bài khác.
       */
      if (levelId !== problem.code) {
        throw new Error(`nhật ký thuộc bài "${levelId}" nhưng được phát lại trên "${problem.code}"`);
      }
      /*
       * `seed` KHÔNG đi vào phép mô phỏng — engine CI/CD lấy hạt giống từ
       * `evaluation.baseSeed` của đề. Nhưng nó vẫn phải ĐÚNG, vì `verifyRun` so
       * `log.seed` với `claimed.seed` và một client gửi số khác đang khai một
       * lượt chơi khác lượt nó vừa chơi.
       */
      if (seed !== CICD_UNSEEDED_REPLAY_SEED) {
        throw new Error(
          `bài CI/CD không sinh đề theo seed, nên nhật ký phải mang seed ${String(CICD_UNSEEDED_REPLAY_SEED)}, nhận ${String(seed)}`,
        );
      }
      return { levelId, actions: [] };
    },
    reduce: (state, action) => {
      /*
       * Thu hẹp CÓ KIỂM, đúng lối `k8s/replay-engine.ts`: một `as` trần sẽ đẩy
       * action của game khác vào đây, nơi nó nằm im trong mảng và làm phép chấm
       * lệch — `verifyRun` khi đó báo `khong-khop`, tức đổ lỗi cho người chơi vì
       * một lỗi ghép engine của ta. Ném thì thành `phat-lai-loi`, đúng ô "lỗi
       * của ta hoặc của dữ liệu".
       */
      if (action.gameId !== 'cicd') {
        throw new Error(`nhật ký của game "${action.gameId}" không phát lại được trên engine CI/CD`);
      }
      /*
       * Vẫn cần `as` sau phép kiểm, và vì đúng lý do mà bản K8s đã ghi: `core/`
       * chỉ biết dạng MỞ (`CicdActionShape` với `CicdOverridesLike` /
       * `CicdCdPoliciesLike` — xem `core/run-log.ts`), còn `gradeCicdProblem` đòi
       * dạng ĐÓNG. Kiểm lại hình dạng `overrides.cache` ở đây là chép hợp đồng
       * sang chỗ thứ hai; và không cần — một giá trị cache bịa ra không tra ra
       * khuôn nào trong `hydrate.ts`, nên bước ghép bỏ qua nó và phát lại lệch
       * đúng như nó phải lệch.
       */
      return { ...state, actions: [...state.actions, action as CicdGameAction] };
    },
    objectivesMet: (state) => passedCuaTrangThai(state).passed,
    /*
     * `movesUsed` đọc `tally.commandsUsed`, và `'evaluate'` nằm trong
     * `COMMAND_KINDS` (`core/verify.ts`) — tức mỗi lần bấm "Nộp bài" là một nước
     * đi. Đó là định nghĩa đúng ở game này: sửa YAML rồi chạy là toàn bộ tương
     * tác của người chơi.
     */
    score: (state, tally) => scoreRun({ objectivesMet: passedCuaTrangThai(state).passed }, tally),
  };

  /**
   * Chấm MỘT LẦN cho mỗi trạng thái cuối, nhớ lại cho lần hỏi thứ hai.
   *
   * `verifyRun` hỏi `objectivesMet` rồi hỏi `score` trên cùng một trạng thái, và
   * nó phát lại HAI lượt để bắt engine không tất định — tức bốn lời gọi cho một
   * lượt nộp. Mỗi lời gọi chạy trọn `evaluation.passes` lượt mô phỏng CI cộng ba
   * bộ mô phỏng CD, nên đây là tiết kiệm THẬT, không phải tối ưu sớm.
   *
   * ⚠ `WeakMap` khoá theo THAM CHIẾU trạng thái, và điều đó đúng ở đây vì
   * `reduce` trả một object MỚI mỗi lần: hai trạng thái khác nhau không bao giờ
   * chung khoá. Nó cũng không làm hỏng phép kiểm tất định — hai lượt phát lại
   * dựng hai chuỗi object riêng, nên mỗi lượt vẫn chấm thật một lần.
   */
  function passedCuaTrangThai(state: CicdReplayState): { readonly passed: readonly string[] } {
    const daCo = nhoKetQua.get(state);
    if (daCo !== undefined) return daCo;
    const ket = gradeCicdProblem({
      initialState: problem.initialState as CicdProblemSpec,
      actions: state.actions,
      testcases: problem.testcases,
      seed: CICD_UNSEEDED_REPLAY_SEED,
    });
    const gon = { passed: ket.passed };
    nhoKetQua.set(state, gon);
    return gon;
  }
}

const nhoKetQua = new WeakMap<object, { readonly passed: readonly string[] }>();

// ── Cửa chung ───────────────────────────────────────────────────────────────

/**
 * Game có bài `published` nhưng chưa có adapter phát lại.
 *
 * Một lớp lỗi RIÊNG, cùng khuôn `UnknownProblemGameError` của
 * `packages/games/src/problem-plugins.ts` và cùng lý do: chỗ gọi phải phân biệt
 * được "nền tảng thiếu một mảnh" với "lượt chơi này sai". Trả một `VerifyResult`
 * hỏng ở đây sẽ đọc ra trên màn hình là *"không xác minh được"* — một câu đổ lỗi
 * cho người nộp về một thứ họ không gây ra.
 */
export class UnsupportedReplayGameError extends Error {
  readonly gameId: GameId;

  constructor(gameId: GameId) {
    super(`game "${gameId}" chưa có adapter phát lại phía máy chủ`);
    // Đặt tay: `class X extends Error` để lại `name === 'Error'` sau khi biên
    // dịch, nên `error.name` ở chỗ bắt sẽ nói sai tên lớp.
    this.name = 'UnsupportedReplayGameError';
    this.gameId = gameId;
  }
}

/**
 * Xác minh một lượt nộp bằng ĐÚNG engine của game bài đó.
 *
 * ⛔ Đây là chỗ §18.C mở từ một game sang hai. Trước nó, `submitProblem` gọi
 * thẳng `problemReplayEngine` — một tên nghe trung lập nhưng dựng `Level` của
 * K8s — nên một bài Git `published` chỉ có đúng một kết cục: `problemAsLevel`
 * ném, và người nộp nhận 500 kèm một câu về "bộ mô phỏng".
 *
 * ## Vì sao là `switch` ở `apps/web` chứ không phải một ô trong bảng plugin
 *
 * Chỗ đúng là `GameProblemPlugin.replayEngine?` — cùng lý lẽ `core/problem-plugin.ts`
 * dùng để từ chối mô hình `switch (gameId)`: *"thêm game thứ ba nghĩa là tìm cho
 * đủ mọi chỗ đã switch; cái nào sót thì không đỏ"*. Nó không ở đó vì `core/` và
 * `index.ts` của `packages/games` không thuộc lane này.
 *
 * Cái giá trả tạm: nhánh `default` dưới đây là chỗ DUY NHẤT phát hiện thiếu sót,
 * và nó chỉ nói lúc CHẠY chứ không nói lúc biên dịch. Bù lại một phần bằng cách
 * cho nó ném một lớp lỗi có tên, và bằng `verify-game-split.test.ts` — ô đó
 * khẳng định mọi `GameId` có plugin chấm thì cũng phải có adapter phát lại, nên
 * game thứ ba cắm plugin vào mà quên chỗ này sẽ ĐỎ chứ không im lặng.
 */
export function verifyProblemRun(
  problem: StoredProblem,
  log: RunLog,
  claimed: RunResult,
  revealedHintIds: readonly string[],
): VerifyResult {
  switch (problem.gameId) {
    case 'k8s':
      return verifyRun(log, claimed, problemReplayEngine(problem, revealedHintIds));
    case 'git':
      return verifyRun(log, claimed, gitProblemReplayEngine(problem, revealedHintIds));
    case 'cicd':
      return verifyRun(log, claimed, cicdProblemReplayEngine(problem, revealedHintIds));
    default:
      throw new UnsupportedReplayGameError(problem.gameId);
  }
}

/**
 * Id gợi ý mà chính NHẬT KÝ khai là đã mở.
 *
 * Action `hint` mang `index` chứ không mang id (hợp đồng: id sẽ là một trường
 * suy ra được ở đó), nên phải tra ngược qua `problem.hints`. Index ngoài phạm vi
 * thì bỏ qua — một nhật ký thuộc bản đề CŨ hơn không được làm cả lượt nộp nổ;
 * `verifyRun` sẽ tự bắt nó ở chỗ điểm không khớp.
 */
export function hintIdsFromLog(problem: StoredProblem, log: RunLog): readonly string[] {
  const ids: string[] = [];
  for (const action of log.actions) {
    if (action.kind !== 'hint') {
      continue;
    }
    const hint = problem.hints[action.index];
    if (hint !== undefined) {
      ids.push(hint.id);
    }
  }
  return ids;
}

/**
 * Đã giải được chưa — theo MỌI testcase.
 *
 * ⚠ ĐỔI NGHĨA ở 18.B, ghi lại vì cổng này bị SIẾT chứ không phải được dọn. Bản
 * cũ chỉ đếm mục tiêu `required: true` và bỏ qua mục tiêu thưởng. Quyết định #20
 * bỏ hẳn khái niệm đó — mọi testcase đều chặn — nên một bài cũ có mục tiêu
 * thưởng nay đòi đạt cả nó mới được tính là "đã giải".
 *
 * Không có đường giữ hành vi cũ ở đây kể cả khi muốn: `problemTestcases` ở biên
 * đọc không chở `required` sang `Testcase`, nên tới hàm này thì thông tin ấy đã
 * không còn tồn tại. Chỗ duy nhất còn phân biệt được là cột jsonb thô.
 *
 * Đọc `objectivesMet` ĐÃ PHÁT LẠI XÁC MINH, không phải một cờ client gửi lên.
 */
export function isSolved(problem: StoredProblem, objectivesMet: readonly string[]): boolean {
  const met = new Set(objectivesMet);
  // Bài không có testcase nào là bài không chấm được — trả `false` thay vì
  // `true` theo kiểu "mọi phần tử của tập rỗng đều thoả". Cổng xuất bản chặn
  // hình dạng đó, nên tới được đây nghĩa là dữ liệu đã hỏng ở đâu đó.
  if (problem.testcases.length === 0) {
    return false;
  }
  return problem.testcases.every((testcase) => met.has(testcase.id));
}
