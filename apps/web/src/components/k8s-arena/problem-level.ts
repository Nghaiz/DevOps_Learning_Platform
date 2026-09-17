import {
  ALL_KINDS,
  problemDifficultyToLevelDifficultyLossy,
  scoreProblemRun,
  tallyLog,
  type ClusterSpec,
  type Level,
  type Objective,
  type ProblemDifficulty,
  type ResourceKind,
  type RunLog,
  type RunResult,
} from '@devops-platform/games';

/**
 * `Problem` → `Level` ở PHÍA CLIENT, nửa còn lại của hợp đồng mà
 * `server/problems/replay.ts` § `problemAsLevel` dựng ở phía máy chủ.
 *
 * ⛔ ĐỌC TRƯỚC KHI SỬA MỘT DÒNG NÀO Ở ĐÂY.
 *
 * Máy chủ không tin điểm client gửi lên: nó phát lại nhật ký trên `Level` mà NÓ
 * tự dựng, rồi chỉ ghi nhận khi kết quả khớp lời khai. Nên hai bản dựng level
 * phải ra cùng một thứ ở mọi trường engine ĐỌC. Lệch một điểm thì **mọi lượt nộp
 * hợp lệ đều bị từ chối**, và triệu chứng không đọc ra như một lỗi ánh xạ — nó
 * đọc ra như một hệ thống từ chối người chơi ngẫu nhiên.
 *
 * File này là bản K8s của `components/games/git/problem-level.ts`. Hai bản riêng
 * chứ không phải một bản chung, vì `Level` (K8s) và `GitLevel` là hai kiểu khác
 * nhau ở gần như mọi trường — một hàm chung sẽ là một `switch` trả union, và
 * chỗ gọi vẫn phải hẹp lại bằng tay.
 *
 * File này thuần, không React, không mạng: đó là điều kiện để ô gác
 * `problem-level.test.ts` ép nó qua ĐÚNG fixture mà ô gác máy chủ dùng, và so
 * hai bên bằng con số chứ bằng lời hứa.
 *
 * ── ⛔ KHE CÓ THẬT: wire của NGƯỜI HỌC không chở `check`/`args` ──
 *
 * `server/problems/testcases.ts` § `toTestcaseTeasers` cắt `check` và `args` của
 * MỌI testcase trước khi dữ liệu rời máy chủ — kể cả testcase hiện, kể cả với
 * tác giả. Đó là §18.B.4 và nó cố ý: *"nhãn là đề bài; tên vị từ và tham số là
 * cách chấm"*.
 *
 * Hệ quả dây chuyền, và nó lớn hơn vẻ ngoài: không có `check` thì
 * `evaluateObjectives` của engine bỏ qua mọi mục tiêu (`session.ts` §
 * `evaluateObjectives` — *"vị từ lạ tính là CHƯA đạt và không ném"*), nên phiên
 * chơi cục bộ KHÔNG BAO GIỜ tới pha `won` và `status.objectivesMet` luôn RỖNG.
 * Client vì thế không tự chấm được và không khai được `objectivesMet` — trường
 * mà `verifyRun` so. Đó là lý do `k8sOjClaim` nhận `objectivesMet` từ MÁY CHỦ
 * (`problems.tryGrade`), không đọc `engine.status`.
 */

/**
 * Một testcase như CLIENT nhìn thấy nó — `TestcaseTeaser` của `problems.byCode`.
 *
 * KHÔNG khai `check`/`args`, khác bản Git. Bản kia để chúng tuỳ chọn vì lúc viết
 * nó còn một đường thứ hai (`problems.forEdit`) chở dữ liệu đầy đủ; đường đó đã
 * gỡ ngày 2026-09-15 khi máy chủ nhận việc chấm. Khai một trường mà không đường
 * dây nào điền là mời người sau viết một nhánh "nếu có check thì tự chấm" — tức
 * dựng lại đúng thứ vừa tháo ra.
 */
export interface K8sOjTestcase {
  readonly id: string;
  /** `null` khi testcase ẩn và người làm chưa nộp lần nào. */
  readonly label: string | null;
  readonly visible: boolean;
}

