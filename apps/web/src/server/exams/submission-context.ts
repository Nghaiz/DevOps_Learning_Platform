import { TRPCError } from '@trpc/server';
import { and, arrayContains, eq, isNull } from 'drizzle-orm';

import type { Database } from '../db/client';
import { classMembers, examAttempts, exams } from '../db/schema';
import { examSubmissionRejection } from './attempt-seed';
import { isAttemptClosed } from './clock';
import { getAttemptFor, getExamForStudent, type AttemptRow } from './crud';

/**
 * Lượt nộp này thuộc KỲ THI nào — và nếu thuộc, nó có được tính không (§18.G).
 *
 * ## Vì sao máy chủ phải tự SUY, không chờ client khai `examId`
 *
 * Bảng điểm (`scoreboard.ts`) gán lượt nộp vào lượt thi theo CỬA SỔ THỜI GIAN:
 * mọi lượt nộp bài trong đề, nằm trong `[started_at, hạn]`, đều được tính. Trước
 * khi có phép suy, ba cổng của kỳ thi (đúng đề, còn giờ, đúng seed) chỉ chạy khi
 * client GỬI `examId` — nên một lượt nộp từ trang luyện tập bình thường, trong
 * lúc lượt thi đang mở, đi vòng qua cả ba cổng mà vẫn rơi vào bảng điểm. Một cổng
 * mà người bị gác tự chọn có chạy hay không thì không phải một cổng.
 *
 * Nên: người nộp đang có một lượt thi MỞ mà đề chứa bài này ⇒ lượt nộp là lượt
 * thi, áp đủ luật thi, y như khi họ gửi `examId` tường minh. Không có lượt nào
 * như thế ⇒ luyện tập, không đổi một dòng nào so với trước.
 *
 * ## "Mở" nghĩa là gì
 *
 * Đúng `!isAttemptClosed(...)` của `clock.ts` — chưa bấm nộp VÀ chưa quá
 * `attemptDeadline` (thời lượng ảnh chụp lẫn `closes_at` của kỳ thi). Lượt hết
 * giờ mà bỏ dở KHÔNG mở, nên lượt nộp sau đó là luyện tập. Không dựng lại phép
 * tính hạn ở đây: SQL chỉ lọc thô (`submitted_at is null`), phép phán cuối đi qua
 * đúng hàm mà mọi đường khác của kỳ thi dùng.
 *
 * ## Vì sao giữ điều kiện thành viên lớp
 *
 * Cùng phép lọc với `getExamForStudent` — cổng quyền của mọi đường người học. Một
 * sinh viên đã bị gỡ khỏi lớp không còn vào được kỳ thi đó (NOT_FOUND), nên lượt
 * thi cũ của họ cũng không được kéo lượt nộp luyện tập của họ vào luật thi.
 */

export interface OpenExamAttempt {
  readonly examId: string;
  readonly title: string;
  readonly problemCodes: readonly string[];
  readonly closesAt: Date | null;
  readonly attempt: AttemptRow;
}

/**
 * Mọi lượt thi CÒN MỞ của người này mà đề chứa `problemCode`, mới bắt đầu nhất
 * trước. `userId` là `ctx.user.id` — không bao giờ lấy từ input.
 */
export async function findOpenAttemptsContaining(
  db: Database,
  userId: string,
  problemCode: string,
  now: Date,
): Promise<readonly OpenExamAttempt[]> {
  const rows = await db
    .select({
      examId: exams.id,
      title: exams.title,
      problemCodes: exams.problemCodes,
      closesAt: exams.closesAt,
      userId: examAttempts.userId,
      seed: examAttempts.seed,
      durationMinutes: examAttempts.durationMinutes,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
    })
    .from(examAttempts)
    .innerJoin(exams, eq(exams.id, examAttempts.examId))
    .innerJoin(
      classMembers,
      and(eq(classMembers.classId, exams.classId), eq(classMembers.userId, userId)),
    )
    .where(
      and(
        eq(examAttempts.userId, userId),
        // Lọc thô; "còn giờ" phán bằng `isAttemptClosed` ngay dưới.
        isNull(examAttempts.submittedAt),
        arrayContains(exams.problemCodes, [problemCode]),
      ),
    );

  return rows
    .map(
      (row): OpenExamAttempt => ({
        examId: row.examId,
        title: row.title,
        problemCodes: row.problemCodes,
        closesAt: row.closesAt,
        attempt: {
          examId: row.examId,
          userId: row.userId,
          seed: row.seed,
          durationMinutes: row.durationMinutes,
          startedAt: row.startedAt,
          submittedAt: row.submittedAt,
        },
      }),
    )
    .filter((open) => !isAttemptClosed(open.attempt, open.closesAt, now))
    .sort((a, b) => {
      const byStart = b.attempt.startedAt.getTime() - a.attempt.startedAt.getTime();
      if (byStart !== 0) {
        return byStart;
      }
      // Phá hoà cho tất định: hai lượt mở cùng một mili-giây vẫn ra cùng một lựa
      // chọn ở mọi lần nộp.
      return a.examId < b.examId ? -1 : a.examId > b.examId ? 1 : 0;
    });
}

