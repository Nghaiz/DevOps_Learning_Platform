import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { appRouter } from '../server/trpc/routers/app-router';
import {
  learningPathItems,
  learningPaths,
  progress,
  quizAttempts,
  quizChoices,
  quizQuestions,
  quizzes,
  users,
} from '../server/db/schema';
import { closeTestDb, ctxFor, testDb, uniqueId } from './test-helpers';

/**
 * Ô AC của P10 chạy trên **SQL THẬT**, không phải trên repository giả.
 *
 * Vì sao cần bộ này khi đã có `path-progress.test.ts`: bộ kia kiểm *luật* (hàm
 * thuần `viewPathItems`) với dữ liệu dựng tay. Nó KHÔNG chạm đường
 * `paths.openItem` → `readPathDetail` → `loadPassedItemKeys` → SQL, và chính
 * đường đó là chỗ ô khoá thật sự được thi hành. Một mệnh đề `WHERE` viết sai ở
 * `loadPassedItemKeys` vẫn để mọi test unit xanh — và triệu chứng là "ai cũng
 * mở được item cuối".
 *
 * ⚠ Bộ này ĐÒI Postgres (`docker compose up -d postgres` + `pnpm db:migrate`).
 *
 * ⚠ `createCaller` BỎ QUA tầng serialize (bài học đã ghi ở `grpc/session-json.ts`
 * và trong memory của dự án): nó chứng minh LUẬT, không chứng minh payload trên
 * dây. Phần payload — "đáp án không rời server" — được gác bằng rào compile +
 * `quiz-dto-leak.test.ts`, không bằng bộ này.
 */

const LEARNER = uniqueId('u-learner');
const OTHER = uniqueId('u-other');
const AUTHOR = uniqueId('u-author');

const LESSON_ID = uniqueId('bai-mo-dau');
const QUIZ_ID = uniqueId('quiz-cuoi');
const PATH_SEQ = uniqueId('lo-trinh-tuan-tu');
const PATH_FREE = uniqueId('lo-trinh-tu-do');

function caller(userId: string, role: 'user' | 'author' | 'admin' = 'user') {
  return appRouter.createCaller(ctxFor({ id: userId, role }));
}

