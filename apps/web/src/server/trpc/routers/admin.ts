import { z } from 'zod';
import { fetchAdminHealth } from '../../admin/health';
import { listAdminAuditPage, writeAdminAudit } from '../../admin/audit';
import { listAdminUsersPage, setUserRole } from '../../admin/users';
import { terminateSessionAsAdmin } from '../../admin/terminate';
import { listSessionsPage } from '../../sessions/list';
import { userRole as userRoleEnum } from '../../db/schema';
import { adminProcedure, createTRPCRouter, listInputSchema } from '../init';

/**
 * `admin.*` — P13 C4. MỌI procedure đứng sau `adminProcedure` (role === 'admin'
 * — 403 nếu không). Nội dung soạn bài của admin dùng LẠI `authoring.list` +
 * `authoring.archive` (`authorProcedure` đã cho `admin` qua, và
 * `visibilityFor({role:'admin'})` trả `{kind:'admin'}` — thấy MỌI state của
 * MỌI người); không có procedure `admin.content.*` nào ở đây, đúng contract.
 *
 * `admin.sessions.terminate` — GIỚI HẠN CŨ ĐÃ ĐƯỢC GỠ (P13 D15). Bản trước của
 * chú thích này ghi: orchestrator chốt cứng `actor.userId === session.userId`,
 * nhánh `system_component` đòi mTLS + CN trong allowlist, nên admin bấm nút chỉ
 * nhận `NOT_FOUND` — một no-op đội lốt "không tìm thấy". Nay `ReapSession` có
 * nhánh actor thứ ba, `admin_user_id`, và đường đi là
 * `admin/terminate.ts → ReapSession(actor.admin_user_id = id của admin)`.
 *
 * Hai điều PHẢI giữ khi sửa chỗ này:
 *
 *  · Nhánh `admin_user_id` KHÔNG được rò sang bất kỳ procedure nào khác. Nó có
 *    đúng một call-site (`terminateSessionAsAdmin`); `me.endSession` vẫn đi
 *    `endSessionAs` với `actor.user_id` và vẫn bị kiểm chủ sở hữu.
 *  · Orchestrator KHÔNG chứng minh được người gọi là admin — nó tin BFF, y hệt
 *    cách nó tin `user_id` ở mọi RPC khác (§2 C3: BFF là ranh giới tin cậy).
 *    `adminProcedure` Ở ĐÂY là phép kiểm vai trò DUY NHẤT trên đường này.
 *
 * Audit đi HAI ĐẦU, cố ý: orchestrator ghi `sessions_audit` ("reap bởi admin
 * <id>", cạnh chủ phiên và pod), BFF ghi `admin_audit` (actor, phiên, chủ
 * phiên, lý do). Một đầu thôi là không đủ — `sessions_audit` không biết tới vai
 * trò, còn `admin_audit` không biết phiên đó thật sự có chết hay không.
 */

const listUsersInput = listInputSchema.extend({ q: z.string().max(80).optional() }).strict();
const setRoleInput = z
  .object({ userId: z.string().min(1), role: z.enum(userRoleEnum.enumValues) })
  .strict();
const sessionIdInput = z.object({ sessionId: z.string().min(1) }).strict();

export const adminRouter = createTRPCRouter({
  users: createTRPCRouter({
    list: adminProcedure.input(listUsersInput).query(async ({ ctx, input }) => {
      return listAdminUsersPage(ctx.db, { limit: input.limit, cursor: input.cursor, q: input.q });
    }),

    setRole: adminProcedure.input(setRoleInput).mutation(async ({ ctx, input }) => {
      const updated = await setUserRole(ctx.db, ctx.user, input.userId, input.role);
      await writeAdminAudit(ctx.db, {
        actorId: ctx.user.id,
        action: 'user.setRole',
        targetType: 'user',
        targetId: input.userId,
        // `from` VÀ `to`: một dòng audit chỉ có `to` không nói được cái gì đã
        // đổi — nó chỉ lặp lại trạng thái hiện tại của bảng `users`.
        detail: { from: updated.previousRole, to: updated.role },
      });
      return { id: updated.id, role: updated.role };
    }),
  }),

  sessions: createTRPCRouter({
    /** `ListSessions(user_id = '')` — mọi phiên đang sống, mọi user. */
    list: adminProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
      return listSessionsPage(ctx, { userId: '', limit: input.limit, cursor: input.cursor });
    }),

    /** Xem chú thích ĐẦU FILE — đường admin, KHÔNG dùng chung với `me.endSession`. */
    terminate: adminProcedure.input(sessionIdInput).mutation(async ({ ctx, input }) => {
      const result = await terminateSessionAsAdmin(ctx, input.sessionId);
      await writeAdminAudit(ctx.db, {
        actorId: ctx.user.id,
        action: 'session.terminate',
        targetType: 'session',
        targetId: input.sessionId,
        // `targetUserId` + `reason`: `targetId` một mình chỉ là id phiên, mà id
        // phiên rụng theo TTL — vài ngày sau không ai tra ngược ra được đó là
        // phiên của ai. `reason` ghi lại chuỗi ĐÃ gửi xuống orchestrator, để
        // hai bảng audit đối chiếu được với nhau.
        detail: { reason: 'admin_terminated', targetUserId: result.targetUserId },
      });
      return { status: result.status };
    }),
  }),

  audit: createTRPCRouter({
    list: adminProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
      return listAdminAuditPage(ctx.db, input.limit, input.cursor);
    }),
  }),

  health: adminProcedure.input(z.object({}).strict()).query(async ({ ctx }) => {
    return fetchAdminHealth(ctx);
  }),
});
