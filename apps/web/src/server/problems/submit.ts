import { TRPCError } from '@trpc/server';
import {
  UnknownProblemGameError,
  gradeOf,
  gradeProblemRun,
  isVerified,
  problemVerdictOf,
  tallyLog,
  type GradeResult,
  type ProblemSubmission,
  type RunLog,
  type RunResult,
  type VerifyResult,
  type VerifyStatus,
} from '@devops-platform/games';
import type { Database } from '../db/client';
import { RATE_LIMIT_WINDOW_MS, checkRateLimit } from '../security/rate-limit';
import { problemSubmissions } from '../db/schema';
import { toSubmissionDTO, type StoredProblem } from './dto';
import {
  UnsupportedReplayGameError,
  expectedLogLevelId,
  hintIdsFromLog,
  isSolved,
  verifyProblemRun,
} from './replay';
import { revealedHintsForOne } from './reveals';

/** Trần của `integer` Postgres — vượt là `22003`, tức 500 thay vì một câu nói được. */
const PG_INT4_MAX = 2_147_483_647;

/**
 * Trần nhịp nộp bài — §18.C.4, nửa "giới hạn nhịp".
 *
 * ## Vì sao cần một trần RIÊNG khi đã có trần mutation chung
 *
 * `protectedProcedure` đã kẹp mọi mutation ở `TRPC_MUTATION_LIMIT_PER_MIN = 20`
 * mỗi phút. Trần đó bảo vệ tRPC nói chung; nó không nhìn thấy rằng MỘT lượt nộp
 * bài đắt hơn hẳn một mutation thường — máy chủ phát lại toàn bộ nhật ký **hai
 * lần** (`verifyRun` phát hai lượt để bắt engine không tất định) rồi chạy mọi vị
 * từ. Hai mươi lượt như thế mỗi phút mỗi người là một cần gạt khuếch đại tải
 * sẵn có, không cần lỗ hổng nào.
 *
 * Con số 6 chọn theo cái nó phải cho phép: một người làm bài thật nộp lại sau
 * mỗi lần sửa, tức hàng chục giây một lượt. Sáu lượt/phút vẫn rộng hơn nhịp đó
 * và hẹp hơn nhịp của một vòng lặp.
 *
 * ⚠ Khoá theo `userId` chứ không theo IP — cùng lý lẽ đã ghi ở `trpc/init.ts`:
 * IP tới từ header giả mạo được, `userId` tới từ session cookie.
 *
 * ⚠ Kế thừa nguyên giới hạn của `checkRateLimit`: bucket in-memory PER-PROCESS,
 * nên nhiều pod web = mỗi pod một bucket, và hạn mức thật rộng hơn con số này
 * đúng N lần. Đủ cho một replica; chỗ sửa khi cần chặt là bucket dùng chung qua
 * Redis, ghi sẵn ở `trpc/init.ts`.
 */
const SUBMIT_LIMIT_PER_MIN = 6;

/**
 * Trần nhịp nộp — ném `TOO_MANY_REQUESTS` khi vượt.
 *
 * Đặt ở `submitProblem` chứ không ở middleware của router: đây là trần của chính
 * VIỆC NỘP BÀI, nên nó phải đi cùng hàm nộp bài. Một chỗ gọi thứ hai tới
 * `submitProblem` (đường thi ở §18.G sẽ có) thừa hưởng trần này mà không phải
 * nhớ tự gắn lại.
 */
function assertSubmitRateLimit(userId: string): void {
  if (!checkRateLimit(`problems:submit:${userId}`, Date.now(), RATE_LIMIT_WINDOW_MS, SUBMIT_LIMIT_PER_MIN)) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: `Bạn đang nộp bài quá nhanh — tối đa ${String(SUBMIT_LIMIT_PER_MIN)} lượt mỗi phút. Hãy đợi một chút rồi nộp lại.`,
    });
  }
}

