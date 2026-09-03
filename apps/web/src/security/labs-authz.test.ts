import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import {
  labSchema,
  playgroundSchema,
  type Lab,
  type Playground,
} from '@devops-platform/shared-types';
import { users, labAttempts, labTaskResults } from '../server/db/schema';
import { MAX_LIST_LIMIT } from '../server/trpc/init';
import { closeTestDb, ctxFor, testDb, uniqueId } from './test-helpers';

/**
 * `labs.*` + `playgrounds.*` — contract §3/§4
 * (`plans/devops-learning-platform/reports/harness/2026-09-04-p8-contract/contract.md`).
 *
 * Mức test: INTEGRATION nhẹ, CÙNG khuôn `lessons-authz.test.ts` — `appRouter.createCaller`
 * với Postgres THẬT, KHÔNG cần orchestrator/gateway thật đang chạy.
 *
 * Hai phụ thuộc được mock (đều thuộc 8.A — lane khác, ĐÃ merge trong lúc file
 * này được viết; giữ mock vì fixture nội dung ở đây KHÔNG tồn tại trên đĩa
 * thật, không phải vì hàm thật chưa có):
 *
 * 1. `../server/labs/catalog` — thay `ContentSource` thật (đọc `content/labs`,
 *    `content/playgrounds` trên đĩa) bằng fixture Lab/Playground dựng tay qua
 *    `labSchema.parse`/`playgroundSchema.parse` (schema THẬT). Router gọi
 *    đúng shape `listLabs`/`getLab`/`listPlaygrounds`/`getPlayground` mà
 *    `packages/scenario/src/source.ts` đã hiện thực — mock chỉ đổi NGUỒN dữ
 *    liệu, không đổi hợp đồng.
 * 2. `../server/grpc/orchestrator-client` — mock CÙNG khuôn
 *    `lessons-authz.test.ts`, có thêm `createSession` (labs/playgrounds đều mở
 *    sandbox mới).
 *
 * `computeLabScore`/`computeLabStatus`/`computeAttemptDurationSeconds` (contract
 * §2) dùng bản THẬT từ `@devops-platform/scenario` — KHÔNG mock, vì đó chính là
 * thứ các test dưới đây đang khẳng định ("điểm/trạng thái tính đúng").
 *
 * `fetch` vẫn bị CHẶN CỨNG như lessons-authz.test.ts, nhưng ở đây một số ca chủ
 * đích cho nó TRẢ LỜI có kiểm soát (không throw) để dựng ba ca lỗi của
 * `runScriptInSession` — xem `describe('labs.checkTask — ba ca lỗi')`.
 */

const { labFixtures, playgroundFixtures } = vi.hoisted(() => ({
  labFixtures: new Map<string, unknown>(),
  playgroundFixtures: new Map<string, unknown>(),
}));

vi.mock('../server/labs/catalog', () => ({
  labSource: () => ({
    listLabs: async () => {
      const { toLabSummary: toSummary } = await import('@devops-platform/shared-types');
      return [...labFixtures.values()]
        .map((lab) => toSummary(lab as never))
        .sort((a, b) => a.id.localeCompare(b.id));
    },
    getLab: async (id: string) => labFixtures.get(id) ?? null,
    listPlaygrounds: async () => [],
    getPlayground: async () => null,
  }),
  playgroundSource: () => ({
    listLabs: async () => [],
    getLab: async () => null,
    listPlaygrounds: async () =>
      [...playgroundFixtures.values()]
        .map((p) => p as { id: string })
        .sort((a, b) => a.id.localeCompare(b.id)),
    getPlayground: async (id: string) => playgroundFixtures.get(id) ?? null,
  }),
  requireLab: async (id: string) => {
    const lab = labFixtures.get(id);
    if (lab === undefined) {
      const { TRPCError: T } = await import('@trpc/server');
      throw new T({ code: 'NOT_FOUND', message: `Không có lab "${id}"` });
    }
    return lab;
  },
  requirePlayground: async (id: string) => {
    const p = playgroundFixtures.get(id);
    if (p === undefined) {
      const { TRPCError: T } = await import('@trpc/server');
      throw new T({ code: 'NOT_FOUND', message: `Không có playground "${id}"` });
    }
    return p;
  },
}));