beforeAll(async () => {
  const db = testDb();
  await db.insert(users).values([
    { id: LEARNER, name: 'learner', email: `${LEARNER}@test.local` },
    { id: OTHER, name: 'other', email: `${OTHER}@test.local` },
    { id: AUTHOR, name: 'author', email: `${AUTHOR}@test.local`, role: 'author' },
  ]);

  // Một quiz ĐÃ XUẤT BẢN: 2 câu, mốc đạt 100% để "đạt/chưa đạt" là nhị phân rõ ràng.
  await db.insert(quizzes).values({
    id: QUIZ_ID,
    authorId: AUTHOR,
    state: 'published',
    title: 'Quiz cuối',
    description: null,
    passThresholdPercent: 100,
  });
  const inserted = await db
    .insert(quizQuestions)
    .values({
      quizId: QUIZ_ID,
      questionId: 'cau-1',
      ordinal: 0,
      kind: 'single',
      markdown: 'Lệnh nào liệt kê pod ở mọi namespace?',
      explanation: 'Cờ -A mở rộng ra mọi namespace.',
    })
    .returning({ id: quizQuestions.id });
  const questionRowId = inserted[0]?.id ?? '';
  await db.insert(quizChoices).values([
    { questionRowId, choiceId: 'a', ordinal: 0, markdown: 'kubectl get pods', isCorrect: false },
    { questionRowId, choiceId: 'b', ordinal: 1, markdown: 'kubectl get pods -A', isCorrect: true },
  ]);

  // Lộ trình TUẦN TỰ: lesson (chưa đạt) → quiz. Quiz phải khoá.
  await db.insert(learningPaths).values({
    id: PATH_SEQ,
    authorId: AUTHOR,
    state: 'published',
    title: 'Lộ trình tuần tự',
    description: null,
    sequential: true,
  });
  await db.insert(learningPathItems).values([
    { pathId: PATH_SEQ, ordinal: 0, itemKind: 'lesson', itemId: LESSON_ID },
    { pathId: PATH_SEQ, ordinal: 1, itemKind: 'quiz', itemId: QUIZ_ID },
  ]);

  // Lộ trình TỰ DO chứa CÙNG hai item — bằng chứng cho "một item nằm được ở
  // nhiều lộ trình", và cho "khoá là thuộc tính của lộ trình, không của bài".
  await db.insert(learningPaths).values({
    id: PATH_FREE,
    authorId: AUTHOR,
    state: 'published',
    title: 'Lộ trình tự do',
    description: null,
    sequential: false,
  });
  await db.insert(learningPathItems).values([
    { pathId: PATH_FREE, ordinal: 0, itemKind: 'lesson', itemId: LESSON_ID },
    { pathId: PATH_FREE, ordinal: 1, itemKind: 'quiz', itemId: QUIZ_ID },
  ]);

  /*
    ⚠ HÂM NÓNG nguồn nội dung Ở ĐÂY, không để nó rơi vào test đầu tiên.

    `paths.get` đi qua `readPathDetail` → nguồn nội dung, và lượt gọi ĐẦU TIÊN
    nạp `content/**` từ đĩa. Chi phí một-lần đó rơi vào ô chạy trước, và ô đó
    chịu trần `testTimeout: 15_000` của gói chứ không phải ngân sách 60s của
    `beforeAll`.

    Đo 2026-09-13: ô "cùng quiz xuất hiện ở cả hai lộ trình" chạy **187ms** khi
    file chạy một mình, nhưng **15 186ms và ĐỎ** khi 163 file chạy song song —
    gấp 80 lần, trong khi hai ô tuần tự nặng hơn nó chỉ chậm 7–12 lần. Khoảng
    chênh đó là phần nạp đĩa, không phải phần ô này gác.

    `me-idor.test.ts` đã gặp đúng chuyện này và chữa đúng cách này; ghi lại đây
    để lần thứ ba không phải truy lại từ đầu.
  */
  await caller(LEARNER).paths.get({ pathId: PATH_SEQ });
}, 60_000);

afterAll(async () => {
  const db = testDb();
  await db.delete(quizAttempts).where(inArray(quizAttempts.userId, [LEARNER, OTHER]));
  await db.delete(progress).where(inArray(progress.userId, [LEARNER, OTHER]));
  await db.delete(learningPaths).where(inArray(learningPaths.id, [PATH_SEQ, PATH_FREE]));
  await db.delete(quizzes).where(eq(quizzes.id, QUIZ_ID));
  await db.delete(users).where(inArray(users.id, [LEARNER, OTHER, AUTHOR]));
  await closeTestDb();
});

describe('AC #1 — một item nằm được ở nhiều lộ trình', () => {
  it('cùng quiz xuất hiện ở cả hai lộ trình', async () => {
    const seq = await caller(LEARNER).paths.get({ pathId: PATH_SEQ });
    const free = await caller(LEARNER).paths.get({ pathId: PATH_FREE });

    expect(seq.items.map((item) => item.itemId)).toContain(QUIZ_ID);
    expect(free.items.map((item) => item.itemId)).toContain(QUIZ_ID);
  });

  it('lộ trình gom được cả lesson lẫn quiz, giữ nguyên thứ tự', async () => {
    const detail = await caller(LEARNER).paths.get({ pathId: PATH_SEQ });
    expect(detail.items.map((item) => item.kind)).toEqual(['lesson', 'quiz']);
    expect(detail.items.map((item) => item.ordinal)).toEqual([0, 1]);
  });
});

