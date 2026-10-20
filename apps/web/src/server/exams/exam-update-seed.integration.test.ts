import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeTestDb, ctxFor, purgeLeakedFixtures, testDb, uniqueId } from '../../security/test-helpers';
import { exams, problems, users } from '../db/schema';
import { appRouter } from '../trpc/routers/app-router';

/**
 * `exams.update` đổi sang `fixed` phải mang theo một `fixed_seed`.
 *
 * Bản đầu chỉ ghi `seed_strategy`: kỳ thi tạo dạng `per-student` (seed null) rồi sửa
 * thành "cùng đề cho cả lớp" thì trang báo `fixed` mà `startAttempt` vẫn sinh seed
 * riêng cho từng người (`crud.ts`, nhánh `fixedSeed !== null`). Đường này chỉ mở ra
 * khi giao diện quản trị bắt đầu gọi `exams.update` (bản dựng lại PTIT).
 *
 * Kỳ thi `per-student` được chèn thẳng vào bảng: cổng soạn đề đòi bài seedable cho
 * `per-student`, mà thứ cần đo ở đây là lượt SỬA, không phải lượt tạo.
 */

const ADMIN = uniqueId('seed-adm');
let classId = '';
let publishedCode = '';

const admin = () => appRouter.createCaller(ctxFor({ id: ADMIN, role: 'admin' }));

async function seedOf(examId: string): Promise<number | null> {
  const [row] = await testDb().select({ fixedSeed: exams.fixedSeed }).from(exams).where(eq(exams.id, examId));
  if (row === undefined) throw new Error(`không thấy kỳ thi ${examId}`);
  return row.fixedSeed;
}

/** Thân `exams.update` dạng `fixed`. Không đo chiều ngược (`fixed` → `per-student`):
 *  cổng soạn đề đòi bài seedable, và lượt 2026-10-20 chưa có bài nào seedable. */
function fixedBody() {
  return {
    classId,
    title: uniqueId('Ky-thi-seed'),
    problemCodes: [publishedCode],
    durationMinutes: 45,
    seedStrategy: 'fixed' as const,
    opensAt: null,
    closesAt: null,
  };
}

beforeAll(async () => {
  await purgeLeakedFixtures(testDb());
  await testDb()
    .insert(users)
    .values({ id: ADMIN, name: 'Giảng viên', email: `${ADMIN}@test.local`, role: 'admin' });
  classId = (await admin().classes.create({ name: uniqueId('Lop-seed') })).id;

  const [seeded] = await testDb()
    .select({ code: problems.code })
    .from(problems)
    .where(eq(problems.state, 'published'))
    .limit(1);
  if (seeded === undefined) {
    throw new Error('DB test chưa có bài nào đã xuất bản — chạy `seed-content` trước');
  }
  publishedCode = seeded.code;
});

afterAll(async () => {
  // `classes` và `exams` cascade từ `users`.
  await testDb().delete(users).where(inArray(users.id, [ADMIN]));
  await closeTestDb();
});

describe('exams.update · fixed_seed đi theo seed_strategy', () => {
  it('per-student → fixed: sinh seed; sửa tiếp vẫn fixed: GIỮ seed cũ', async () => {
    const [row] = await testDb()
      .insert(exams)
      .values({
        ownerId: ADMIN,
        classId,
        title: uniqueId('Ky-thi-seed'),
        problemCodes: [publishedCode],
        durationMinutes: 45,
        seedStrategy: 'per-student',
        fixedSeed: null,
        opensAt: null,
        closesAt: null,
      })
      .returning({ id: exams.id });
    if (row === undefined) throw new Error('không chèn được kỳ thi');

    await admin().exams.update({ ...fixedBody(), examId: row.id });
    const first = await seedOf(row.id);
    expect(first, 'đổi sang fixed mà fixed_seed vẫn null').not.toBeNull();

    await admin().exams.update({ ...fixedBody(), examId: row.id });
    expect(await seedOf(row.id), 'sửa lần hai đổi seed dưới chân lớp').toBe(first);
  });
});
