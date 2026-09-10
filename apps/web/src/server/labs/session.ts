import { TRPCError } from '@trpc/server';
import { SandboxTier } from '@devops-platform/shared-types';
import type {
  SandboxTierName,
  ScenarioCapability,
} from '@devops-platform/shared-types/scenario';

import { profileForCapabilities } from '../lessons/catalog';
import { mintAccessTokenFor } from '../auth/jwt';
import { attachSandboxCookie } from '../auth/sandbox-cookie';
import { callOrchestrator, orchestratorClient } from '../grpc/orchestrator-client';
import type { Session } from '@devops-platform/shared-types';

/**
 * Helper dựng sandbox dùng chung giữa `labs.startAttempt` và
 * `playgrounds.start` — CÙNG lý lẽ với `lessons.ts`'s `TIER_TO_PROTO`/
 * `callHeaders`/`sessionExpiry` (không export ở đó, và `lessons.ts` không nằm
 * trong quyền sở hữu file của lane này nên không sửa nó để export ra). Ba hàm
 * dưới đây là bản NHÂN BẢN có chủ ý, ghi lại đây để không lặng lẽ trôi khỏi bản
 * gốc nếu một bên đổi.
 */
const TIER_TO_PROTO: Readonly<Record<SandboxTierName, SandboxTier>> = {
  sysbox: SandboxTier.SYSBOX,
  gvisor: SandboxTier.GVISOR,
  kata: SandboxTier.KATA,
};

export function tierToProto(tier: SandboxTierName): SandboxTier {
  return TIER_TO_PROTO[tier];
}

export async function callHeaders(userId: string, role: string): Promise<HeadersInit> {
  const token = await mintAccessTokenFor(userId, role);
  return { authorization: `Bearer ${token}` };
}

/**
 * Hỏi orchestrator `expiresAt` của session — bắt buộc trước khi
 * `mintSandboxTokenFor` (nó từ chối phát token đã chết). Cũng là vế authz ĐẦU
 * TIÊN: `GetSession` nhận `userId` và orchestrator tự kiểm chủ sở hữu.
 */
export async function sessionExpiry(
  ctx: { user: { id: string; role: string } },
  sessionId: string,
): Promise<number> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() =>
    orchestratorClient().getSession({ sessionId, userId: ctx.user.id }, { headers }),
  );
  const expiresAt = response.session?.expiresAt;
  if (expiresAt === undefined) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Phiên sandbox chưa sẵn sàng — đợi provisioning xong rồi thử lại',
    });
  }
  return Number(expiresAt.seconds);
}

export interface NewSandbox {
  session: Session;
}

/**
 * Tạo một sandbox mới qua orchestrator + gắn cookie `dlp_sandbox` cho WS
 * terminal — dùng chung cho lab (task giao trước, làm trong sandbox) và
 * playground (sandbox trống). `ttlSeconds: 0` = TTL mặc định của server; caller
 * truyền số dương khi nội dung tự khai TTL riêng (playground).
 */
export async function createSandboxSession(
  ctx: { user: { id: string; role: string }; resHeaders: Headers },
  params: {
    tier: SandboxTierName;
    ttlSeconds: number;
    idempotencyKey: string;
    /**
     * Năng lực mà NỘI DUNG khai (lab/playground). Dùng để chọn profile tài
     * nguyên — KHÔNG lấy từ input của client: không ai được tự khai mình đáng
     * được cấp bao nhiêu RAM, cùng lý do `userId` không nằm trong input.
     */
    capabilities: readonly ScenarioCapability[];
  },
): Promise<NewSandbox> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() =>
    orchestratorClient().createSession(
      {
        userId: ctx.user.id,
        tier: tierToProto(params.tier),
        ttlSeconds: params.ttlSeconds,
        idempotencyKey: params.idempotencyKey,
        profile: profileForCapabilities(params.capabilities),
      },
      { headers },
    ),
  );
  // `attachSandboxCookie` tự ném nếu `session`/`expiresAt` vắng mặt — kiểm lại
  // ở đây chỉ để TypeScript thu hẹp kiểu (`Session | undefined` → `Session`)
  // cho giá trị trả về, không phải một nhánh lỗi thứ hai.
  await attachSandboxCookie(ctx, ctx.user.id, response.session);
  if (response.session === undefined) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'orchestrator không trả session sau khi tạo',
    });
  }
  return { session: response.session };
}