export interface SubmitProblemResult {
  readonly submission: ProblemSubmission;
  /** Vì sao lượt này được (hay không được) tính điểm. Tầng UI hiển thị nhãn từ `verifyLabel`. */
  readonly verifyStatus: VerifyStatus;
  /** Chi tiết máy móc để ghi log và để gỡ lỗi — KHÔNG phải nhãn cho người dùng. */
  readonly verifyDetail: string;
  /**
   * Verdict của lượt vừa nộp — §18.B.3 và §18.B.5.
   *
   * ĐÃ ĐƯỢC LƯU kể từ 18.C: `passed`/`total` nằm ở hai cột cùng tên trên
   * `problem_submissions`, nên lịch sử nộp bài đọc lại được `WA (4/5)` — xem
   * `submission.passed` / `submission.total` ngay trong chính kết quả này, và
   * `gradeFromSubmission` ở `verdict-view.ts` cho đường dựng lại từ một dòng cũ.
   *
   * Hai giá trị ở đây và hai cột kia là MỘT, không phải hai bản sao: cả hai lấy
   * từ cùng một `GradeResult` bên dưới. Đừng tính lại `passed` ở chỗ đọc.
   */
  readonly grade: GradeResult;
}

/**
 * Ghi một lượt nộp bài, sau khi CHẤM LẠI bằng phát lại nhật ký.
 *
 * ⛔ Không một con số nào trong dòng ghi xuống lấy từ lời khai của client mà
 * không qua kiểm:
 *
 * | Cột | Lấy từ đâu |
 * |---|---|
 * | `passed` / `total` | `gradeProblemRun` — máy chủ tự phát lại nhật ký và tự chấm từng testcase |
 * | `score` | Chỉ ghi khi phát lại KHỚP; lúc đó `claimed.score` đã được chứng minh bằng chính số phát lại ra |
 * | `solved` | Tính từ `objectivesMet` đã phát lại, theo các mục tiêu `required` |
 * | `movesUsed` | Đếm từ `log.actions` theo `COMMAND_KINDS` |
 * | `hintsRevealed` | HỢP của nhật ký và bảng `problem_hint_reveals` |
 * | `durationSeconds` | Giờ treo tường do client khai — KHÔNG xác minh được, xem dưới |
 *
 * Chỗ tinh tế nhất là dòng `score`: dùng `claimed.score` TRÔNG NHƯ tin client,
 * nhưng `verifyRun` chỉ trả `da-xac-minh` khi số phát lại ra bằng đúng số đã
 * khai, nên ở nhánh đó hai giá trị là một. Lấy `claimed.score` khi CHƯA xác minh
 * mới là tin client — và nhánh đó ghi 0.
 *
 * ⚠ `passed` KHÔNG đi qua cổng `verifyRun`, và đó là một khác biệt có chủ ý chứ
 * không phải một chỗ lỏng. `gradeProblemRun` không đọc `claimed` một chữ nào: nó
 * phát lại `log.actions` trên `problem.initialState` rồi chạy vị từ của từng
 * testcase trên trạng thái CUỐI. Kết quả của nó là sự thật của máy chủ dù client
 * khai gì. Hai cột cũ (`score`, `solved`) thì khác — chúng thuộc mô hình
 * `Objective` cũ, và giá trị duy nhất máy chủ cầm cho chúng LÀ lời khai, nên
 * chúng phải đi qua cổng.
 *
 * Một lượt không xác minh được VẪN được ghi, với `solved: false, score: 0`.
 * `verify.ts` §8.3.3 nói rõ: đó vẫn là dữ liệu của người dùng, nó chỉ mất quyền
 * được tính điểm. Nó cũng vẫn phải đếm vào `attemptCount`, nếu không thì tỉ lệ
 * giải được sẽ được tính trên một mẫu đã bị lọc bỏ đúng những lượt thất bại.
 */
