import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  contentItems,
  contentSteps,
  labAttempts,
  progress,
  quizAnswers,
  quizAttempts,
  quizChoices,
  quizQuestions,
  quizzes,
  userPreferences,
  users,
} from '../server/db/schema';
import { closeTestDb, ctxFor, testDb, uniqueId } from './test-helpers';

/**
 * `me.*` — IDOR (P13 C4, luật 1).
 *
 * ⛔ VÌ SAO BỘ NÀY LÀ BẮT BUỘC, KHÔNG PHẢI "CÓ THÌ TỐT": không một input schema
 * nào của `me.*` nhận `userId`, nên "không thể IDOR" trông như một tính chất
 * hiển nhiên của HÌNH DẠNG API. Nó không phải. Nó là tính chất của MỆNH ĐỀ
 * `WHERE` trong từng truy vấn, và một `eq(col.userId, ctx.user.id)` bị bỏ quên
 * ở MỘT procedure không làm hỏng typecheck, không làm hỏng test nào khác, và
 * trả về một danh sách trông hoàn toàn bình thường — chỉ là nó chứa cả lịch sử
 * của người khác.
 *
 * Nên mọi ca dưới đây gieo dữ liệu của NGƯỜI KHÁC trước, rồi khẳng định nó
 * VẮNG MẶT. Một bộ test chỉ gieo dữ liệu của chính mình rồi thấy nó xuất hiện
 * là một green không thể đỏ.
 *
 * ⚠ `me.activeSessions` là ca NGHIÊM TRỌNG NHẤT và nó KHÔNG chạm Postgres:
 * orchestrator TIN `user_id` do BFF gửi (C3 nói thẳng: "BFF là ranh giới tin
 * cậy"), nên `user_id` truyền vào `ListSessions` LÀ quyết định authz. Truyền
 * nhầm chuỗi rỗng ở đó = phơi phiên của MỌI người cho MỌI người, và không tầng
 * nào phía dưới chặn lại. Vì thế ca đó khẳng định THAM SỐ THẬT của lời gọi,
 * không phải khẳng định kết quả trả về.
 */

const { listSessionsSpy, reapSessionSpy } = vi.hoisted(() => ({
  listSessionsSpy: vi.fn(
    (_req: { userId: string; limit: number; cursor: string }, _opts?: unknown) =>
      Promise.resolve({ sessions: [], nextCursor: '' }),
  ),
  reapSessionSpy: vi.fn(
    (
      _req: { sessionId: string; reason: string; actor: { case: 'userId'; value: string } },
      _opts?: unknown,
    ) => Promise.resolve({ session: undefined }),
  ),
}));

