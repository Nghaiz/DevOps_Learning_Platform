import {
  problemDifficultyToLevelDifficultyLossy,
  scoreProblemRun,
  tallyLog,
  type GitLevel,
  type GitObjective,
  type GitPredicateName,
  type ProblemDifficulty,
  type RunLog,
  type RunResult,
  type WorldSpec,
} from '@devops-platform/games';

/**
 * `Problem` → `GitLevel` ở PHÍA CLIENT, nửa còn lại của hợp đồng mà
 * `server/problems/replay.ts` § `problemAsGitLevel` dựng ở phía máy chủ.
 *
 * ⛔ ĐỌC TRƯỚC KHI SỬA MỘT DÒNG NÀO Ở ĐÂY.
 *
 * Máy chủ không tin điểm client gửi lên: nó phát lại nhật ký trên `GitLevel` mà
 * NÓ tự dựng, rồi chỉ ghi nhận khi kết quả khớp lời khai. Nên hai bản dựng level
 * phải ra cùng một thứ từng trường. Lệch một điểm thì **mọi lượt nộp hợp lệ đều
 * bị từ chối**, và triệu chứng không đọc ra như một lỗi ánh xạ — nó đọc ra như
 * một hệ thống từ chối người chơi ngẫu nhiên.
 *
 * File này thuần, không React, không mạng: đó là điều kiện để ô gác
 * `problem-level.test.ts` ép nó qua ĐÚNG fixture JSON mà ô gác máy chủ dùng, và
 * so hai bên bằng con số chứ bằng lời hứa.
 *
 * ── ⛔ KHE CÓ THẬT: wire của NGƯỜI HỌC không chở `check`/`args` ──
 *
 * `server/problems/testcases.ts` § `toTestcaseTeasers` cắt `check` và `args` của
 * MỌI testcase trước khi dữ liệu rời máy chủ — kể cả testcase hiện, kể cả với
 * tác giả. Đó là §18.B.4 và nó cố ý: *"nhãn là đề bài; tên vị từ và tham số là
 * cách chấm"*.
 *
 * Hệ quả không tránh được: một client chỉ có `problems.byCode` **không thể tự
 * chấm**, nên nó cũng không thể khai `objectivesMet` — và `verifyRun` so đúng
 * trường đó. Vì vậy `gitOjGradable` là một cổng THẬT chứ không phải một phép
 * kiểm phòng xa: chưa có `check` thì màn chơi phải nói ra rằng chưa nộp được,
 * chứ không được nộp một lời khai rỗng rồi để người chơi nhận `CE`.
 */

/**
 * Một testcase như CLIENT nhìn thấy nó.
 *
 * `check`/`args` là TUỲ CHỌN vì hai đường dây trả hai hình dạng khác nhau:
 * `problems.byCode` trả `TestcaseTeaser` (không có), `problems.forEdit` trả
 * `Testcase` đầy đủ (có). Khai một kiểu nhận cả hai, rồi hỏi `gitOjGradable`,
 * thay vì hai kiểu song song — hai kiểu là hai nhánh dựng level và chúng sẽ trôi.
 */
export interface GitOjTestcase {
  readonly id: string;
  /** `null` khi testcase ẩn và người làm chưa nộp lần nào. */
  readonly label: string | null;
  readonly visible: boolean;
  /** Vắng ⇒ wire người học đã che. Xem khối đầu file. */
  readonly check?: string;
  readonly args?: Readonly<Record<string, unknown>>;
}

export interface GitOjHint {
  readonly id: string;
  readonly penaltyPoints: number;
  /** Máy chủ nói, không phải client tự khai. Vào thẳng phép tính điểm. */
  readonly revealed: boolean;
  readonly text: string | null;
}

/** Phần của một bài OJ mà việc dựng level cần. Cố ý hẹp hơn `SolverProblem`. */
export interface GitOjProblem {
  readonly code: string;
  readonly title: string;
  readonly statement: string;
  readonly difficulty: ProblemDifficulty;
  readonly initialState: unknown;
  readonly targetState?: unknown;
  readonly testcases: readonly GitOjTestcase[];
  readonly hints: readonly GitOjHint[];
  readonly parMoves: number | null;
}

/**
 * Nhãn hiện lên khi testcase ẩn và người làm chưa nộp lần nào.
 *
 * Một chuỗi rỗng ở đây sẽ thành một dòng trống trong danh sách mục tiêu, và một
 * dòng trống đọc ra như một lỗi render. Nói thẳng rằng nó tồn tại và chưa có tên
 * là cách duy nhất giữ mẫu số `n/m` trung thực mà không nói dối về nội dung.
 */
