import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDb, ctxFor, testDb, uniqueId } from '../../../security/test-helpers';
import { progress, users } from '../../db/schema';
import { appRouter } from './app-router';
import { toProgressRowDTO } from './me';

/**
 * `me.listProgress` — HÌNH DẠNG ĐI QUA DÂY, không phải kiểu TS suy ra.
 *
 * ⛔ VÌ SAO KHÔNG KHẲNG ĐỊNH BẰNG KIỂU: dây tRPC ở đây không có transformer, nên
 * một cột `timestamp` mà router trả thẳng là `Date` trong TS và là **chuỗi** sau
 * `JSON.stringify`. Kiểu client suy ra khi đó nói `Date` — sai — và không
 * typecheck nào đỏ, vì kiểu sai vẫn tự nhất quán với chính nó. Chỉ một khẳng
 * định LÚC CHẠY mới phân biệt được hai thứ đó.
 *
 * ⚠ `createCaller` bỏ qua tầng serialize (ghi ở `authoring.integration.test.ts`)
 * — và ở ĐÚNG bộ này, đó là điều ta cần: nó trả về nguyên vật thể resolver vừa
 * dựng, nên một `Date` sót lại hiện nguyên hình thay vì bị `JSON.stringify` âm
 * thầm biến thành chuỗi và giấu lỗi đi.
 *
 * Ca cuối là cổng RỘNG hơn `updatedAt`: nó đòi payload phải sống sót một vòng
 * `JSON` mà không đổi. Nó đỏ cho MỌI giá trị không đi được qua dây — `Date`,
 * `undefined`, và `bigint` (`JSON.stringify` NÉM trên bigint — đúng cái đã làm
 * 500 thật ở P2). Một cổng chỉ nhìn `updatedAt` sẽ bỏ lọt cột tiếp theo ai đó
 * thêm vào.
 *
 * ⚠ ĐÒI Postgres.
 */

const ME = { id: uniqueId('me-wire'), role: 'user' as const };
const LESSON_ID = uniqueId('me-wire-lesson');

beforeAll(async () => {
  const db = testDb();
  await db.insert(users).values({ id: ME.id, name: ME.id, email: `${ME.id}@test.local`, role: 'user' });
  await db.insert(progress).values({
    userId: ME.id,
    lessonId: LESSON_ID,
    stepIndex: 2,
    completedAt: new Date('2026-09-06T10:00:00.000Z'),
  });
});

afterAll(async () => {
  const db = testDb();
  await db.delete(progress).where(eq(progress.userId, ME.id));
  await db.delete(users).where(eq(users.id, ME.id));
  await closeTestDb();
});

describe('me.listProgress — hình dạng đi qua dây', () => {
  it('mọi cột thời gian là CHUỖI lúc chạy, không phải Date', async () => {
    const out = await appRouter.createCaller(ctxFor(ME)).me.listProgress({ limit: 10 });
    const row = out.items[0];

    // Đối chứng dương: có dòng thật để soi. Không có nó, ba khẳng định dưới
    // đều "đúng" trên một danh sách rỗng.
    expect(row).toBeDefined();
    expect(row?.lessonId).toBe(LESSON_ID);

    expect(typeof row?.updatedAt).toBe('string');
    expect(typeof row?.createdAt).toBe('string');
    expect(typeof row?.completedAt).toBe('string');
    expect(row?.updatedAt).not.toBeInstanceOf(Date);
  });

  it('payload sống sót một vòng JSON mà KHÔNG đổi', async () => {
    const out = await appRouter.createCaller(ctxFor(ME)).me.listProgress({ limit: 10 });

    expect(JSON.parse(JSON.stringify(out.items))).toEqual(out.items);
  });
});

describe('toProgressRowDTO', () => {
  it('Date vào, chuỗi ISO ra; completedAt null giữ nguyên null', () => {
    const dto = toProgressRowDTO({
      id: 'row-1',
      userId: 'u-1',
      lessonId: 'lesson-1',
      stepIndex: 3,
      completedAt: null,
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-01-02T03:04:06.000Z'),
    });

    expect(dto.completedAt).toBeNull();
    expect(dto.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(dto.updatedAt).toBe('2026-01-02T03:04:06.000Z');
  });
});