/**
 * Cổng kỳ thi của `problems.submit`. Trả về khi lượt nộp được nhận (luyện tập,
 * hoặc lượt thi hợp lệ); NÉM khi luật thi từ chối nó.
 *
 * ## Hai đường vào, một bộ luật
 *
 * | Input | Lượt thi áp luật | Không khớp thì |
 * |---|---|---|
 * | có `examId` | lượt của CHÍNH kỳ thi đó | NOT_FOUND (không thuộc lớp) / FORBIDDEN (chưa mở lượt, bài ngoài đề, hết giờ, lệch seed) |
 * | không có | lượt mở MỚI NHẤT có chứa bài này | không có lượt nào ⇒ luyện tập |
 *
 * `examId` là một GỢI Ý tường minh, không phải một công tắc tắt phép suy: gửi một
 * `examId` không khớp một lượt mở chứa bài này thì bị TỪ CHỐI, không rơi về luyện
 * tập. Rơi về luyện tập ở đó là im lặng làm khác điều người gọi đã nói.
 *
 * ⚠ Nhiều lượt mở cùng chứa bài này (hai kỳ thi chồng giờ, cùng một bài) ⇒ chọn
 * lượt BẮT ĐẦU GẦN NHẤT. Đó là lượt người học nhiều khả năng đang ngồi làm. Lưu ý
 * giới hạn: `problem_submissions` không có cột `exam_id`, nên bảng điểm vẫn gán
 * lượt nộp đó cho MỌI lượt thi có cửa sổ chứa nó — phép chọn ở đây chỉ quyết định
 * luật (seed) nào được áp. Client muốn chắc thì gửi `examId`.
 *
 * ## `FORBIDDEN` chứ không `BAD_REQUEST`
 *
 * Người nộp không gửi dữ liệu hỏng; họ gửi một lượt hợp lệ mà luật kỳ thi không
 * nhận. Xem `exam-format.md` §5.
 */
export async function assertExamSubmission(
  db: Database,
  userId: string,
  submission: {
    readonly examId?: string | undefined;
    readonly problemCode: string;
    readonly seed: number;
  },
  now: Date,
): Promise<void> {
  const context =
    submission.examId === undefined
      ? await inferredContext(db, userId, submission.problemCode, now)
      : await explicitContext(db, userId, submission.examId);
  if (context === null) {
    return;
  }
  const rejection = examSubmissionRejection(
    {
      problemCodes: context.problemCodes,
      attemptSeed: context.attempt.seed,
      attempt: context.attempt,
      closesAt: context.closesAt,
    },
    { problemCode: submission.problemCode, seed: submission.seed },
    now,
  );
  if (rejection !== null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: context.inferred
        ? // Người học KHÔNG gửi `examId` nên không biết vì sao luật thi chạm tới
          // mình — câu lỗi phải nói ra kỳ thi nào đang giữ bài này.
          `${rejection} (bạn đang có lượt thi mở "${context.title}" chứa bài này)`
        : rejection,
    });
  }
}

interface ResolvedContext {
  readonly title: string;
  readonly problemCodes: readonly string[];
  readonly closesAt: Date | null;
  readonly attempt: AttemptRow;
  readonly inferred: boolean;
}

async function inferredContext(
  db: Database,
  userId: string,
  problemCode: string,
  now: Date,
): Promise<ResolvedContext | null> {
  // Mới bắt đầu nhất trước — xem khối "Nhiều lượt mở" ở `assertExamSubmission`.
  const [latest] = await findOpenAttemptsContaining(db, userId, problemCode, now);
  return latest === undefined ? null : { ...latest, inferred: true };
}

async function explicitContext(
  db: Database,
  userId: string,
  examId: string,
): Promise<ResolvedContext> {
  // Lọc theo tư cách thành viên lớp: `examId` của lớp khác ⇒ NOT_FOUND, nên trường
  // này trên dây chọn LUẬT áp dụng chứ không cấp thêm quyền nào.
  const exam = await getExamForStudent(db, examId, userId);
  const attempt = await getAttemptFor(db, examId, userId);
  if (attempt === null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bạn chưa mở lượt thi này, nên bài nộp không được tính',
    });
  }
  // Bài ngoài đề / hết giờ / lệch seed: `examSubmissionRejection` ở chỗ gọi nói
  // ra đúng câu cho từng ca — tức `examId` không khớp một lượt MỞ chứa bài này
  // thì luôn bị từ chối kèm lý do, không bao giờ rơi về luyện tập.
  return {
    title: exam.title,
    problemCodes: exam.problemCodes,
    closesAt: exam.closesAt,
    attempt,
    inferred: false,
  };
}