describe('AC #3 — sequential kiểm Ở SERVER', () => {
  it('quiz sau một lesson chưa đạt hiện là locked', async () => {
    const detail = await caller(LEARNER).paths.get({ pathId: PATH_SEQ });
    expect(detail.items[1]?.state).toBe('locked');
    expect(detail.nextItemId).toBe(LESSON_ID);
  });

  /**
   * Ô AC trung tâm: *"gọi thẳng API item bị khoá vẫn bị từ chối"*. Đây là lượt
   * gọi BỎ QUA giao diện hoàn toàn — không có ổ khoá nào để bấm, chỉ có một
   * mutation gửi thẳng lên.
   */
  it('gọi THẲNG openItem trên item đang khoá → FORBIDDEN', async () => {
    await expect(
      caller(LEARNER).paths.openItem({ pathId: PATH_SEQ, kind: 'quiz', itemId: QUIZ_ID }),
    ).rejects.toThrow(/khoá/i);
  });

  /**
   * Đối chứng DƯƠNG — nếu `openItem` từ chối MỌI thứ thì phép khẳng định trên
   * không chứng minh gì (`green-that-proves-nothing`).
   */
  it('item đầu tiên (available) thì openItem CHO QUA — đối chứng dương', async () => {
    await expect(
      caller(LEARNER).paths.openItem({ pathId: PATH_SEQ, kind: 'lesson', itemId: LESSON_ID }),
    ).resolves.toEqual({ kind: 'lesson', itemId: LESSON_ID });
  });

  /**
   * Khoá là thuộc tính của MỘT lộ trình, không của bài — cùng quiz, cùng người
   * học, cùng thời điểm, nhưng ở lộ trình tự do thì mở. Đây là phạm vi thật của
   * ổ khoá, ghi ở `docs/learning-path.md`.
   */
  it('CÙNG quiz đó mở ở lộ trình tự do — khoá thuộc về lộ trình, không thuộc bài', async () => {
    await expect(
      caller(LEARNER).paths.openItem({ pathId: PATH_FREE, kind: 'quiz', itemId: QUIZ_ID }),
    ).resolves.toEqual({ kind: 'quiz', itemId: QUIZ_ID });
  });

  it('item không thuộc lộ trình → NOT_FOUND, không phải "mở"', async () => {
    await expect(
      caller(LEARNER).paths.openItem({ pathId: PATH_SEQ, kind: 'lab', itemId: 'khong-thuoc' }),
    ).rejects.toThrow(/không thuộc/i);
  });

  it('đạt item trước ⇒ item sau MỞ RA, tính lại từ tiến độ thật', async () => {
    await testDb().insert(progress).values({
      userId: LEARNER,
      lessonId: LESSON_ID,
      stepIndex: 0,
      completedAt: new Date(),
    });

    const detail = await caller(LEARNER).paths.get({ pathId: PATH_SEQ });
    expect(detail.items[0]?.state).toBe('passed');
    expect(detail.items[1]?.state).toBe('available');
    expect(detail.passedCount).toBe(1);

    await expect(
      caller(LEARNER).paths.openItem({ pathId: PATH_SEQ, kind: 'quiz', itemId: QUIZ_ID }),
    ).resolves.toEqual({ kind: 'quiz', itemId: QUIZ_ID });
  });

  /**
   * Luật 1 — tiến độ của A không mở khoá cho B. `paths.get` không nhận `userId`,
   * nên đây là phép kiểm rằng nó thật sự đọc `ctx.user.id`.
   */
  it('tiến độ của người này KHÔNG mở khoá cho người kia', async () => {
    const detail = await caller(OTHER).paths.get({ pathId: PATH_SEQ });
    expect(detail.items[1]?.state).toBe('locked');
    expect(detail.passedCount).toBe(0);

    await expect(
      caller(OTHER).paths.openItem({ pathId: PATH_SEQ, kind: 'quiz', itemId: QUIZ_ID }),
    ).rejects.toThrow(/khoá/i);
  });
});

