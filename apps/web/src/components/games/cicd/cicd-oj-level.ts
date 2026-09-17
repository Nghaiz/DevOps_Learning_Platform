import {
  CICD_UNSEEDED_REPLAY_SEED,
  EDITABLE_PARTS,
  scoreProblemRun,
  tallyLog,
  type CicdLevel,
  type CicdObjective,
  type CicdProblemSpec,
  type Difficulty,
  type ProblemDifficulty,
  type RunLog,
  type RunResult,
} from '@devops-platform/games';

/**
 * `Problem` → `CicdLevel` ở PHÍA CLIENT — 19.J.3.2, nửa client của bộ đôi mà
 * `gradeCicdProblem` giữ ở phía máy chủ.
 *
 * ⛔ ĐỌC TRƯỚC KHI SỬA MỘT DÒNG NÀO Ở ĐÂY.
 *
 * Khác bộ đôi của game Git ở MỘT điểm quyết định mọi thứ còn lại: **bản dựng này
 * không tham gia phép chấm**. Ở game Git, máy chủ dựng lại `GitLevel` rồi phát
 * lại nhật ký trên đó, nên hai bản dựng lệch nhau một trường là mọi lượt nộp hợp
 * lệ đều bị từ chối. Ở đây máy chủ dựng ngữ cảnh chấm THẲNG từ `CicdProblemSpec`
 * (`gradeCicdProblem` đọc `initialState.workflow` / `.workload` / `.evaluation`),
 * nên `CicdLevel` dưới đây chỉ là **bộ khung cho màn chơi** — nó quyết định người
 * làm nhìn thấy gì và sửa được gì, không quyết định họ đạt hay trượt.
 *
 * Hệ quả thực tế, và nó là thứ dễ hiểu sai nhất ở file này: ba trường
 * `workflow` / `workload` / `evaluation` PHẢI chép nguyên từ `spec`, vì màn chơi
 * chạy thử tại chỗ bằng chúng và người làm đọc ba trục từ lượt chạy đó. Lệch một
 * trường thì con số trên màn khác con số máy chủ tính — không ai bị từ chối oan,
 * nhưng người làm chỉnh theo một cái đồng hồ chạy sai.
 *
 * ── ⛔ VÌ SAO `objectives` KHÔNG MANG `check` THẬT ──
 *
 * `server/problems/testcases.ts` § `toTestcaseTeasers` cắt `check` và `args` của
 * MỌI testcase trước khi dữ liệu rời máy chủ (§18.B.4) — kể cả testcase hiện, kể
 * cả với tác giả. Nhãn là đề bài; tên vị từ và tham số là CÁCH CHẤM.
 *
 * Nên client không có `check`, và `checkObjective` gọi `CICD_PREDICATES[check]`
 * rồi gọi luôn kết quả tra được — một tên rỗng cho `undefined(...)`, tức một
 * `TypeError` giữa lượt chơi. Vì vậy `cicdOjObjectives` dựng danh sách để HIỆN,
 * còn lượt chạy thử tại chỗ nhận một danh sách RỖNG (xem `cicd-level-screen.tsx`),
 * và màn hình tắt chữ "Đạt / Chưa đạt" của lượt chạy cục bộ. Verdict chỉ tới từ
 * máy chủ.
 */

/** Một testcase như CLIENT nhìn thấy nó — không bao giờ có `check`. Xem khối trên. */
export interface CicdOjTestcase {
  readonly id: string;
  /** `null` khi testcase ẩn và người làm chưa nộp lần nào. */
  readonly label: string | null;
  readonly visible: boolean;
}

export interface CicdOjHint {
  readonly id: string;
  readonly penaltyPoints: number;
  /** Máy chủ nói, không phải client tự khai. Vào thẳng phép tính điểm. */
  readonly revealed: boolean;
  readonly text: string | null;
}

/** Phần của một bài OJ mà việc dựng màn chơi cần. Cố ý hẹp hơn `SolverProblem`. */
export interface CicdOjProblem {
  readonly code: string;
  readonly title: string;
  readonly statement: string;
  readonly difficulty: ProblemDifficulty;
  readonly initialState: unknown;
  readonly testcases: readonly CicdOjTestcase[];
  readonly hints: readonly CicdOjHint[];
}

/**
 * Nhãn hiện lên khi testcase ẩn và người làm chưa nộp lần nào.
 *
 * Một chuỗi rỗng ở đây sẽ thành một dòng trống trong danh sách tiêu chí, và một
 * dòng trống đọc ra như một lỗi render. Nói thẳng rằng nó tồn tại và chưa có tên
 * là cách duy nhất giữ mẫu số `n/m` trung thực mà không nói dối về nội dung.
 */
