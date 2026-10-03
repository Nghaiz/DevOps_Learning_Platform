import { sql } from 'drizzle-orm';

import type { Database } from '../db/client';
import { examAttempts, exams } from '../db/schema';
import { effectiveSubmittedAt, wasAutoSubmitted } from './clock';
import { getExam, listAttemptRows } from './crud';
import { inScoringWindow } from './scoring-window';

/**
 * Bảng điểm của MỘT kỳ thi (§18.G.6).
 *
 * ⛔ Cùng cảnh báo như `classes/scoreboard.ts`: cả file này là dữ liệu của
 * người khác. Đường vào duy nhất là `adminProcedure`, và
 * `exams/authz.integration.test.ts` gác điều đó bằng cách DUYỆT bảng procedure
 * lúc chạy chứ không bằng một lời hứa trong chú thích.
 *
 * ## ⚠ Lượt nộp NGOÀI cửa sổ thi không được tính, và đây là chỗ dễ sai nhất
 *
 * Một sinh viên có thể đã giải `K8S-0001` từ tuần trước. Nếu phép gộp chỉ lọc
 * theo `problem_code` thì bài làm tuần trước đó rơi thẳng vào bảng điểm kỳ thi
 * — không lỗi, không cảnh báo, và điểm trông hoàn toàn hợp lý. Nên mọi lượt
 * nộp phải nằm trong cửa sổ chấm của CHÍNH lượt thi đó:
 * `[started_at, least(submitted_at, hạn)]`.
 *
 * Định nghĩa cửa sổ sống ở MỘT chỗ — `scoring-window.ts` — và dấu `solved` của
 * màn làm bài (`exam-problems.ts`) đọc cùng mảnh SQL đó. CSV dựng từ chính bảng
 * điểm này nên không có định nghĩa riêng.
 *
 * ## Một lượt thi, nhiều lần nộp: lấy lần TỐT NHẤT của từng bài
 *
 * `distinct on (user_id, problem_code)` sắp theo số testcase đã qua giảm dần.
 * Cùng lý do đã ghi ở `classes/scoreboard.ts`: cộng dồn mọi lượt sẽ thưởng cho
 * việc nộp đi nộp lại. Hoà thì lấy lượt MỚI nhất — người nộp lại bằng điểm
 * thường là người vừa sửa xong một thứ khác.
 */

export interface ExamScoreCell {
  readonly problemCode: string;
  /** `null` = chưa nộp bài này lần nào trong lượt thi. */
  readonly passed: number | null;
  readonly total: number | null;
  readonly solved: boolean;
  /** Mã lý do hỏng của lượt tốt nhất, nếu có. Cho phép hiện `CE` thay vì `WA 0/n`. */
  readonly failCode: string | null;
}

export interface ExamScoreRow {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly startedAt: string;
  /** Mốc nộp HIỆU LỰC — hết giờ mà bỏ dở thì là đúng hạn. `null` = còn đang làm. */
  readonly submittedAt: string | null;
  /** `null` = lượt chưa khoá nên câu hỏi chưa có nghĩa. */
  readonly autoSubmitted: boolean | null;
  readonly cells: readonly ExamScoreCell[];
  /** Số bài giải trọn vẹn. */
  readonly solvedCount: number;
  /** Tổng testcase đã qua trên tổng testcase của cả đề đã thử. */
  readonly passedTotal: number;
  readonly caseTotal: number;
}

export interface ExamScoreboard {
  readonly examId: string;
  readonly title: string;
  readonly className: string;
  readonly problemCodes: readonly string[];
  readonly rows: readonly ExamScoreRow[];
}

interface RawBest {
  readonly user_id: string;
  readonly problem_code: string;
  readonly passed: number;
  readonly total: number;
  readonly solved: boolean;
  readonly fail_code: string | null;
}

