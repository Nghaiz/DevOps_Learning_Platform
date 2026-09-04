import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq, inArray } from 'drizzle-orm';
import { closeTestDb, ctxFor, testDb, uniqueId } from '../../../security/test-helpers';
import { contentItems, contentSteps, users } from '../../db/schema';
import { appRouter } from './app-router';
import { draftIdFor } from './authoring';

/**
 * Router soạn bài chạy trên **DB thật** — vế mà bộ unit không với tới.
 *
 * `authoring-idor.test.ts` kiểm *hình dạng schema* (không có field `authorId`);
 * bộ này kiểm *hành vi lúc chạy*: một author khác gọi `update` trên bài của
 * người ta thì nhận gì, và bài đã xuất bản có bị đổi dưới chân người học không.
 *
 * ⚠ ĐÒI Postgres. ⚠ `createCaller` bỏ qua tầng serialize của tRPC
 * (`docs`/kinh nghiệm P8): nó đúng cho khẳng định về DB và authz ở đây, nhưng
 * KHÔNG chứng minh gì về hình dạng JSON trả về trình duyệt.
 */

const AUTHOR_A = uniqueId('u-a');
const AUTHOR_B = uniqueId('u-b');
const created: string[] = [];

function callerAs(id: string, role: 'author' | 'admin' | 'user') {
  return appRouter.createCaller(ctxFor({ id, role }));
}

function draftPayload(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: 'Bài gốc',
    tier: 'sysbox',
    backendImageId: 'ubuntu',
    difficulty: 'beginner',
    steps: [{ markdown: '# bước một', title: 'Bước 1' }],
    ...over,
  };
}

beforeAll(async () => {
  const db = testDb();
  for (const id of [AUTHOR_A, AUTHOR_B]) {
    await db.insert(users).values({ id, name: id, email: `${id}@example.test` });
  }
});

afterAll(async () => {
  const db = testDb();
  const all = [...created, ...created.map(draftIdFor)];
  if (all.length > 0) {
    await db.delete(contentItems).where(inArray(contentItems.id, all));
  }
  await db.delete(users).where(inArray(users.id, [AUTHOR_A, AUTHOR_B]));
  await closeTestDb();
});

/** `create` đòi `kind`; `update` thì KHÔNG (loại nội dung không đổi được sau khi tạo). */
async function createOwned(author: string, over: Record<string, unknown> = {}): Promise<string> {
  const id = uniqueId('bai');
  created.push(id);
  await callerAs(author, 'author').authoring.create(
    draftPayload(id, { kind: 'lesson', ...over }) as never,
  );
  return id;
}