export async function submitProblem(
  db: Database,
  problem: StoredProblem,
  userId: string,
  log: RunLog,
  claimed: RunResult,
): Promise<SubmitProblemResult> {
  assertSubmitRateLimit(userId);
  /*
   * ⛔ CỔNG GAME ĐÃ GỠ 2026-09-15 (§18.C cho game thứ hai), và khối này ghi lại
   * nó vì lý do nó tồn tại vẫn còn nguyên giá trị.
   *
   * Bản trước từ chối thẳng mọi bài không phải K8s, với lời khai đúng ở thời
   * điểm viết: `problemReplayEngine` → `problemAsLevel` dựng một `Level` của
   * K8s, nên một bài Git `published` — đường đã mở từ migration 0015, vì chỗ tra
   * bài ở `routers/problems.ts` lọc theo `code` + `state` chứ không theo game —
   * chỉ có đúng một kết cục là `phat-lai-loi`.
   *
   * Thứ thay thế nó KHÔNG phải một cái kiểu rộng hơn: `verifyProblemRun` tách
   * đường theo `gameId` và mỗi game giữ adapter riêng. Phép ném của
   * `problemAsLevel` vẫn ở nguyên chỗ cũ và vẫn phải ở đó — nó là chỗ nói ra
   * rằng một `WorldSpec` của Git không bao giờ được xuống reducer K8s.
   *
   * Cổng chuyển thành: game nào chưa có adapter phát lại thì
   * `UnsupportedReplayGameError`, bắt ở dưới. `INTERNAL_SERVER_ERROR` chứ không
   * phải `BAD_REQUEST` vì người nộp không làm gì sai — một bài xuất bản thuộc
   * game chưa có đường chấm là lỗi cấu hình nền tảng.
   */
  if (log.levelId !== expectedLogLevelId(problem)) {
    // Kiểm trước để trả một câu nói được. Để `sessionReplayEngine.init` tự ném
    // thì nó về dưới dạng `phat-lai-loi` — nhãn ấy nghĩa là "lỗi bộ mô phỏng"
    // và sẽ gửi người đọc log đi tìm bug ở engine.
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Nhật ký thuộc bài "${log.levelId}", không phải "${problem.code}"`,
    });
  }

  // HỢP của hai nguồn, không phải chỉ nhật ký. Nhật ký do client dựng, nên gọi
  // thẳng `revealHint` mà không ghi action tương ứng sẽ đọc gợi ý miễn phí nếu
  // chỉ tin nhật ký; bảng `problem_hint_reveals` là vế mà client không viết được.
  // Chiều ngược lại cũng cần: một action `hint` trong nhật ký mà không có dòng
  // tương ứng vẫn phải bị trừ, vì nội dung gợi ý có thể đã tới từ một phiên
  // trước trên máy khác.
  const fromServer = await revealedHintsForOne(db, userId, problem.code);
  const revealedIds = [...new Set([...fromServer, ...hintIdsFromLog(problem, log)])].sort();

  const verdict = verifyOrExplain(problem, log, claimed, revealedIds);
  const verified = isVerified(verdict);
  const tally = tallyLog(log);
  const grade = gradeSubmission(problem, log, verdict.status);
  warnOnVerdictDivergence(problem, userId, claimed, grade);

  const rows = await db
    .insert(problemSubmissions)
    .values({
      problemCode: problem.code,
      userId,
      solved: verified && isSolved(problem, claimed.objectivesMet),
      score: verified ? claimed.score : 0,
      durationSeconds: claimedDurationSeconds(claimed),
      movesUsed: Math.min(tally.commandsUsed, PG_INT4_MAX),
      // Đã khử trùng và sắp ở trên: hai lượt nộp cùng tập gợi ý ra cùng một
      // mảng, nên chỗ đọc so sánh được mà không phải tự sắp lại.
      hintsRevealed: revealedIds,
      // ⛔ Chép NGUYÊN VĂN từ `grade`, không tính lại từ `problem.objectives`:
      // hai phép tính là hai cơ hội lệch, và cái lệch đó sẽ nằm im trong DB.
      passed: [...grade.passed],
      total: grade.total,
      // ⛔ Chép từ `grade` như hai dòng trên, cùng một lý do. Đây là vế đóng khe
      // §0.3a: nhánh `engine-khong-tat-dinh` ngay dưới ghi `passed = []` với
      // `total > 0`, và nếu không chốt mã ở đây thì đọc lại sẽ ra `WA (0/n)`
      // cho một lượt máy chủ đã kết luận là KHÔNG chấm được.
      failCode: grade.failedCode,
    })
    .returning();

  const row = rows[0];
  if (row === undefined) {
    // `INSERT … RETURNING` không có `ON CONFLICT` thì hoặc ném hoặc trả một
    // dòng. Nhánh này không tới được, nhưng một `!` ở đây sẽ là chỗ duy nhất
    // trong file nói dối trình biên dịch.
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Không ghi được lượt nộp' });
  }

  return {
    submission: toSubmissionDTO(row),
    verifyStatus: verdict.status,
    verifyDetail: verdict.detail,
    grade,
  };
}

/**
 * Xác minh, và đổi một game-thiếu-adapter thành một câu nói được.
 *
 * `verifyProblemRun` ném `UnsupportedReplayGameError` thay vì trả một
 * `VerifyResult` hỏng — có chủ ý, vì hai thứ đó cần hai câu khác nhau trên màn
 * hình. Một `VerifyResult` hỏng hiện ra là *"không xác minh được"*, tức đổ lỗi
 * cho người nộp về một mảnh nền tảng còn thiếu. Ở đây nó thành 500 kèm tên game.
 */
function verifyOrExplain(
  problem: StoredProblem,
  log: RunLog,
  claimed: RunResult,
  revealedIds: readonly string[],
): VerifyResult {
  try {
    return verifyProblemRun(problem, log, claimed, revealedIds);
  } catch (error) {
    if (error instanceof UnsupportedReplayGameError) {
      // ⛔ Bắt theo LỚP, không so chuỗi thông điệp — cùng lý do đã ghi ở
      // `gradeSubmission` bên dưới cho `UnknownProblemGameError`.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Bài "${problem.code}" thuộc game "${error.gameId}" nhưng hệ thống chưa có đường chấm lại cho game đó`,
      });
    }
    throw error;
  }
}