export async function examScoreboard(
  db: Database,
  examId: string,
  now: Date,
): Promise<ExamScoreboard> {
  // NOT_FOUND cho một kỳ thi không tồn tại thay vì một bảng rỗng: "chưa ai vào
  // làm" và "không có kỳ thi đó" là hai câu trả lời khác nhau.
  const exam = await getExam(db, examId);
  const attempts = await listAttemptRows(db, examId);

  // `exam_attempts` và `exams` join KHÔNG bí danh, có chủ ý: `inScoringWindow`
  // tham chiếu hai bảng đó bằng tên bảng (`scoring-window.ts`).
  const raw = await db.execute(sql`
    select distinct on (ps.user_id, ps.problem_code)
      ps.user_id                            as user_id,
      ps.problem_code                       as problem_code,
      coalesce(array_length(ps.passed, 1), 0)::int as passed,
      ps.total::int                         as total,
      ps.solved                             as solved,
      ps.fail_code                          as fail_code
    from problem_submissions ps
    join ${examAttempts}
      on ${examAttempts.userId} = ps.user_id
     and ${examAttempts.examId} = ${examId}
    join ${exams} on ${exams.id} = ${examAttempts.examId}
    where ps.problem_code = any(${exams.problemCodes})
      and ${inScoringWindow(sql`ps.submitted_at`)}
    order by
      ps.user_id,
      ps.problem_code,
      coalesce(array_length(ps.passed, 1), 0) desc,
      ps.submitted_at desc
  `);

  // Khoá gộp `<userId>::<problemCode>`. Dấu `::` chứ không phải một ký tự
  // điều khiển: bản đầu dùng NUL và nó lọt vào nguồn dưới dạng một byte vô
  // hình, tức một dòng mã không đọc lại được bằng mắt.
  const best = new Map<string, RawBest>();
  for (const row of raw as unknown as readonly RawBest[]) {
    best.set(`${row.user_id}::${row.problem_code}`, row);
  }

  const rows = attempts.map((attempt): ExamScoreRow => {
    const closesAt = exam.closesAt === null ? null : new Date(exam.closesAt);
    const clock = {
      startedAt: attempt.startedAt,
      durationMinutes: attempt.durationMinutes,
      submittedAt: attempt.submittedAt,
    };
    const cells = exam.problemCodes.map((problemCode): ExamScoreCell => {
      const hit = best.get(`${attempt.userId}::${problemCode}`);
      return hit === undefined
        ? { problemCode, passed: null, total: null, solved: false, failCode: null }
        : {
            problemCode,
            passed: hit.passed,
            total: hit.total,
            solved: hit.solved,
            failCode: hit.fail_code,
          };
    });
    const submitted = effectiveSubmittedAt(clock, closesAt, now);
    return {
      userId: attempt.userId,
      name: attempt.name,
      email: attempt.email,
      startedAt: attempt.startedAt.toISOString(),
      submittedAt: submitted?.toISOString() ?? null,
      autoSubmitted: wasAutoSubmitted(clock, closesAt, now),
      cells,
      solvedCount: cells.filter((cell) => cell.solved).length,
      passedTotal: cells.reduce((sum, cell) => sum + (cell.passed ?? 0), 0),
      caseTotal: cells.reduce((sum, cell) => sum + (cell.total ?? 0), 0),
    };
  });

  /*
   * Sắp theo SỐ, `user_id` phá hoà. KHÔNG sắp theo tên: Postgres bản alpine
   * chạy trên musl, không có locale, nên nó xếp mọi ký tự tiếng Việt có dấu
   * xuống sau `Z` — "Đặng" đứng sau "Zulu" và không lỗi nào báo. Bẫy này đã
   * ghi ở `classes/scoreboard.ts`, và đây là chỗ thứ hai nó có thể cắn.
   */
  const sorted = [...rows].sort((a, b) => {
    if (a.solvedCount !== b.solvedCount) {
      return b.solvedCount - a.solvedCount;
    }
    if (a.passedTotal !== b.passedTotal) {
      return b.passedTotal - a.passedTotal;
    }
    return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
  });

  return {
    examId: exam.id,
    title: exam.title,
    className: exam.className,
    problemCodes: exam.problemCodes,
    rows: sorted,
  };
}
