import {
  ALL_KINDS,
  createSession,
  scoreProblemRun,
  sessionReplayEngine,
  type Difficulty,
  type K8sSession,
  type Level,
  type Problem,
  type ProblemDifficulty,
  type ReplayEngine,
  type RunLog,
  type RunTally,
  type SessionStatus,
} from '@devops-platform/games';

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
export function expectedLogLevelId(problem: Problem): string {
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
export function problemAsLevel(problem: Problem): Level {
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
    initialState: problem.initialState,
    allowedResources: problem.allowedResources ?? ALL_KINDS,
    objectives: problem.objectives,
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
  problem: Problem,
  revealedHintIds: readonly string[],
): (status: SessionStatus, tally: RunTally) => number {
  return (status, tally) =>
    scoreProblemRun({
      objectivesMet: new Set(status.objectivesMet).size,
      objectivesTotal: problem.objectives.length,
      movesUsed: tally.commandsUsed,
      parMoves: problem.parMoves,
      hints: problem.hints,
      revealedHintIds,
    });
}

export function problemReplayEngine(
  problem: Problem,
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
export function hintIdsFromLog(problem: Problem, log: RunLog): readonly string[] {
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
 * Đã giải được chưa — theo các mục tiêu BẮT BUỘC.
 *
 * Mục tiêu thưởng (`required: false`) ăn điểm nhưng không chặn, nên một lượt đạt
 * hết phần bắt buộc vẫn là "đã giải". Đọc `objectivesMet` ĐÃ ĐƯỢC PHÁT LẠI XÁC
 * MINH, không phải một cờ client gửi lên.
 */
export function isSolved(problem: Problem, objectivesMet: readonly string[]): boolean {
  const met = new Set(objectivesMet);
  const required = problem.objectives.filter((objective) => objective.required);
  // Bài không có mục tiêu bắt buộc nào là bài không chấm được — trả `false` thay
  // vì `true` theo kiểu "mọi phần tử của tập rỗng đều thoả". Cổng xuất bản chặn
  // hình dạng đó, nên tới được đây nghĩa là dữ liệu đã hỏng ở đâu đó.
  if (required.length === 0) {
    return false;
  }
  return required.every((objective) => met.has(objective.id));
}