export interface K8sOjHint {
  readonly id: string;
  readonly penaltyPoints: number;
  /** Máy chủ nói, không phải client tự khai. Vào thẳng phép tính điểm. */
  readonly revealed: boolean;
  readonly text: string | null;
}

/** Phần của một bài OJ mà việc dựng level cần. Cố ý hẹp hơn `SolverProblem`. */
export interface K8sOjProblem {
  readonly code: string;
  readonly title: string;
  readonly statement: string;
  readonly difficulty: ProblemDifficulty;
  readonly initialState: unknown;
  /** `null` = cho dùng MỌI loại tài nguyên. Xem `k8sOjLevel`. */
  readonly allowedResources: readonly ResourceKind[] | null;
  readonly testcases: readonly K8sOjTestcase[];
  readonly hints: readonly K8sOjHint[];
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
 * `problemVerdictOf(0, 0)` trả `CE`, nên một bài không testcase nào là một bài
 * không ai nộp được — và màn hình phải nói ra điều đó thay vì để nút nộp dẫn tới
 * một `CE` khó hiểu. Cổng xuất bản đã chặn ca này (`publishIssues` đòi ≥1
 * testcase), nên đây là lưới thứ hai cho một bài lọt qua bằng đường khác.
 *
 * ⛔ KHÔNG hỏi *"client có đủ `check` để tự chấm chưa"*. Client KHÔNG BAO GIỜ có
 * `check` (§18.B.4), nên câu hỏi đó sẽ tắt nút nộp của mọi người học vĩnh viễn —
 * đúng cái bẫy bản Git đã rơi vào rồi phải gỡ.
 */
export function k8sOjGradable(problem: K8sOjProblem): boolean {
  return problem.testcases.length > 0;
}

/**
 * Bài OJ → `Level` mà `createSession` chạy được.
 *
 * Năm điểm dưới đây là hợp đồng với `problemAsLevel` phía máy chủ; mỗi cái có
 * một ô gác riêng ở `problem-level.test.ts`.
 */
export function k8sOjLevel(problem: K8sOjProblem): Level {
  const objectives: readonly Objective[] = problem.testcases.map((testcase) => ({
    id: testcase.id,
    label: testcase.label ?? NHAN_TESTCASE_AN,
    /*
     * (2) Chuỗi RỖNG, vì wire của người học không chở `check` — và đây là chỗ
     * bản K8s khác bản máy chủ một cách KHÔNG tránh được.
     *
     * `evaluateObjectives` tra `PREDICATES[check]`, thấy `undefined` thì `continue`
     * (không ném — `session.ts` ghi rõ: *"level viết sai thì hỏng một level; ném
     * ở đây thì hỏng cả phiên chơi"*). Hệ quả: mục tiêu không bao giờ đạt ở phía
     * client, phiên không bao giờ tới pha `won`, và `status.objectivesMet` rỗng.
     *
     * Điều đó KHÔNG làm lệch phép xác minh, vì lời khai không lấy `objectivesMet`
     * từ phiên cục bộ mà lấy từ `problems.tryGrade` — xem `K8sOjClaimInput`.
     * Thứ nó có làm mất là phản hồi tại chỗ: người chơi không thấy mục tiêu nào
     * tự sáng lên. Đó là cái giá của §18.B.4, và nó phải hiện trên màn chứ không
     * nằm trong chú thích này.
     */
    check: '',
    /*
     * `args` không trải: wire không chở nó, và một khoá `args: undefined` khác
     * với không có khoá dưới `exactOptionalPropertyTypes: true`.
     */
    /*
     * (3) `required: true` cho MỌI testcase. Quyết định #20: *"một testcase thì
     * luôn chặn — đó là nghĩa của AC"*. `false` ở đây sẽ làm màn báo thắng trong
     * khi máy chủ chấm `WA`, vì `isSolved` phía kia đếm mọi testcase.
     */
    required: true,
  }));

  return {
    /*
     * (1) `problem.code`, KHÔNG phải một hằng riêng cho level tổng hợp.
     *
     * Ba chỗ phải khớp nhau: `getLog()` ghi `levelId: level.id`, `verifyRun` so
     * `log.levelId` với `claimed.levelId`, và `submitProblem`/`tryGradeProblem`
     * so tiếp với `expectedLogLevelId(problem)` — mà hàm đó trả thẳng
     * `problem.code`. Một id khác ở đây là `BAD_REQUEST` ngay trước khi phát lại
     * chạy dòng nào.
     *
     * ⚠ Đây là trường mà đường K8s đã SAI suốt từ 18.C tới 2026-09-15: cửa vào
     * cũ cho người chơi chọn một level trong `LEVELS`, nên `log.levelId` là
     * `k8s-NN-…` và không lượt nộp nào qua nổi cổng trên.
     */
    id: problem.code,
    /*
     * `0` = "không thuộc chương nào", cùng giá trị máy chủ chọn. Khác bản Git
     * (`1`) vì `GitLevel.chapter` là union `1 | 2 | 3` còn `Level.chapter` nhận
     * số bất kỳ — không phải hai bên bất đồng, mà hai kiểu khác nhau.
     */
    chapter: 0,
    title: problem.title,
    // `mission` là dòng nhiệm vụ một câu mà giao diện hiện thường trực. Bài OJ
    // không có ô riêng cho nó — cả đề bài NẰM ở `statement` — nên dùng tiêu đề.
    mission: problem.title,
    brief: problem.statement,
    difficulty: problemDifficultyToLevelDifficultyLossy(problem.difficulty),
    initialState: problem.initialState as ClusterSpec,
    /*
     * (4) `ALL_KINDS` chứ KHÔNG phải `[]` khi bài không giới hạn. Hai giá trị
     * mang nghĩa NGƯỢC nhau: `null` của `Problem` = "cho dùng mọi loại", `[]`
     * của `Level` = "cấm mọi loại". `[]` ở đây làm mọi lượt phát lại của mọi bài
     * "không giới hạn" trượt, im lặng, vì một action bị chặn không phải một lỗi.
     */
    allowedResources: problem.allowedResources ?? ALL_KINDS,
    objectives,
    /*
     * Chỉ chở TEXT. `revealHint(index)` chặn `index >= level.hints.length` rồi
     * thoát sớm, nên ĐỘ DÀI mới là thứ có nghĩa: mảng ngắn hơn thật thì một lượt
     * mở gợi ý im lặng không xảy ra, và `hintsUsed` của hai bên lệch nhau.
     *
     * `text` là `null` với gợi ý chưa mở (wire người học che nội dung), và chuỗi
     * rỗng ở đây KHÔNG còn là nội dung sẽ hiện ra — nó chỉ giữ chỗ để độ dài
     * đúng. Chữ thật tới từ `problems.revealHint` lúc người chơi mở, qua
     * `lib/use-hint-reveal.ts`.
     *
     * ⚠ Lời khai cũ ở đây — *"chuỗi rỗng ở đó là đúng nghĩa, engine chỉ in nó ra
     * khi người chơi tự mở"* — ĐÚNG về cơ chế và SAI về hệ quả: người chơi tự mở
     * thì đúng là in ra, và thứ in ra là một ô trống sau khi đã trừ điểm. Đó là
     * C3, vá 2026-09-15.
     */
    hints: problem.hints.map((hint) => hint.text ?? ''),
    /*
     * (5) `?? 0`, y như máy chủ. `0` KHÔNG có nghĩa "mốc chuẩn là không nước đi
     * nào": `efficiencyScore` có nhánh `parMoves <= 0` trả trọn phần hiệu quả.
     */
    parMoves: problem.parMoves ?? 0,
    // Rỗng là đúng nghĩa, không phải chỗ giữ chỗ: một `Problem` theo định nghĩa
    // là bài KHÔNG dạy. Cùng lời khai như phía máy chủ.
    teaches: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
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
function idGoiYTrongNhatKy(problem: K8sOjProblem, log: RunLog): readonly string[] {
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

export interface K8sOjClaimInput {
  readonly problem: K8sOjProblem;
  readonly log: RunLog;
  /**
   * Id testcase đã đạt, **do MÁY CHỦ tính** (`problems.tryGrade`).
   *
   * ⛔ KHÔNG phải `engine.status.objectivesMet`. `toTestcaseTeasers` cắt
   * `check`/`args` của mọi testcase, nên `evaluateObjectives` bỏ qua tất cả và
   * trường đó luôn RỖNG ở phía client. Lời khai rỗng ⇒ `verifyRun` ra
   * `khong-khop` ⇒ `CE` cho một lượt chơi ĐÚNG.
   *
   * ⚠ Hệ quả phải nói ra: lời khai nay là một tiếng VỌNG của chính máy chủ, nên
   * phép so `objectivesMet`/`score` trong `verifyRun` **không còn là một nhân
   * chứng độc lập** cho bài K8s — y như bài Git từ 2026-09-15. Thứ vẫn gác thật:
   * hai lượt phát lại của `verifyRun` (tính tất định), và
   * `levelId`/`seed`/`commandsUsed`/`hintsUsed` — cả bốn suy từ chính NHẬT KÝ
   * chứ không từ máy chủ.
   */
  readonly objectivesMet: readonly string[];
  readonly startedAt: number;
  readonly finishedAt: number;
}

/**
 * Lời khai của client về một lượt làm bài K8s — thứ máy chủ chấm lại.
 *
 * ## `commandsUsed`/`hintsUsed` đếm từ NHẬT KÝ, không từ `status`
 *
 * Khác `buildRunResult` của chế độ LEVEL, và khác có chủ ý. `verifyRun` so lời
 * khai với `tallyLog(log)` — tức với chính nhật ký — chứ không với trạng thái
 * phiên. Lấy `status.movesUsed` là lấy một con số ĐỒNG NGHĨA nhưng do một đoạn
 * mã khác tính, và hai đoạn mã đồng nghĩa là hai cơ hội lệch.
 *
 * ## `score` gọi `scoreProblemRun`, KHÔNG gọi `computeScore`
 *
 * Đây là khe thứ ba của đường K8s, vá cùng lượt này. `computeScore` trừ điểm
 * gợi ý qua tỉ lệ `hintsUsed/hintsAvailable`; `scoreProblemRun` truyền 0/0 vào
 * đó rồi trừ thẳng `penaltyPoints`. Hai công thức ra hai số khác nhau **ngay khi
 * bài có một gợi ý được mở**, và máy chủ dùng cái thứ hai (`problemScoreRun`).
 * `buildRunResult` vẫn dùng `computeScore` và điều đó vẫn ĐÚNG — cho chế độ
 * LEVEL, nơi `recordRun` là bên đọc. Hai chế độ, hai công thức, một chỗ mỗi cái.
 *
 * ## `revealedHintIds` là HỢP hai nguồn, y như máy chủ
 *
 * Máy chủ gộp bảng `problem_hint_reveals` với gợi ý mở trong nhật ký. Client
 * không đọc được bảng đó, nhưng `problems.byCode` đã trả cờ `revealed` của chính
 * người đang xem — đó LÀ vế thứ nhất. Vế thứ hai đọc từ nhật ký.
 */
export function k8sOjClaim(input: K8sOjClaimInput): RunResult {
  const { problem, log, objectivesMet, startedAt, finishedAt } = input;
  const tally = tallyLog(log);
  const revealedHintIds = [
    ...new Set([
      ...problem.hints.filter((hint) => hint.revealed).map((hint) => hint.id),
      ...idGoiYTrongNhatKy(problem, log),
    ]),
  ].sort();

  return {
    // Khai TƯỜNG MINH. `submitProblem` chốt cả `log.gameId` lẫn `claimed.gameId`
    // về `problem.gameId` và trả `BAD_REQUEST` khi lệch.
    gameId: 'k8s',
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
