import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import type { GameId } from '@devops-platform/games';

import {
  closeTestDb,
  ctxFor,
  purgeLeakedFixtures,
  testDb,
  uniqueId,
} from '../../security/test-helpers';
import { examAttempts, problemSubmissions, problems, users, type User } from '../db/schema';
import { resetRateLimitState } from '../security/rate-limit';
import { appRouter } from '../trpc/routers/app-router';

/**
 * Hai việc của kỳ thi phía người học, đi qua ROUTER thật:
 *
 * 1. `examSitting.get` trả `problems` — thứ tự đề, tên, `gameId`, và `solved`
 *    tính trong CỬA SỔ của chính lượt thi đó.
 * 2. `problems.submit` KHÔNG suy ngữ cảnh kỳ thi: không có `examId` ⇒ luyện tập,
 *    kể cả khi người nộp đang có lượt thi mở chứa bài đó. Luật thi (đúng đề,
 *    còn giờ, đúng seed) chỉ chạy khi `examId` có mặt. Client không bao giờ nhận
 *    seed của lượt thi, nên một máy chủ tự suy sẽ từ chối mọi lượt nộp bài thi.
 *
 * Lượt thi được CHÈN THẲNG với `started_at` và `seed` chọn trước, thay vì đi qua
 * `examSitting.start`: các ô về "lượt khác", "hết giờ" và "hai lượt chồng nhau"
 * cần những mốc thời gian mà một lượt mở thật lúc chạy test không dựng được, và
 * một seed ngẫu nhiên 31 bit làm ô "lệch seed" bong tróc 1 lần trên 2³¹.
 *
 * ⚠ ĐÒI Postgres. `createCaller` bỏ qua tầng serialize của tRPC.
 */

const ADMIN = uniqueId('u-ectx-adm');
const A = uniqueId('u-ectx-a');
const B = uniqueId('u-ectx-b');
const C = uniqueId('u-ectx-c');
const D = uniqueId('u-ectx-d');
const E = uniqueId('u-ectx-e');
const F = uniqueId('u-ectx-f');
/** Chỉ dùng cho cửa sổ chấm: lượt đề chính đã bấm nộp, lượt nộp bài chèn thẳng. */
const G = uniqueId('u-ectx-g');
const OUTSIDER = uniqueId('u-ectx-out');
const LEARNERS = [A, B, C, D, E, F, G];
const ALL_USERS = [ADMIN, ...LEARNERS, OUTSIDER];

/** Bài nộp được thật: trạng thái đầu đã thoả testcase, nên nhật ký rỗng vẫn phát lại được. */
const SUBMITTABLE = 'K8S-9971';
const K8S_OTHER = 'K8S-9972';
const GIT_CODE = 'GIT-9971';
const CODES = [SUBMITTABLE, K8S_OTHER, GIT_CODE];

const HOUR_MS = 60 * 60 * 1000;

const INITIAL_STATE = {
  nodes: [],
  namespaces: ['default'],
  resources: [{ kind: 'ConfigMap', name: 'cm-mot', namespace: 'default', spec: {} }],
};
const TESTCASES = [
  {
    id: 't1',
    label: 'Có ConfigMap',
    check: 'resource-exists',
    args: { kind: 'ConfigMap', name: 'cm-mot', namespace: 'default' },
    required: true,
    visible: true,
  },
];

function problemRow(code: string, gameId: GameId, title: string) {
  return {
    code,
    gameId,
    slug: uniqueId(`ectx-${code.toLowerCase()}`),
    title,
    statement: 'Đề ngắn.',
    difficulty: 'easy' as const,
    topics: [] as string[],
    tags: [] as string[],
    timeLimitSec: null,
    initialState: INITIAL_STATE,
    objectives: TESTCASES,
    allowedResources: null,
    hints: [],
    parMoves: null,
    state: 'published' as const,
    authorId: null,
  } as unknown as typeof problems.$inferInsert;
}

function callerAs(id: string, role: User['role'] = 'user') {
  return appRouter.createCaller(ctxFor({ id, role }));
}

function payload(code: string, seed: number, examId?: string) {
  return {
    code,
    ...(examId === undefined ? {} : { examId }),
    runLog: { gameId: 'k8s' as const, levelId: code, seed, actions: [] },
    claimed: {
      gameId: 'k8s' as const,
      levelId: code,
      seed,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_060_000,
      objectivesMet: ['t1'],
      objectivesTotal: 1,
      commandsUsed: 0,
      hintsUsed: 0,
      score: 0,
    },
  };
}