/**
 * §18.C.3 — lệch verdict client/server thì GHI LOG, không chặn.
 *
 * ## Vì sao không chặn, và vì sao vẫn phải ghi
 *
 * Plan nói thẳng lý do không chặn: *"lệch là dấu hiệu bug tất định, không nhất
 * thiết là gian lận"*. Hai engine chạy cùng một hàm chấm (`gradeProblemRun`), nên
 * một lệch ở đây gần như luôn có nghĩa là một trong hai phía chạy bản mã KHÁC —
 * một tab mở từ hôm qua, một lần triển khai đang dở. Chặn nó là từ chối người
 * học vì lỗi triển khai của chúng ta.
 *
 * Vẫn phải ghi vì đây là tín hiệu DUY NHẤT của việc engine mất tính tất định
 * giữa hai môi trường. `verifyRun` bắt được chiều *"cùng máy chủ, hai lần phát
 * lại khác nhau"*; nó KHÔNG bắt được chiều *"trình duyệt và Node cho hai kết quả
 * khác nhau"* — mà đó đúng là chiều §18.C sợ, và là chiều duy nhất làm mọi lượt
 * nộp hợp lệ bị từ chối cùng lúc.
 *
 * ## Verdict của client là một SUY RA, không phải một trường gửi lên
 *
 * Client không gửi verdict — nó gửi `objectivesMet` + `objectivesTotal`, và
 * `problemVerdictOf` là phép suy DUY NHẤT từ cặp đó (`core/problem.ts`). Thêm
 * một trường `verdict` vào input là gửi cùng một sự thật hai lần, đúng thứ quy
 * ước "No Derived Fields" cấm — và tệ hơn, nó sẽ là một trường client tự điền,
 * tức một lời khai thứ hai phải kiểm.
 *
 * ⚠ Ô này KHÔNG dư so với `verifyRun`. `verifyRun` so `objectivesMet` từng id và
 * đã bắt mọi lệch — nhưng nó gộp tất cả vào một `khong-khop` chung, và câu
 * `khong-khop` không phân biệt "client khai thừa một id" với "client nói AC còn
 * máy chủ nói WA". Cái sau là cái đáng báo động; dòng log này là chỗ nó có tên.
 */
