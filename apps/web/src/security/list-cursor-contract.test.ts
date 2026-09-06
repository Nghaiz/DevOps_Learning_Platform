import { afterAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { appRouter } from '../server/trpc/routers/app-router';
import { users } from '../server/db/schema';
import { closeTestDb, ctxFor, testDb, uniqueId } from './test-helpers';

/**
 * C4 (phase-13) — hợp đồng `cursor`: một procedure NHẬN `cursor` thì phải DÙNG
 * nó; procedure chưa phân trang thì phải TỪ CHỐI nó.
 *
 * ⛔ Chế độ hỏng bộ này gác KHÔNG phải "thiếu tính năng", mà là một câu trả lời
 * KHÔNG THỂ ĐỎ: `listInputSchema` mang sẵn `cursor`, nên một procedure quên
 * hiện thực keyset vẫn NHẬN input đó và trả **trang 1** cho mọi giá trị cursor.
 * Client không thấy lỗi, không thấy khác biệt — nó hoặc dừng sớm (mất dữ liệu)
 * hoặc nối trang 1 vào cuối rồi lặp vô hạn. Đó là `green-that-proves-nothing`
 * ở tầng API.
 *
 * Bộ này có HAI VẾ, và vế thứ hai mới làm vế đầu có nghĩa:
 *  · vế cấm — 5 procedure chưa phân trang phải TỪ CHỐI `cursor`;
 *  · vế đối chứng dương — procedure C4 đòi cursor thật phải THỰC SỰ ĐỌC nó
 *    (bằng chứng: một cursor không tồn tại làm chúng ném "Cursor không còn hợp
 *    lệ", tức chúng đã đi tra cursor đó). Không có vế này, "mọi procedure đều
 *    từ chối cursor" cũng làm bộ test xanh — và đó là một API vô dụng.
 */

const learner = { id: uniqueId('cursor-contract-learner'), role: 'user' as const };
const author = { id: uniqueId('cursor-contract-author'), role: 'author' as const };

async function seedUser(u: { id: string; role: 'user' | 'author' }): Promise<void> {
  await testDb()
    .insert(users)
    .values({ id: u.id, name: u.id, email: `${u.id}@test.local`, role: u.role });
}

function caller(u: { id: string; role: 'user' | 'author' }) {
  return appRouter.createCaller(ctxFor(u));
}

afterAll(async () => {
  await closeTestDb();
});

describe('procedure CHƯA phân trang ⇒ `cursor` bị TỪ CHỐI, không bị phớt lờ', () => {
  it.each([
    ['session.history', async () => caller(learner).session.history({ cursor: 'x' } as never)],
    ['paths.mine', async () => caller(learner).paths.mine({ cursor: 'x' } as never)],
    ['paths.listMine', async () => caller(author).paths.listMine({ cursor: 'x' } as never)],
    [
      'quiz.listAttempts',
      async () => caller(learner).quiz.listAttempts({ quizId: 'q-nao-do', cursor: 'x' } as never),
    ],
    ['quiz.listMine', async () => caller(author).quiz.listMine({ cursor: 'x' } as never)],
  ])('%s({ cursor }) → BAD_REQUEST nêu đích danh key `cursor`', async (_name, call) => {
    await seedUser(learner).catch(() => undefined);
    await seedUser(author).catch(() => undefined);
    let thrown: unknown;
    try {
      await call();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe('BAD_REQUEST');
    // Thông điệp phải NÊU TÊN key — một 400 chung chung không nói cho client
    // biết field nào sai, và đây là thứ phân biệt "từ chối" với "hết dữ liệu".
    expect(JSON.stringify((thrown as TRPCError).message)).toContain('cursor');
  });

  it('cùng procedure đó KHÔNG có `cursor` → chạy bình thường (không phải cấm cả procedure)', async () => {
    await seedUser(learner).catch(() => undefined);
    const out = await caller(learner).session.history({ limit: 5 });
    expect(Array.isArray(out.items)).toBe(true);
    expect(out.limit).toBe(5);
  });
});

describe('đối chứng dương — procedure C4 đòi cursor thật THỰC SỰ tra cursor', () => {
  it.each([
    ['me.listProgress', async () => caller(learner).me.listProgress({ cursor: 'khong-ton-tai' })],
    [
      'me.listLabAttempts',
      async () => caller(learner).me.listLabAttempts({ cursor: 'khong-ton-tai' }),
    ],
    [
      'me.listQuizAttempts',
      async () => caller(learner).me.listQuizAttempts({ cursor: 'khong-ton-tai' }),
    ],
  ])('%s nhận cursor rồi ĐI TRA nó — cursor lạ ⇒ "Cursor không còn hợp lệ"', async (_n, call) => {
    await seedUser(learner).catch(() => undefined);
    await expect(call()).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof TRPCError &&
        error.code === 'BAD_REQUEST' &&
        error.message.includes('Cursor không còn hợp lệ'),
    );
  });

  it('admin.audit.list với cursor KHÔNG PHẢI uuid → 400 sạch, KHÔNG rò câu SQL', async () => {
    const admin = { id: uniqueId('cursor-contract-admin'), role: 'admin' as const };
    await testDb()
      .insert(users)
      .values({ id: admin.id, name: admin.id, email: `${admin.id}@test.local`, role: 'admin' });

    let thrown: unknown;
    try {
      await appRouter.createCaller(ctxFor(admin)).admin.audit.list({ cursor: 'khong-phai-uuid' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe('BAD_REQUEST');
    // ⛔ Vế QUAN TRỌNG NHẤT: `errorFormatter` không xoá `message`, nên một lỗi
    // Drizzle lọt ra đây là NGUYÊN VĂN câu SQL + `params` (có `user_id`) đi
    // thẳng vào trình duyệt.
    expect((thrown as TRPCError).message).not.toContain('select');
    expect((thrown as TRPCError).message).not.toContain('params');
    expect((thrown as TRPCError).message).not.toContain(admin.id);
  });

  it.each([
    ['paths.list', async () => caller(learner).paths.list({ cursor: 'zzzz-khong-ton-tai' })],
    ['quiz.list', async () => caller(learner).quiz.list({ cursor: 'zzzz-khong-ton-tai' })],
  ])('%s CHẤP NHẬN cursor (keyset thuần) và trả về shape có nextCursor', async (_n, call) => {
    await seedUser(learner).catch(() => undefined);
    const out = await call();
    expect(out).toHaveProperty('items');
    expect(out).toHaveProperty('nextCursor');
  });
});