const NHAN_TESTCASE_AN = 'Testcase ẩn chưa hiện tên';

/**
 * Thang bốn bậc của `Problem` → thang ba bậc của `Level`, MẤT THÔNG TIN.
 *
 * Bản sao thứ ba của cùng phép chiếu (`server/problems/replay.ts` và
 * `games/git/problem-level.ts` là hai bản kia), và lý lẽ cho phép sao chép vẫn y
 * nguyên: `difficulty` KHÔNG có mặt trong `RunLog` lẫn `RunResult`, nên hai bên
 * lệch nhau cũng không từ chối lượt nộp nào — nó chỉ đổi một chữ trên màn.
 *
 * ⚠ Nhưng ba bản là ngưỡng `code-conventions.md` gọi là phải trích ra, và chỗ
 * đúng của nó là `packages/games/src/core/` cạnh `problemVerdictOf`. Ghi ra đây
 * để lần thứ tư không ai phải tự nghĩ lại, và để món nợ có tên.
 */
function doKhoLevelMatThongTin(difficulty: ProblemDifficulty): Difficulty {
  switch (difficulty) {
    case 'easy':
      return 'basic';
    case 'medium':
      return 'intermediate';
    case 'hard':
    case 'expert':
      return 'advanced';
  }
}

/**
 * Bài này có chấm được không.
 *
 * `problemVerdictOf(0, 0)` trả `CE`, nên một bài không testcase nào là bài không
 * ai nộp được — và màn hình phải nói ra điều đó thay vì để nút nộp dẫn tới một
 * `CE` khó hiểu. Cổng xuất bản đã chặn ca này (`publishIssues` đòi ≥1 testcase),
 * nên đây là lưới thứ hai cho một bài lọt qua bằng đường khác.
 *
 * ⛔ KHÔNG hỏi "client có `check` chưa" — client KHÔNG BAO GIỜ có, và hỏi thế sẽ
 * tắt nút nộp của mọi người học vĩnh viễn. Bộ đôi của game Git đã sửa đúng lỗi
 * đó ngày 2026-09-15; đừng dựng lại nó ở đây.
 */
export function cicdOjGradable(problem: CicdOjProblem): boolean {
  return problem.testcases.length > 0;
}

/** Tiêu chí chấm, ở dạng HIỆN ĐƯỢC. Xem khối đầu file về `check` rỗng. */
export function cicdOjObjectives(problem: CicdOjProblem): readonly CicdObjective[] {
  return problem.testcases.map((testcase) => ({
    id: testcase.id,
    label: testcase.label ?? NHAN_TESTCASE_AN,
    /*
     * Chuỗi rỗng, ép kiểu, và KHÔNG BAO GIỜ được đưa vào `checkObjective`. Đây
     * là chỗ duy nhất trong đường OJ mà một `CicdPredicateName` không có thật;
     * `cicd-level-screen.tsx` giữ nó khỏi lượt chạy bằng cách truyền danh sách
     * RỖNG cho `runWorkflow`.
     */
    check: '' as CicdObjective['check'],
    required: true,
  }));
}

/**
 * Bộ ba của đề, đã thu hẹp kiểu.
 *
 * `initialState` tới đây ở `unknown`, và đó không phải một chỗ lỏng lẻo tình cờ:
 * biên ghi CỐ Ý không dựng lại `CicdProblemSpec` bằng một schema Zod thứ hai —
 * `server/problems/validate.ts` § `refineByGame` ghi lý do (một bản sao của hợp
 * đồng đang sống ở `packages/games` sẽ trôi). Nên phép ép dưới đây không kiểm
 * được gì, và `cicdOjSpecThieu` là chỗ trả lời câu hỏi đó thành một câu đọc được.
 */
function specCuaDe(problem: CicdOjProblem): CicdProblemSpec {
  return problem.initialState as CicdProblemSpec;
}

/**
 * Tên mảnh còn THIẾU trong bộ ba của đề, hoặc `null` khi đủ.
 *
 * ⛔ Phải gọi TRƯỚC `cicdOjLevel`. Thiếu `evaluation` thì `runWorkflow` ném ở
 * `evaluate()`, và một ngoại lệ giữa lượt render cho người làm một TRANG TRẮNG —
 * không thông điệp, không nút thử lại, không cách nào đoán rằng lỗi nằm ở đề chứ
 * không ở họ. `rules/development-principles.md` § Errors Over Silent Fallbacks:
 * lỗi phải nổi lên thành chữ, không được nuốt và cũng không được để nó nổ ở tầng
 * sai.
 *
 * Phép kiểm ở độ sâu MỘT — có mặt hay không — chứ không kiểm hình dạng bên
 * trong. Kiểm sâu hơn là dựng bản sao thứ hai của hợp đồng ngay tại chỗ vừa nói
 * là không nên dựng.
 */
