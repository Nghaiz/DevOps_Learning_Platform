import { callOrchestrator, orchestratorClient } from '../grpc/orchestrator-client';
import { toJsonSession, type JsonSession } from '../grpc/session-json';
import { callHeaders } from '../labs/session';

/**
 * `ListSessions` (C3, phase-13 — Lane Go) — dùng chung bởi `me.activeSessions`
 * (`userId = ctx.user.id`) VÀ `admin.sessions.list` (`userId = ''`, mọi user).
 *
 * ⚠ Orchestrator TIN `user_id` do BFF gửi (đọc chú thích ở
 * `packages/shared-types/gen/orchestrator/v1/session_pb.ts` §ListSessionsRequest)
 * — nó KHÔNG tự phân biệt "tôi hỏi phiên của tôi" với "admin hỏi mọi phiên".
 * Quyết định đó nằm Ở ĐÂY, tại lệnh gọi: `userId` truyền vào hàm này LÀ quyết
 * định authz, không phải một tham số trung lập. `me.activeSessions` PHẢI
 * truyền `ctx.user.id`; `admin.sessions.list` (đứng sau `adminProcedure`) mới
 * được phép truyền `''`.
 */
export async function listSessionsPage(
  ctx: { user: { id: string; role: string } },
  options: { readonly userId: string; readonly limit: number; readonly cursor?: string | undefined },
): Promise<{ items: readonly JsonSession[]; nextCursor: string | null }> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() =>
    orchestratorClient().listSessions(
      { userId: options.userId, limit: options.limit, cursor: options.cursor ?? '' },
      { headers },
    ),
  );
  const items = response.sessions
    .map((session) => toJsonSession(session))
    .filter((session): session is JsonSession => session !== null);
  return { items, nextCursor: response.nextCursor === '' ? null : response.nextCursor };
}

/**
 * `me.endSession`/`admin.sessions.terminate` dùng chung — `ReapSession` với
 * `actor` là NGƯỜI GỌI THẬT (không phải chủ session, khi actor là admin kết
 * thúc hộ). `reason` khác nhau ở hai router (`'user_ended'` vs
 * `'admin_terminated'`) nên KHÔNG được cố định ở đây — truyền vào từ caller.
 */
export async function endSessionAs(
  ctx: { user: { id: string; role: string } },
  sessionId: string,
  reason: 'user_ended' | 'admin_terminated',
): Promise<{ status: number | null }> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() =>
    orchestratorClient().reapSession(
      { sessionId, reason, actor: { case: 'userId', value: ctx.user.id } },
      { headers },
    ),
  );
  return { status: response.session?.status ?? null };
}