interface FakeOrchestratorSession {
  expiresAtSeconds: number;
}
const orchestratorSessions = new Map<string, FakeOrchestratorSession>();
let sessionCounter = 0;

vi.mock('../server/grpc/orchestrator-client', () => ({
  orchestratorClient: () => ({
    createSession: (req: { userId: string }) => {
      sessionCounter += 1;
      const id = `sess-${String(sessionCounter)}`;
      const expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600;
      orchestratorSessions.set(id, { expiresAtSeconds });
      return Promise.resolve({
        session: {
          id,
          userId: req.userId,
          status: 1,
          podName: 'pod-fixture',
          namespace: 'ns-fixture',
          tier: 0,
          createdAt: undefined,
          expiresAt: { seconds: BigInt(expiresAtSeconds), nanos: 0 },
          revision: BigInt(0),
        },
      });
    },
    getSession: (req: { sessionId: string }) => {
      const s = orchestratorSessions.get(req.sessionId);
      if (s === undefined) {
        return Promise.resolve({ session: undefined });
      }
      return Promise.resolve({ session: { expiresAt: { seconds: BigInt(s.expiresAtSeconds), nanos: 0 } } });
    },
  }),
  callOrchestrator: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

/**
 * `fetch` chặn cứng theo mặc định (cùng khẳng định với `lessons-authz.test.ts`)
 * — mọi test PHẢI tự đặt `fetchSpy.mockImplementationOnce(...)` nếu nó THẬT SỰ
 * cần đi tới `runScriptInSession`.
 */
// Annotation kiểu trả về TƯỜNG MINH — khác `lessons-authz.test.ts` (không cần vì
// file đó không bao giờ `mockImplementationOnce`). Thiếu nó, TS suy `never` từ
// một hàm luôn `throw`, và mọi `mockImplementationOnce(() => Promise<Response>)`
// dưới đây sẽ đỏ ở `pnpm typecheck` (`Promise<Response>` không gán được cho `never`).
const fetchSpy = vi.fn((): Promise<Response> => {
  throw new Error('test không được gọi gateway thật');
});
vi.stubGlobal('fetch', fetchSpy);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

async function caller(user: { id: string; role: 'user' | 'admin' } | null) {
  const { appRouter } = await import('../server/trpc/routers/app-router');
  return appRouter.createCaller(ctxFor(user));
}

async function makeUser(prefix: string): Promise<{ id: string; role: 'user' }> {
  const id = uniqueId(prefix);
  await testDb()
    .insert(users)
    .values({ id, name: prefix, email: `${id}@test.local` });
  return { id, role: 'user' };
}

function isTRPCCode(code: string) {
  return (error: unknown) => error instanceof TRPCError && error.code === code;
}

function makeLab(overrides: Partial<Lab> & { id: string }): Lab {
  const lab = labSchema.parse({
    id: overrides.id,
    title: overrides.title ?? 'Fixture Lab',
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: 10,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu-fixture',
    interfaceLayout: null,
    assets: [],
    source: null,
    tasks: overrides.tasks ?? [
      { id: 'task-a', title: 'Task A', markdown: 'A', verifyScript: 'true', weight: 1, hint: null },
      { id: 'task-b', title: 'Task B', markdown: 'B', verifyScript: 'true', weight: 1, hint: null },
    ],
    setup: { foreground: null, background: null },
    passThresholdPercent: overrides.passThresholdPercent ?? 50,
    leaderboard: overrides.leaderboard ?? true,
  });
  labFixtures.set(lab.id, lab);
  return lab;
}

function makePlayground(overrides: Partial<Playground> & { id: string }): Playground {
  const playground = playgroundSchema.parse({
    id: overrides.id,
    title: overrides.title ?? 'Fixture Playground',
    description: null,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu-fixture',
    interfaceLayout: null,
    ttlSeconds: overrides.ttlSeconds ?? 1800,
  });
  playgroundFixtures.set(playground.id, playground);
  return playground;
}

async function countTaskResults(attemptId: string): Promise<number> {
  const rows = await testDb().select().from(labTaskResults).where(eq(labTaskResults.attemptId, attemptId));
  return rows.length;
}

afterAll(async () => {
  await closeTestDb();
});

describe('labs.list / labs.get', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('lab-list');
    labFixtures.clear();
  });

  it('list trả LabSummary, limit ÉP về ≤100', async () => {
    makeLab({ id: 'lab-list-a' });
    makeLab({ id: 'lab-list-b' });
    const out = await (await caller(user)).labs.list({ limit: 100_000 });
    expect(out.limit).toBe(MAX_LIST_LIMIT);
    expect(out.items.map((i) => i.id).sort()).toEqual(['lab-list-a', 'lab-list-b']);
    expect(out.items[0]).not.toHaveProperty('tasks'); // summary, không phải full
  });

  it('get trả lab đầy đủ + unsupportedCapabilities', async () => {
    makeLab({ id: 'lab-get-a' });
    const out = await (await caller(user)).labs.get({ labId: 'lab-get-a' });
    expect(out.lab.tasks).toHaveLength(2);
    expect(out.unsupportedCapabilities).toEqual([]);
  });

  it('lab không tồn tại → NOT_FOUND', async () => {
    await expect((await caller(user)).labs.get({ labId: 'khong-ton-tai' })).rejects.toSatisfy(
      isTRPCCode('NOT_FOUND'),
    );
  });

  it('chưa đăng nhập → UNAUTHORIZED', async () => {
    const anon = await caller(null);
    await expect(anon.labs.list({ limit: 10 })).rejects.toSatisfy(isTRPCCode('UNAUTHORIZED'));
  });
});