describe('AC #4/#5 — chấm server-side, đáp án không đi ra sớm', () => {
  it('quiz.get KHÔNG mang isCorrect hay explanation ở bất kỳ tầng nào', async () => {
    const { quiz } = await caller(LEARNER).quiz.get({ quizId: QUIZ_ID });
    // Phép kiểm mà ô AC dùng trên response thật (`jq '..|.isCorrect? // empty'`),
    // chạy ở đây trên chính giá trị router trả về.
    const wire = JSON.stringify(quiz);
    expect(wire).not.toContain('isCorrect');
    expect(wire).not.toContain('explanation');
    expect(wire).toContain('kubectl get pods -A');
  });

  it('quy tắc chấm đi KÈM payload để UI hiện trước khi làm (AC #6)', async () => {
    const { quiz } = await caller(LEARNER).quiz.get({ quizId: QUIZ_ID });
    expect(quiz.multipleAnswerRule).toBe('all-or-nothing');
    expect(quiz.passThresholdPercent).toBe(100);
  });

  it('nộp SAI ⇒ chấm ở server, trả kết quả từng câu + giải thích', async () => {
    const result = await caller(LEARNER).quiz.submit({
      quizId: QUIZ_ID,
      answers: [{ questionId: 'cau-1', selectedChoiceIds: ['a'] }],
    });

    expect(result.score).toMatchObject({ correctCount: 0, questionCount: 1, passed: false });
    expect(result.questions[0]).toMatchObject({
      questionId: 'cau-1',
      correct: false,
      correctChoiceIds: ['b'],
      explanation: 'Cờ -A mở rộng ra mọi namespace.',
    });
    expect(result.attemptNumber).toBe(1);
  });

  it('nộp ĐÚNG ⇒ đạt, và lần làm thứ hai được đếm', async () => {
    const result = await caller(LEARNER).quiz.submit({
      quizId: QUIZ_ID,
      answers: [{ questionId: 'cau-1', selectedChoiceIds: ['b'] }],
    });
    expect(result.score.passed).toBe(true);
    expect(result.score.percent).toBe(100);
    expect(result.attemptNumber).toBe(2);
  });

  it('id lựa chọn bịa bị TỪ CHỐI, không âm thầm chấm là sai', async () => {
    await expect(
      caller(LEARNER).quiz.submit({
        quizId: QUIZ_ID,
        answers: [{ questionId: 'cau-1', selectedChoiceIds: ['khong-co-that'] }],
      }),
    ).rejects.toThrow(/không thuộc câu hỏi/i);
  });

  it('lượt nộp của người khác KHÔNG đọc được (luật 1)', async () => {
    const mine = await caller(LEARNER).quiz.listAttempts({ quizId: QUIZ_ID });
    expect(mine.items.length).toBeGreaterThan(0);
    const attemptId = mine.items[0]?.attemptId ?? '';

    await expect(caller(OTHER).quiz.getAttempt({ attemptId })).rejects.toThrow(/không có/i);
  });
});

describe('AC #7 — rate-limit đường nộp', () => {
  /**
   * `QUIZ_SUBMIT_LIMIT_PER_MIN = 6`. Người học đã nộp 2 lượt hợp lệ ở suite
   * trên (bucket khoá theo `quiz:submit:<userId>`, chung cả tiến trình test),
   * nên vài lượt nữa là chạm trần. Nộp liên tục PHẢI bị chặn — đó là toàn bộ
   * nội dung của "dò đáp án bằng cách nộp liên tục bị chặn".
   */
  it('nộp liên tục chạm trần và bị TOO_MANY_REQUESTS', async () => {
    const learner = caller(LEARNER);
    let blocked = false;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        await learner.quiz.submit({
          quizId: QUIZ_ID,
          answers: [{ questionId: 'cau-1', selectedChoiceIds: ['a'] }],
        });
      } catch (error) {
        if (String(error).includes('Nộp quá nhanh')) {
          blocked = true;
          break;
        }
        throw error;
      }
    }

    expect(blocked).toBe(true);
  });
});
