import { afterAll, describe, expect, it } from 'vitest';
import { appRouter } from '../server/trpc/routers/app-router';
import { listInputSchema, MAX_LIST_LIMIT } from '../server/trpc/init';
import { closeTestDb, ctxFor, uniqueId } from './test-helpers';

/**
 * Luật 4 — list request `limit=1000000` → server ÉP về ≤100 (không phải reject).
 *
 * Mức test: UNIT (schema Zod thuần, chính xác nhất — không phụ thuộc DB) +
 * INTEGRATION nhẹ (qua `session.history`, DB thật nhưng user không có dòng nào
 * nên không cần seed dữ liệu).
 */
describe('luật 4 — pagination cap', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  it('limit=1000000 → ép về đúng MAX_LIST_LIMIT (100), KHÔNG throw', () => {
    const result = listInputSchema.parse({ limit: 1_000_000 });
    expect(result.limit).toBe(MAX_LIST_LIMIT);
    expect(MAX_LIST_LIMIT).toBe(100);
  });

  it('limit trong hạn mức (50) → giữ nguyên, không bị ép xuống mức mặc định', () => {
    expect(listInputSchema.parse({ limit: 50 }).limit).toBe(50);
  });

  it('không truyền limit → dùng default, vẫn ≤ MAX_LIST_LIMIT', () => {
    const result = listInputSchema.parse({});
    expect(result.limit).toBeLessThanOrEqual(MAX_LIST_LIMIT);
  });

  it('limit=0 hoặc âm → reject (không phải "ép", vì 0/âm không phải cỡ trang hợp lệ)', () => {
    expect(() => listInputSchema.parse({ limit: 0 })).toThrow();
    expect(() => listInputSchema.parse({ limit: -5 })).toThrow();
  });

  it('session.history với limit=1000000 qua tRPC thật → response.limit ép về 100', async () => {
    const caller = appRouter.createCaller(ctxFor({ id: uniqueId('rule4-user'), role: 'user' }));
    const result = await caller.session.history({ limit: 1_000_000 });
    expect(result.limit).toBe(MAX_LIST_LIMIT);
    expect(Array.isArray(result.items)).toBe(true);
  });
});