function warnOnVerdictDivergence(
  problem: StoredProblem,
  userId: string,
  claimed: RunResult,
  grade: GradeResult,
): void {
  /*
   * Bỏ qua nhánh `CE`: nó KHÔNG phải một verdict về lượt chơi mà là lời khai
   * "lượt này không chấm được", và client không có cách nào tự kết luận điều đó
   * — nó không chạy `verifyRun`. So một `CE` của máy chủ với một `AC`/`WA` suy
   * từ lời khai sẽ báo động ở mọi lượt trượt xác minh, tức biến dòng log này
   * thành tiếng ồn và không ai đọc nữa.
   */
  if (grade.verdict === 'CE') {
    return;
  }
  const clientVerdict = problemVerdictOf(
    new Set(claimed.objectivesMet).size,
    claimed.objectivesTotal,
  );
  if (clientVerdict === grade.verdict) {
    return;
  }
  console.warn('[problems:submit] verdict client lệch verdict máy chủ', {
    code: problem.code,
    gameId: problem.gameId,
    userId,
    clientVerdict,
    serverVerdict: grade.verdict,
    clientPassed: new Set(claimed.objectivesMet).size,
    clientTotal: claimed.objectivesTotal,
    serverPassed: grade.passed.length,
    serverTotal: grade.total,
  });
}

/**
 * Chấm lượt này theo MÔ HÌNH TESTCASE — máy chủ tự phát lại, tự chạy vị từ.
 *
 * ⛔ `gradeProblemRun` là hàm dùng chung của cả client lẫn máy chủ, và đó không
 * phải chuyện gọn gàng: §18.C.3 đem so verdict hai bên, nên hai bên chấm bằng
 * hai đoạn mã khác nhau thì một lệch nhau chỉ nói về hai hàm chứ không nói gì về
 * lượt chơi. Đừng viết lại `passed === total` ở đây.
 *
 * ## `seed` lấy từ NHẬT KÝ, không phải một hằng
 *
 * `log.seed` là số client đã dùng THẬT để dựng thế giới đầu. Tự đặt một hằng ở
 * đây là mở lại đúng cái hố mà `core/problem.ts` § `Submission.seed` ghi lại:
 * hai bên chọn hai hằng khác nhau (`K8S_UNSEEDED_REPLAY_SEED = 0` vs
 * `GIT_UNSEEDED_REPLAY_SEED = 1`) thì máy chủ phát lại trên một thế giới KHÁC,
 * và mọi lượt nộp hợp lệ đều bị từ chối — nhìn từ phía người dùng nó giống hệt
 * một hệ thống từ chối người chơi ngẫu nhiên.
 *
 * ## MỌI trạng thái không-xác-minh-được đều về `CE` — đổi 2026-09-15
 *
 * Bản trước chỉ đặc cách `engine-khong-tat-dinh`, với lý lẽ: log hỏng hay reducer
 * ném thì `gradeProblemRun` cũng tự trả `CE`, còn `khong-khop` *"chỉ nói rằng lời
 * khai điểm của client sai — một câu về `claimed`, không phải một câu về nhật ký"*.
 *
 * Lý lẽ đó nghe được nhưng nó để lại một chỗ mà HAI phần của mã trả lời khác
 * nhau cho cùng một lượt, và review đối kháng 2026-09-15 đo ra:
 * `verdictFromVerify` ánh xạ `khong-khop` → `CE`, trong khi đường này để
 * `gradeProblemRun` trả `AC`. Dòng ghi xuống mang `solved: false, score: 0`
 * (đúng) cạnh `passed` đầy đủ và `failCode: null`, nên lịch sử hiện **`AC`** cho
 * một lượt vừa TRƯỢT xác minh. Người học đọc ra "AC, 0 điểm, chưa giải" — ba câu
 * mâu thuẫn nhau trên cùng một dòng.
 *
 * Chủ dự án chốt (2026-09-15): hiện `CE`. `CE` trong hợp đồng nghĩa là *"lượt
 * chơi không chạy tới nơi, nên `passed`/`total` không nói lên gì"*, và một lượt
 * không chứng minh được chính nó đúng là ca đó.
 *
 * Hệ quả phụ, đáng có: nhánh không-xác-minh nay KHÔNG gọi `gradeProblemRun` nữa,
 * nên máy chủ bỏ được một lượt phát lại toàn bộ nhật ký cho đúng những lượt
 * không dùng tới kết quả ấy.
 *
 * ⚠ `gradeProblemRun` vẫn là chỗ chấm DUY NHẤT cho nhánh đã xác minh — đừng viết
 * lại `passed === total` ở đây; §18.C.3 đem so verdict hai bên.
 */