/**
 * Thu hồi NGAY một phiên vừa tạo mà không dùng được (P15 / 15.A).
 *
 * ## Vì sao cần, và nó đáng bao nhiêu
 *
 * `labs.startAttempt` tạo phiên → chạy setup → **ném** nếu setup lỗi. Phiên nằm
 * lại cho tới khi reaper TTL thu hồi: MỘT GIỜ. Đã đo 2026-09-09: pod
 * `sandbox-0129152d5014` sống tiếp với `DLP_K8S=1` và `/root/lab-k8s` rỗng sau
 * một lượt setup hỏng.
 *
 * ⛔ Lab k8s có trần **5 phiên đồng thời** (`requestsMemory` 1Gi mỗi pod so với
 * quota 5952Mi, trừ pod ấm). Năm lượt hỏng liên tiếp là lab đóng cửa một tiếng,
 * và người dùng không có cách nào biết vì sao "Còn 0 chỗ" trong khi không ai
 * đang học. Đó là lý do một lượt rò khe ở đây nghiêm trọng hơn vẻ ngoài của nó.
 *
 * `lifecycle.Reap` xoá pod với grace 0 và `LREM` khỏi cả `pool:claimed` lẫn
 * `pool:free`, nên khe quota trả lại trong cùng lời gọi — KHÔNG chờ một chu kỳ
 * sweep. Đây cũng là lý do phải đi qua RPC này chứ không phải `kubectl delete`:
 * xoá pod sau lưng orchestrator làm lệch warm pool và lượt claim sau phát ra tên
 * một pod đã chết.
 *
 * ## Vì sao không dùng `endSessionAs` (`server/sessions/list.ts`)
 *
 * Hàm đó thu hẹp `reason` về đúng `'user_ended'`, và đó là một hàng rào CÓ CHỦ Ý
 * (P13 D15): nó tồn tại để không ai nối lại đường admin-reap-như-thể-chủ-phiên
 * bằng cách truyền một chuỗi khác. Mở union ra để dùng lại ở đây là tháo hàng rào
 * đó cho một lý do không liên quan. Lượt reap này cũng KHÔNG phải "người dùng tự
 * kết thúc" — không ai bấm gì; nền tảng đang dọn thứ nó vừa tạo và không dùng
 * được. Một `reason` riêng là thứ duy nhất làm câu hỏi "phiên này chết vì sao"
 * trả lời được từ `sessions_audit`.
 *
 * `actor` vẫn là CHỦ phiên (`ctx.user.id`), không phải `system_component`: nhánh
 * ấy đòi mTLS in-cluster + CommonName trong allowlist, và chủ sở hữu ở đây đúng
 * là người vừa yêu cầu tạo phiên.
 *
 * KHÔNG ném: lượt reap hỏng không được thay thế câu báo lỗi THẬT của setup bằng
 * một câu về reap. Pod khi đó vẫn chết theo TTL — tức lùi về đúng hành vi cũ —
 * nhưng nó phải để lại dấu, nếu không rò khe là một sự kiện vô hình (cùng lý lẽ
 * `content/publish.ts`).
 */
export async function reapUnusableSession(
  ctx: { user: { id: string; role: string } },
  sessionId: string,
): Promise<void> {
  try {
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    await callOrchestrator(() =>
      orchestratorClient().reapSession(
        {
          sessionId,
          reason: 'setup_failed',
          actor: { case: 'userId', value: ctx.user.id },
        },
        { headers },
      ),
    );
  } catch (cause) {
    console.error('[labs:startAttempt] reap phiên sau setup hỏng thất bại', {
      sessionId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
}
