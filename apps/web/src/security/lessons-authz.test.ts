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
 * | `ckad-configmap-as-files` | **1** | có (kubectl thật) | không | `kubernetes`, `multi-node` (cả hai ĐÃ hỗ trợ từ P7-bis) |
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

  it('sessionStatus cũng KHÔNG nhận userId, và trả `null` khi phiên không còn', async () => {
    // Procedure này sinh ra để FE phân biệt "mạng chập" với "phiên đã chết"
    // (contract §7). Nó CỐ Ý không dùng `session.get` của P1 — thứ nhận `userId`
    // trong input — vì router này đã bỏ hẳn hình dạng đó ở 2.B.
    const c = await caller(userA);
    // Mock orchestrator của file này luôn trả `session: undefined`.
    expect(await c.lessons.sessionStatus({ sessionId: 'sess-1' })).toEqual({ status: null });
    await expect(
      // @ts-expect-error — cố tình gửi userId để chứng minh KHÔNG có chỗ nhận nó
      c.lessons.sessionStatus({ sessionId: 'sess-1', userId: 'nan-nhan' }),
    ).rejects.toSatisfy(isTRPCCode('BAD_REQUEST'));
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
    await expect(anon.lessons.sessionStatus({ sessionId: 'sess-1' })).rejects.toSatisfy(
      isTRPCCode('UNAUTHORIZED'),
    );
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

  /**
   * ⛔ Ô này đi bộ trên một tập DÙNG CHUNG, nên nó phải nói ra điều đó.
   *
   * ## Cái đã cắn: đỏ 1 trong 3 lượt toàn suite, xanh mọi lượt chạy riêng
   *
   * `InvalidCursorError: bai-1789456432419-tfx7q7`. Đọc từng mảnh thì mã đó khai
   * trọn nguyên nhân: khuôn `<tiền tố>-<13 chữ số>-<6 ký tự>` là đúng khuôn
   * `uniqueId()` của `test-helpers.ts` sinh ra, tức **một fixture của suite
   * khác**, không phải nội dung thật của nền tảng (`loki-quickstart` không có
   * khối 13 chữ số nào).
   *
   * `lessons.list` đọc `scenarioSource()` = `composite([đĩa, DB])`, nên mọi bài
   * `published` trong `content_items` đều nằm trong danh sách này. Ít nhất năm
   * suite khác tạo rồi xoá bài `published` mang id fixture
   * (`repository.integration`, `repository-page-sql.integration`,
   * `publish-timestamp.integration`, `me-idor`, `paths-quiz-authz`). Vitest chạy
   * file song song trên cùng một Postgres ⇒ mục mà cursor đang neo vào có thể
   * biến mất THẬT giữa trang N và trang N+1.
   *
   * ## Vì sao KHÔNG vá ở mã sản phẩm
   *
   * `composite-source.ts` ném `InvalidCursorError` khi không nguồn nào nhận ra
   * cursor, và đó là hành vi ĐÚNG — ô ngay phía trên (`cursor không còn hợp lệ →
   * BAD_REQUEST`) khẳng định chính điều đó, với lý do đã ghi: quay về trang 1
   * trong im lặng làm infinite-scroll lặp vô hạn. Nới nó ở đây là gỡ một cổng
   * thật để làm xanh một ô đo sai.
   *
   * ## Vì sao KHÔNG lọc, và KHÔNG tiêm nguồn
   *
   * `filter` chỉ có `difficulty`/`tier`/`capability`; chọn một giá trị mà fixture
   * "tình cờ" không dùng là đúng loại đúng-do-may-mắn sẽ hỏng lần sau. Và
   * `scenarioSource()` là zero-arg THEO HỢP ĐỒNG (`lessons/catalog.ts` ghi thẳng
   * rằng `scenarioSource(ctx)` sẽ phá một ô AC); mock trọn nó thì phép phân trang
   * của composite — thứ ô này tồn tại để gác — không còn chạy nữa.
   *
   * ## Nên: TÁI NEO có trần, và trần đó là thứ giữ cho ô còn gác được
   *
   * Chủ thể của ô là THUẬT TOÁN cursor, còn tiền đề của nó là "danh sách đứng
   * yên". Khi tiền đề bị một tiến trình khác phá, đi lại từ đầu là phản ứng
   * đúng. Trần 3 lượt là thứ phân biệt hai ca: một cursor hỏng THẬT vô hiệu ở
   * mọi lượt nên nó tiêu hết trần rồi đỏ; một lượt xoá đồng thời thì lượt sau đi
   * trọn. Mọi khẳng định vẫn chạy trên một lượt đi HOÀN CHỈNH, không lượt nào bị
   * bỏ qua.
   */
  it('phân trang bằng cursor đi hết danh sách, không lặp mục', async () => {
    const c = await caller(user);
    const LAN_TOI_DA = 3;
    let seen: string[] = [];
    let taiNeo = 0;

    for (let lan = 0; lan < LAN_TOI_DA; lan += 1) {
      seen = [];
      let cursor: string | undefined;
      let biPhaGiuaChung = false;

      for (let page = 0; page < 10; page += 1) {
        let out: { items: { id: string }[]; nextCursor: string | null };
        try {
          out = await c.lessons.list(cursor === undefined ? { limit: 2 } : { limit: 2, cursor });
        } catch (cause) {
          /*
           * CHỈ nuốt đúng cái đua đã mô tả ở trên, và chỉ khi đang đi GIỮA
           * chừng. Một BAD_REQUEST ở trang ĐẦU (`cursor === undefined`) là lỗi
           * thật — không cursor nào để mất — nên nó ném tiếp. Mọi mã lỗi khác
           * cũng ném tiếp: bắt rộng ở đây sẽ biến một 500 thành một lượt đi lại.
           */
          if (cursor === undefined || !isTRPCCode('BAD_REQUEST')(cause)) throw cause;
          biPhaGiuaChung = true;
          taiNeo += 1;
          break;
        }
        seen.push(...out.items.map((i) => i.id));
        if (out.nextCursor === null) break;
        cursor = out.nextCursor;
      }

      if (!biPhaGiuaChung) break;
    }

    expect(
      taiNeo,
      `cursor hỏng ở cả ${String(LAN_TOI_DA)} lượt — đây KHÔNG còn là đua fixture`,
    ).toBeLessThan(LAN_TOI_DA);
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

  it('bài đòi kubernetes + multi-node → KHÔNG còn cảnh báo nào', async () => {
    // ⚠ Ca này ĐÃ ĐƯỢC LẬT HAI LẦN, và cả hai lần đều vì khoảng trống được lấp
    // thật — không lần nào là "sửa cho xanh".
    //
    // Lần 1 (P7, 2026-09-04): bản gốc ghim `toContain('kubernetes')`. Runtime
    // k3s-trong-pod dựng xong thì ô đó đỏ, và luật là LẬT chứ không ghim lại.
    //
    // Lần 2 (P7-bis, cùng ngày): vế còn lại — `toContain('multi-node')` — kèm
    // dặn dò "nếu ai đó mở multi-node cho tiện, ca này đỏ ngay". Nó đã đỏ, và
    // đây là thứ đứng sau, đo trên cụm thật chứ không phải sự tiện tay:
    //
    //   · cụm con 2 node dựng được trên ĐƯỜNG SẢN XUẤT (DLP_K8S_NODES=2 →
    //     `start_k8s` dựng thêm một container `k3s agent`), 2/2 node Ready sau
    //     23 s — `dlp-k8s-wait` đếm ĐỦ node chứ không dừng ở node đầu tiên;
    //   · đỉnh workingSet DƯỚI TẢI THẬT 1094.79 MiB (lab dlp-k8s-broken-deploy,
    //     5 Deployment), tách được: cluster 712.96 + tải 381.83;
    //   · profile riêng `k8s-multinode` (1536Mi/3Gi) với trần đồng thời 3, ghi
    //     thẳng vào values kèm cả năm ràng buộc;
    //   · `p7-escape-verify.sh NODES=2` — gồm phép thử từ một pod GHIM TRÊN
    //     NODE 2, vì `kubectl run` không hứa đặt pod ở đâu và node 2 là một
    //     container riêng trên một mạng docker riêng.
    //
    // Từ đây, BẤT KỲ phần tử nào trong `unsupportedCapabilities` của bài này là
    // một HỒI QUY (ai đó rút một dòng khỏi `RUNTIME_SUPPORTED_CAPABILITIES`),
    // không phải trạng thái mong đợi. Khẳng định `toEqual([])` thay vì hai phép
    // `not.toContain` rời: một năng lực THỨ BA lẻn vào nhãn của bài cũng phải
    // làm ca này đỏ, chứ không im lặng trôi qua vì ta chỉ hỏi đúng hai cái tên.
    const out = await (await caller(user)).lessons.get({ scenarioId: SCENARIO_K8S });
    expect(out.unsupportedCapabilities).toEqual([]);
  });

  it('bài chỉ cần shell → không cảnh báo gì', async () => {
    const out = await (await caller(user)).lessons.get({ scenarioId: SCENARIO_NO_VERIFY });
    expect(out.unsupportedCapabilities).toEqual([]);
  });
});

describe('lessons.list — trang rỗng', () => {
  let user: { id: string; role: 'user' };

  beforeEach(async () => {
    user = await makeUser('lesson-empty');
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('cursor ở mục CUỐI → trang rỗng, không nổ SQL `in ()`', async () => {
    // `inArray` với mảng rỗng sinh `in ()` — lỗi CÚ PHÁP ở Postgres, không phải
    // "không khớp gì". Ca này chỉ chạm được khi cursor trỏ đúng mục cuối, nên nó
    // rất dễ lọt qua mọi test phân trang "bình thường".
    const c = await caller(user);
    const all = await c.lessons.list({ limit: 100 });
    const last = all.items[all.items.length - 1];
    expect(last).toBeDefined();

    const after = await c.lessons.list({ limit: 10, cursor: last!.id });
    expect(after.items).toEqual([]);
    expect(after.nextCursor).toBeNull();
  });
});
