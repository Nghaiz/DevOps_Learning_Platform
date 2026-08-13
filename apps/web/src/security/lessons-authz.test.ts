import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { users, progress } from '../server/db/schema';
import { MAX_LIST_LIMIT } from '../server/trpc/init';
import { closeTestDb, ctxFor, testDb, uniqueId } from './test-helpers';

/**
 * `lessons.*` — luật 1 (authz object-level), luật 3 (Zod strict), luật 4 (trần
 * pagination), và ranh giới "script chấm KHÔNG tới từ client" (P2 / 2.B + 2.C).
 *
 * Mức test: INTEGRATION nhẹ — `appRouter.createCaller` với Postgres THẬT (docker
 * compose) và nội dung THẬT từ `content/scenarios/`. KHÔNG cần orchestrator hay
 * gateway đang chạy: mọi ca ở đây chết ở tầng authz/validate TRƯỚC khi có gói tin
 * nào rời BFF, và ca duy nhất đi xa hơn thì mock `orchestrator-client`.
 *
 * ⚠ `createCaller` BỎ QUA tầng serialize (bài học đã ghi ở `grpc/session-json.ts`
 * — `session.create` từng trả HTTP 500 vì bigint mà mọi test router vẫn xanh).
 * Nên file này KHÔNG khẳng định gì về hình dạng JSON trên dây; nó khẳng định
 * authz và validation, hai thứ chạy trước serialize.
 */

/**
 * Bài THẬT trong `content/scenarios/`, mỗi hằng chọn vì MỘT đặc tính cụ thể.
 *
 * ⚠ Bốn bài đã vendor phân bố đặc tính không đều, và đó là dữ kiện chứ không
 * phải bất tiện — nó là lý do phải đọc nội dung thật thay vì bịa fixture:
 *
 * | bài | step | verify ở step | verify ở intro | capabilities |
 * |---|---|---|---|---|
 * | `ckad-configmap-as-files` | **1** | có (kubectl thật) | không | `kubernetes`, `multi-node` |
 * | `loki-quickstart` | 2 | không | không | — |
 * | `loxilb-tcp-load-balancing` | 3 | **không** | **có** | — |
 * | `prolug-linux-system-checking` | 3 | có (`/bin/true`) | không | — |
 *
 * Hệ quả đáng ghi: `ckad` chỉ có MỘT step, nên nó không dùng được cho ca "ghi
 * tiến độ ở step 2" — bản đầu của file này giả định nó nhiều step và ba ca đã
 * đỏ. Chính phép kiểm `stepIndex >= steps.length` bắt được, đúng việc nó sinh ra
 * để làm.
 */
const SCENARIO_MULTISTEP = 'prolug-linux-system-checking'; // 3 step, có verify ở step
const SCENARIO_NO_VERIFY = 'loki-quickstart'; // KHÔNG phase nào có verify
const SCENARIO_INTRO_VERIFY = 'loxilb-tcp-load-balancing'; // verify CHỈ ở intro
const SCENARIO_K8S = 'ckad-configmap-as-files'; // đòi kubernetes (chưa hỗ trợ)

