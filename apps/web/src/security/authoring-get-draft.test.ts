import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';
import { closeTestDb, ctxFor, testDb, uniqueId } from './test-helpers';
import { contentItems, users } from '../server/db/schema';
import { appRouter } from '../server/trpc/routers/app-router';

/**
 * `authoring.get` — bản nháp GHI ĐƯỢC phải ĐỌC LẠI ĐƯỢC, và chỉ bởi chủ của nó.
 *
 * Bộ này khẳng định hai thứ khác nhau, và cả hai đều cần DB thật:
 *
 * 1. **Cái lỗ đã đóng.** `preview` đọc qua nguồn hợp nhất, và nguồn DB
 *    `safeParse` bằng CHÍNH schema xuất bản rồi trả `null` khi trượt. Nhưng
 *    `authoring.create` cho lưu một bản nháp 0 bước, và một task lab không có
 *    `verifyScript`. Nên tồn tại một tập bản nháp GHI được mà `preview` không
 *    ĐỌC được — form soạn mở lại là trắng. `get` phải trả về chúng.
 *
 *    ⚠ Vế "preview trả null" một mình KHÔNG chứng minh gì (một `preview` hỏng
 *    hoàn toàn cũng trả null). Nên mỗi ca đều có ĐỐI CHỨNG DƯƠNG: cùng đường
 *    `preview` đó, với một bản nháp HỢP LỆ, phải trả về nội dung.
 *
 * 2. **Bề mặt IDOR mới.** `get` trả THÂN của một bài theo id — ngang hàng
 *    `preview`/`update`, tức là rủi ro score 20 của phase-9. `author` không
 *    phải chủ và `user` đều phải bị từ chối, và phép từ chối KHÔNG được để lộ
 *    bài đó có tồn tại hay không.
 *
 * ⚠ ĐÒI Postgres (`docker compose up -d postgres` + `pnpm db:migrate`).
 * ⚠ `createCaller` bỏ qua tầng serialize của tRPC — bộ này khẳng định về authz
 * và về DB, KHÔNG về hình dạng JSON mà trình duyệt nhận.
 */

const AUTHOR_A = uniqueId('u-get-a');
const AUTHOR_B = uniqueId('u-get-b');
const created: string[] = [];

function callerAs(id: string, role: 'author' | 'admin' | 'user') {
  return appRouter.createCaller(ctxFor({ id, role }));
}

/** Bản nháp tối thiểu. `steps` để caller quyết định — đó là biến của cả bộ này. */
function draftPayload(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    kind: 'lesson',
    title: 'Bản nháp còn dở',
    tier: 'sysbox',
    backendImageId: 'ubuntu',
    // `contentBaseSchema.difficulty` là enum KHÔNG nullable, nên `null` ở đây sẽ
    // làm CẢ bài hợp lệ cũng trượt `preview` — và đối chứng dương mất nghĩa.
    difficulty: 'beginner',
    steps: [],
    ...over,
  };
}

async function create(author: string, over: Record<string, unknown> = {}): Promise<string> {
  const id = uniqueId('nhap');
  created.push(id);
  await callerAs(author, 'author').authoring.create(draftPayload(id, over) as never);
  return id;
}

/** Id chưa từng tồn tại — dùng cho vế "không lộ sự tồn tại". */
const GHOST_ID = uniqueId('khong-co');

let zeroStepLesson = '';
let validLesson = '';
let brokenLab = '';
let validLab = '';

