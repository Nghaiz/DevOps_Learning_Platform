import { callOrchestrator, orchestratorClient } from '../grpc/orchestrator-client';
import { callHeaders } from '../labs/session';

/**
 * `admin.sessions.terminate` — admin kết thúc phiên của NGƯỜI KHÁC (P13 D15).
 *
 * ⛔ VÌ SAO KHÔNG DÙNG LẠI `endSessionAs` TRONG `../sessions/list.ts`.
 * Hàm đó phục vụ `me.endSession`: nó gửi `actor.user_id = người đang đăng
 * nhập`, và với đường đó chuyện kiểm chủ sở hữu của `reap.lua` là ĐÚNG — không
 * ai được kết thúc phiên của người khác qua `me.*`. Đường admin gửi
 * `actor.admin_user_id`, tức CỐ Ý bỏ qua phép kiểm ấy. Hai quyết định authz
 * khác nhau, không phải một tham số khác nhau.
 *
 * Gộp chúng vào một hàm với một cờ nghĩa là mỗi lần ai đó sửa `me.endSession`
 * họ đang sửa cả cổng quyền của admin, và một lỗi truyền cờ ở đó biến thành
 * "người dùng thường reap được phiên bất kỳ". Tách ra thì nhánh `admin_user_id`
 * có ĐÚNG MỘT call-site, và call-site đó nằm trong thư mục chỉ `adminProcedure`
 * gọi tới — grep một lần là kiểm được toàn bộ phạm vi của quyền này.
 */
export interface AdminTerminateResult {
  /** `SessionStatus` sau khi reap. `null` khi orchestrator không trả session. */
  readonly status: number | null;
  /**
   * CHỦ phiên bị kết thúc — đọc từ chính response, KHÔNG tra thêm một RPC nữa.
   *
   * Nó là thứ làm dòng `admin_audit` trả lời được "admin X đã kết thúc phiên
   * của AI"; `targetId` một mình chỉ nói được id phiên, mà id phiên thì chết
   * theo TTL và vài ngày sau không tra ngược ra người nào nữa.
   */
  readonly targetUserId: string | null;
}

export async function terminateSessionAsAdmin(
  ctx: { user: { id: string; role: string } },
  sessionId: string,
): Promise<AdminTerminateResult> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() =>
    orchestratorClient().reapSession(
      {
        sessionId,
        reason: 'admin_terminated',
        // `value` là id của ADMIN, không phải của chủ phiên. Truyền nhầm chủ
        // phiên vào đây thì lời gọi VẪN THÀNH CÔNG (reap.lua bỏ kiểm chủ sở
        // hữu ở nhánh này) và chỉ audit là sai — hỏng im lặng, nên đọc kỹ.
        actor: { case: 'adminUserId', value: ctx.user.id },
      },
      { headers },
    ),
  );
  return {
    status: response.session?.status ?? null,
    targetUserId: response.session?.userId ?? null,
  };
}
