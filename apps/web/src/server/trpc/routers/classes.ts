import { z } from 'zod';
import { writeAdminAudit } from '../../admin/audit';
import {
  addClassMemberByEmail,
  createClass,
  getClass,
  listClassMembersPage,
  listClassesPage,
  removeClassMember,
} from '../../classes/crud';
import { classScoreboard } from '../../classes/scoreboard';
import { adminProcedure, createTRPCRouter, listInputSchema } from '../init';

/**
 * `classes.*` — lớp học (18.F).
 *
 * ## ⛔ MỌI procedure ở đây là `adminProcedure`, không có ngoại lệ
 *
 * Đó là toàn bộ nội dung của 18.F.3 ("sinh viên chỉ thấy điểm của chính mình,
 * ở mọi điểm cuối liên quan") và là thứ ô nghiệm thu **AC-F** đo. Router này
 * không có một điểm cuối nào cho sinh viên: mỗi dòng nó trả về đều là dữ liệu
 * của người khác (danh sách lớp, email thành viên, bảng điểm).
 *
 * Ràng buộc "mọi procedure" được gác bằng máy, không bằng lời hứa:
 * `server/classes/authz.integration.test.ts` DUYỆT đúng bảng procedure của
 * router này lúc chạy và đòi từng cái từ chối cả `user` lẫn `author`. Thêm một
 * procedure công khai vào đây thì ô đó đỏ, kể cả khi người thêm không đọc dòng
 * chú thích này.
 *
 * ## Vai trò giảng viên: KHÔNG có role `teacher`
 *
 * Chủ dự án chốt 2026-09-11 rằng giảng viên dùng lại `admin`. Cái giá được ghi
 * rõ ở `plans/devops-learning-platform/phase-18.md` §2: một giảng viên được cấp
 * `admin` đồng thời có TOÀN QUYỀN hệ thống. Đánh đổi có chủ ý ở quy mô một lớp
 * NCKH, không phải sơ suất, và chỗ phải tách nếu mở cho giảng viên ngoài nhóm.
 *
 * ## `classId` là `.uuid()`, không phải `.min(1)`
 *
 * Không phải để cho chặt. `classes.id` là `uuid` ở tầng Postgres, nên một chuỗi
 * lạ làm truy vấn NÉM (`22P02 invalid input syntax for type uuid`) thay vì trả
 * 0 dòng: một input hỏng của client đọc ra như sự cố máy chủ, và câu SQL kèm
 * tham số đi thẳng vào thông điệp lỗi. Cùng bẫy mà `assertUuidCursor` trong
 * `trpc/init.ts` đã ghi lại; ở đây Zod chặn sớm hơn một tầng.
 */

const classIdInput = z.object({ classId: z.string().uuid() }).strict();

const createInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    // `.trim()` rồi mới đo: một cái tên toàn dấu cách không phải một cái tên.
    description: z.string().trim().max(500).optional(),
  })
  .strict();

const membersInput = listInputSchema.extend({ classId: z.string().uuid() }).strict();

const addMemberInput = z
  .object({
    classId: z.string().uuid(),
    // `.email()` chứ không phải một chuỗi bất kỳ: người vận hành gõ tay ô này,
    // và một lỗi chính tả nên đỏ ngay tại chỗ nhập thay vì thành "không có tài
    // khoản nào mang email đó" (câu ấy đúng, nhưng nó đổ lỗi cho sai chỗ).
    email: z.string().trim().email().max(254),
  })
  .strict();

const removeMemberInput = z
  .object({ classId: z.string().uuid(), userId: z.string().min(1) })
  .strict();

export const classesRouter = createTRPCRouter({
  list: adminProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    return listClassesPage(ctx.db, { limit: input.limit, cursor: input.cursor });
  }),

  get: adminProcedure.input(classIdInput).query(async ({ ctx, input }) => {
    return getClass(ctx.db, input.classId);
  }),

  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const created = await createClass(ctx.db, ctx.user.id, {
      name: input.name,
      // Chuỗi rỗng sau `.trim()` là "không nhập gì", và nó phải thành `null` chứ
      // không phải `''`: hai giá trị đó hiện ra như nhau trên màn hình nhưng
      // khác nhau với mọi truy vấn `is null` về sau.
      description: input.description === undefined || input.description === '' ? null : input.description,
    });
    await writeAdminAudit(ctx.db, {
      actorId: ctx.user.id,
      action: 'class.create',
      targetType: 'class',
      targetId: created.id,
      detail: { name: created.name },
    });
    return created;
  }),

  members: adminProcedure.input(membersInput).query(async ({ ctx, input }) => {
    return listClassMembersPage(ctx.db, input.classId, {
      limit: input.limit,
      cursor: input.cursor,
    });
  }),

  addMember: adminProcedure.input(addMemberInput).mutation(async ({ ctx, input }) => {
    const added = await addClassMemberByEmail(ctx.db, input.classId, input.email);
    await writeAdminAudit(ctx.db, {
      actorId: ctx.user.id,
      action: 'class.addMember',
      targetType: 'class',
      targetId: input.classId,
      // `targetUserId` chứ không chỉ `targetId`: `targetId` một mình chỉ nói
      // "lớp nào đó đổi", không nói ai bị thêm vào. Cùng lý lẽ với
      // `admin.sessions.terminate`.
      detail: { targetUserId: added.userId, email: added.email },
    });
    return added;
  }),

  removeMember: adminProcedure.input(removeMemberInput).mutation(async ({ ctx, input }) => {
    const removed = await removeClassMember(ctx.db, input.classId, input.userId);
    await writeAdminAudit(ctx.db, {
      actorId: ctx.user.id,
      action: 'class.removeMember',
      targetType: 'class',
      targetId: input.classId,
      detail: { targetUserId: removed.userId },
    });
    return removed;
  }),

  /**
   * ⛔ ĐIỂM CUỐI CỦA **AC-F**. Một sinh viên gọi thẳng đây phải nhận
   * `FORBIDDEN`. Xem chú thích đầu file trước khi đổi bất cứ thứ gì ở dòng này.
   */
  scoreboard: adminProcedure.input(classIdInput).query(async ({ ctx, input }) => {
    return { rows: await classScoreboard(ctx.db, input.classId) };
  }),
});
