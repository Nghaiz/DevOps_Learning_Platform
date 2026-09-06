import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { SandboxTier } from '@devops-platform/shared-types';
import { sessionsAudit } from '../../db/schema';
import { mintAccessTokenFor } from '../../auth/jwt';
import { attachSandboxCookie } from '../../auth/sandbox-cookie';
import { callOrchestrator, orchestratorClient } from '../../grpc/orchestrator-client';
import { toJsonSession } from '../../grpc/session-json';
import {
  assertOwnerOrAdmin,
  createTRPCRouter,
  noCursorListInputSchema,
  protectedProcedure,
} from '../init';

/**
 * `session.*` gọi thẳng services/orchestrator qua gRPC (proto/orchestrator/v1) —
 * mọi RPC ở P0 trả `Unimplemented` một cách CÓ CHỦ Ý (xem services/orchestrator).
 * Điều tRPC phải chứng minh ở đây KHÔNG PHẢI "session hoạt động" mà là: (1) luật 1 —
 * authz object-level chặn TRƯỚC KHI gói tin rời BFF, (2) lỗi gRPC nổi lên thành
 * TRPCError sạch, không rò kiểu nội bộ connect-node ra ngoài.
 */

const sandboxTierInput = z.nativeEnum(SandboxTier);

const createInput = z
  .object({
    userId: z.string().min(1),
    tier: sandboxTierInput,
    ttlSeconds: z.number().int().min(0).default(0),
    // Khớp CHÍNH XÁC validator của `rediskeys.Idem` (docs/redis-key-namespace.md
    // — cùng regex ở cả hai bản song sinh Go/TS). `.min(1)` trần cho qua `a:ws`,
    // `a{dlp}b`, chuỗi 500 ký tự — orchestrator mới từ chối, và trả `Internal`
    // thay vì `InvalidArgument` ở biên gần client nhất.
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, 'idempotencyKey chỉ nhận [A-Za-z0-9_-], tối đa 64 ký tự'),
  })
  .strict();

const claimInput = z.object({ sessionId: z.string().min(1), userId: z.string().min(1) }).strict();

const getInput = z.object({ sessionId: z.string().min(1), userId: z.string().min(1) }).strict();

const extendInput = z
  .object({
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    // 0 = dùng idle-window mặc định của server (`EXTEND_DEFAULT`), đúng nghĩa
    // proto. Trần 2h khớp `HARD_CAP` — xin nhiều hơn cũng bị công thức của B5
    // cắt về trần, nên chặn ở biên gần client nhất thay vì để orchestrator từ chối.
    extendSeconds: z.number().int().min(0).max(7200).default(0),
  })
  .strict();

const reapInput = z
  .object({
    sessionId: z.string().min(1),
    reason: z.string().min(1),
    userId: z.string().min(1),
  })
  .strict();

/** Đính JWT (aud=orchestrator, xem server/auth/jwt.ts) vào metadata gRPC. */
async function callHeaders(userId: string, role: string): Promise<HeadersInit> {
  const token = await mintAccessTokenFor(userId, role);
  return { authorization: `Bearer ${token}` };
}

