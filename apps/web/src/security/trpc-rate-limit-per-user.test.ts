import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../server/trpc/routers/app-router';
import { TRPC_MUTATION_LIMIT_PER_MIN, TRPC_QUERY_LIMIT_PER_MIN } from '../server/trpc/init';
import { resetRateLimitState } from '../server/security/rate-limit';
import { closeTestDb, ctxFor, uniqueId } from './test-helpers';

/**
 * Rate limit PER-USER cho tRPC (P1 — chặn pod-bomb, xem `server/trpc/init.ts` +
 * `docs/web-auth-security.md`). KHÔNG thuộc bảng luật 1-9 gốc (P0.D) — bổ sung khi
 * orchestrator ở P1 bắt đầu sinh pod sandbox thật, đóng lỗ hổng: user đã đăng nhập
 * hợp lệ spam `session.create` với `userId` của CHÍNH MÌNH (qua được luật 1
 * `assertOwnerOrAdmin`) vẫn phải bị chặn ở tầng rate limit.
 *
 * Mức test: INTEGRATION nhẹ — giống `rule-01-authz.test.ts`, gọi thẳng
 * `appRouter.createCaller` (không qua HTTP), DB thật, KHÔNG cần orchestrator chạy.
 *
 * Mẹo tốc độ: mọi call `session.create` trong file này CỐ Ý dùng `userId` LỆCH chủ
 * sở hữu (`'someone-else'`/`'x'`) — `assertOwnerOrAdmin` trả FORBIDDEN NGAY ở đầu
 * resolver, TRƯỚC KHI chạm mint JWT / gRPC ra orchestrator. Middleware rate limit
 * đứng TRƯỚC bước đó trong chain (`protectedProcedure` ở `server/trpc/init.ts`) nên
 * request vẫn tính vào bucket — kết quả FORBIDDEN (còn hạn mức) vs
 * TOO_MANY_REQUESTS (hết hạn mức) đủ phân biệt hai trạng thái, không cần
 * orchestrator đang chạy và không tốn thời gian gRPC timeout.
 */
describe('tRPC rate limit PER-USER — chặn pod-bomb (P1)', () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('vượt TRPC_MUTATION_LIMIT_PER_MIN cho một user → TOO_MANY_REQUESTS', async () => {
    const caller = appRouter.createCaller(ctxFor({ id: uniqueId('mut-user'), role: 'user' }));

    for (let i = 0; i < TRPC_MUTATION_LIMIT_PER_MIN; i += 1) {
      const outcome = await caller.session
        .create({ userId: 'someone-else', tier: 1, ttlSeconds: 0, idempotencyKey: `k${i}` })
        .then(() => null)
        .catch((error: unknown) => error);
      // Trong hạn mức: chặn ở luật 1 (FORBIDDEN), KHÔNG PHẢI ở rate limit.
      expect(outcome).toBeInstanceOf(TRPCError);
      expect((outcome as TRPCError).code).toBe('FORBIDDEN');
    }

    await expect(
      caller.session.create({ userId: 'someone-else', tier: 1, ttlSeconds: 0, idempotencyKey: 'over-limit' }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === 'TOO_MANY_REQUESTS',
    );
  });

  it('user A hết hạn mức KHÔNG làm user B bị chặn theo — bucket cô lập theo userId (test quan trọng nhất)', async () => {
    const callerA = appRouter.createCaller(ctxFor({ id: uniqueId('iso-a'), role: 'user' }));
    const callerB = appRouter.createCaller(ctxFor({ id: uniqueId('iso-b'), role: 'user' }));

    for (let i = 0; i < TRPC_MUTATION_LIMIT_PER_MIN; i += 1) {
      await createAsForeignUser(callerA, `a${i}`).catch(() => null);
    }
    // A đã cạn hạn mức mutation.
    await expect(createAsForeignUser(callerA, 'a-over')).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === 'TOO_MANY_REQUESTS',
    );

    // B dùng bucket riêng (key khoá theo ctx.user.id) — request ĐẦU TIÊN của B vẫn
    // được rate limit cho qua (chặn ở FORBIDDEN của luật 1, không phải rate limit).
    const outcomeB = await createAsForeignUser(callerB, 'b1')
      .then(() => null)
      .catch((error: unknown) => error);
    expect(outcomeB).toBeInstanceOf(TRPCError);
    expect((outcomeB as TRPCError).code).toBe('FORBIDDEN');
  });

  it('query và mutation có hạn mức riêng — cạn mutation không ảnh hưởng query', async () => {
    expect(TRPC_QUERY_LIMIT_PER_MIN).not.toBe(TRPC_MUTATION_LIMIT_PER_MIN);

    const caller = appRouter.createCaller(ctxFor({ id: uniqueId('qm-user'), role: 'user' }));

    for (let i = 0; i < TRPC_MUTATION_LIMIT_PER_MIN; i += 1) {
      await createAsForeignUser(caller, `m${i}`).catch(() => null);
    }
    await expect(createAsForeignUser(caller, 'm-over')).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === 'TOO_MANY_REQUESTS',
    );

    // Bucket query (`trpc:query:<userId>`) tách biệt khỏi bucket mutation
    // (`trpc:mutation:<userId>`) dù cùng một user — query vẫn còn hạn mức.
    const queryOutcome = await caller.session
      .history({ limit: 1 })
      .then(() => null)
      .catch((error: unknown) => error);
    const queryCode = queryOutcome instanceof TRPCError ? queryOutcome.code : null;
    expect(queryCode).not.toBe('TOO_MANY_REQUESTS');
  });

  it('resetRateLimitState() giữa các test → cùng userId nhưng không rò state từ test trước', async () => {
    const FIXED_USER_ID = 'reset-check-user';

    // Vòng 1: dùng cạn hạn mức mutation cho FIXED_USER_ID.
    const callerRound1 = appRouter.createCaller(ctxFor({ id: FIXED_USER_ID, role: 'user' }));
    for (let i = 0; i < TRPC_MUTATION_LIMIT_PER_MIN; i += 1) {
      await createAsForeignUser(callerRound1, `r1-${i}`).catch(() => null);
    }
    await expect(createAsForeignUser(callerRound1, 'r1-over')).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === 'TOO_MANY_REQUESTS',
    );

    // resetRateLimitState() chạy lại ở beforeEach của MỘT test khác — mô phỏng
    // bằng cách gọi trực tiếp ở đây rồi kiểm tra CÙNG userId có hạn mức đầy đủ trở
    // lại (nếu buckets không được clear, request dưới đây sẽ vẫn là
    // TOO_MANY_REQUESTS thay vì FORBIDDEN).
    resetRateLimitState();
    const callerRound2 = appRouter.createCaller(ctxFor({ id: FIXED_USER_ID, role: 'user' }));
    const outcome = await createAsForeignUser(callerRound2, 'r2-1')
      .then(() => null)
      .catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(TRPCError);
    expect((outcome as TRPCError).code).toBe('FORBIDDEN');
  });
});

/** Helper dùng chung — gọi `session.create` với userId lệch chủ sở hữu (xem ghi chú ở đầu file). */
function createAsForeignUser(caller: ReturnType<typeof appRouter.createCaller>, idempotencyKey: string) {
  return caller.session.create({ userId: 'x', tier: 1, ttlSeconds: 0, idempotencyKey });
}