beforeAll(async () => {
  const db = testDb();
  for (const id of [AUTHOR_A, AUTHOR_B]) {
    await db.insert(users).values({ id, name: id, email: `${id}@example.test` });
  }

  // Bản nháp 0 bước — ca ĐƠN GIẢN NHẤT mà `scenarioSchema.steps.min(1)` từ chối.
  zeroStepLesson = await create(AUTHOR_A);
  validLesson = await create(AUTHOR_A, {
    title: 'Bài hoàn chỉnh',
    steps: [{ markdown: '# bước một', title: 'Bước 1' }],
  });

  // Lab: `stepInput` mặc định `taskId`/`weight`/`verifyScript` = null, còn
  // `labTaskSchema` đòi cả ba. Một task lưu như thế này hợp lệ với đường GHI và
  // bị đường ĐỌC từ chối — cùng cái lỗ, ở một loại nội dung khác.
  brokenLab = await create(AUTHOR_A, {
    kind: 'lab',
    title: 'Lab chưa có script chấm',
    steps: [{ markdown: '# task một', title: 'Task 1' }],
  });
  validLab = await create(AUTHOR_A, {
    kind: 'lab',
    title: 'Lab hoàn chỉnh',
    // ⚠ Hai field này KHÔNG thừa. `contentDraftInput` mặc định cả hai = `null`,
    // còn `labSchema` đòi `number`/`boolean` — nên một lab "trông đầy đủ" vẫn
    // trượt `preview` nếu thiếu chúng. Chính đối chứng dương này bắt được lỗi
    // đó lúc viết bộ test; nếu chỉ có vế "preview trả null" thì bộ này đã xanh
    // trong khi không chứng minh gì.
    passThresholdPercent: 70,
    leaderboard: false,
    steps: [
      {
        taskId: 'task-mot',
        title: 'Task 1',
        markdown: '# task một',
        verifyScript: 'true',
        weight: 1,
      },
    ],
  });
});

afterAll(async () => {
  const db = testDb();
  if (created.length > 0) {
    await db.delete(contentItems).where(inArray(contentItems.id, created));
  }
  await db.delete(users).where(inArray(users.id, [AUTHOR_A, AUTHOR_B]));
  await closeTestDb();
});

describe('cái lỗ: bản nháp GHI được mà `preview` không ĐỌC được', () => {
  it('ĐỐI CHỨNG DƯƠNG — preview đọc được bản nháp HỢP LỆ (đường đó không hỏng)', async () => {
    const seen = await callerAs(AUTHOR_A, 'author').authoring.preview({ id: validLesson });
    expect(seen.kind).toBe('lesson');
    // Không có dòng này thì mọi `toBeNull()` dưới đây chỉ chứng minh "preview
    // trả null cho mọi thứ", tức là không chứng minh gì cả.
    expect(seen.kind === 'lesson' ? seen.lesson?.title : null).toBe('Bài hoàn chỉnh');
  });

  it('lesson 0 bước: preview KHÔNG trả gì dùng được — form soạn mở lại là trắng', async () => {
    const seen = await callerAs(AUTHOR_A, 'author').authoring.preview({ id: zeroStepLesson });
    expect(seen.kind).toBe('lesson');
    expect(seen.kind === 'lesson' ? seen.lesson : undefined).toBeNull();
  });

  it('…nhưng `get` trả THÂN của nó — phép so này là thứ làm cả procedure có nghĩa', async () => {
    const got = await callerAs(AUTHOR_A, 'author').authoring.get({ id: zeroStepLesson });
    expect(got.kind).toBe('lesson');
    expect(got.state).toBe('draft');
    expect(got.body.item.id).toBe(zeroStepLesson);
    expect(got.body.item.title).toBe('Bản nháp còn dở');
    // Đúng 0 bước — thứ khiến `preview` trượt — và `get` vẫn trả về.
    expect(got.body.steps).toEqual([]);
  });

  it('lab thiếu verifyScript: cùng cái lỗ, và cùng cách đóng', async () => {
    const caller = callerAs(AUTHOR_A, 'author');

    // ĐỐI CHỨNG DƯƠNG cho đường lab.
    const ok = await caller.authoring.preview({ id: validLab });
    expect(ok.kind === 'lab' ? ok.lab?.title : null).toBe('Lab hoàn chỉnh');

    const broken = await caller.authoring.preview({ id: brokenLab });
    expect(broken.kind === 'lab' ? broken.lab : undefined).toBeNull();

    const got = await caller.authoring.get({ id: brokenLab });
    expect(got.kind).toBe('lab');
    expect(got.body.steps).toHaveLength(1);
    // Đúng giá trị làm nó trượt schema, đọc lại nguyên vẹn để form điền vào ô.
    expect(got.body.steps[0]?.verifyScript).toBeNull();
    expect(got.body.steps[0]?.taskId).toBeNull();
    expect(got.body.steps[0]?.markdown).toBe('# task một');
  });
});