export function cicdOjSpecThieu(problem: CicdOjProblem): string | null {
  const spec: Partial<CicdProblemSpec> | null =
    typeof problem.initialState === 'object' && problem.initialState !== null
      ? (problem.initialState as Partial<CicdProblemSpec>)
      : null;
  if (spec === null) return 'toàn bộ đề (initialState không phải một object)';
  if (spec.workflow === undefined) return 'workflow';
  if (spec.workload === undefined) return 'workload';
  if (spec.evaluation === undefined) return 'evaluation';
  return null;
}

/**
 * Ngưỡng ba trục cho một bài OJ — CỐ Ý nới hết cỡ.
 *
 * ⛔ Đây không phải giá trị điền cho đủ. Một bài OJ chấm bằng TESTCASE, và
 * testcase do người soạn viết; ba trục chỉ là số đo để người làm tự đọc. Đặt một
 * ngưỡng bịa ở đây sẽ vẽ chữ "Chưa đạt" lên bảng ba trục của một bài đã qua hết
 * testcase — hai phép đánh giá trái nhau trên cùng một màn hình, và người làm
 * không có cách nào biết cái nào là thật.
 *
 * `showVerdict: false` ở bảng kết quả là thứ thật sự tắt chữ đó; ngưỡng nới ở
 * đây là lớp thứ hai, cho mọi chỗ khác đọc `thresholds`.
 */
const NGUONG_NOI: CicdLevel['thresholds'] = {
  parLeadSeconds: Number.MAX_SAFE_INTEGER,
  budgetLeadSeconds: Number.MAX_SAFE_INTEGER,
  parThroughputPerHour: 0,
  minThroughputPerHour: 0,
  parRunnerMinutes: Number.MAX_SAFE_INTEGER,
  budgetRunnerMinutes: Number.MAX_SAFE_INTEGER,
  minGreenRate: 0,
};

/**
 * Lời khai đi kèm lượt nộp — `RunResult` mà `verifyRun` đối chiếu.
 *
 * ⚠ Là TIẾNG VỌNG của máy chủ, không phải một phép đo độc lập. `objectivesMet`
 * tới từ `problems.tryGrade`; client không có `check` của testcase (§18.B.4) nên
 * nó KHÔNG THỂ tự tính trường này. Hệ quả phải nói thẳng: phép so `objectivesMet`
 * trong `verifyRun` không còn là nhân chứng độc lập cho bài CI/CD — cùng cái giá
 * mà game Git đã trả ngày 2026-09-15, và vì cùng lý do.
 *
 * Thứ VẪN gác thật: `levelId` + `seed` phải khớp (nhật ký phải thuộc lượt chơi
 * đã khai), `commandsUsed` / `hintsUsed` đếm TỪ NHẬT KÝ chứ không từ lời khai,
 * và `score` phát lại phải ra đúng số đã khai.
 */