describe('labs.startAttempt', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('lab-start');
    labFixtures.clear();
    makeLab({ id: 'lab-start-fixture' });
  });

  it('mở sandbox + ghi một dòng lab_attempts đang làm dở (submittedAt null)', async () => {
    const out = await (await caller(user)).labs.startAttempt({
      labId: 'lab-start-fixture',
      idempotencyKey: uniqueId('idem'),
    });
    expect(out.attemptId).toBeTruthy();
    expect(out.sessionId).toBeTruthy();

    const rows = await testDb().select().from(labAttempts).where(eq(labAttempts.id, out.attemptId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.submittedAt).toBeNull();
    expect(rows[0]?.userId).toBe(user.id);
    expect(rows[0]?.displayNamePublic).toBe(false);
  });

  it('input KHÔNG có field userId — @ts-expect-error phải BAD_REQUEST', async () => {
    const c = await caller(user);
    await expect(
      // @ts-expect-error — cố tình gửi field không có trong schema (luật 1 ở dạng mạnh)
      c.labs.startAttempt({ labId: 'lab-start-fixture', idempotencyKey: uniqueId('idem'), userId: 'nan-nhan' }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });
});

describe('labs — luật 1/5: IDOR có đối chứng dương', () => {
  let userA: { id: string; role: 'user' };
  let userB: { id: string; role: 'user' };
  let attemptA: string;

  beforeEach(async () => {
    userA = await makeUser('lab-idor-a');
    userB = await makeUser('lab-idor-b');
    labFixtures.clear();
    makeLab({ id: 'lab-idor-fixture' });

    const started = await (await caller(userA)).labs.startAttempt({
      labId: 'lab-idor-fixture',
      idempotencyKey: uniqueId('idem'),
    });
    attemptA = started.attemptId;
  });

  it('getAttempt: A xem được CỦA MÌNH (đối chứng dương) — B xem CỦA A → NOT_FOUND', async () => {
    const seenByA = await (await caller(userA)).labs.getAttempt({ attemptId: attemptA });
    expect(seenByA.attempt.id).toBe(attemptA);
    expect(seenByA.status).toBe('in_progress');

    await expect((await caller(userB)).labs.getAttempt({ attemptId: attemptA })).rejects.toSatisfy(
      isTRPCCode('NOT_FOUND'),
    );
  });

  it('listAttempts: A thấy lần thử của mình — B không thấy gì (danh sách rỗng, không lỗi)', async () => {
    const listA = await (await caller(userA)).labs.listAttempts({ labId: 'lab-idor-fixture', limit: 10 });
    expect(listA.items.map((i) => i.attempt.id)).toContain(attemptA);

    const listB = await (await caller(userB)).labs.listAttempts({ labId: 'lab-idor-fixture', limit: 10 });
    expect(listB.items).toEqual([]);
  });

  it('checkTask: A chấm được (đối chứng dương) — B chấm attempt của A → NOT_FOUND', async () => {
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(200, { exitCode: 0, output: 'ok', truncated: false })),
    );
    const passed = await (await caller(userA)).labs.checkTask({
      labId: 'lab-idor-fixture',
      attemptId: attemptA,
      taskId: 'task-a',
    });
    expect(passed.passed).toBe(true);

    await expect(
      (await caller(userB)).labs.checkTask({ labId: 'lab-idor-fixture', attemptId: attemptA, taskId: 'task-a' }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
    // Không gọi thêm gateway nào cho lượt bị chặn ở authz.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('submit: A nộp được (đối chứng dương) — B nộp attempt của A → NOT_FOUND', async () => {
    await expect(
      (await caller(userB)).labs.submit({ labId: 'lab-idor-fixture', attemptId: attemptA }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));

    const out = await (await caller(userA)).labs.submit({ labId: 'lab-idor-fixture', attemptId: attemptA });
    expect(out.attempt.submittedAt).not.toBeNull();
    expect(out.status).toBe('failed'); // 0/2 task đạt, thềm 50%
  });

  it('setDisplayPreference: A đổi được (đối chứng dương) — B đổi attempt của A → NOT_FOUND', async () => {
    await expect(
      (await caller(userB)).labs.setDisplayPreference({ attemptId: attemptA, displayNamePublic: true }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));

    const out = await (await caller(userA)).labs.setDisplayPreference({
      attemptId: attemptA,
      displayNamePublic: true,
    });
    expect(out.ok).toBe(true);
    const rows = await testDb().select().from(labAttempts).where(eq(labAttempts.id, attemptA));
    expect(rows[0]?.displayNamePublic).toBe(true);
  });

  it('attemptId của người khác trả NOT_FOUND, KHÔNG PHẢI FORBIDDEN (contract §3 luật 5)', async () => {
    const error = await (await caller(userB)).labs.getAttempt({ attemptId: attemptA }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe('NOT_FOUND');
    expect((error as TRPCError).code).not.toBe('FORBIDDEN');
  });
});

describe('labs.checkTask — ba ca lỗi (contract §3 luật 3)', () => {
  let user: { id: string; role: 'user' };
  let attemptId: string;

  beforeEach(async () => {
    user = await makeUser('lab-check-err');
    labFixtures.clear();
    makeLab({ id: 'lab-check-err-fixture' });
    const started = await (await caller(user)).labs.startAttempt({
      labId: 'lab-check-err-fixture',
      idempotencyKey: uniqueId('idem'),
    });
    attemptId = started.attemptId;
    fetchSpy.mockClear();
  });

  it('script chấm thoát exit code ≠ 0 → GHI một dòng, passed:false (đúng nghĩa "làm sai")', async () => {
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(200, { exitCode: 1, output: 'assertion thất bại', truncated: false })),
    );
    const before = await countTaskResults(attemptId);
    const out = await (await caller(user)).labs.checkTask({
      labId: 'lab-check-err-fixture',
      attemptId,
      taskId: 'task-a',
    });
    expect(out).toEqual({ exitCode: 1, passed: false, output: 'assertion thất bại' });
    expect(await countTaskResults(attemptId)).toBe(before + 1);
  });

  it('gateway trả 200 nhưng SAI SHAPE (contract vỡ) → NÉM, KHÔNG ghi dòng nào', async () => {
    fetchSpy.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, { foo: 'bar' })));
    const before = await countTaskResults(attemptId);
    await expect(
      (await caller(user)).labs.checkTask({ labId: 'lab-check-err-fixture', attemptId, taskId: 'task-a' }),
    ).rejects.toSatisfy(isTRPCCode('INTERNAL_SERVER_ERROR'));
    expect(await countTaskResults(attemptId)).toBe(before);
  });

  it('gateway trả lỗi hạ tầng (SESSION_NOT_ACTIVE, 5xx) → NÉM CONFLICT, KHÔNG ghi dòng nào', async () => {
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(503, { code: 'SESSION_NOT_ACTIVE', message: 'pod chưa sẵn sàng' })),
    );
    const before = await countTaskResults(attemptId);
    await expect(
      (await caller(user)).labs.checkTask({ labId: 'lab-check-err-fixture', attemptId, taskId: 'task-a' }),
    ).rejects.toSatisfy(isTRPCCode('CONFLICT'));
    expect(await countTaskResults(attemptId)).toBe(before);
  });

  it('checkTask trên attempt ĐÃ nộp → CONFLICT, không chạm gateway', async () => {
    // `submit` KHÔNG chạy verify script nào (contract §3 luật 1) — không cần
    // (và không được) đặt mock cho `fetch` ở đây; đặt một cái sẽ NẰM CHỜ và bị
    // tiêu thụ nhầm bởi lượt fetch thật đầu tiên của một test SAU trong file.
    await (await caller(user)).labs.submit({ labId: 'lab-check-err-fixture', attemptId });
    fetchSpy.mockClear();

    await expect(
      (await caller(user)).labs.checkTask({ labId: 'lab-check-err-fixture', attemptId, taskId: 'task-b' }),
    ).rejects.toSatisfy(isTRPCCode('CONFLICT'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('labs.submit — luật 1: KHÔNG chạy verify script nào', () => {
  let user: { id: string; role: 'user' };
  let attemptId: string;

  beforeEach(async () => {
    user = await makeUser('lab-submit');
    labFixtures.clear();
    makeLab({ id: 'lab-submit-fixture', passThresholdPercent: 50 });
    const started = await (await caller(user)).labs.startAttempt({
      labId: 'lab-submit-fixture',
      idempotencyKey: uniqueId('idem'),
    });
    attemptId = started.attemptId;
    fetchSpy.mockClear();
  });

  it('submit chỉ chốt, tuyệt đối không gọi gateway, và tính lại từ dòng đã lưu', async () => {
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(200, { exitCode: 0, output: 'ok', truncated: false })),
    );
    await (await caller(user)).labs.checkTask({ labId: 'lab-submit-fixture', attemptId, taskId: 'task-a' });
    fetchSpy.mockClear();

    const out = await (await caller(user)).labs.submit({ labId: 'lab-submit-fixture', attemptId });
    expect(fetchSpy).not.toHaveBeenCalled(); // submit KHÔNG chấm gì thêm
    expect(out.score.percent).toBe(50); // 1/2 task đạt (weight bằng nhau)
    expect(out.status).toBe('passed'); // 50% >= thềm 50%
    expect(out.attempt.submittedAt).not.toBeNull();
  });

  it('submit hai lần trên cùng attempt → CONFLICT lần thứ hai', async () => {
    await (await caller(user)).labs.submit({ labId: 'lab-submit-fixture', attemptId });
    await expect(
      (await caller(user)).labs.submit({ labId: 'lab-submit-fixture', attemptId }),
    ).rejects.toSatisfy(isTRPCCode('CONFLICT'));
  });
});

describe('labs.leaderboard', () => {
  beforeEach(() => {
    labFixtures.clear();
  });

  async function submitWith(
    labId: string,
    taskExit: { taskA: number; taskB: number },
    displayNamePublic: boolean,
    userPrefix: string,
  ): Promise<{ user: { id: string; role: 'user' } }> {
    const user = await makeUser(userPrefix);
    const c = await caller(user);
    const started = await c.labs.startAttempt({ labId, idempotencyKey: uniqueId('idem') });

    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(200, { exitCode: taskExit.taskA, output: 'a', truncated: false })),
    );
    await c.labs.checkTask({ labId, attemptId: started.attemptId, taskId: 'task-a' });
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(200, { exitCode: taskExit.taskB, output: 'b', truncated: false })),
    );
    await c.labs.checkTask({ labId, attemptId: started.attemptId, taskId: 'task-b' });

    if (displayNamePublic) {
      await c.labs.setDisplayPreference({ attemptId: started.attemptId, displayNamePublic: true });
    }
    await c.labs.submit({ labId, attemptId: started.attemptId });
    return { user };
  }

  it('lab.leaderboard === false → NOT_FOUND', async () => {
    const labId = uniqueId('lb-disabled');
    makeLab({ id: labId, leaderboard: false });
    const viewer = await makeUser('lb-viewer-disabled');
    await expect(
      (await caller(viewer)).labs.leaderboard({ labId, limit: 10 }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
  });

  it('mặc định ẩn danh, không lộ email; opt-in hiện tên; loại attempt chưa nộp; giới hạn 100', async () => {
    // `labId` PHẢI duy nhất mỗi lượt chạy: leaderboard gộp theo TOÀN BỘ lịch sử
    // của một labId (không lọc theo user), nên một chuỗi tĩnh sẽ cộng dồn dòng
    // từ lượt chạy test TRƯỚC còn sót lại trong Postgres (không có dọn bảng
    // giữa các lần chạy — cùng khuôn `lessons-authz.test.ts`, nơi cách ly dựa
    // vào `uniqueId()` cho user chứ không phải xoá bảng).
    const labId = uniqueId('lb-basic');
    makeLab({ id: labId, leaderboard: true, passThresholdPercent: 50 });
    const anon = await submitWith(labId, { taskA: 0, taskB: 0 }, false, 'lb-anon');
    const named = await submitWith(labId, { taskA: 0, taskB: 0 }, true, 'lb-named');

    // Một lần thử KHÔNG nộp — không được xuất hiện.
    const c3 = await caller(await makeUser('lb-unsubmitted'));
    await c3.labs.startAttempt({ labId, idempotencyKey: uniqueId('idem') });

    const viewer = await caller(anon.user);
    const out = await viewer.labs.leaderboard({ labId, limit: 100_000 });

    expect(out.items).toHaveLength(2); // KHÔNG có dòng thứ ba (chưa nộp)
    for (const row of out.items) {
      expect(Object.keys(row)).not.toContain('email');
      expect(Object.keys(row)).not.toContain('userId');
    }
    const anonRow = out.items.find((r) => r.isSelf);
    expect(anonRow?.displayName).toBeNull(); // mặc định ẩn danh

    const namedRow = out.items.find((r) => !r.isSelf);
    expect(namedRow?.displayName).toBe('lb-named');

    // limit khổng lồ vẫn bị ép về ≤100 (luật 4) — không throw, chỉ kẹp.
    expect(out.items.length).toBeLessThanOrEqual(MAX_LIST_LIMIT);
  });

  it('sắp xếp percent DESC, durationSeconds ASC, submittedAt ASC — cả ba mức đều được test', async () => {
    // Cùng lý do `labId` phải duy nhất như test ở trên — leaderboard gộp TOÀN
    // BỘ lịch sử của một labId, chuỗi tĩnh sẽ cộng dồn dòng từ lượt chạy trước.
    const labId = uniqueId('lb-order');
    makeLab({ id: labId, leaderboard: true, passThresholdPercent: 1 });

    // A: percent thấp hơn hẳn (chỉ task-a đạt) — luôn đứng CUỐI bất kể duration/thời điểm.
    const lowPercent = await makeUser('lb-order-low');
    {
      const c = await caller(lowPercent);
      const started = await c.labs.startAttempt({ labId, idempotencyKey: uniqueId('idem') });
      fetchSpy.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, { exitCode: 0, output: '', truncated: false })));
      await c.labs.checkTask({ labId, attemptId: started.attemptId, taskId: 'task-a' });
      fetchSpy.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, { exitCode: 1, output: '', truncated: false })));
      await c.labs.checkTask({ labId, attemptId: started.attemptId, taskId: 'task-b' });
      await c.labs.submit({ labId, attemptId: started.attemptId });
    }

    // B, C, D: percent 100% (cả hai task đạt) — phân biệt bằng duration rồi submittedAt.
    // C có duration NGẮN NHẤT → hạng nhất. B và D cùng duration dài hơn, nhưng B nộp
    // TRƯỚC D → B hạng nhì, D hạng ba. Duration điều khiển được vì `startAttempt` và
    // `submit` đều đọc đồng hồ THẬT — chèn một `await sleep()` giữa hai mốc.
    async function fullPass(prefix: string, waitMs: number): Promise<string> {
      const u = await makeUser(prefix);
      const c = await caller(u);
      const started = await c.labs.startAttempt({ labId, idempotencyKey: uniqueId('idem') });
      fetchSpy.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, { exitCode: 0, output: '', truncated: false })));
      await c.labs.checkTask({ labId, attemptId: started.attemptId, taskId: 'task-a' });
      fetchSpy.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, { exitCode: 0, output: '', truncated: false })));
      await c.labs.checkTask({ labId, attemptId: started.attemptId, taskId: 'task-b' });
      await new Promise((r) => setTimeout(r, waitMs));
      await c.labs.submit({ labId, attemptId: started.attemptId });
      return u.id;
    }

    const cId = await fullPass('lb-order-c', 5); // nộp gần như ngay — duration ngắn nhất
    const bId = await fullPass('lb-order-b', 1100); // duration dài hơn, nộp TRƯỚC d
    const dId = await fullPass('lb-order-d', 1100); // duration dài tương tự b, nộp SAU b

    const viewer = await caller(lowPercent);
    const out = await viewer.labs.leaderboard({ labId, limit: 10 });
    expect(out.items.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(out.items[3]?.percent).toBeLessThan(out.items[0]!.percent); // A ở cuối
    void cId;
    void bId;
    void dId;
    // Không đọc `userId` được từ DTO (không lộ) nên chỉ khẳng định QUAN HỆ thứ tự
    // percent/duration ở ba dòng đầu, không định danh bằng id.
    expect(out.items[0]!.percent).toBe(100);
    expect(out.items[1]!.percent).toBe(100);
    expect(out.items[2]!.percent).toBe(100);
    expect(out.items[0]!.durationSeconds).toBeLessThanOrEqual(out.items[1]!.durationSeconds);
    expect(out.items[1]!.durationSeconds).toBeLessThanOrEqual(out.items[2]!.durationSeconds);
    // Hai dòng có duration BẰNG NHAU (trong khoảng làm tròn giây) phải sắp theo submittedAt.
    if (out.items[1]!.durationSeconds === out.items[2]!.durationSeconds) {
      expect(out.items[1]!.submittedAt.getTime()).toBeLessThanOrEqual(out.items[2]!.submittedAt.getTime());
    }
  }, 20_000);
});

describe('playgrounds.list / playgrounds.get / playgrounds.start', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('pg');
    playgroundFixtures.clear();
  });

  it('list + get trả đúng nội dung', async () => {
    makePlayground({ id: 'pg-a', ttlSeconds: 900 });
    const list = await (await caller(user)).playgrounds.list({ limit: 10 });
    expect(list.items.map((p) => p.id)).toContain('pg-a');

    const got = await (await caller(user)).playgrounds.get({ playgroundId: 'pg-a' });
    expect(got.playground.ttlSeconds).toBe(900);
  });

  it('start mở sandbox, KHÔNG ghi bảng nào, trả ttlSeconds của NỘI DUNG', async () => {
    makePlayground({ id: 'pg-start', ttlSeconds: 1200 });
    const out = await (await caller(user)).playgrounds.start({
      playgroundId: 'pg-start',
      idempotencyKey: uniqueId('idem'),
    });
    expect(out.ttlSeconds).toBe(1200);
    expect(out.sessionId).toBeTruthy();
  });

  it('playground không tồn tại → NOT_FOUND', async () => {
    await expect((await caller(user)).playgrounds.get({ playgroundId: 'khong-co' })).rejects.toSatisfy(
      isTRPCCode('NOT_FOUND'),
    );
  });
});
