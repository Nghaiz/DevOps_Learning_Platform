import { TRPCError } from '@trpc/server';
import {
  UnknownProblemGameError,
  gradeProblemRun,
  isVerified,
  tallyLog,
  verifyRun,
  type GradeResult,
  type Problem,
  type ProblemSubmission,
  type RunLog,
  type RunResult,
  type VerifyStatus,
} from '@devops-platform/games';
import type { Database } from '../db/client';
import { problemSubmissions } from '../db/schema';
import { toSubmissionDTO } from './dto';
import { hintIdsFromLog, isSolved, problemReplayEngine, expectedLogLevelId } from './replay';
import { revealedHintsForOne } from './reveals';
import { problemTestcases } from './testcases';
import { gradeOf } from './verdict-view';

/** Trần của `integer` Postgres — vượt là `22003`, tức 500 thay vì một câu nói được. */
const PG_INT4_MAX = 2_147_483_647;

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
  problem: Problem,
  userId: string,
  log: RunLog,
  claimed: RunResult,
): Promise<SubmitProblemResult> {
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

  const engine = problemReplayEngine(problem, revealedIds);
  const verdict = verifyRun(log, claimed, engine);
  const verified = isVerified(verdict);
  const tally = tallyLog(log);
  const grade = gradeSubmission(problem, log, verdict.status);

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
 * ## `engine-khong-tat-dinh` là nhánh DUY NHẤT còn phải hỏi `verifyRun`
 *
 * `gradeProblemRun` phát lại MỘT lần, nên nó không phát hiện được một engine
 * không tất định — nó chỉ trả một trong nhiều kết quả có thể, trông hoàn toàn
 * bình thường. `verifyRun` phát lại hai lần và bắt được. Ở nhánh đó không con số
 * nào đáng tin, kể cả số của chính lần phát lại này, nên `passed` bị bỏ và
 * verdict về `CE` — đúng nghĩa mà hợp đồng gán cho `CE`: *"lượt chơi không chạy
 * tới nơi, nên `passed`/`total` không nói lên gì."*
 *
 * Bốn trạng thái còn lại của `verifyRun` KHÔNG cần hỏi: log hỏng hay reducer ném
 * thì chính `gradeProblemRun` cũng trả `CE` (plugin bọc phần phát lại trong
 * `try/catch`), còn `khong-khop` chỉ nói rằng *lời khai điểm* của client sai —
 * một câu về `claimed`, không phải một câu về nhật ký.
 */
function gradeSubmission(problem: Problem, log: RunLog, status: VerifyStatus): GradeResult {
  const testcases = problemTestcases(problem.objectives);
  if (status === 'engine-khong-tat-dinh') {
    return gradeOf(status, [], testcases.length);
  }
  try {
    return gradeProblemRun({
      gameId: log.gameId,
      initialState: problem.initialState,
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