const NHAN_TESTCASE_AN = 'Testcase ẩn chưa hiện tên';


/**
 * Bài này có chấm được không.
 *
 * ⛔ ĐỔI NGHĨA 2026-09-15, và đổi nghĩa chứ không nới. Bản trước hỏi *"client có
 * đủ `check` để tự chấm chưa"*, vì lúc đó client là bên chấm. Nay máy chủ chấm
 * (`problems.tryGrade`) nên câu hỏi đó không còn ai hỏi — client KHÔNG BAO GIỜ
 * có `check`, và đòi nó sẽ tắt nút nộp của mọi người học vĩnh viễn.
 *
 * Câu còn lại vẫn là một cổng THẬT: `problemVerdictOf(0, 0)` trả `CE`, nên một
 * bài không testcase nào là một bài không ai nộp được — và màn hình phải nói ra
 * điều đó thay vì để nút nộp dẫn tới một `CE` khó hiểu. Cổng xuất bản đã chặn ca
 * này (`publishIssues` đòi ≥1 testcase), nên đây là lưới thứ hai cho một bài lọt
 * qua bằng đường khác.
 */
export function gitOjGradable(problem: GitOjProblem): boolean {
  return problem.testcases.length > 0;
}

/**
 * Bài OJ → `GitLevel` mà `createGitSession` chạy được.
 *
 * Bốn điểm dưới đây là hợp đồng với `problemAsGitLevel` phía máy chủ; mỗi cái có
 * một ô gác riêng ở `problem-level.test.ts`.
 */
export function gitOjLevel(problem: GitOjProblem): GitLevel {
  const objectives: readonly GitObjective[] = problem.testcases.map((testcase) => ({
    id: testcase.id,
    label: testcase.label ?? NHAN_TESTCASE_AN,
    /*
     * (2) Ép kiểu KHÔNG kiểm lại tên vị từ, y như phía máy chủ, và đó là một
     * quyết định chứ không phải một chỗ lười. Một tên lạ rơi ra ngoài `switch`
     * của `evaluatePredicate` ở CẢ HAI phía như nhau, nên hai bên vẫn khớp và
     * `verifyRun` vẫn `da-xac-minh`; chỗ duy nhất còn giữ cổng tên vị từ là
     * `gradeGitProblem`, và nó trả `CE` kèm đúng tên testcase gõ sai. Dựng một
     * bản sao thứ hai của luật đó ở đây là dựng một thứ sẽ trôi.
     *
     * `check` vắng mặt thì `gitOjGradable` đã chặn từ trước — chuỗi rỗng dưới
     * đây không bao giờ tới engine ở đường nộp bài.
     */
    check: (testcase.check ?? '') as GitPredicateName,
    ...(testcase.args === undefined ? {} : { args: testcase.args }),
    /*
     * (3) `required: true` cho MỌI testcase. Quyết định #20: *"một testcase thì
     * luôn chặn — đó là nghĩa của AC"*. `false` ở đây sẽ làm `verdictOf` trên màn
     * báo `AC` trong khi máy chủ chấm `WA`, vì `isSolved` phía kia đếm mọi
     * testcase.
     */
    required: true,
  }));

  return {
    /*
     * (1) `problem.code`, KHÔNG phải một hằng riêng cho level tổng hợp.
     *
     * Ba chỗ phải khớp nhau: `getLog()` ghi `levelId: level.id`, `verifyRun` so
     * `log.levelId` với `claimed.levelId`, và `submitProblem` so tiếp với
     * `expectedLogLevelId(problem)` — mà hàm đó trả thẳng `problem.code`. Một id
     * khác ở đây là `BAD_REQUEST` ngay trước khi phát lại chạy dòng nào.
     */
    id: problem.code,
    /*
     * Chương 1 là chỗ ĐẶT TẠM có ý thức, không phải một phân loại. `GitLevel`
     * đòi `chapter` để hiện tiêu đề chương, còn `Problem` không có khái niệm
     * chương nào. Cùng giá trị máy chủ chọn, nên hai bên không lệch.
     */
    chapter: 1,
    title: problem.title,
    mission: problem.title,
    brief: problem.statement,
    difficulty: problemDifficultyToLevelDifficultyLossy(problem.difficulty),
    setup: problem.initialState as WorldSpec,
    /*
     * Trải CÓ ĐIỀU KIỆN. `exactOptionalPropertyTypes: true` phân biệt "không có
     * khoá" với "có khoá, giá trị `undefined`", và `createGitSession` đọc
     * `level.target === undefined` để quyết dựng cây đích hay không. Viết thẳng
     * `target: problem.targetState` đỏ ở `tsc`.
     */
    ...(problem.targetState === undefined ? {} : { target: problem.targetState as WorldSpec }),
    /*
     * (4) `null` chứ KHÔNG phải `[]`. Hai giá trị mang nghĩa NGƯỢC nhau: `null`
     * = cho dùng mọi lệnh, `[]` = cấm mọi lệnh. `[]` ở đây không ném và không
     * báo gì — nó chỉ làm mọi lệnh người chơi gõ thành vô tác dụng, tức một bài
     * không bao giờ giải được và không một dòng log nào nói tại sao.
     */
    allowedCommands: null,
    objectives,
    /*
     * Chỉ chở TEXT. `revealHint(index)` chặn `index >= level.hints.length` rồi
     * thoát sớm, nên ĐỘ DÀI mới là thứ có nghĩa: mảng ngắn hơn thật thì một lượt
     * mở gợi ý im lặng không xảy ra, và `hintsUsed` của hai bên lệch nhau.
     *
     * `text` là `null` với gợi ý chưa mở (wire người học che nội dung), và chuỗi
     * rỗng ở đây chỉ GIỮ CHỖ cho đúng độ dài — nó không còn là nội dung sẽ hiện.
     * Chữ thật tới từ `problems.revealHint` và đi vào qua tham số thứ hai của
     * `session.revealHint(index, text)`; xem `lib/use-hint-reveal.ts`.
     *
     * ⚠ Vế cuối của lời khai cũ — *"đường mở gợi ý trong chế độ OJ chưa nối"* —
     * đã nối 2026-09-15 (C3). Trước đó nút "Mở gợi ý" trừ điểm rồi đẩy ra đúng
     * dòng *"Gợi ý 1: "*, vì `engine.ts` nội suy chính chuỗi rỗng này.
     */
    hints: problem.hints.map((hint) => hint.text ?? ''),
    // Rỗng là đúng nghĩa, không phải chỗ giữ chỗ: một `Problem` theo định nghĩa
    // là bài KHÔNG dạy. Cùng lời khai như phía máy chủ.
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
    theoryId: null,
    // Bài OJ không khai lời giải mẫu ở đâu cả. Rỗng đọc ra đúng "không có lời
    // giải mẫu"; một chuỗi bịa ra sẽ làm màn chơi mọc nút chạy lời giải cho một
    // bài chưa ai chứng minh là giải được.
    solutionCommands: [],
    altSolutionCommands: [],
    par: problem.parMoves ?? 0,
  };
}