describe('quyền sở hữu lúc CHẠY (rủi ro score 20)', () => {
  it('author khác KHÔNG sửa được bài của người ta — và nhận NOT_FOUND, không FORBIDDEN', async () => {
    const id = await createOwned(AUTHOR_A);

    await expect(
      callerAs(AUTHOR_B, 'author').authoring.update(
        draftPayload(id, { title: 'BỊ CHIẾM' }) as never,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Khẳng định ở tầng DỮ LIỆU, không chỉ ở mã lỗi: một cổng ném đúng mã nhưng
    // vẫn ghi trước khi ném là cổng vô dụng.
    const [row] = await testDb().select().from(contentItems).where(eq(contentItems.id, id));
    expect(row?.title).toBe('Bài gốc');
    expect(row?.authorId).toBe(AUTHOR_A);
  });

  it('ĐỐI CHỨNG DƯƠNG: chủ thật sửa được', async () => {
    const id = await createOwned(AUTHOR_A);
    await callerAs(AUTHOR_A, 'author').authoring.update(
      draftPayload(id, { title: 'Đã sửa' }) as never,
    );
    const [row] = await testDb().select().from(contentItems).where(eq(contentItems.id, id));
    expect(row?.title).toBe('Đã sửa');
  });

  it('admin sửa được bài của người khác', async () => {
    const id = await createOwned(AUTHOR_A);
    await callerAs('admin-1', 'admin').authoring.update(
      draftPayload(id, { title: 'Admin sửa' }) as never,
    );
    const [row] = await testDb().select().from(contentItems).where(eq(contentItems.id, id));
    expect(row?.title).toBe('Admin sửa');
    // Quyền sở hữu KHÔNG đổi chủ khi admin đụng vào.
    expect(row?.authorId).toBe(AUTHOR_A);
  });

  it('vai trò `user` bị chặn ở cổng THỨ NHẤT', async () => {
    await expect(
      callerAs(AUTHOR_A, 'user').authoring.list(),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it('author chỉ thấy bài của CHÍNH MÌNH trong authoring.list', async () => {
    const mineId = await createOwned(AUTHOR_A);
    const theirs = await createOwned(AUTHOR_B);

    const seen = (await callerAs(AUTHOR_A, 'author').authoring.list()).map((r) => r.id);
    expect(seen).toContain(mineId);
    expect(seen).not.toContain(theirs);
  });
});

describe('sửa bài ĐÃ XUẤT BẢN không đổi nội dung dưới chân người học (task 20)', () => {
  it('update trên bài published tạo BẢN NHÁP KẾ NHIỆM, bản gốc không đổi một byte', async () => {
    const id = await createOwned(AUTHOR_A);
    const db = testDb();
    // Đưa thẳng sang `published` — `publish` thật cần sandbox, ngoài tầm bộ này.
    await db.update(contentItems).set({ state: 'published' }).where(eq(contentItems.id, id));

    const result = await callerAs(AUTHOR_A, 'author').authoring.update(
      draftPayload(id, {
        title: 'Bản mới',
        steps: [{ markdown: '# bước một ĐÃ SỬA', title: 'Bước 1' }],
      }) as never,
    );

    expect(result).toMatchObject({ id: draftIdFor(id), supersedes: id });

    // Bản ĐANG CHẠY: từng byte như cũ.
    const [live] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(live?.title).toBe('Bài gốc');
    expect(live?.state).toBe('published');
    const liveSteps = await db.select().from(contentSteps).where(eq(contentSteps.contentId, id));
    expect(liveSteps[0]?.markdown).toBe('# bước một');

    // Bản nháp kế nhiệm: nội dung mới, state draft, CÙNG chủ sở hữu.
    const [draft] = await db.select().from(contentItems).where(eq(contentItems.id, draftIdFor(id)));
    expect(draft?.title).toBe('Bản mới');
    expect(draft?.state).toBe('draft');
    expect(draft?.authorId).toBe(AUTHOR_A);
  });

  it('sửa LẦN HAI ghi đè bản nháp, không đẻ ra bản thứ ba', async () => {
    const id = await createOwned(AUTHOR_A);
    const db = testDb();
    await db.update(contentItems).set({ state: 'published' }).where(eq(contentItems.id, id));

    const caller = callerAs(AUTHOR_A, 'author');
    await caller.authoring.update(draftPayload(id, { title: 'Lần 1' }) as never);
    await caller.authoring.update(draftPayload(id, { title: 'Lần 2' }) as never);

    const [draft] = await db.select().from(contentItems).where(eq(contentItems.id, draftIdFor(id)));
    expect(draft?.title).toBe('Lần 2');
    const steps = await db
      .select()
      .from(contentSteps)
      .where(eq(contentSteps.contentId, draftIdFor(id)));
    // Xoá-rồi-chèn trong MỘT transaction: đúng một bộ bước, không cộng dồn.
    expect(steps).toHaveLength(1);
  });
});

describe('archive thay cho XOÁ (task 19)', () => {
  it('archive đổi state, hàng vẫn còn — tiến độ người học không trỏ vào hư không', async () => {
    const id = await createOwned(AUTHOR_A);
    await callerAs(AUTHOR_A, 'author').authoring.archive({ id });

    const [row] = await testDb().select().from(contentItems).where(eq(contentItems.id, id));
    expect(row).toBeDefined();
    expect(row?.state).toBe('archived');
  });
});

describe('chuẩn hoá xuống dòng đi TỚI TẬN DB', () => {
  it('script CRLF gửi lên được lưu dưới dạng LF', async () => {
    // `authoring-input.test.ts` kiểm ở tầng schema. Đây là vế còn lại: giá trị
    // đã chuẩn hoá thật sự là thứ nằm trong cột — nơi `execShell` (bash) đọc.
    const id = await createOwned(AUTHOR_A, {
      steps: [{ markdown: '# a\r\nb', verifyScript: 'set -e\r\ntrue\r\n' }],
    });

    const [step] = await testDb().select().from(contentSteps).where(eq(contentSteps.contentId, id));
    expect(step?.markdown).not.toContain('\r');
    expect(step?.verifyScript).toBe('set -e\ntrue\n');
  });
});
