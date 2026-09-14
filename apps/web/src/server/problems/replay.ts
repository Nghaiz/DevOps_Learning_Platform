import {
  ALL_KINDS,
  createSession,
  scoreProblemRun,
  sessionReplayEngine,
  type Difficulty,
  type K8sSession,
  type ClusterSpec,
  type Level,
  type ProblemDifficulty,
  type ReplayEngine,
  type RunLog,
  type RunTally,
  type SessionStatus,
} from '@devops-platform/games';
import type { StoredProblem } from './dto';

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
 * Thang bốn bậc của `Problem` → thang ba bậc của `Level`, MẤT THÔNG TIN.
 *
 * Tên hàm nói ra điều đó vì hợp đồng bắt: *"vì hai thang KHÁC nhau, TUYỆT ĐỐI
 * không ánh xạ ngầm giữa chúng — chỗ nào cần đổi qua lại thì viết hàm đổi tường
 * minh và đặt tên nói rõ nó làm mất thông tin."* `hard` và `expert` gộp lại
 * thành `advanced`, và phép gộp đó KHÔNG đảo ngược được.
 *
 * ⚠ Chỉ dùng cho `Level` tổng hợp phục vụ phát lại. KHÔNG dùng nó để hiển thị,
 * để lọc, hay để lưu: ở những chỗ đó bốn bậc là bốn bậc, và một bản đồ về ba bậc
 * sẽ xoá mất đúng ranh giới mà người dùng dựa vào để chọn bài kế tiếp.
 */
export function problemDifficultyToLevelDifficultyLossy(
  difficulty: ProblemDifficulty,
): Difficulty {
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
): (status: SessionStatus, tally: RunTally) => number {
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