async function submitError(caller: ReturnType<typeof callerAs>, input: unknown): Promise<TRPCError | null> {
  return caller.problems
    .submit(input as never)
    .then(() => null)
    .catch((caught: unknown) => {
      if (caught instanceof TRPCError) {
        return caught;
      }
      throw caught;
    });
}

async function submissionCount(userId: string, code: string): Promise<number> {
  const rows = await testDb()
    .select({ id: problemSubmissions.id })
    .from(problemSubmissions)
    .where(and(eq(problemSubmissions.userId, userId), eq(problemSubmissions.problemCode, code)));
  return rows.length;
}

let classId = '';
/** Đề chính: thứ tự CỐ Ý không theo mã, để ô thứ tự đo được thứ tự đề. */
let mainExamId = '';
const MAIN_TITLE = uniqueId('Ky-thi-chinh');
let otherExamId = '';
/** Đề không chứa `SUBMITTABLE` — cho ô "examId không khớp". */
let unrelatedExamId = '';
let laterExamId = '';
const LATER_TITLE = uniqueId('Ky-thi-sau');
let mainStartedAt = new Date();
let gSubmittedAt = new Date();

async function insertAttempt(
  examId: string,
  userId: string,
  seed: number,
  startedAt: Date,
  durationMinutes = 60,
  submittedAt: Date | null = null,
): Promise<void> {
  await testDb()
    .insert(examAttempts)
    .values({ examId, userId, seed, durationMinutes, startedAt, submittedAt });
}

async function createExam(title: string, problemCodes: readonly string[]): Promise<string> {
  return (
    await callerAs(ADMIN, 'admin').exams.create({
      classId,
      title,
      problemCodes: [...problemCodes],
      durationMinutes: 60,
      seedStrategy: 'fixed',
      opensAt: null,
      closesAt: null,
    })
  ).id;
}

beforeAll(async () => {
  const db = testDb();
  await purgeLeakedFixtures(db);
  resetRateLimitState();
  await db.delete(problemSubmissions).where(inArray(problemSubmissions.problemCode, CODES));
  await db.delete(problems).where(inArray(problems.code, CODES));

  await db.insert(users).values(
    ALL_USERS.map((id) => ({
      id,
      name: id,
      email: `${id}@test.local`,
      role: id === ADMIN ? ('admin' as const) : ('user' as const),
    })),
  );
  await db.insert(problems).values([
    problemRow(SUBMITTABLE, 'k8s', 'Bài nộp được'),
    problemRow(K8S_OTHER, 'k8s', 'Bài K8s thứ hai'),
    problemRow(GIT_CODE, 'git', 'Bài Git'),
  ]);

  const admin = callerAs(ADMIN, 'admin');
  classId = (await admin.classes.create({ name: uniqueId('Lop-ectx') })).id;
  for (const id of LEARNERS) {
    await admin.classes.addMember({ classId, email: `${id}@test.local` });
  }

  mainExamId = await createExam(MAIN_TITLE, [GIT_CODE, K8S_OTHER, SUBMITTABLE]);
  otherExamId = await createExam(uniqueId('Ky-thi-cu'), [SUBMITTABLE]);
  unrelatedExamId = await createExam(uniqueId('Ky-thi-khac'), [K8S_OTHER]);
  laterExamId = await createExam(LATER_TITLE, [SUBMITTABLE]);

  const now = Date.now();
  mainStartedAt = new Date(now - 10 * 60 * 1000);
  // A: đang thi đề chính (seed 101), một lượt ĐÃ HẾT GIỜ ở đề cũ, một lượt mở ở
  // đề không chứa bài nộp được.
  await insertAttempt(mainExamId, A, 101, mainStartedAt);
  await insertAttempt(otherExamId, A, 202, new Date(now - 3 * HOUR_MS));
  await insertAttempt(unrelatedExamId, A, 303, mainStartedAt);
  // D: chỉ có lượt hết giờ. E: lượt đề chính đã bấm nộp. F: hai lượt mở chồng nhau.
  await insertAttempt(otherExamId, D, 404, new Date(now - 3 * HOUR_MS));
  await insertAttempt(mainExamId, E, 505, mainStartedAt, 60, new Date(now - 60 * 1000));
  await insertAttempt(mainExamId, F, 606, new Date(now - 20 * 60 * 1000));
  await insertAttempt(laterExamId, F, 707, new Date(now - 5 * 60 * 1000));
  // G: lượt đề chính bắt đầu cùng A, BẤM NỘP 5 phút trước; hạn còn ~50 phút nữa.
  gSubmittedAt = new Date(now - 5 * 60 * 1000);
  await insertAttempt(mainExamId, G, 808, mainStartedAt, 60, gSubmittedAt);

  const sub = (userId: string, code: string, solved: boolean, submittedAt: Date) => ({
    problemCode: code,
    userId,
    solved,
    score: solved ? 800 : 0,
    durationSeconds: 60,
    movesUsed: 1,
    hintsRevealed: [] as string[],
    submittedAt,
  });
  await db.insert(problemSubmissions).values([
    // A giải bài nộp được từ HÔM QUA — trước lượt thi.
    sub(A, SUBMITTABLE, true, new Date(now - 24 * HOUR_MS)),
    // A giải bài nộp được TRONG cửa sổ của lượt đề cũ (đã hết giờ).
    sub(A, SUBMITTABLE, true, new Date(now - 2.5 * HOUR_MS)),
    // A thử bài K8s thứ hai trong lượt chính nhưng trượt.
    sub(A, K8S_OTHER, false, new Date(mainStartedAt.getTime() + 60 * 1000)),
    // B (không có lượt thi) giải bài K8s thứ hai trong đúng giờ đó.
    sub(B, K8S_OTHER, true, new Date(mainStartedAt.getTime() + 60 * 1000)),
    // A giải bài Git trong lượt chính.
    sub(A, GIT_CODE, true, new Date(mainStartedAt.getTime() + 2 * 60 * 1000)),
    // G: giải bài Git TRƯỚC lúc bấm nộp ⇒ tính.
    { ...sub(G, GIT_CODE, true, new Date(mainStartedAt.getTime() + 60 * 1000)), passed: ['t1'], total: 1 },
    // G: giải bài nộp được ĐÚNG mốc bấm nộp ⇒ tính (hai đầu cửa sổ đều đóng).
    { ...sub(G, SUBMITTABLE, true, gSubmittedAt), passed: ['t1'], total: 1 },
    // G: giải bài K8s thứ hai SAU lúc bấm nộp, còn trước hạn ⇒ KHÔNG tính.
    { ...sub(G, K8S_OTHER, true, new Date(gSubmittedAt.getTime() + 2 * 60 * 1000)), passed: ['t1'], total: 1 },
  ]);
});