vi.mock('../server/grpc/orchestrator-client', () => ({
  orchestratorClient: () => ({
    getSession: () => Promise.resolve({ session: undefined }),
  }),
  callOrchestrator: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

/**
 * `fetch` bị chặn CỨNG trong cả file.
 *
 * Không phải để cô lập cho gọn — nó là một PHÉP KHẲNG ĐỊNH: không ca nào dưới
 * đây được phép chạm tới gateway. Ca nào lọt qua authz và gọi thật sẽ đỏ với
 * thông điệp này thay vì im lặng treo tới timeout (hoặc, tệ hơn, chạy script
 * trong một pod thật trên máy dev).
 */
const fetchSpy = vi.fn(() => {
  throw new Error('test không được gọi gateway thật');
});
vi.stubGlobal('fetch', fetchSpy);

async function caller(user: { id: string; role: 'user' | 'admin' } | null) {
  const { appRouter } = await import('../server/trpc/routers/app-router');
  return appRouter.createCaller(ctxFor(user));
}

/** Tạo user thật — `progress.user_id` có FK tới `users`. */
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

describe('lessons — luật 1: tiến độ là của riêng từng người', () => {
  let userA: { id: string; role: 'user' };
  let userB: { id: string; role: 'user' };

  beforeEach(async () => {
    userA = await makeUser('lesson-a');
    userB = await makeUser('lesson-b');
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('input KHÔNG có field userId — không có chỗ nào để giả mạo danh tính', async () => {
    const a = await caller(userA);

    // Đây là hình thức mạnh nhất của luật 1: không phải "kiểm rồi cho qua" mà
    // "không có gì để kiểm". Nếu ai đó thêm `userId` vào input schema, ca này đỏ.
    await expect(
      // @ts-expect-error — cố tình gửi field không có trong schema
      a.lessons.saveProgress({ scenarioId: SCENARIO_MULTISTEP, stepIndex: 0, userId: userB.id }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });

  it('A ghi tiến độ → B đọc bài đó vẫn thấy not-started', async () => {
    await (await caller(userA)).lessons.saveProgress({
      scenarioId: SCENARIO_MULTISTEP,
      stepIndex: 1,
    });

    const seenByB = await (await caller(userB)).lessons.get({ scenarioId: SCENARIO_MULTISTEP });
    expect(seenByB.progress).toEqual({
      status: 'not-started',
      stepIndex: 0,
      completedAt: null,
      updatedAt: null,
    });

    const seenByA = await (await caller(userA)).lessons.get({ scenarioId: SCENARIO_MULTISTEP });
    expect(seenByA.progress.stepIndex).toBe(1);
    expect(seenByA.progress.status).toBe('in-progress');
  });

  it('B ghi tiến độ KHÔNG đè lên dòng của A (một dòng mỗi cặp user+bài)', async () => {
    await (await caller(userA)).lessons.saveProgress({
      scenarioId: SCENARIO_MULTISTEP,
      stepIndex: 2,
    });
    await (await caller(userB)).lessons.saveProgress({
      scenarioId: SCENARIO_MULTISTEP,
      stepIndex: 0,
    });

    const rowsA = await testDb().select().from(progress).where(eq(progress.userId, userA.id));
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.stepIndex).toBe(2);
  });

  it('`lessons.list` chỉ gắn tiến độ của chính người gọi', async () => {
    await (await caller(userA)).lessons.saveProgress({
      scenarioId: SCENARIO_MULTISTEP,
      stepIndex: 1,
    });

    const listB = await (await caller(userB)).lessons.list({ limit: 100 });
    for (const item of listB.items) {
      expect(item.progress.status).toBe('not-started');
    }
  });

  it('chưa đăng nhập → UNAUTHORIZED ở mọi procedure', async () => {
    const anon = await caller(null);
    await expect(anon.lessons.list({ limit: 10 })).rejects.toSatisfy(isTRPCCode('UNAUTHORIZED'));
    await expect(anon.lessons.get({ scenarioId: SCENARIO_MULTISTEP })).rejects.toSatisfy(
      isTRPCCode('UNAUTHORIZED'),
    );
    await expect(
      anon.lessons.saveProgress({ scenarioId: SCENARIO_MULTISTEP, stepIndex: 0 }),
    ).rejects.toSatisfy(isTRPCCode('UNAUTHORIZED'));
  });

  it('saveProgress KHÔNG xoá dấu hoàn thành đã ghi', async () => {
    // Người học mở lại bài đã xong để xem lại — mất thành tích là một chế độ
    // hỏng im lặng, và nó chỉ lộ khi có người phàn nàn.
    const now = new Date();
    await testDb()
      .insert(progress)
      .values({
        userId: userA.id,
        lessonId: SCENARIO_MULTISTEP,
        stepIndex: 3,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

    const after = await (await caller(userA)).lessons.saveProgress({
      scenarioId: SCENARIO_MULTISTEP,
      stepIndex: 0,
    });
    expect(after.status).toBe('completed');
    expect(after.stepIndex).toBe(0);
  });
});

describe('lessons — luật 3: Zod strict', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('lesson-strict');
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('field lạ ở checkStep → BAD_REQUEST', async () => {
    const c = await caller(user);
    await expect(
      c.lessons.checkStep({
        scenarioId: SCENARIO_MULTISTEP,
        sessionId: 'sess-1',
        phase: { kind: 'step', index: 0 },
        // @ts-expect-error — field lạ phải bị từ chối
        script: 'echo pwned',
      }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });

  it('sai type ở saveProgress → BAD_REQUEST', async () => {
    const c = await caller(user);
    await expect(
      // @ts-expect-error — stepIndex phải là số
      c.lessons.saveProgress({ scenarioId: SCENARIO_MULTISTEP, stepIndex: '1' }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });

  it('scenarioId sai định dạng → BAD_REQUEST (không chạm tới đĩa)', async () => {
    const c = await caller(user);
    await expect(c.lessons.get({ scenarioId: '../../../etc/passwd' })).rejects.toSatisfy(
      isTRPCCode('BAD_REQUEST'),
    );
  });

  it('phase kind lạ → BAD_REQUEST', async () => {
    const c = await caller(user);
    await expect(
      c.lessons.checkStep({
        scenarioId: SCENARIO_MULTISTEP,
        sessionId: 'sess-1',
        // @ts-expect-error — chỉ có intro/finish/step
        phase: { kind: 'bonus' },
      }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });
});

describe('lessons — luật 4: trần pagination', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('lesson-limit');
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('limit khổng lồ bị ÉP về ≤100, không bị reject', async () => {
    const out = await (await caller(user)).lessons.list({ limit: 100_000 });
    expect(out.limit).toBe(MAX_LIST_LIMIT);
    expect(out.items.length).toBeLessThanOrEqual(MAX_LIST_LIMIT);
  });

  it('cursor không còn hợp lệ → BAD_REQUEST, không lặng lẽ quay về trang 1', async () => {
    // Quay về trang 1 trong im lặng làm infinite-scroll lặp vô hạn.
    await expect(
      (await caller(user)).lessons.list({ limit: 2, cursor: 'bai-da-bi-xoa' }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
  });

  it('phân trang bằng cursor đi hết danh sách, không lặp mục', async () => {
    const c = await caller(user);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const out: { items: { id: string }[]; nextCursor: string | null } = await c.lessons.list(
        cursor === undefined ? { limit: 2 } : { limit: 2, cursor },
      );
      seen.push(...out.items.map((i) => i.id));
      if (out.nextCursor === null) break;
      cursor = out.nextCursor;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain(SCENARIO_MULTISTEP);
    expect(seen).toContain(SCENARIO_NO_VERIFY);
  });
});

describe('lessons — ranh giới script chấm', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('lesson-verify');
    fetchSpy.mockClear();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('bài KHÔNG có verify → PRECONDITION_FAILED, tuyệt đối không tự động pass', async () => {
    // `loki-quickstart` không có phase nào mang verify. Trả `passed:true` ở đây
    // là cách một lỗi vendor nội dung (quên file verify) biến thành một bài học
    // ai cũng qua.
    const c = await caller(user);
    await expect(
      c.lessons.checkStep({
        scenarioId: SCENARIO_NO_VERIFY,
        sessionId: 'sess-1',
        phase: { kind: 'step', index: 0 },
      }),
    ).rejects.toSatisfy(isTRPCCode('PRECONDITION_FAILED'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('stepIndex vượt số step → NOT_FOUND, không chạm gateway', async () => {
    const c = await caller(user);
    await expect(
      c.lessons.checkStep({
        scenarioId: SCENARIO_MULTISTEP,
        sessionId: 'sess-1',
        phase: { kind: 'step', index: 999 },
      }),
    ).rejects.toSatisfy(isTRPCCode('NOT_FOUND'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('bài không tồn tại → NOT_FOUND', async () => {
    const c = await caller(user);
    await expect(c.lessons.get({ scenarioId: 'khong-co-bai-nay' })).rejects.toSatisfy(
      isTRPCCode('NOT_FOUND'),
    );
  });

  it('verify nằm ở INTRO vẫn chấm được — không phải chỉ step mới có script', async () => {
    // `loxilb-tcp-load-balancing` có `verify` ở intro và KHÔNG có ở step nào.
    // Một API chỉ nhận `stepIndex` sẽ im lặng bỏ qua script đó, và bài trông như
    // "không có gì để chấm". Ca này đi tới tận `sessionExpiry` (→ CONFLICT vì
    // mock), tức nó đã QUA được `resolvePhase` + phép kiểm verifyScript !== null.
    const c = await caller(user);
    await expect(
      c.lessons.checkStep({
        scenarioId: SCENARIO_INTRO_VERIFY,
        sessionId: 'sess-1',
        phase: { kind: 'intro' },
      }),
    ).rejects.toSatisfy(isTRPCCode('CONFLICT'));

    // Cùng bài, ở STEP thì không có verify — hai nhánh phải khác nhau thật.
    await expect(
      c.lessons.checkStep({
        scenarioId: SCENARIO_INTRO_VERIFY,
        sessionId: 'sess-1',
        phase: { kind: 'step', index: 0 },
      }),
    ).rejects.toSatisfy(isTRPCCode('PRECONDITION_FAILED'));
  });

  // Nhánh "bài KHÔNG có intro/finish" KHÔNG có ở đây, và đó là chủ ý: cả bốn bài
  // đã vendor đều có đủ intro lẫn finish, nên không nội dung thật nào chạm được
  // nhánh đó. Nó được gác bằng `server/lessons/phase.test.ts` với scenario dựng
  // tay — xem chú thích ở đầu file đó.

  it('session chưa sẵn sàng (orchestrator không trả expiresAt) → CONFLICT, KHÔNG gọi gateway', async () => {
    // Mock `getSession` trả `session: undefined`. Không có `expiresAt` thì
    // `mintSandboxTokenFor` sẽ phát một token chết sẵn và gateway trả 401 —
    // triệu chứng cách nguyên nhân ba thành phần. Chặn sớm ở BFF.
    const c = await caller(user);
    await expect(
      c.lessons.checkStep({
        scenarioId: SCENARIO_MULTISTEP,
        sessionId: 'sess-1',
        phase: { kind: 'step', index: 0 },
      }),
    ).rejects.toSatisfy(isTRPCCode('CONFLICT'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('lessons — cảnh báo năng lực chưa hỗ trợ', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('lesson-cap');
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('bài đòi kubernetes → get trả unsupportedCapabilities cho FE cảnh báo', async () => {
    // `ckad-configmap-as-files` chạy `kubernetes-kubeadm-2nodes`. P1 chứng minh
    // DinD trong Sysbox, kubeadm-trong-pod thì CHƯA — nên nhãn này phải tới được
    // FE. Nếu ca này đỏ vì danh sách hỗ trợ đã dài ra, kiểm lại rằng runtime
    // tương ứng THẬT SỰ đã dựng, đừng sửa test cho xanh.
    const out = await (await caller(user)).lessons.get({ scenarioId: SCENARIO_K8S });
    expect(out.unsupportedCapabilities).toContain('kubernetes');
  });

  it('bài chỉ cần shell → không cảnh báo gì', async () => {
    const out = await (await caller(user)).lessons.get({ scenarioId: SCENARIO_NO_VERIFY });
    expect(out.unsupportedCapabilities).toEqual([]);
  });
});
