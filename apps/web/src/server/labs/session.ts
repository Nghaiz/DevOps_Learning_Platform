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