vi.mock('../server/grpc/orchestrator-client', () => ({
  orchestratorClient: () => ({ listSessions: listSessionsSpy, reapSession: reapSessionSpy }),
  callOrchestrator: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

const ME = { id: uniqueId('me-idor-toi'), role: 'user' as const };
const OTHER = { id: uniqueId('me-idor-nguoi-khac'), role: 'user' as const };
const QUIZ_ID = uniqueId('me-idor-quiz');
const LAB_ID = uniqueId('me-idor-lab');

async function caller(user: { id: string; role: 'user' }) {
  const { appRouter } = await import('../server/trpc/routers/app-router');
  return appRouter.createCaller(ctxFor(user));
}

/**
 * Gieo MỘT lượt: hai user, và với MỖI user một dòng ở cả ba bảng lịch sử.
 *
 * Dữ liệu của hai người CỐ Ý trùng nhau ở mọi trường không phải `user_id`
 * (cùng lab, cùng quiz, cùng lesson): nếu một truy vấn lọc nhầm theo `labId`
 * thay vì `userId` thì nó vẫn "đúng" trên dữ liệu lệch nhau — chỉ dữ liệu
 * trùng mới ép mệnh đề `WHERE` phải là `user_id`.
 */
let seeded = false;
async function seedOnce(): Promise<void> {
  if (seeded) return;
  const db = testDb();

  for (const u of [ME, OTHER]) {
    await db.insert(users).values({ id: u.id, name: u.id, email: `${u.id}@test.local`, role: 'user' });
  }

  await db.insert(quizzes).values({
    id: QUIZ_ID,
    authorId: ME.id,
    state: 'published',
    title: 'Quiz IDOR fixture',
    description: null,
    passThresholdPercent: 50,
  });
  const [question] = await db
    .insert(quizQuestions)
    .values({ quizId: QUIZ_ID, questionId: 'q1', ordinal: 0, kind: 'single', markdown: 'Câu 1' })
    .returning();
  if (question === undefined) {
    throw new Error('không gieo được câu hỏi fixture');
  }
  await db.insert(quizChoices).values([
    { questionRowId: question.id, choiceId: 'a', ordinal: 0, markdown: 'A', isCorrect: true },
    { questionRowId: question.id, choiceId: 'b', ordinal: 1, markdown: 'B', isCorrect: false },
  ]);

  // Lab fixture nằm trong NGUỒN DB (`content_items`), không phải trên đĩa.
  //
  // ⚠ ĐÃ ĐO, không phải trang trí: `me.listLabAttempts` BỎ QUA im lặng mọi lượt
  // mà `source.getLab(labId)` trả `null` (`if (lab === null) continue`). Với
  // một labId không tồn tại ở nguồn nào, danh sách trả về RỖNG — và khi đó
  // "không thấy lượt của người khác" trở thành một khẳng định vô nghĩa: nó
  // đúng vì danh sách rỗng, không phải vì mệnh đề `WHERE`. Đối chứng dương
  // (`toContain` lượt của CHÍNH tôi) là thứ ép fixture phải giải được lab.
  await db.insert(contentItems).values({
    id: LAB_ID,
    kind: 'lab',
    authorId: ME.id,
    state: 'published',
    title: 'Lab IDOR fixture',
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    assets: [],
    intro: null,
    finish: null,
    setup: null,
    passThresholdPercent: 50,
    leaderboard: false,
    ttlSeconds: null,
    publishedAt: new Date(),
  });
  await db.insert(contentSteps).values({
    id: `step-${LAB_ID}`,
    contentId: LAB_ID,
    ordinal: 0,
    taskId: 'task-1',
    title: 'Task 1',
    markdown: '# nội dung',
    setupForeground: null,
    setupBackground: null,
    verifyScript: 'true',
    weight: 1,
    hint: null,
  });

  for (const u of [ME, OTHER]) {
    await db.insert(labAttempts).values({
      id: `attempt-${u.id}`,
      userId: u.id,
      labId: LAB_ID,
      sessionId: `sess-${u.id}`,
      startedAt: new Date(),
      submittedAt: new Date(),
    });
    await db.insert(quizAttempts).values({
      id: `qattempt-${u.id}`,
      userId: u.id,
      quizId: QUIZ_ID,
      submittedAt: new Date(),
    });
    await db.insert(quizAnswers).values({
      attemptId: `qattempt-${u.id}`,
      questionId: 'q1',
      selectedChoiceIds: ['a'],
    });
    await db.insert(progress).values({
      userId: u.id,
      lessonId: 'bai-hoc-chung-cua-ca-hai',
      stepIndex: 1,
    });
  }
  // Bật cờ SAU CÙNG: bật trước biến một lỗi gieo thành N test đỏ vì "thiếu dữ
  // liệu", che mất lỗi thật ở đúng một chỗ.
  seeded = true;
}

/**
 * Gieo ở `beforeAll` với timeout RIÊNG, không gọi trong từng `it`.
 *
 * ⚠ ĐÃ ĐO: gọi `seedOnce()` bên trong test đầu tiên làm test đó gánh cả phần
 * gieo LẪN lượt nạp nguồn nội dung đầu tiên (`contentSourceFor` đọc
 * `content/labs/**` trên đĩa). Chạy một mình thì kịp; chạy CẢ SUITE song song
 * thì vượt 5s mặc định và test đỏ vì HẠ TẦNG, không vì hành vi nó gác — đúng
 * kiểu flaky làm người đọc mất niềm tin vào một ô AC thật.
 */
beforeAll(async () => {
  await seedOnce();

  // ⚠ HÂM NÓNG nguồn nội dung Ở ĐÂY, không để nó rơi vào test đầu tiên.
  //
  // Bản trước chỉ gieo dữ liệu ở đây và để `contentSourceFor` (đọc
  // `content/labs/**` trên đĩa) nạp lười trong test đầu chạm tới nó — kèm một
  // trần 30s riêng cho đúng test đó. Trần ấy KHÔNG đủ khi máy đang bận: đo
  // 2026-09-07, `me.listLabAttempts` mất **34.6s** và đỏ, nhưng chỉ khi turbo
  // chạy `build` (next build) trong cùng lượt; chạy suite một mình thì
  // 1089/1089 xanh, và `turbo run test` một mình cũng 9/9.
  //
  // Một ô AN NINH đỏ vì máy bận là cách nhanh nhất làm người đọc thôi tin nó.
  // Chi phí một-lần thuộc về `beforeAll` — nơi ngân sách 60s đã có sẵn và
  // KHÔNG ai đọc nhầm thành "phép kiểm này chậm".
  await (await caller(ME)).me.listLabAttempts({ limit: 1 });
}, 60_000);

afterAll(async () => {
  await closeTestDb();
});

describe('me.* — lịch sử của NGƯỜI KHÁC không lọt vào danh sách của tôi', () => {
  it('me.listLabAttempts: chỉ lượt của tôi (cùng labId, khác userId)', async () => {
    const out = await (await caller(ME)).me.listLabAttempts({ limit: 100 });
    const ids = out.items.map((item) => item.attempt.id);
    expect(ids).toContain(`attempt-${ME.id}`);
    expect(ids).not.toContain(`attempt-${OTHER.id}`);
    // Không còn trần riêng: chi phí một-lần của `contentSourceFor` đã chuyển
    // sang `beforeAll`. Test này nay chỉ đo đúng thứ nó gác.
  });

  it('me.listQuizAttempts: chỉ lượt của tôi (cùng quizId, khác userId)', async () => {
    const out = await (await caller(ME)).me.listQuizAttempts({ limit: 100 });
    const ids = out.items.map((item) => item.attemptId);
    expect(ids).toContain(`qattempt-${ME.id}`);
    expect(ids).not.toContain(`qattempt-${OTHER.id}`);
  });

  it('me.listProgress: chỉ tiến độ của tôi (cùng lessonId, khác userId)', async () => {
    const db = testDb();
    const otherRows = await db.select().from(progress).where(eq(progress.userId, OTHER.id));
    const otherId = otherRows[0]?.id;
    expect(otherId).toBeDefined();

    const out = await (await caller(ME)).me.listProgress({ limit: 100 });
    // Đối chứng dương: tôi CÓ thấy dòng của mình (nếu không, "không thấy dòng
    // người khác" chỉ chứng minh danh sách rỗng).
    expect(out.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(out.items)).not.toContain(otherId as string);
  });

  it('me.listProgress: cursor của NGƯỜI KHÁC không mở được trang của họ', async () => {
    const db = testDb();
    const otherRows = await db.select().from(progress).where(eq(progress.userId, OTHER.id));
    const otherCursor = otherRows[0]?.id;
    expect(otherCursor).toBeDefined();

    // Cursor là uuid HỢP LỆ và TỒN TẠI — nhưng của người khác. Tra cursor phải
    // kèm `userId`, nếu không đây là một IDOR đọc-được-vị-trí.
    await expect(
      (await caller(ME)).me.listProgress({ cursor: otherCursor as string }),
    ).rejects.toThrow('Cursor không còn hợp lệ');
  });

  it('me.get / me.updatePreferences chỉ chạm hồ sơ của chính tôi', async () => {
    await (await caller(ME)).me.updatePreferences({ defaultShell: 'pwsh' });

    const mine = await (await caller(ME)).me.get({});
    const theirs = await (await caller(OTHER)).me.get({});
    expect(mine.id).toBe(ME.id);
    expect(mine.preferences.defaultShell).toBe('pwsh');
    // Người khác KHÔNG bị đổi theo (mặc định `bash`).
    expect(theirs.id).toBe(OTHER.id);
    expect(theirs.preferences.defaultShell).toBe('bash');

    const rows = await testDb()
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, OTHER.id));
    expect(rows[0]?.defaultShell ?? 'bash').toBe('bash');
  });
});

describe('me.activeSessions — ranh giới tin cậy C3 nằm ở THAM SỐ của lời gọi', () => {
  it('truyền ctx.user.id làm user_id — KHÔNG bao giờ chuỗi rỗng (rỗng = mọi user)', async () => {
    listSessionsSpy.mockClear();
    await (await caller(ME)).me.activeSessions({ limit: 10 });

    expect(listSessionsSpy).toHaveBeenCalledTimes(1);
    const request = listSessionsSpy.mock.calls[0]?.[0];
    expect(request?.userId).toBe(ME.id);
    // Khẳng định RIÊNG cho chuỗi rỗng: đó là giá trị DUY NHẤT biến lời gọi này
    // thành "liệt kê phiên của mọi người", và nó là một ký tự khác biệt.
    expect(request?.userId).not.toBe('');
  });

  it('người khác gọi thì user_id đổi theo NGƯỜI GỌI, không phải một hằng nào đó', async () => {
    listSessionsSpy.mockClear();
    await (await caller(OTHER)).me.activeSessions({ limit: 10 });
    expect(listSessionsSpy.mock.calls[0]?.[0]?.userId).toBe(OTHER.id);
  });

  it('me.endSession reap với actor = NGƯỜI GỌI và reason = user_ended', async () => {
    reapSessionSpy.mockClear();
    await (await caller(ME)).me.endSession({ sessionId: 'sess-bat-ky' });

    const request = reapSessionSpy.mock.calls[0]?.[0];
    expect(request?.reason).toBe('user_ended');
    expect(request?.actor).toEqual({ case: 'userId', value: ME.id });
  });
});
