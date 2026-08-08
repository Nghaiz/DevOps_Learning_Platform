import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { SandboxTier } from '@devops-platform/shared-types';
import { sessionsAudit } from '../../db/schema';
import { mintAccessTokenFor } from '../../auth/jwt';
import { callOrchestrator, orchestratorClient } from '../../grpc/orchestrator-client';
import { assertOwnerOrAdmin, createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

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
    idempotencyKey: z.string().min(1),
  })
  .strict();

const claimInput = z.object({ sessionId: z.string().min(1), userId: z.string().min(1) }).strict();

const getInput = z.object({ sessionId: z.string().min(1), userId: z.string().min(1) }).strict();

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
  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    return callOrchestrator(() =>
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
  }),

  claim: protectedProcedure.input(claimInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    return callOrchestrator(() =>
      orchestratorClient().claimSession(
        { sessionId: input.sessionId, userId: input.userId },
        { headers },
      ),
    );
  }),

  /** Luật 1 — kiểm chuẩn: user A gọi get với userId=B (không phải chính mình) → 403. */
  get: protectedProcedure.input(getInput).query(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    return callOrchestrator(() =>
      orchestratorClient().getSession(
        { sessionId: input.sessionId, userId: input.userId },
        { headers },
      ),
    );
  }),

  reap: protectedProcedure.input(reapInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    return callOrchestrator(() =>
      orchestratorClient().reapSession(
        {
          sessionId: input.sessionId,
          reason: input.reason,
          actor: { case: 'userId', value: input.userId },
        },
        { headers },
      ),
    );
  }),

  /**
   * KHÔNG có RPC gRPC tương ứng ở proto v0 — lịch sử audit đọc thẳng Postgres
   * (sessions_audit, 0.C). Luôn lọc theo chính ctx.user.id (không nhận userId từ
   * input) nên không cần assertOwnerOrAdmin ở đây. Luật 4: limit ép về ≤100.
   */
  history: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(sessionsAudit)
      .where(eq(sessionsAudit.userId, ctx.user.id))
      .orderBy(desc(sessionsAudit.occurredAt))
      .limit(input.limit);
    return { items: rows, limit: input.limit };
  }),
});
