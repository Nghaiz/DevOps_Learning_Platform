import { z } from 'zod';

import { attemptDeadline, isAttemptClosed, remainingMs } from '../../exams/clock';
import {
  getAttemptFor,
  getExamForStudent,
  listExamsForStudent,
  startAttempt,
  submitAttempt,
} from '../../exams/crud';
import { createTRPCRouter, protectedProcedure } from '../init';

/**
 * `examSitting.*` — màn LÀM BÀI của người học (18.G.4, 18.G.5).
 *
 * ## Vì sao nó là một router riêng chứ không phải vài procedure trong `exams.*`
 *
 * Báo cáo bàn giao của lane 18.F dặn thẳng: *"Màn dành cho người học là việc
 * của 18.G. Khi thêm, nó phải là một router khác hoặc một procedure lọc cứng
 * theo `ctx.user.id` — đừng nới `classes.*`, vì cổng cấu trúc sẽ đỏ và nó đỏ
 * đúng."* `exams.*` mang đúng hợp đồng đó: MỌI procedure là `adminProcedure`,
 * và một ô gác duyệt bảng procedure lúc chạy để giữ lời. Nhét một procedure
 * cho người học vào đó sẽ làm ô ấy đỏ — đúng như nó phải thế.
 *
 * ## ⛔ Không procedure nào ở đây nhận `userId` từ input
 *
 * Mọi hàm bên dưới lấy `ctx.user.id`. Một tham số `userId` trên dây, dù có cổng
 * kiểm bên cạnh, là một đường để hỏi về lượt thi của người khác — và cổng ấy
 * chỉ cần sai một lần.
 *
 * ## Đồng hồ: máy chủ cấp, máy khách chỉ ĐẾM
 *
 * `get` trả `remainingMs` cùng `serverNow`, không trả mốc hạn để client tự trừ
 * theo `Date.now()`. Đó là toàn bộ nội dung AC-7 ("đổi giờ hệ thống máy khách
 * lên 2 tiếng ⇒ đếm ngược không đổi"): client nhận một khoảng thời gian rồi
 * đếm lùi bằng đồng hồ ĐƠN ĐIỆU của nó, nên giờ hệ thống không tham gia vào
 * phép tính nào.
 *
 * Memory dự án có hai vết đã cắn đúng chỗ này: VM ngủ làm vỡ ô nghiệm thu treo
 * theo đồng hồ, và đồng hồ VM lệch ~59 giây so với máy chủ. Lệch NHỎ nguy hơn
 * lệch lớn vì con số vẫn trông hợp lý.
 */

const examIdInput = z.object({ examId: z.string().uuid() }).strict();

export const examSittingRouter = createTRPCRouter({
  /** Những kỳ thi của các lớp mà tôi đang ở trong. */
  list: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    return {
      items: await listExamsForStudent(ctx.db, ctx.user.id, now),
      serverNow: now.toISOString(),
    };
  }),

  /**
   * Trạng thái lượt thi của TÔI trong một kỳ thi.
   *
   * `attempt: null` = chưa bắt đầu. Đó không phải lỗi — màn làm bài dùng chính
   * nó để quyết định hiện nút "Bắt đầu" hay hiện đồng hồ.
   */
  get: protectedProcedure.input(examIdInput).query(async ({ ctx, input }) => {
    const now = new Date();
    const exam = await getExamForStudent(ctx.db, input.examId, ctx.user.id);
    const attempt = await getAttemptFor(ctx.db, input.examId, ctx.user.id);
    return {
      exam: {
        id: exam.id,
        title: exam.title,
        className: exam.className,
        problemCodes: exam.problemCodes,
        durationMinutes: exam.durationMinutes,
        opensAt: exam.opensAt?.toISOString() ?? null,
        closesAt: exam.closesAt?.toISOString() ?? null,
      },
      attempt: attempt === null ? null : viewOf(attempt, exam.closesAt, now),
      serverNow: now.toISOString(),
    };
  }),

  /**
   * Mở lượt thi, hoặc trả lại lượt đang có.
   *
   * KHÔNG ném khi đã mở: bấm hai lần, hai tab, hay một lượt F5 đều phải ra cùng
   * một lượt với cùng một seed và cùng một `started_at`. Xem `startAttempt`.
   */
  start: protectedProcedure.input(examIdInput).mutation(async ({ ctx, input }) => {
    const now = new Date();
    const exam = await getExamForStudent(ctx.db, input.examId, ctx.user.id);
    const attempt = await startAttempt(ctx.db, input.examId, ctx.user.id, now);
    return { attempt: viewOf(attempt, exam.closesAt, now), serverNow: now.toISOString() };
  }),

  /** Bấm nộp. Không ném khi đã nộp rồi — người bấm hai lần đã có kết quả họ muốn. */
  submit: protectedProcedure.input(examIdInput).mutation(async ({ ctx, input }) => {
    const now = new Date();
    const exam = await getExamForStudent(ctx.db, input.examId, ctx.user.id);
    const attempt = await submitAttempt(ctx.db, input.examId, ctx.user.id, now);
    return { attempt: viewOf(attempt, exam.closesAt, now), serverNow: now.toISOString() };
  }),
});


/**
 * Lượt thi như người học được thấy.
 *
 * ⛔ KHÔNG chở `seed` ra ngoài. Người học không cần nó để làm bài — arena tự
 * sinh seed của phiên — và một khi nó đi qua dây thì cổng seed lúc nộp chỉ còn
 * gác được những ai không mở DevTools.
 *
 * ⚠ Ngoại lệ đã cân nhắc rồi bỏ: với `seedStrategy = 'per-student'`, client
 * SẼ cần seed máy chủ cấp để dựng đúng đề. Hôm nay chưa plugin nào khai
 * `seedSpec` (xem `exams/attempt-seed.ts`), nên seed chưa đổi `initialState`
 * của bài và chưa có gì để dựng. Ngày có, chỗ sửa là ĐÂY, và lúc đó phải chấp
 * nhận tường minh rằng cổng seed lúc nộp mất tác dụng với người mở DevTools —
 * đổi lại nó vẫn gác được nhầm lẫn và script đơn giản.
 */
function viewOf(
  attempt: {
    readonly startedAt: Date;
    readonly durationMinutes: number;
    readonly submittedAt: Date | null;
  },
  closesAt: Date | null,
  now: Date,
) {
  return {
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    deadline: attemptDeadline(attempt, closesAt).toISOString(),
    /*
     * `remainingMs` là thứ client thật sự đếm. `deadline` đi kèm chỉ để HIỆN
     * ("hết hạn lúc 09:00"), không để trừ — client trừ `deadline - Date.now()`
     * là đưa đồng hồ máy khách trở lại vào phép tính, và AC-7 đỏ ngay.
     */
    remainingMs: remainingMs(attempt, closesAt, now),
    closed: isAttemptClosed(attempt, closesAt, now),
  };
}