export function cicdOjClaim(input: {
  readonly problem: CicdOjProblem;
  /** Nhật ký ĐÚNG lượt đang nộp. Số nước đi đếm TỪ NÓ, không gõ tay. */
  readonly log: RunLog;
  readonly objectivesMet: readonly string[];
  readonly startedAt: number;
  readonly finishedAt: number;
}): RunResult {
  const { problem, log, objectivesMet, startedAt, finishedAt } = input;
  /*
   * ⛔ ĐẾM, không gõ. `verifyRun` so `claimed.commandsUsed` với `tallyLog(log)`
   * phía máy chủ và trả `khong-khop` khi lệch — tức người nộp bị từ chối vì một
   * con số ta tự bịa. Hôm nay nhật ký luôn có đúng một `evaluate`, nên `1` sẽ
   * đúng; nhưng ngày ai đó cho mỗi lần "Chạy thử" vào nhật ký, một hằng gõ tay
   * ở đây sẽ sai trong im lặng và mọi lượt nộp đều trượt xác minh.
   *
   * `tallyLog` là CHÍNH hàm máy chủ gọi, nên hai bên không thể lệch định nghĩa.
   */
  const tally = tallyLog(log);
  /*
   * ⛔ HỢP của HAI nguồn, không phải một. Đây là một lỗi ĐÃ ĐO (review PR #146),
   * và cả hai vế đều cần:
   *
   *  - `hint.revealed` tới từ `problems.byCode`, tức trạng thái ở MÁY CHỦ lúc MỞ
   *    bài. Nó chở gợi ý mở ở phiên TRƯỚC, nhưng KHÔNG chở gợi ý vừa mở phiên
   *    này: `useHintReveal` không `invalidate` query đó, nên giá trị còn cũ.
   *  - Nhật ký chở đúng phần còn thiếu — những gợi ý mở TRONG lượt này.
   *
   * Máy chủ hợp đúng hai nguồn đó (`submit.ts` § `revealedIds`), nên chỉ lấy một
   * vế ở client là khai một số điểm KHÁC số máy chủ tính ⇒ `khong-khop` ⇒ `CE`
   * cho một bài giải ĐÚNG. Bản đầu chỉ đọc `hint.revealed`.
   */
  const revealedHintIds = [
    ...new Set([
      ...problem.hints.filter((hint) => hint.revealed).map((hint) => hint.id),
      ...idGoiYTrongNhatKy(problem, log),
    ]),
  ].sort();
  return {
    /*
     * Khai TƯỜNG MINH. `submitProblem` chốt cả `log.gameId` lẫn `claimed.gameId`
     * về `problem.gameId` và trả `BAD_REQUEST` khi lệch.
     */
    gameId: 'cicd',
    levelId: problem.code,
    seed: CICD_UNSEEDED_REPLAY_SEED,
    startedAt,
    finishedAt,
    objectivesMet,
    objectivesTotal: problem.testcases.length,
    commandsUsed: tally.commandsUsed,
    /*
     * ⛔ ĐẾM TỪ NHẬT KÝ, y như `commandsUsed`. Bản đầu khai
     * `hints.reveals.size` — trạng thái React của màn hình — và nó SAI ở hai
     * chiều cùng lúc:
     *
     *  1. Nhật ký không chở action `hint` nào, nên `tallyLog` phía máy chủ đếm
     *     0 trong khi client khai 1 ⇒ `khong-khop` ⇒ `CE` cho một lượt giải
     *     ĐÚNG. Cả hai bài seed đều có một gợi ý, nên lỗi này sống trên dữ liệu
     *     thật: mở gợi ý rồi nộp là trượt.
     *  2. `reveals` giữ cả pha `pending` và `error`, nên một lượt xin gợi ý
     *     HỎNG (máy chủ không ghi gì) vẫn làm `.size` tăng.
     *
     * Nay `cicd-problem.tsx` ghi action `hint` vào nhật ký cho mỗi gợi ý mở
     * THÀNH CÔNG, và con số dưới đây đọc từ chính nhật ký đó.
     */
    hintsUsed: tally.hintsUsed,
    score: scoreProblemRun({
      /*
       * Khử trùng bằng `Set`: `ProblemScoreInput` đòi id KHÁC NHAU, và phía máy
       * chủ cũng khử. Một bộ chấm trả trùng sẽ đẩy tỉ lệ vượt 100% ở đúng một bên.
       */
      objectivesMet: new Set(objectivesMet).size,
      objectivesTotal: problem.testcases.length,
      movesUsed: tally.commandsUsed,
      /*
       * `null` — bài CI/CD không có "số nước đi chuẩn". Một lượt nộp là một lượt
       * nộp, và người giải sau ba lần thử không đáng bị trừ điểm so với người
       * đoán trúng ngay lần đầu; cái đáng đo ở game này là ba trục, không phải
       * số lần bấm.
       */
      parMoves: null,
      hints: problem.hints.map((hint) => ({
        id: hint.id,
        // `text` KHÔNG đi vào phép tính điểm, và thường là `null` ở phía client.
        text: hint.text ?? '',
        penaltyPoints: hint.penaltyPoints,
      })),
      revealedHintIds,
    }),
  };
}

/**
 * Id gợi ý mà chính NHẬT KÝ khai là đã mở.
 *
 * Action `hint` mang `index` chứ không mang id (id là một trường suy ra được ở
 * đó), nên phải tra ngược qua `problem.hints`. Index ngoài phạm vi thì BỎ QUA:
 * một nhật ký thuộc bản đề CŨ hơn không được làm cả lượt nộp nổ — `verifyRun`
 * sẽ tự bắt nó ở chỗ điểm không khớp.
 *
 * Bản sao của `idGoiYTrongNhatKy` ở `games/git/problem-level.ts`, và bản sao này
 * CÓ CHỦ Ý: hàm kia đóng trên `GitOjProblem`. Chỗ đúng lâu dài là một hàm dùng
 * chung nhận `readonly { id }[]`, cùng món nợ với `doKhoLevelMatThongTin`.
 */
