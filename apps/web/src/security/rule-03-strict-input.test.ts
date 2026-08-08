import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../server/trpc/routers/app-router';
import { closeTestDb, ctxFor } from './test-helpers';

/**
 * Luật 3 — payload có field thừa hoặc sai type → tRPC reject 400 (Zod `.strict()`).
 * Không dùng Mongo ở đâu cả.
 *
 * Mức test: INTEGRATION nhẹ (tRPC caller thật, KHÔNG qua HTTP) cho phần Zod; UNIT
 * (đọc package.json) cho phần "không Mongo".
 */
describe('luật 3 — Zod strict + required, không Mongo', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  const authedCtx = () => ctxFor({ id: 'user-a', role: 'user' });

  it('field thừa (không khai báo trong schema) → BAD_REQUEST', async () => {
    const caller = appRouter.createCaller(authedCtx());

    await expect(
      // Object LITERAL trực tiếp tại call site (không qua biến trung gian) — TS
      // excess-property-check chỉ áp dụng cho literal, cần giữ đúng hình dạng này
      // để @ts-expect-error không bị "Unused directive".
      // @ts-expect-error — cố tình gửi field thừa để kiểm .strict() từ chối nó.
      caller.session.get({ sessionId: 's1', userId: 'user-a', extraField: 'khong-duoc-phep' }),
    ).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === 'BAD_REQUEST');
  });

  it('thiếu field bắt buộc (userId) → BAD_REQUEST', async () => {
    const caller = appRouter.createCaller(authedCtx());

    await expect(
      // @ts-expect-error — thiếu userId bắt buộc.
      caller.session.get({ sessionId: 's1' }),
    ).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === 'BAD_REQUEST');
  });

  it('sai type (sessionId là number thay vì string) → BAD_REQUEST', async () => {
    const caller = appRouter.createCaller(authedCtx());

    await expect(
      // @ts-expect-error — sessionId phải là string.
      caller.session.get({ sessionId: 123, userId: 'user-a' }),
    ).rejects.toSatisfy((error: unknown) => error instanceof TRPCError && error.code === 'BAD_REQUEST');
  });

  it('payload hợp lệ, ĐÚNG field → KHÔNG bị BAD_REQUEST (authz/Zod cho qua)', async () => {
    const caller = appRouter.createCaller(authedCtx());
    const outcome = await caller.session
      .get({ sessionId: 's1', userId: 'user-a' })
      .then(() => null)
      .catch((error: unknown) => error);

    if (outcome instanceof TRPCError) {
      expect(outcome.code).not.toBe('BAD_REQUEST');
    }
  });

  it('không package nào trong apps/web hay packages/* tham chiếu Mongo', () => {
    const roots = ['apps/web/package.json', 'packages/ui/package.json', 'packages/shared-types/package.json'];
    const repoRoot = path.resolve(import.meta.dirname, '../../../..');

    for (const relPath of roots) {
      const raw = readFileSync(path.join(repoRoot, relPath), 'utf8');
      expect(raw.toLowerCase()).not.toContain('mongo');
    }
  });
});
