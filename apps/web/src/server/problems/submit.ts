import { TRPCError } from '@trpc/server';
import {
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
   * ⚠ KHÔNG được lưu xuống DB, và điều đó có hệ quả phải biết: `passed`/`total`
   * ở đây là số ĐÚNG tại thời điểm này, nhưng bảng `problem_submissions` chưa
   * có cột nào chở chúng, nên lịch sử nộp bài KHÔNG đọc lại được `WA (4/5)`.
   *
   * Hợp đồng `core/problem.ts` § `Submission` nói rõ vì sao hai trường đó phải
   * là SỰ THẬT LỊCH SỬ chốt tại thời điểm nộp chứ không suy lại từ bài hôm nay:
   * một lượt `WA (4/5)` hôm nay sẽ tự đọc thành `WA (4/7)` sau khi tác giả thêm
   * hai case. Cột `passed text[]` + `total integer` nằm ở `db/schema.ts`, file
   * lane này không sở hữu. Đã báo lead.
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
    grade: gradeOf(verdict.status, passedTestcaseIds(problem, claimed), testcaseTotal(problem)),
  };
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

/**
 * Id các testcase ĐÃ QUA của lượt này.
 *
 * ⛔ Chỉ trả tập thật khi phát lại ĐÃ XÁC MINH — `gradeOf` là chỗ ép điều đó, và
 * nó bỏ tập này đi ở mọi nhánh khác. Lý do phải nói ra: `claimed.objectivesMet`
 * là LỜI KHAI của client, và nó chỉ trở thành sự thật sau khi `verifyRun` chứng
 * minh phát lại ra đúng con số đã khai. Đọc nó mà không qua cổng đó là tin
 * client — đúng thứ mà cả `submit.ts` này tồn tại để không làm.
 *
 * Khử trùng bằng `Set`: một engine trả id trùng sẽ đẩy `passed.length` vượt
 * `total` và cho ra `AC` cho một lượt chưa qua hết.
 */
function passedTestcaseIds(problem: Problem, claimed: RunResult): readonly string[] {
  const ids = new Set(problem.objectives.map((objective) => objective.id));
  // Lọc theo id THẬT của bài: một nhật ký thuộc bản đề cũ có thể mang id không
  // còn tồn tại, và đếm nó vào mẫu số hôm nay là đếm một testcase đã bị xoá.
  return [...new Set(claimed.objectivesMet)].filter((id) => ids.has(id));
}

/**
 * Mẫu số của `n/m`.
 *
 * Đếm MỌI testcase, không chỉ những cái `required` — và đó là chỗ mô hình
 * testcase khác mô hình objective. `core/problem.ts` § `Testcase` nói thẳng:
 * *"Một testcase thì luôn chặn — đó là nghĩa của `AC`."* Cột `solved` bên dưới
 * vẫn đếm theo `required` (hành vi cũ, một câu hỏi khác), nên hai số có thể
 * lệch nhau ở bài có mục tiêu thưởng: `solved: true` mà verdict `WA`. Đó là hợp
 * đồng mới nói đúng, không phải một lỗi.
 */
function testcaseTotal(problem: Problem): number {
  return problemTestcases(problem.objectives).length;
}