afterAll(async () => {
  const db = testDb();
  // `users` cascade xuống lớp, kỳ thi, lượt thi và lượt nộp; `problems` thì không
  // cascade từ lượt nộp, nên xoá lượt nộp theo mã trước.
  await db.delete(users).where(inArray(users.id, ALL_USERS));
  await db.delete(problemSubmissions).where(inArray(problemSubmissions.problemCode, CODES));
  await db.delete(problems).where(inArray(problems.code, CODES));
  await closeTestDb();
});

describe('examSitting.get · problems', () => {
  it('theo ĐÚNG thứ tự đề, kèm tên và gameId', async () => {
    const view = await callerAs(A).examSitting.get({ examId: mainExamId });
    expect(view.problems.map((p) => [p.code, p.title, p.gameId])).toEqual([
      [GIT_CODE, 'Bài Git', 'git'],
      [K8S_OTHER, 'Bài K8s thứ hai', 'k8s'],
      [SUBMITTABLE, 'Bài nộp được', 'k8s'],
    ]);
  });

  it('solved tính trong cửa sổ của CHÍNH lượt này', async () => {
    const view = await callerAs(A).examSitting.get({ examId: mainExamId });
    const solved = Object.fromEntries(view.problems.map((p) => [p.code, p.solved]));
    expect(solved).toEqual({
      // Giải trong lượt ⇒ có dấu tích.
      [GIT_CODE]: true,
      // Lượt trượt của A, và lượt giải của B, đều không tính.
      [K8S_OTHER]: false,
      // Giải hôm qua và giải trong lượt đề KHÁC đều không tính.
      [SUBMITTABLE]: false,
    });
  });

  it('ĐỐI CHỨNG: cùng lượt giải đó tính cho lượt thi mà nó nằm trong cửa sổ', async () => {
    // Không có ô này thì một `solved` luôn `false` cũng làm ô trên xanh ở vế này.
    const view = await callerAs(A).examSitting.get({ examId: otherExamId });
    expect(view.problems).toEqual([
      { code: SUBMITTABLE, title: 'Bài nộp được', gameId: 'k8s', solved: true },
    ]);
  });

  it('chưa bắt đầu ⇒ mọi bài solved: false, danh sách vẫn đủ', async () => {
    // C không có lượt nào; B có lượt giải trong giờ thi nhưng không có lượt thi.
    for (const id of [B, C]) {
      const view = await callerAs(id).examSitting.get({ examId: mainExamId });
      expect(view.attempt).toBeNull();
      expect(view.problems.map((p) => p.solved)).toEqual([false, false, false]);
    }
  });

  it('người ngoài lớp nhận NOT_FOUND, và không có gì về bài lọt ra', async () => {
    await expect(callerAs(OUTSIDER).examSitting.get({ examId: mainExamId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('không chở seed, testcase hay đề bài ra dây', async () => {
    const wire = JSON.stringify(await callerAs(A).examSitting.get({ examId: mainExamId }));
    expect(wire).not.toContain('seed');
    expect(wire).not.toContain('resource-exists');
    expect(wire).not.toContain('Đề ngắn');
  });
});

describe('cửa sổ chấm dừng ở lúc BẤM NỘP, không ở hạn', () => {
  const afterSubmit = () => new Date(gSubmittedAt.getTime() + 2 * 60 * 1000);

  it('ĐỐI CHỨNG: lượt giải sau lúc bấm nộp vẫn nằm TRƯỚC hạn', () => {
    // Không có ô này thì ba ô dưới xanh cả khi cửa sổ vẫn dừng ở hạn mà lượt
    // giải "sau nộp" lỡ rơi ra ngoài hạn.
    expect(afterSubmit().getTime()).toBeLessThan(mainStartedAt.getTime() + HOUR_MS);
  });

  it('examSitting.get: giải trước lúc nộp có dấu tích, giải sau lúc nộp thì không', async () => {
    const view = await callerAs(G).examSitting.get({ examId: mainExamId });
    expect(Object.fromEntries(view.problems.map((p) => [p.code, p.solved]))).toEqual({
      [GIT_CODE]: true,
      [K8S_OTHER]: false,
      [SUBMITTABLE]: true,
    });
  });

  it('bảng điểm: lượt giải sau lúc nộp không vào ô, không vào solvedCount', async () => {
    const board = await callerAs(ADMIN, 'admin').exams.scoreboard({ examId: mainExamId });
    const row = board.rows.find((r) => r.userId === G);
    expect(row?.submittedAt).toBe(gSubmittedAt.toISOString());
    expect(row?.cells.map((c) => [c.problemCode, c.solved, c.passed])).toEqual([
      [GIT_CODE, true, 1],
      [K8S_OTHER, false, null],
      [SUBMITTABLE, true, 1],
    ]);
    expect(row?.solvedCount).toBe(2);
  });

  it('CSV: cùng cửa sổ — ô của bài giải sau lúc nộp để trống', async () => {
    const { csv } = await callerAs(ADMIN, 'admin').exams.scoreboardCsv({ examId: mainExamId });
    const line = csv.split('\r\n').find((l) => l.includes(`"${G}@test.local"`));
    // Cột bài theo thứ tự đề: GIT, K8S_OTHER, SUBMITTABLE — rồi Số bài AC.
    expect(line).toContain('"AC","","AC","2"');
  });
});

describe('problems.submit · không có examId thì là luyện tập', () => {
  it('lượt thi MỞ chứa bài, không gửi examId, seed bất kỳ ⇒ được ghi, cổng seed không chạm tới', async () => {
    // 999 ≠ seed 101 của lượt chính. Có cổng thi thì lượt này bị FORBIDDEN.
    const result = await callerAs(A).problems.submit(payload(SUBMITTABLE, 999) as never);
    expect(result.submission.problemCode).toBe(SUBMITTABLE);
    expect(await submissionCount(A, SUBMITTABLE)).toBe(3);
  });

  it('bài K8s, seed NGẪU NHIÊN như arena, lượt thi đang mở, không gửi examId ⇒ được ghi', async () => {
    // Đúng biểu thức của `components/k8s-arena/arena-session.ts`: mỗi phiên một
    // seed ngẫu nhiên, và client không bao giờ biết seed 101 của lượt thi.
    const arenaSeed = Math.floor(Math.random() * 2 ** 31);
    const result = await callerAs(A).problems.submit(payload(SUBMITTABLE, arenaSeed) as never);
    expect(result.submission.problemCode).toBe(SUBMITTABLE);
    expect(await submissionCount(A, SUBMITTABLE)).toBe(4);
  });

  it('lượt luyện tập đó nằm trong cửa sổ của lượt thi đang mở ⇒ bảng điểm vẫn thấy nó', async () => {
    // Bảng điểm gán lượt nộp vào lượt thi theo CỬA SỔ thời gian, không theo
    // examId — lượt nộp vừa ghi ở ô trên rơi vào đó.
    const board = await callerAs(ADMIN, 'admin').exams.scoreboard({ examId: mainExamId });
    const cell = board.rows
      .find((row) => row.userId === A)
      ?.cells.find((c) => c.problemCode === SUBMITTABLE);
    expect(cell?.passed, 'lượt nộp không rơi vào cửa sổ của lượt thi').not.toBeNull();
  });

  it('hai lượt mở cùng chứa bài, không gửi examId ⇒ seed của lượt nào cũng được, kể cả seed lạ', async () => {
    for (const seed of [606, 707, 31_337]) {
      await callerAs(F).problems.submit(payload(SUBMITTABLE, seed) as never);
    }
    expect(await submissionCount(F, SUBMITTABLE)).toBe(3);
  });

  it('không có lượt thi nào ⇒ luyện tập: seed bất kỳ, được ghi', async () => {
    await callerAs(C).problems.submit(payload(SUBMITTABLE, 123_456) as never);
    expect(await submissionCount(C, SUBMITTABLE)).toBe(1);
  });

  it('lượt thi đã HẾT GIỜ ⇒ luyện tập', async () => {
    await callerAs(D).problems.submit(payload(SUBMITTABLE, 42) as never);
    expect(await submissionCount(D, SUBMITTABLE)).toBe(1);
  });

  it('lượt thi đã BẤM NỘP ⇒ luyện tập', async () => {
    await callerAs(E).problems.submit(payload(SUBMITTABLE, 42) as never);
    expect(await submissionCount(E, SUBMITTABLE)).toBe(1);
  });
});

describe('problems.submit · có examId thì luật thi áp đủ, câu lỗi không đổi', () => {
  it('examId tường minh, lệch seed ⇒ FORBIDDEN nói về seed, không ghi', async () => {
    const before = await submissionCount(A, SUBMITTABLE);
    const error = await submitError(callerAs(A), payload(SUBMITTABLE, 999, mainExamId));
    expect(error?.code).toBe('FORBIDDEN');
    expect(error?.message).toBe('Bài nộp mang seed khác seed máy chủ đã cấp cho lượt thi này');
    expect(await submissionCount(A, SUBMITTABLE)).toBe(before);
  });

  it('examId tường minh, đúng seed ⇒ được ghi', async () => {
    const before = await submissionCount(A, SUBMITTABLE);
    await callerAs(A).problems.submit(payload(SUBMITTABLE, 101, mainExamId) as never);
    expect(await submissionCount(A, SUBMITTABLE)).toBe(before + 1);
  });

  it('examId tường minh KHÔNG khớp lượt mở chứa bài ⇒ bị từ chối, không rơi về luyện tập', async () => {
    const before = await submissionCount(A, SUBMITTABLE);
    // Đề không chứa bài này.
    const outside = await submitError(callerAs(A), payload(SUBMITTABLE, 303, unrelatedExamId));
    expect(outside?.code).toBe('FORBIDDEN');
    expect(outside?.message).toContain('không nằm trong đề');
    // Lượt của đề đó đã hết giờ.
    const expired = await submitError(callerAs(A), payload(SUBMITTABLE, 202, otherExamId));
    expect(expired?.code).toBe('FORBIDDEN');
    expect(expired?.message).toContain('đã kết thúc');
    // Kỳ thi A chưa mở lượt nào.
    const notStarted = await submitError(callerAs(A), payload(SUBMITTABLE, 1, laterExamId));
    expect(notStarted?.code).toBe('FORBIDDEN');
    expect(notStarted?.message).toBe('Bạn chưa mở lượt thi này, nên bài nộp không được tính');
    expect(await submissionCount(A, SUBMITTABLE)).toBe(before);
  });

  it('hai lượt mở chồng nhau ⇒ examId chọn đúng lượt, và seed của lượt kia bị từ chối', async () => {
    const before = await submissionCount(F, SUBMITTABLE);
    const crossed = await submitError(callerAs(F), payload(SUBMITTABLE, 707, mainExamId));
    expect(crossed?.code).toBe('FORBIDDEN');
    expect(crossed?.message).toContain('seed');
    await callerAs(F).problems.submit(payload(SUBMITTABLE, 606, mainExamId) as never);
    await callerAs(F).problems.submit(payload(SUBMITTABLE, 707, laterExamId) as never);
    expect(await submissionCount(F, SUBMITTABLE)).toBe(before + 2);
  });

  it('người ngoài lớp gửi examId ⇒ NOT_FOUND', async () => {
    const error = await submitError(callerAs(OUTSIDER), payload(SUBMITTABLE, 101, mainExamId));
    expect(error?.code).toBe('NOT_FOUND');
  });
});
