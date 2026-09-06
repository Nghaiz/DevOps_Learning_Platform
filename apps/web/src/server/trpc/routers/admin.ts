import { z } from 'zod';
import { fetchAdminHealth } from '../../admin/health';
import { listAdminAuditPage, writeAdminAudit } from '../../admin/audit';
import { listAdminUsersPage, setUserRole } from '../../admin/users';
import { endSessionAs, listSessionsPage } from '../../sessions/list';
import { userRole as userRoleEnum } from '../../db/schema';
import { adminProcedure, createTRPCRouter, listInputSchema } from '../init';

/**
 * `admin.*` — P13 C4. MỌI procedure đứng sau `adminProcedure` (role === 'admin'
 * — 403 nếu không). Nội dung soạn bài của admin dùng LẠI `authoring.list` +
 * `authoring.archive` (`authorProcedure` đã cho `admin` qua, và
 * `visibilityFor({role:'admin'})` trả `{kind:'admin'}` — thấy MỌI state của
 * MỌI người); không có procedure `admin.content.*` nào ở đây, đúng contract.
 *
 * ⚠ `admin.sessions.terminate` — GIỚI HẠN ĐÃ BIẾT, đọc trước khi dùng: RPC
 * `ReapSession` của orchestrator (`services/orchestrator/internal/lifecycle/
 * reap.lua`) kiểm CỨNG `actor.userId === session.userId` cho nhánh `user_id`,
 * và nhánh `system_component` (đường DUY NHẤT bỏ qua kiểm đó) đòi mTLS
 * in-cluster VÀ CommonName nằm trong allowlist `GRPC_MTLS_SYSTEM_CNS` —
 * `session_service.go` viết THẲNG: "apps/web sẽ reap được session của bất kỳ
 * ai qua nhánh system_component… việc của nó chỉ là reap phiên của chính người
 * đang đăng nhập". Nói cách khác: **orchestrator hôm nay KHÔNG có đường cho
 * admin kết thúc session của người KHÁC** — gọi `admin.sessions.terminate`
 * trên một session không phải của chính admin sẽ nhận `NOT_FOUND` từ
 * orchestrator (cùng mã với "không tồn tại", theo đúng thiết kế chống dò id
 * của `reap.lua`). Đây là hợp đồng bên `services/orchestrator/**` (Lane Go),
 * NGOÀI quyền sở hữu file của lane này — đã báo lead trong report, không tự
 * sửa.
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

    /** Xem chú thích ĐẦU FILE — giới hạn đã biết với session của người khác. */
    terminate: adminProcedure.input(sessionIdInput).mutation(async ({ ctx, input }) => {
      const result = await endSessionAs(ctx, input.sessionId, 'admin_terminated');
      await writeAdminAudit(ctx.db, {
        actorId: ctx.user.id,
        action: 'session.terminate',
        targetType: 'session',
        targetId: input.sessionId,
      });
      return result;
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