export const sessionRouter = createTRPCRouter({
  /**
   * G12 — điểm DUY NHẤT phát sandbox token. Không phải `claim`/`get`: token mang
   * đúng một `sid` và dùng lại được suốt TTL (contract §2), nên reconnect không
   * cần token mới và mint thêm chỗ nữa chỉ là thêm đường để lệch.
   *
   * Đánh đổi đã biết: tạo session THỨ HAI sẽ ghi đè cookie của session thứ nhất
   * (cùng tên `dlp_sandbox`, cùng `Path=/ws`), nên tab cũ mất quyền mở WS. Đó là
   * hệ quả trực tiếp của "một cookie ⇒ một sid", và nó khớp D17 (một session chỉ
   * cho một WS sống): P1 cố ý KHÔNG hỗ trợ hai phiên lab song song trên một
   * trình duyệt. Ngày cần, đường đúng là đặt tên cookie theo sid — không phải
   * nới trần D17.
   */
  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().createSession(
        {
          userId: input.userId,
          tier: input.tier,
          ttlSeconds: input.ttlSeconds,
          idempotencyKey: input.idempotencyKey,
        },
        { headers },
      ),
    );
    await attachSandboxCookie(ctx, input.userId, response.session);
    return { session: toJsonSession(response.session) };
  }),

  claim: protectedProcedure.input(claimInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().claimSession(
        { sessionId: input.sessionId, userId: input.userId },
        { headers },
      ),
    );
    return { session: toJsonSession(response.session) };
  }),

  /** Luật 1 — kiểm chuẩn: user A gọi get với userId=B (không phải chính mình) → 403. */
  get: protectedProcedure.input(getInput).query(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().getSession(
        { sessionId: input.sessionId, userId: input.userId },
        { headers },
      ),
    );
    return { session: toJsonSession(response.session) };
  }),

  /**
   * F9 — nút "Gia hạn" của trang `/session`.
   *
   * **Vì sao vẫn cần dù 1.C-3 đã tự gia hạn theo traffic:** contract §8 chốt
   * rằng CHỈ stdin/stdout thật mới đẩy `ExtendSession` — ping/pong và `resize`
   * cố tình không tính, để một tab bỏ quên không giữ pod tới trần cứng. Hệ quả
   * đúng-nhưng-khó-chịu: sinh viên đang ĐỌC tài liệu bên cửa sổ khác, không gõ
   * gì trong 55 phút, mất phiên dù đang ngồi ngay đó. Một cú bấm là bằng chứng
   * có người — thứ mà ping/pong không bao giờ là.
   *
   * `expectedRevision: 0` (bỏ qua optimistic lock) là ĐÚNG ở đây, không phải
   * đường tắt: FE không đọc-rồi-ghi, nó chỉ xin đẩy hạn, và công thức của B5
   * (`max(current, min(now + extend, createdAt + HARD_CAP))`) chỉ tiến không lùi
   * — nên không có ca "ghi đè mất thay đổi của người khác" để mà chặn. Gác
   * revision ở đây chỉ tạo ra `FailedPrecondition` giả mỗi khi gateway vừa tự
   * gia hạn xong trước cú bấm vài ms.
   */
  extend: protectedProcedure.input(extendInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().extendSession(
        {
          sessionId: input.sessionId,
          userId: input.userId,
          extendSeconds: input.extendSeconds,
          // `BigInt(0)` chứ không phải literal `0n`: tsconfig của apps/web target
          // ES2017 (cùng lý do đã ghi ở security/sandbox-token-cookie.test.ts).
          expectedRevision: BigInt(0),
        },
        { headers },
      ),
    );
    return {
      session: toJsonSession(response.session),
      hardCapReached: response.hardCapReached,
    };
  }),

  reap: protectedProcedure.input(reapInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().reapSession(
        {
          sessionId: input.sessionId,
          reason: input.reason,
          actor: { case: 'userId', value: input.userId },
        },
        { headers },
      ),
    );
    return { session: toJsonSession(response.session) };
  }),

  /**
   * KHÔNG có RPC gRPC tương ứng ở proto v0 — lịch sử audit đọc thẳng Postgres
   * (sessions_audit, 0.C). Luôn lọc theo chính ctx.user.id (không nhận userId từ
   * input) nên không cần assertOwnerOrAdmin ở đây. Luật 4: limit ép về ≤100.
   */
  history: protectedProcedure.input(noCursorListInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(sessionsAudit)
      .where(eq(sessionsAudit.userId, ctx.user.id))
      .orderBy(desc(sessionsAudit.occurredAt))
      .limit(input.limit);
    return { items: rows, limit: input.limit };
  }),
});
