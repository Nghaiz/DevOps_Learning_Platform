import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

import { examAttempts, exams } from '../db/schema';

/**
 * Cửa sổ CHẤM của một lượt thi — SSOT. Một lượt nộp bài trong đề được tính cho
 * lượt thi iff `submitted_at` của nó nằm trong:
 *
 * ```
 * [exam_attempts.started_at, least(exam_attempts.submitted_at, hạn)]
 * hạn = least(started_at + duration_minutes, coalesce(exams.closes_at, 'infinity'))
 * ```
 *
 * Hai đầu đều đóng. `hạn` là đúng `attemptDeadline` của `clock.ts`, dựng lại bằng
 * SQL vì nó là một phép TÍNH chứ không phải một cột (`schema.ts` § `exam_attempts`).
 *
 * ## Vì sao đầu phải dừng ở lúc BẤM NỘP chứ không ở hạn
 *
 * Nộp bài thì lượt thi khoá, nhưng người học vẫn mở được bài đó và nộp như luyện
 * tập (lượt nộp không kèm `examId` luôn là luyện tập, `exam-format.md` §5). Cửa
 * sổ dừng ở hạn thì những lượt giải SAU khi bấm nộp vẫn rơi vào bảng điểm — người
 * nộp sớm được thêm thời gian mà không ai thấy.
 *
 * ## Một định nghĩa, ba chỗ đọc
 *
 * Bảng điểm (`scoreboard.ts`), CSV (dựng từ chính bảng điểm đó) và dấu `solved`
 * của màn làm bài (`exam-problems.ts`) đều lọc bằng `inScoringWindow`. Lệch nhau
 * thì sinh viên thấy dấu tích mà giảng viên không thấy điểm.
 *
 * ⚠ Mảnh SQL tham chiếu `exam_attempts` và `exams` bằng TÊN BẢNG, không bí danh:
 * câu truy vấn dùng nó phải join hai bảng đó mà không đặt alias.
 *
 * `'infinity'` chứ không phải một ngày xa: `timestamptz` của Postgres có giá trị vô
 * cực thật, còn một hằng "năm 9999" là một quả bom hẹn giờ.
 */
export function scoringWindowEnd(): SQL {
  return sql`least(
    coalesce(${examAttempts.submittedAt}, 'infinity'::timestamptz),
    ${examAttempts.startedAt} + make_interval(mins => ${examAttempts.durationMinutes}),
    coalesce(${exams.closesAt}, 'infinity'::timestamptz)
  )`;
}

/** `submittedAt` (mốc của lượt NỘP BÀI) nằm trong cửa sổ chấm — xem `scoringWindowEnd`. */
export function inScoringWindow(submittedAt: SQLWrapper): SQL {
  return sql`(${submittedAt} >= ${examAttempts.startedAt} and ${submittedAt} <= ${scoringWindowEnd()})`;
}