describe('IDOR — `get` trả thân bài theo id, cùng bề mặt với preview/update', () => {
  it('ĐỐI CHỨNG DƯƠNG: chủ thật đọc được', async () => {
    const got = await callerAs(AUTHOR_A, 'author').authoring.get({ id: zeroStepLesson });
    expect(got.body.item.authorId).toBe(AUTHOR_A);
  });

  it('author KHÁC bị chặn — NOT_FOUND, không FORBIDDEN', async () => {
    await expect(
      callerAs(AUTHOR_B, 'author').authoring.get({ id: zeroStepLesson }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('phép từ chối KHÔNG lộ bài đó có tồn tại hay không', async () => {
    const denied = await callerAs(AUTHOR_B, 'author')
      .authoring.get({ id: zeroStepLesson })
      .then(() => null)
      .catch((error: unknown) => error as TRPCError);
    const missing = await callerAs(AUTHOR_B, 'author')
      .authoring.get({ id: GHOST_ID })
      .then(() => null)
      .catch((error: unknown) => error as TRPCError);

    // "id tồn tại nhưng không phải của bạn" và "id không tồn tại" phải KHÔNG
    // phân biệt được — cả mã LẪN message. Message khác nhau là một oracle dò
    // id, và nó vô hiệu hoá chính lý do router này chọn NOT_FOUND.
    expect(denied?.code).toBe('NOT_FOUND');
    expect(missing?.code).toBe('NOT_FOUND');
    expect(denied?.message).toBe(missing?.message);
  });

  it('vai trò `user` bị chặn ở cổng THỨ NHẤT, trước cả khi chạm DB', async () => {
    await expect(
      callerAs(AUTHOR_A, 'user').authoring.get({ id: zeroStepLesson }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admin đi qua — ĐÚNG bằng thứ `assertContentOwner` đã cấp, không hơn', async () => {
    // Không mở rộng quyền admin ở đây: `get` gọi CÙNG hàm mà `update`/`archive`
    // gọi, nên nếu quyết định "admin xem mọi bài" đổi thì nó đổi ở MỘT chỗ.
    const got = await callerAs('admin-get-1', 'admin').authoring.get({ id: zeroStepLesson });
    expect(got.body.item.authorId).toBe(AUTHOR_A);
  });

  it('id không tồn tại → NOT_FOUND, kể cả với chủ sở hữu thật', async () => {
    await expect(
      callerAs(AUTHOR_A, 'author').authoring.get({ id: GHOST_ID }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});

describe('state báo cáo: `get` và `list` trả CÙNG một câu trả lời', () => {
  it('publishing đã treo được kể là draft ở CẢ HAI — không thì form khoá tác giả ra ngoài', async () => {
    const id = await create(AUTHOR_A, { title: 'Treo giữa chừng' });
    // Mốc bắt đầu ở quá khứ xa ⇒ chắc chắn quá hạn treo, không phụ thuộc hằng số.
    await testDb()
      .update(contentItems)
      .set({ state: 'publishing', publishStartedAt: new Date(0) })
      .where(inArray(contentItems.id, [id]));

    const caller = callerAs(AUTHOR_A, 'author');
    const got = await caller.authoring.get({ id });
    const row = (await caller.authoring.list()).find((r) => r.id === id);

    expect(got.state).toBe('draft');
    expect(row?.state).toBe('draft');
    expect(got.state).toBe(row?.state);
  });
});