function gradeSubmission(problem: StoredProblem, log: RunLog, status: VerifyStatus): GradeResult {
  // Đã qua biên đọc ở `toProblemDTO` — KHÔNG gọi `problemTestcases` lần nữa.
  const testcases = problem.testcases;
  if (status !== 'da-xac-minh') {
    // `gradeOf` tự ánh xạ từng `VerifyStatus` sang mã hỏng tương ứng, nên cột
    // `fail_code` nay chốt được CẢ BỐN nhánh `CE` chứ không riêng một nhánh.
    return gradeOf(status, [], testcases.length);
  }
  try {
    return gradeProblemRun({
      gameId: log.gameId,
      initialState: problem.initialState,
      /*
       * ⛔ NỐI 2026-09-15. Bản trước bỏ trống `targetState`, và khe đó im lặng
       * cho tới đúng bài đầu tiên cần nó: `gradeGitProblem` trả `CE` cho MỌI
       * testcase gọi `graphShapeMatches` khi bài không khai cây đích — kể cả khi
       * bài ĐÃ khai và cột `target_state` đã có dữ liệu từ migration 0015. Tức
       * một bài soạn đúng đọc ra thành một bài soạn thiếu.
       *
       * Trải CÓ ĐIỀU KIỆN, không viết thẳng: `exactOptionalPropertyTypes` phân
       * biệt "không có khoá" với "có khoá, giá trị `undefined`", và plugin Git
       * đọc `targetState === undefined` để quyết `CE`. Cùng khuôn mà
       * `gradeProblemRun` đã dùng ở chỗ nó chuyển tiếp xuống plugin.
       */
      ...(problem.targetState === undefined ? {} : { targetState: problem.targetState }),
      actions: log.actions,
      testcases,
      seed: log.seed,
    });
  } catch (error) {
    if (error instanceof UnknownProblemGameError) {
      // ⛔ Bắt theo LỚP, không so chuỗi thông điệp: thông điệp là tiếng Việt cho
      // người đọc và sẽ được sửa lại lúc nào đó; lớp thì không đổi trong im lặng.
      //
      // `INTERNAL_SERVER_ERROR` chứ không phải `BAD_REQUEST`: người nộp không
      // làm gì sai. Một bài `published` thuộc game chưa có plugin chấm là một
      // lỗi CẤU HÌNH của nền tảng, và trả 400 sẽ gửi người dùng đi sửa lượt chơi
      // của họ.
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Bài này thuộc game "${error.gameId}" nhưng hệ thống chưa có bộ chấm cho game đó`,
      });
    }
    throw error;
  }
}

/**
 * Giờ treo tường do client khai.
 *
 * ⚠ KHÔNG xác minh được, và cố ý không giả vờ xác minh: `verify.ts` nói rõ
 * `startedAt`/`finishedAt` không nằm trong nhật ký nên phát lại không tái tạo
 * được chúng. Ở đây chỉ kẹp về khoảng mà cột `integer` biểu diễn được — một số
 * âm (đồng hồ máy nhảy lùi) hoặc một số vượt trần `int4` sẽ nổ `22003` ở
 * Postgres, tức một input hỏng của client đọc ra như một sự cố máy chủ.
 *
 * Hệ quả phải nhớ ở chỗ dùng: cột này KHÔNG dùng làm khoá xếp hạng được.
 */
function claimedDurationSeconds(claimed: RunResult): number {
  const millis = claimed.finishedAt - claimed.startedAt;
  if (!Number.isFinite(millis) || millis <= 0) {
    return 0;
  }
  return Math.min(Math.round(millis / 1000), PG_INT4_MAX);
}