function idGoiYTrongNhatKy(problem: CicdOjProblem, log: RunLog): readonly string[] {
  const ids: string[] = [];
  for (const action of log.actions) {
    if (action.kind !== 'hint') continue;
    const hint = problem.hints[action.index];
    if (hint !== undefined) ids.push(hint.id);
  }
  return ids;
}

/** Bài OJ → `CicdLevel` mà `CicdLevelScreen` dựng được màn chơi từ đó. */
export function cicdOjLevel(problem: CicdOjProblem): CicdLevel {
  const spec = specCuaDe(problem);
  return {
    id: problem.code,
    /*
     * Chương suy TỪ ĐỀ, không mặc định `'ci'`: chương quyết định trục Y của tầng
     * 3D và màn chuyển tiếp trục. Một bài có kịch bản phát hành mà hiện cảnh CI
     * là một cảnh thiếu đúng nửa nó cần vẽ.
     */
    chapter: spec.cd === undefined ? 'ci' : 'cd',
    title: problem.title,
    /*
     * `mission` là dòng chữ thường trực duy nhất trên màn, hợp đồng đòi ≤ 20 từ.
     * Đề bài đầy đủ nằm ở `brief`, nên ở đây nói vai trò của màn chứ không cắt
     * `statement` — một câu bị cắt giữa chừng đọc ra như dữ liệu hỏng.
     */
    mission: `Bài ${problem.code}: sửa đường ống cho qua hết tiêu chí chấm.`,
    brief: problem.statement,
    difficulty: doKhoLevelMatThongTin(problem.difficulty),
    initialWorkflow: spec.workflow,
    workload: spec.workload,
    evaluation: spec.evaluation,
    /*
     * MỌI phần đều mở, đúng bằng `EDITABLE_PARTS` mà `gradeCicdProblem` truyền
     * cho `hydrateWorkflow`. Hai bên phải khớp: màn chơi khoá chặt hơn máy chủ
     * thì người làm không gõ nổi lời giải; lỏng hơn thì họ gõ được một thứ máy
     * chủ lặng lẽ bỏ qua, và verdict không giải thích được.
     */
    editable: EDITABLE_PARTS,
    allowedKinds: null,
    objectives: cicdOjObjectives(problem),
    thresholds: NGUONG_NOI,
    /*
     * Chữ gợi ý tới từ máy chủ theo từng lần mở (`useHintReveal`), nên ở đây chỉ
     * cần ĐÚNG SỐ LƯỢNG để màn hình vẽ đủ nút. Chuỗi rỗng là chỗ giữ chỗ, và
     * `oj.hintReveals` là nơi chữ thật đi vào.
     */
    hints: problem.hints.map(() => ''),
    /*
     * Bài OJ theo định nghĩa là bài KHÔNG dạy: không primer, không cheatsheet,
     * không đúc kết. Đề bài là thứ duy nhất người làm được đọc.
     */
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
    theoryId: null,
    /*
     * ⚠ Hai "lời giải" trỏ về chính workflow ban đầu, và đó KHÔNG phải một chỗ
     * điền bừa — đề thi không chở lời giải (`CicdProblemSpec.cd` đã trừ hẳn
     * `solution`/`altSolution` vì lý do này).
     *
     * Hai trường này chỉ nuôi `mergeStageCatalogue` (hộp linh kiện cho stage
     * người chơi tự thêm) và `checkJobShapes`. Trỏ về bản ban đầu cho đúng hành
     * vi mà `gradeCicdProblem` đã chốt: bài OJ chỉ có MỘT workflow đã biết, nên
     * `checkJobShapes(doc, [initialWorkflow], initialWorkflow, …)`. Đưa một
     * workflow khác vào đây sẽ nới khuôn job ở client rộng hơn ở máy chủ, và
     * người làm sẽ thấy "chạy thử được" rồi nộp lên nhận WA.
     */
    solutionWorkflow: spec.workflow,
    altSolutionWorkflow: spec.workflow,
    /*
     * Khối CD của đề. `CicdProblemCd` là `CicdLevelCd` TRỪ hai trường lời giải,
     * nên đắp lại bằng chính `initial` — màn chơi không đọc chúng (chỉ
     * `runLevelCd` đọc `editable`/`initial`/kịch bản), và một bản sao của
     * `initial` là giá trị trung thực nhất có thể đặt vào chỗ không có lời giải.
     */
    ...(spec.cd === undefined
      ? {}
      : { cd: { ...spec.cd, solution: spec.cd.initial, altSolution: spec.cd.initial } }),
  };
}