/**
 * Id gợi ý đã mở TRONG chính nhật ký này.
 *
 * Bản sao của `hintIdsFromLog` phía máy chủ, và bản sao này bắt buộc phải khớp
 * từng phần tử: nó đi thẳng vào `scoreProblemRun`, mà điểm là một trong sáu
 * trường `verifyRun` so. Ánh xạ theo CHỈ SỐ vì nhật ký ghi chỉ số chứ không ghi
 * id — engine không biết bài, nó chỉ biết level.
 */
function idGoiYTrongNhatKy(problem: GitOjProblem, log: RunLog): readonly string[] {
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

export interface GitOjClaimInput {
  readonly problem: GitOjProblem;
  readonly log: RunLog;
  /**
   * Id testcase đã đạt, **do MÁY CHỦ tính** (`problems.tryGrade`).
   *
   * ⛔ Từng là `status: SessionStatus` của phiên cục bộ, và hình dạng đó KHÔNG
   * dựng được cho người học: `toTestcaseTeasers` cắt `check`/`args` của mọi
   * testcase, nên `evaluatePredicate` trả `undefined` và `status.objectivesMet`
   * luôn RỖNG. Lời khai rỗng ⇒ `verifyRun` ra `khong-khop` ⇒ `CE` cho một lượt
   * chơi ĐÚNG.
   *
   * ⚠ Hệ quả phải nói ra: lời khai nay là một tiếng VỌNG của chính máy chủ, nên
   * phép so `objectivesMet`/`score` trong `verifyRun` **không còn là một nhân
   * chứng độc lập** cho bài Git. Thứ vẫn gác thật: hai lượt phát lại của
   * `verifyRun` (tính tất định), và `levelId`/`seed`/`commandsUsed`/`hintsUsed`
   * — cả bốn suy từ chính NHẬT KÝ chứ không từ máy chủ.
   *
   * Đó là cái giá của quyết định 2026-09-15, và nó rẻ hơn đường kia: giữ một
   * nhân chứng độc lập đòi client cầm được cách chấm, tức phá §18.B.4.
   */
  readonly objectivesMet: readonly string[];
  readonly startedAt: number;
  readonly finishedAt: number;
}

/**
 * Lời khai của client về một lượt làm bài Git — thứ máy chủ chấm lại.
 *
 * ## `commandsUsed`/`hintsUsed` đếm từ NHẬT KÝ, không từ `status`
 *
 * Khác `buildRunResult` của đấu trường K8s, và khác có chủ ý. `verifyRun` so lời
 * khai với `tallyLog(log)` — tức với chính nhật ký — chứ không với trạng thái
 * phiên. Lấy `status.movesUsed` là lấy một con số ĐỒNG NGHĨA nhưng do một đoạn
 * mã khác tính, và hai đoạn mã đồng nghĩa là hai cơ hội lệch. Đếm từ nhật ký thì
 * hai bên không thể lệch, vì cả hai cùng đọc một mảng.
 *
 * ## `score` gọi `scoreProblemRun`, KHÔNG gọi `computeScore`
 *
 * `computeScore` trừ điểm gợi ý qua tỉ lệ `hintsUsed/hintsAvailable`;
 * `scoreProblemRun` truyền 0/0 vào đó rồi trừ thẳng `penaltyPoints`. Hai công
 * thức ra hai số khác nhau ngay khi bài có gợi ý, và máy chủ dùng cái thứ hai.
 * (Đấu trường K8s hôm nay dùng cái thứ nhất — một khe riêng của đường K8s, ghi
 * lại ở báo cáo lane, không phải thứ chép sang đây.)
 *
 * ## `revealedHintIds` là HỢP hai nguồn, y như máy chủ
 *
 * Máy chủ gộp bảng `problem_hint_reveals` với gợi ý mở trong nhật ký. Client
 * không đọc được bảng đó, nhưng `problems.byCode` đã trả cờ `revealed` của chính
 * người đang xem — đó LÀ vế thứ nhất. Vế thứ hai đọc từ nhật ký.
 *
 * ✅ ĐÃ ĐÓNG 2026-09-18 (khe ghi ở đây ngày 2026-09-15). `toAuthorProblem` từng
 * đặt cứng `revealed: true` cho mọi gợi ý, nên một tác giả nộp bài CỦA MÌNH mà
 * bài có gợi ý tính điểm sẽ khai điểm thấp hơn máy chủ và nhận `CE`. Nay cờ đó
 * đọc từ bảng `problem_hint_reveals` ở CẢ HAI nhánh, và `text` là thứ duy nhất
 * đường tác giả nới ra — xem `server/problems/solver.ts` § `toAuthorProblem` và
 * `core/problem.ts` § `ProblemHintTeaser`. Đừng viết lại phép suy "tác giả thì
 * revealed" ở đây: nó là chính khe vừa đóng.
 */
export function gitOjClaim(input: GitOjClaimInput): RunResult {
  const { problem, log, objectivesMet, startedAt, finishedAt } = input;
  const tally = tallyLog(log);
  const revealedHintIds = [
    ...new Set([
      ...problem.hints.filter((hint) => hint.revealed).map((hint) => hint.id),
      ...idGoiYTrongNhatKy(problem, log),
    ]),
  ].sort();

  return {
    // (5) Khai TƯỜNG MINH. `submitProblem` chốt cả `log.gameId` lẫn
    // `claimed.gameId` về `problem.gameId` và trả `BAD_REQUEST` khi lệch.
    gameId: 'git',
    levelId: problem.code,
    seed: log.seed,
    startedAt,
    finishedAt,
    objectivesMet,
    objectivesTotal: problem.testcases.length,
    commandsUsed: tally.commandsUsed,
    hintsUsed: tally.hintsUsed,
    score: scoreProblemRun({
      // Khử trùng bằng `Set`: `ProblemScoreInput` đòi id KHÁC NHAU, và phía máy
      // chủ cũng khử. Một engine trả trùng sẽ đẩy tỉ lệ vượt 100% ở đúng một bên.
      objectivesMet: new Set(objectivesMet).size,
      objectivesTotal: problem.testcases.length,
      movesUsed: tally.commandsUsed,
      parMoves: problem.parMoves,
      hints: problem.hints.map((hint) => ({
        id: hint.id,
        // `text` KHÔNG đi vào phép tính điểm, và nó thường là `null` ở phía
        // client. Chuỗi rỗng ở đây chỉ để thoả kiểu `ProblemHint`.
        text: hint.text ?? '',
        penaltyPoints: hint.penaltyPoints,
      })),
      revealedHintIds,
    }),
  };
}
