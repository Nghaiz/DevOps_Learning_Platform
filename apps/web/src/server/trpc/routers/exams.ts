import { z } from 'zod';

import { writeAdminAudit } from '../../admin/audit';
import { EXAM_SEED_STRATEGIES } from '../../db/schema';
import { createExam, deleteExam, getExam, listExamsPage, updateExam } from '../../exams/crud';
import { csvFileName, scoreboardToCsv } from '../../exams/csv';
import { examScoreboard } from '../../exams/scoreboard';
import { adminProcedure, createTRPCRouter, listInputSchema } from '../init';

/**
 * `exams.*` — SOẠN ĐỀ và CHẤM (18.G.2, 18.G.6, 18.G.7).
 *
 * ## ⛔ MỌI procedure ở đây là `adminProcedure`, không có ngoại lệ
 *
 * Cùng hợp đồng như `classes.*`, và cùng lý do: mỗi dòng router này trả về đều
 * là dữ liệu của người khác (danh sách đề, bảng điểm cả lớp, CSV điểm). Ràng
 * buộc được gác bằng máy chứ không bằng lời hứa — `server/exams/authz.integration.test.ts`
 * DUYỆT đúng bảng procedure của router này lúc chạy và đòi từng cái từ chối cả
 * `user` lẫn `author`. Thêm một procedure công khai vào đây thì ô đó đỏ, kể cả
 * khi người thêm không đọc dòng này.
 *
 * ## Màn của NGƯỜI HỌC nằm ở router khác, và đó là một yêu cầu tường minh
 *
 * Báo cáo bàn giao của lane 18.F dặn thẳng: *"Khi thêm, nó phải là một router
 * khác hoặc một procedure lọc cứng theo `ctx.user.id` — đừng nới `classes.*`."*
 * Cùng lý lẽ áp cho `exams.*`. Đường của người học là `examSitting.*`.
 */

const examIdInput = z.object({ examId: z.string().uuid() }).strict();

/**
 * `.uuid()` chứ không `.min(1)`: `exams.id` là `uuid` ở tầng Postgres, nên một
 * chuỗi lạ làm truy vấn NÉM (`22P02`) thay vì trả 0 dòng — một input hỏng của
 * client đọc ra như sự cố máy chủ, và câu SQL kèm tham số đi vào thông điệp lỗi.
 */
const composeInput = z
  .object({
    classId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    problemCodes: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
    durationMinutes: z.number().int().positive(),
    seedStrategy: z.enum(EXAM_SEED_STRATEGIES),
    /*
     * Nhận ISO string rồi tự dựng `Date`, không nhận `z.date()`: input đi qua
     * JSON trên dây và app này KHÔNG có transformer (`superjson`), nên một
     * `Date` gửi lên tới nơi đã là chuỗi. `z.date()` sẽ từ chối nó với một câu
     * lỗi nói về kiểu, ở một chỗ không ai ngờ.
     */
    opensAt: z.string().datetime().nullable().default(null),
    closesAt: z.string().datetime().nullable().default(null),
  })
  .strict();

const updateInput = composeInput.extend({ examId: z.string().uuid() }).strict();

const listInput = listInputSchema.extend({ classId: z.string().uuid().optional() }).strict();

function toBody(input: z.infer<typeof composeInput>) {
  return {
    classId: input.classId,
    title: input.title,
    problemCodes: input.problemCodes,
    durationMinutes: input.durationMinutes,
    seedStrategy: input.seedStrategy,
    opensAt: input.opensAt === null ? null : new Date(input.opensAt),
    closesAt: input.closesAt === null ? null : new Date(input.closesAt),
  };
}

export const examsRouter = createTRPCRouter({
  list: adminProcedure.input(listInput).query(async ({ ctx, input }) => {
    return listExamsPage(ctx.db, {
      limit: input.limit,
      cursor: input.cursor,
      classId: input.classId,
    });
  }),

  get: adminProcedure.input(examIdInput).query(async ({ ctx, input }) => {
    return getExam(ctx.db, input.examId);
  }),

  create: adminProcedure.input(composeInput).mutation(async ({ ctx, input }) => {
    const created = await createExam(ctx.db, ctx.user.id, toBody(input));
    await writeAdminAudit(ctx.db, {
      actorId: ctx.user.id,
      action: 'exam.create',
      targetType: 'exam',
      targetId: created.id,
      detail: { title: created.title, classId: created.classId },
    });
    return created;
  }),

  update: adminProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const updated = await updateExam(ctx.db, input.examId, toBody(input));
    await writeAdminAudit(ctx.db, {
      actorId: ctx.user.id,
      action: 'exam.update',
      targetType: 'exam',
      targetId: updated.id,
      detail: { title: updated.title },
    });
    return updated;
  }),

  remove: adminProcedure.input(examIdInput).mutation(async ({ ctx, input }) => {
    /*
     * Đọc TRƯỚC khi xoá để dòng audit còn gọi được tên kỳ thi. Sau lượt xoá thì
     * `targetId` là một uuid không tra ra gì nữa, và một nhật ký chỉ có uuid
     * không trả lời được câu duy nhất người ta hỏi nó: "cái gì vừa biến mất?"
     */
    const doomed = await getExam(ctx.db, input.examId);
    await deleteExam(ctx.db, input.examId);
    await writeAdminAudit(ctx.db, {
      actorId: ctx.user.id,
      action: 'exam.remove',
      targetType: 'exam',
      targetId: input.examId,
      detail: { title: doomed.title, attemptCount: doomed.attemptCount },
    });
    return { examId: input.examId };
  }),

  /**
   * ⛔ ĐIỂM CUỐI của bảng điểm kỳ thi. Một sinh viên gọi thẳng đây phải nhận
   * `FORBIDDEN` — cùng hợp đồng với `classes.scoreboard`, và cùng ô gác.
   */
  scoreboard: adminProcedure.input(examIdInput).query(async ({ ctx, input }) => {
    return examScoreboard(ctx.db, input.examId, new Date());
  }),

  /**
   * CSV của bảng điểm (18.G.7).
   *
   * Trả CHUỖI qua tRPC chứ không phải một route tải file riêng: nội dung đã là
   * văn bản, và một route riêng sẽ cần dựng lại đúng cổng `adminProcedure` ở
   * một tầng khác (middleware Next) — tức nguồn sự thật thứ hai cho câu hỏi "ai
   * được xem điểm lớp này". Client dựng Blob từ chuỗi này để tải xuống.
   */
  scoreboardCsv: adminProcedure.input(examIdInput).query(async ({ ctx, input }) => {
    const board = await examScoreboard(ctx.db, input.examId, new Date());
    return { fileName: csvFileName(board.title), csv: scoreboardToCsv(board) };
  }),
});
