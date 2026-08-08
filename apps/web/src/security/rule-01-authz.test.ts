import { afterAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../server/trpc/routers/app-router';
import { closeTestDb, ctxFor } from './test-helpers';

/**
 * Luật 1 — object-level authz: truy cập resource của user khác qua tRPC → 403.
 *
 * Mức test: INTEGRATION nhẹ — gọi thẳng `appRouter.createCaller` (không qua HTTP),
 * dùng DB thật (docker compose) nhưng KHÔNG cần services/orchestrator đang chạy:
 * `assertOwnerOrAdmin` (server/trpc/init.ts) throw TRƯỚC KHI gói tin rời BFF, nên
 * case FORBIDDEN không chạm gRPC. Case "authz cho qua" chỉ khẳng định KHÔNG PHẢI
 * FORBIDDEN/UNAUTHORIZED — kết quả cụ thể sau đó (NOT_IMPLEMENTED hay lỗi kết nối)
 * phụ thuộc orchestrator có đang chạy hay không, ngoài phạm vi luật 1.
 */
describe('luật 1 — object-level authz (session.get)', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  it('user A gọi resource với userId=B (không phải chính mình) → FORBIDDEN', async () => {
    const caller = appRouter.createCaller(ctxFor({ id: 'user-a', role: 'user' }));

    await expect(caller.session.get({ sessionId: 'sess-1', userId: 'user-b' })).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === 'FORBIDDEN',
    );
  });

  it('user chưa đăng nhập (ctx.user = null) → UNAUTHORIZED, không lộ 403/khác', async () => {
    const caller = appRouter.createCaller(ctxFor(null));

    await expect(caller.session.get({ sessionId: 'sess-1', userId: 'user-b' })).rejects.toSatisfy(
      (error: unknown) => error instanceof TRPCError && error.code === 'UNAUTHORIZED',
    );
  });

  it('user A gọi đúng resource của chính mình → KHÔNG bị chặn ở tầng authz', async () => {
    const caller = appRouter.createCaller(ctxFor({ id: 'user-a', role: 'user' }));

    const outcome = await caller.session
      .get({ sessionId: 'sess-1', userId: 'user-a' })
      .then(() => null)
      .catch((error: unknown) => error);

    if (outcome instanceof TRPCError) {
      expect(outcome.code).not.toBe('FORBIDDEN');
      expect(outcome.code).not.toBe('UNAUTHORIZED');
    }
  });

  it('admin gọi resource của user khác → bỏ qua kiểm tra owner, KHÔNG bị FORBIDDEN', async () => {
    const caller = appRouter.createCaller(ctxFor({ id: 'admin-1', role: 'admin' }));

    const outcome = await caller.session
      .get({ sessionId: 'sess-1', userId: 'someone-else' })
      .then(() => null)
      .catch((error: unknown) => error);

    if (outcome instanceof TRPCError) {
      expect(outcome.code).not.toBe('FORBIDDEN');
    }
  });

  it('create/claim/reap cũng chặn userId khác chủ sở hữu → FORBIDDEN', async () => {
    const caller = appRouter.createCaller(ctxFor({ id: 'user-a', role: 'user' }));

    await expect(
      caller.session.create({ userId: 'user-b', tier: 1, ttlSeconds: 0, idempotencyKey: 'k1' }),
    ).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === 'FORBIDDEN');

    await expect(
      caller.session.claim({ sessionId: 'sess-1', userId: 'user-b' }),
    ).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === 'FORBIDDEN');

    await expect(
      caller.session.reap({ sessionId: 'sess-1', reason: 'test', userId: 'user-b' }),
    ).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === 'FORBIDDEN');
  });
});
