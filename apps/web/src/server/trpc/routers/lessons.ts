import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { SandboxTier } from '@devops-platform/shared-types';
import {
  effectiveCapabilities,
  scenarioIdSchema,
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
  SCENARIO_DIFFICULTIES,
  type Scenario,
  type SandboxTierName,
} from '@devops-platform/shared-types/scenario';
import type { Database } from '../../db/client';
import { progress } from '../../db/schema';
import { attachSandboxCookie } from '../../auth/sandbox-cookie';
import { mintAccessTokenFor } from '../../auth/jwt';
import { callOrchestrator, orchestratorClient } from '../../grpc/orchestrator-client';
import { toJsonSession } from '../../grpc/session-json';
import { CONTENT_ORDER_KEYS, resolveScenarioAssets } from '@devops-platform/scenario';
import { rethrowContentSourceError } from '../../content/source-errors';
import {
  profileForCapabilities,
  scenarioDir,
  scenarioSource,
  unsupportedCapabilities,
} from '../../lessons/catalog';
import { buildAssetPushScript, isAssetPushPhase } from '../../lessons/asset-push';
import { isFirstPhase, phaseRefSchema, resolvePhase } from '../../lessons/phase';
import { buildToolsEnableScript } from '../../lessons/tools-enable';
import { setupScriptPlan } from '../../lessons/setup-plan';
import { runScriptInSession } from '../../lessons/validate';
import { applySessionPreferences } from '../../sessions/preferences';
import { createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

/**
 * `lessons.*` — trụ cột ① (P2 / 2.B + 2.C).
 *
 * Hai nguồn dữ liệu, hai vai trò khác hẳn nhau:
 *
 * - **Nội dung bài** đến từ `scenarioSource()` (`server/lessons/catalog.ts`) —
 *   hôm nay là đĩa, ngày mai có thể là DB khi có UI soạn bài. Router KHÔNG gọi
 *   `loadScenarios` trực tiếp, đó là toàn bộ điểm của cái seam đó.
 * - **Tiến độ** đến từ Postgres, và MỌI truy vấn lọc theo `ctx.user.id` lấy từ
 *   session cookie — KHÔNG có `userId` nào trong input schema. Đó là hình thức
 *   mạnh nhất của luật 1: không phải "kiểm rồi cho qua" mà "không có gì để kiểm",
 *   vì client không có chỗ nào để nói mình là ai.
 */

// ---------------------------------------------------------------- tiến độ

/**
 * Trạng thái tiến độ — **SUY RA, không lưu**.
 *
 * Plan P2 task 6 liệt kê một cột `status` trong bảng `progress`. Không dựng nó:
 * giá trị đó tính được 100% từ `(stepIndex, completedAt, stepCount)`, nên lưu
 * thêm là dựng nguồn sự thật thứ hai (`rules/code-conventions.md` § No Derived
 * Fields) — và nó sẽ lệch ở lần đầu tiên có ai đó cập nhật `stepIndex` mà quên
 * `status`. Cùng lý lẽ đã bác `markdownHtml` ở 2.A.
 */
export const PROGRESS_STATUSES = ['not-started', 'in-progress', 'completed'] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export interface ProgressView {
  status: ProgressStatus;
  stepIndex: number;
  completedAt: string | null;
  updatedAt: string | null;
}

const NOT_STARTED: ProgressView = {
  status: 'not-started',
  stepIndex: 0,
  completedAt: null,
  updatedAt: null,
};

function toProgressView(row: typeof progress.$inferSelect | undefined): ProgressView {
  if (row === undefined) {
    return NOT_STARTED;
  }
  return {
    status: row.completedAt === null ? 'in-progress' : 'completed',
    stepIndex: row.stepIndex,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function readProgress(
  db: Database,
  userId: string,
  lessonId: string,
): Promise<ProgressView> {
  const rows = await db
    .select()
    .from(progress)
    .where(and(eq(progress.userId, userId), eq(progress.lessonId, lessonId)))
    .limit(1);
  return toProgressView(rows[0]);
}

// ---------------------------------------------------------------- scenario

async function requireScenario(scenarioId: string): Promise<Scenario> {
  const scenario = await scenarioSource().get(scenarioId);
  if (scenario === null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Không có bài học "${scenarioId}"` });
  }
  return scenario;
}

/**
 * `SandboxTierName` (DTO) → `SandboxTier` (enum proto).
 *
 * Bảng tường minh, KHÔNG phải `SandboxTier[name.toUpperCase()]`: phép tra động đó
 * trả `undefined` cho một tên lạ, và `undefined` đi tiếp vào proto sẽ thành
 * `UNSPECIFIED = 0` — đúng giá trị mà `session.proto` bắt server phải TỪ CHỐI vì
 * nó nghĩa là "chạy lab ở mức cô lập nào cũng được". Một bảng thì tên lạ chết ở
 * TypeScript, trước khi có ai chạy nó.
 */
const TIER_TO_PROTO: Readonly<Record<SandboxTierName, SandboxTier>> = {
  sysbox: SandboxTier.SYSBOX,
  gvisor: SandboxTier.GVISOR,
  kata: SandboxTier.KATA,
};

async function callHeaders(userId: string, role: string): Promise<HeadersInit> {
  const token = await mintAccessTokenFor(userId, role);
  return { authorization: `Bearer ${token}` };
}

/**
 * Hỏi orchestrator `expiresAt` của session — thứ `mintSandboxTokenFor` bắt buộc
 * phải có (nó từ chối phát token đã chết).
 *
 * Lời gọi này cũng là vế authz ĐẦU TIÊN: `GetSession` nhận `userId` và
 * orchestrator tự kiểm chủ sở hữu. Chuỗi chín bước của gateway là vế thứ hai.
 * Hai vế độc lập, và đó là chủ ý — vế thứ hai không dựa vào việc vế thứ nhất
 * đã chạy.
 */
async function sessionExpiry(
  ctx: { user: { id: string; role: string } },
  sessionId: string,
): Promise<number> {
  const headers = await callHeaders(ctx.user.id, ctx.user.role);
  const response = await callOrchestrator(() =>
    orchestratorClient().getSession({ sessionId, userId: ctx.user.id }, { headers }),
  );
  const expiresAt = response.session?.expiresAt;
  if (expiresAt === undefined) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'Phiên sandbox chưa sẵn sàng — đợi provisioning xong rồi thử lại',
    });
  }
  return Number(expiresAt.seconds);
}

// ---------------------------------------------------------------- input

const getInput = z.object({ scenarioId: scenarioIdSchema }).strict();

const startSessionInput = z
  .object({
    scenarioId: scenarioIdSchema,
    // Cùng regex với `session.create` — khớp CHÍNH XÁC validator của
    // `rediskeys.Idem`, nên một key sai chết ở biên gần client nhất thay vì trả
    // `Internal` từ orchestrator.
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, 'idempotencyKey chỉ nhận [A-Za-z0-9_-], tối đa 64 ký tự'),
  })
  .strict();

const saveProgressInput = z
  .object({ scenarioId: scenarioIdSchema, stepIndex: z.number().int().min(0) })
  .strict();

const checkStepInput = z
  .object({
    scenarioId: scenarioIdSchema,
    // CÓ trong input vì không tồn tại chỉ mục user→session nào: Redis giữ
    // `session:{id}` chứ không giữ chiều ngược lại. Không phải lỗ hổng — token
    // mà BFF mint mang `sub = ctx.user.id`, nên gateway bước g sẽ từ chối bất kỳ
    // sessionId nào không thuộc về người gọi (và `GetSession` đã từ chối trước đó).
    sessionId: z.string().min(1),
    phase: phaseRefSchema,
  })
  .strict();

const runSetupInput = z
  .object({ scenarioId: scenarioIdSchema, sessionId: z.string().min(1), phase: phaseRefSchema })
  .strict();

/**
 * D9 (phase-13) — `lessons.list` nới thêm bộ lọc SERVER, áp TRƯỚC khi phân
 * trang (không phải một điều kiện FE tự thêm sau khi đã có trang).
 *
 * `orderBy` (phase-13 13.C task 9) chỉ nhận những thứ tự mà **keyset giữ được**
 * — `'id'`, `'difficulty'`, `'duration'`. ⛔ KHÔNG có `'title'`: xem chú thích
 * dài ở `CONTENT_ORDER_KEYS` (`packages/scenario/src/source.ts`) — Postgres và
 * `localeCompare('vi')` cho hai thứ tự KHÁC NHAU trên tiêu đề tiếng Việt (đã đo
 * 2026-09-06), nên một keyset theo `title` vừa sai bảng chữ vừa mất dòng ở biên
 * trang. Sắp theo tiêu đề ở lại phía client, trong trang, với nhãn nói đúng
 * phạm vi.
 *
 * Đổi `orderBy` làm cursor cũ vô nghĩa và server NÓI RA điều đó (400 "Cursor
 * không còn hợp lệ") thay vì đọc nó theo khoá mới — client phải quay về trang
 * đầu khi đổi cách sắp.
 */
const listLessonsInput = listInputSchema
  .extend({
    difficulty: z.enum(SCENARIO_DIFFICULTIES).optional(),
    tier: z.enum(SANDBOX_TIER_NAMES).optional(),
    capability: z.enum(SCENARIO_CAPABILITIES).optional(),
    orderBy: z.enum(CONTENT_ORDER_KEYS).optional(),
  })
  .strict();

const sessionStatusInput = z.object({ sessionId: z.string().min(1) }).strict();
const endSessionInput = z.object({ sessionId: z.string().min(1) }).strict();
const extendSessionInput = z
  .object({
    sessionId: z.string().min(1),
    // 0 = dùng idle-window mặc định của server (`EXTEND_DEFAULT`). Trần 7200
    // khớp `HARD_CAP` — xin nhiều hơn cũng bị công thức B5 cắt về trần, nên
    // chặn ở biên gần client nhất. Cùng khuôn với `session.extend`.
    extendSeconds: z.number().int().min(0).max(7200).default(0),
  })
  .strict();

// ---------------------------------------------------------------- router

export const lessonsRouter = createTRPCRouter({
  /**
   * Danh sách bài cho trang `/lessons`.
   *
   * Luật 4: `limit` bị ÉP về ≤ 100 bởi `listInputSchema` (không phải bị reject).
   *
   * D9 (phase-13): phân trang đi qua `scenarioSource().listPage()` — cursor
   * thật ở tầng nguồn (đĩa cắt lát trong bộ nhớ, DB đẩy `WHERE id > cursor`
   * xuống Postgres), không còn `list()` rồi cắt lát bằng TS ở đây. Cursor
   * không tồn tại ở BẤT KỲ nguồn nào ⇒ `InvalidCursorError`; nguồn không đọc
   * được ⇒ `ContentSourcesUnavailableError`. Cả hai dịch sang mã tRPC ở
   * `server/content/source-errors.ts` (SSOT dùng chung với `playgrounds`/`labs`).
   */
  list: protectedProcedure.input(listLessonsInput).query(async ({ ctx, input }) => {
    let result;
    try {
      result = await scenarioSource().listPage({
        limit: input.limit,
        cursor: input.cursor,
        orderBy: input.orderBy,
        filter: {
          difficulty: input.difficulty,
          tier: input.tier,
          capability: input.capability,
        },
      });
    } catch (cause) {
      // Gồm cả `ContentSourcesUnavailableError` → 503 ("không đọc được" KHÁC
      // "kho trống"). Lý lẽ + vì sao không chuyển tiếp `cause.message`:
      // `server/content/source-errors.ts`.
      rethrowContentSourceError(cause);
    }
    const page = result.items;

    // Tiến độ CHỈ của người gọi, và CHỈ của các bài trên trang này. Một truy vấn
    // cho cả trang thay vì N truy vấn.
    //
    // `inArray` chứ không phải lọc mỗi `userId`: một người học lâu năm có tiến độ
    // trên hàng trăm bài, và kéo hết chúng về để ghép vào một trang 20 mục là
    // đọc thừa theo số bài họ TỪNG học chứ không theo số bài đang hiện.
    //
    // `page.length === 0` (cursor ở mục cuối) phải chặn trước: `inArray` với mảng
    // rỗng sinh SQL `in ()` — lỗi cú pháp ở Postgres, không phải "không khớp gì".
    const byLesson = new Map<string, typeof progress.$inferSelect>();
    if (page.length > 0) {
      const rows = await ctx.db
        .select()
        .from(progress)
        .where(
          and(
            eq(progress.userId, ctx.user.id),
            inArray(
              progress.lessonId,
              page.map((s) => s.id),
            ),
          ),
        );
      for (const row of rows) {
        byLesson.set(row.lessonId, row);
      }
    }

    return {
      items: page.map((scenario) => ({
        ...scenario,
        progress: toProgressView(byLesson.get(scenario.id)),
      })),
      limit: input.limit,
      nextCursor: result.nextCursor,
    };
  }),

  /** Nội dung đầy đủ một bài + tiến độ của chính người gọi. */
  get: protectedProcedure.input(getInput).query(async ({ ctx, input }) => {
    const scenario = await requireScenario(input.scenarioId);
    return {
      scenario,
      progress: await readProgress(ctx.db, ctx.user.id, scenario.id),
      // FE (2.D) BẮT BUỘC hiện cảnh báo này — xem `catalog.unsupportedCapabilities`.
      unsupportedCapabilities: unsupportedCapabilities(effectiveCapabilities(scenario)),
    };
  }),

  /**
   * Contract §7 — trạng thái phiên phía máy chủ, để FE biết một `1006` là "mạng
   * chập" hay "phiên đã chết".
   *
   * Vì sao KHÔNG dùng `session.get` của P1 dù nó trả đúng thứ này: input của nó
   * có `userId` (P1 kiểm bằng `assertOwnerOrAdmin`). 2.B đã bỏ hẳn hình dạng đó
   * khỏi router này — không có field nào để giả mạo thì không có gì phải kiểm.
   * Người dùng suy từ `ctx.user.id`, và orchestrator vẫn tự kiểm chủ sở hữu.
   *
   * `status` là số của enum `SandboxStatus`, KHÔNG phải bigint — trả thẳng qua
   * JSON được. (`expiresAt.seconds` thì là bigint và sẽ cho 500 ở tầng
   * serialize; đó là lý do procedure này chỉ trả đúng `status`.)
   *
   * `null` = orchestrator trả lời nhưng không kèm phiên. Phiên đã bị xoá hẳn thì
   * `GetSession` NÉM `NOT_FOUND`, và client đọc mã đó (`session-reason.ts`).
   */
  sessionStatus: protectedProcedure.input(sessionStatusInput).query(async ({ ctx, input }) => {
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().getSession(
        { sessionId: input.sessionId, userId: ctx.user.id },
        { headers },
      ),
    );
    return { status: response.session?.status ?? null };
  }),

  /**
   * Gia hạn phiên đang học.
   *
   * `ExtendSession` đã có ở proto và ở orchestrator từ P1, nhưng FE **chưa từng
   * gọi** — nên trước dòng này một người học đang làm dở chỉ có thể nhìn đồng hồ
   * chạy về 0 rồi mất pod, dù server hoàn toàn cho phép đẩy hạn.
   *
   * Không nhận `userId` từ input (cùng lý lẽ với `endSession`/`sessionStatus`):
   * orchestrator tự kiểm chủ sở hữu và trả NotFound cho phiên của người khác
   * (luật 1). `expectedRevision: 0` là ĐÚNG ở đây chứ không phải đường tắt —
   * xem khối lý lẽ ở `session.extend`: FE không đọc-rồi-ghi, và công thức B5 chỉ
   * tiến không lùi, nên không có ca "ghi đè mất thay đổi của người khác".
   *
   * Trả `expiresAt` **của server**, không để client tự tính — đó là giá trị duy
   * nhất đúng, và `hardCapReached` cho FE biết nút phải chuyển sang disabled.
   */
  extendSession: protectedProcedure.input(extendSessionInput).mutation(async ({ ctx, input }) => {
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().extendSession(
        {
          sessionId: input.sessionId,
          userId: ctx.user.id,
          extendSeconds: input.extendSeconds,
          // `BigInt(0)` chứ không literal `0n`: tsconfig apps/web target ES2017.
          expectedRevision: BigInt(0),
        },
        { headers },
      ),
    );
    const session = toJsonSession(response.session);
    return {
      expiresAt: session?.expiresAt ?? null,
      hardCapReached: response.hardCapReached,
    };
  }),

  /**
   * Kết thúc phiên SỚM, theo ý người học.
   *
   * Đóng nợ ghi ở 3.I mắt 3–5 §10: "`session.reap` là đường trả sớm duy nhất;
   * không có `lessons.endSession`". Trước dòng này một phiên bài học chỉ chết
   * theo TTL 1h rồi reaper dọn — người học đóng tab là một khe quota bị giữ một
   * giờ cho không ai, và ở trần 21 pod thì 21 tab đóng là cả lớp bị từ chối.
   *
   * Uỷ quyền cho `ReapSession` của orchestrator với actor = CHÍNH người gọi.
   * Không nhận `userId` từ input (cùng lý lẽ với `sessionStatus`): orchestrator
   * kiểm chủ sở hữu và trả NotFound cho phiên của người khác (luật 1). Chỉ trả
   * `status` — `expiresAt.seconds` là bigint và sẽ 500 ở tầng serialize.
   */
  endSession: protectedProcedure.input(endSessionInput).mutation(async ({ ctx, input }) => {
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().reapSession(
        {
          sessionId: input.sessionId,
          reason: 'user_ended',
          actor: { case: 'userId', value: ctx.user.id },
        },
        { headers },
      ),
    );
    return { status: response.session?.status ?? null };
  }),

  /**
   * Mở sandbox cho một bài: tier suy từ `backend.imageid` của chính bài đó.
   *
   * KHÔNG nhận `tier` từ input, khác `session.create`. Tier là thuộc tính của nội
   * dung (`BACKEND_IMAGE_MAPPING`), không phải lựa chọn của người học — cho client
   * chọn nghĩa là cho họ hạ mức cô lập của pod mình.
   */
  startSession: protectedProcedure.input(startSessionInput).mutation(async ({ ctx, input }) => {
    const scenario = await requireScenario(input.scenarioId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);

    const response = await callOrchestrator(() =>
      orchestratorClient().createSession(
        {
          userId: ctx.user.id,
          tier: TIER_TO_PROTO[scenario.tier],
          // 0 = dùng TTL mặc định của server, đúng nghĩa proto.
          ttlSeconds: 0,
          idempotencyKey: input.idempotencyKey,
          // Rỗng cho bài thường; 'k8s' cho bài đòi năng lực `kubernetes` (P7).
          // Suy ra từ capabilities của CHÍNH bài, không phải từ input của client
          // — cùng lý do `userId` không nằm trong input: client không có chỗ nào
          // để tự khai mình đáng được cấp bao nhiêu tài nguyên.
          profile: profileForCapabilities(
            effectiveCapabilities(scenario),
            scenario.interfaceLayout,
          ),
        },
        { headers },
      ),
    );
    await attachSandboxCookie(ctx, ctx.user.id, response.session);
    const { preferencesApplied } = await applySessionPreferences(ctx, response.session);

    return {
      session: toJsonSession(response.session),
      scenarioId: scenario.id,
      unsupportedCapabilities: unsupportedCapabilities(effectiveCapabilities(scenario)),
      preferencesApplied,
    };
  }),

  /**
   * Chuẩn bị môi trường cho một phase (task 11).
   *
   * ⛔ CHỈ chạy `background`. `foreground` được TRẢ VỀ cho FE chứ không chạy ở
   * đây, và đó không phải việc còn dang dở — đó là chính định nghĩa của nó:
   * Killercoda phân biệt hai loại script vì `foreground` phải HIỆN RA trong
   * terminal người học đang nhìn. Chạy nó qua exec one-shot là chạy ở một shell
   * khác, người học không thấy gì, và thứ họ nhận được là một terminal im lặng
   * trong lúc có gì đó đang xảy ra ở nơi khác. FE (2.D) gõ nó vào WS.
   *
   * Idempotency là trách nhiệm của NỘI DUNG, không phải của hàm này — script
   * upstream do người khác viết, và ta không có cách nào biết chạy lại có an toàn
   * hay không. FE gọi một lần cho mỗi phase.
   */
  runSetup: protectedProcedure.input(runSetupInput).mutation(async ({ ctx, input }) => {
    const scenario = await requireScenario(input.scenarioId);
    const phase = resolvePhase(scenario, input.phase);

    // Asset đi TRƯỚC `background`, không song song và không sau: `loxilb` chạy
    // `sudo /bin/bash ./start.sh` ngay dòng đầu background, nên thứ tự này là
    // điều kiện đúng-sai chứ không phải tối ưu.
    const pushable = isAssetPushPhase(scenario, input.phase)
      ? await resolveScenarioAssets(scenarioDir(scenario.id), scenario.assets)
      : [];
    const pushScript = buildAssetPushScript(pushable);

    /*
      Một lần cho mỗi phiên, ở phase ĐẦU — cùng phép suy với asset
      (`isFirstPhase`), vì `dlp-tools enable` cài gói thật: chạy lại nó ở mỗi
      phase là mỗi lần chuyển step lại tốn một lượt exec cho việc đã xong.
    */
    const toolsScript = isFirstPhase(scenario, input.phase)
      ? buildToolsEnableScript(scenario.toolset)
      : null;

    /*
      Thứ tự công cụ → asset → background là ĐIỀU KIỆN ĐÚNG-SAI, và nó sống ở
      `setup-plan.ts` dưới dạng dữ liệu chứ không dưới dạng ba khối `if` ở đây.
      Lý do: dạng dữ liệu có phép kiểm được (`setup-plan.test.ts`); ba khối `if`
      trong một procedure cần orchestrator + Postgres + phiên thật thì không, và
      một ô AC không kiểm được vẫn xanh sau khi ai đó đảo hai khối.
    */
    const steps = setupScriptPlan({
      tools: toolsScript,
      assets: pushScript,
      background: phase.setup.background,
    });

    if (steps.length === 0) {
      return { ran: false, assetsPushed: 0, foreground: phase.setup.foreground };
    }

    const expiresAtSeconds = await sessionExpiry(ctx, input.sessionId);

    for (const step of steps) {
      const outcome = await runScriptInSession({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        expiresAtSeconds,
        script: step.script,
      });

      // Bước setup hỏng KHÔNG được im lặng: mọi step sau đó sẽ sai, và triệu
      // chứng ("lệnh trong bài không có tác dụng") không trỏ về một script thoát
      // non-zero từ ba phút trước. Mỗi bước có câu lỗi RIÊNG vì ba nguyên nhân
      // ứng với ba việc phải làm khác nhau.
      if (!outcome.passed) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: step.failureMessage(outcome.exitCode),
        });
      }
    }

    // `ran` = script `background` CÓ chạy hay không — không phải "có bước nào
    // chạy không". Một phase chỉ đẩy asset vẫn là `ran: false`, đúng như bản
    // trước: FE đọc cờ này để biết môi trường bài đã được dựng chưa.
    return {
      ran: phase.setup.background !== null,
      assetsPushed: pushable.length,
      foreground: phase.setup.foreground,
    };
  }),

  /**
   * Ghi vị trí đang học để lần sau quay lại đúng chỗ.
   *
   * `stepIndex` là VỊ TRÍ HIỆN TẠI, không phải "step xa nhất từng tới" — đó là
   * thứ ô AC "progress lưu và khôi phục khi quay lại" thật sự cần. Hệ quả đã
   * biết: quay lại step 1 thì lần mở sau bắt đầu ở step 1. Đúng ý; "step xa
   * nhất" là một đại lượng KHÁC và nếu cần thì nó là một cột khác, không phải
   * một cách diễn giải khác của cùng cột.
   */
  saveProgress: protectedProcedure.input(saveProgressInput).mutation(async ({ ctx, input }) => {
    const scenario = await requireScenario(input.scenarioId);
    if (input.stepIndex >= scenario.steps.length) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Bài "${scenario.id}" chỉ có ${scenario.steps.length} step (yêu cầu index ${input.stepIndex})`,
      });
    }

    await upsertProgress(ctx.db, ctx.user.id, scenario.id, input.stepIndex, null);
    return readProgress(ctx.db, ctx.user.id, scenario.id);
  }),

  /**
   * Chấm một phase: chạy `verifyScript` TRONG pod session, pass khi exit code 0.
   *
   * ⛔ Script tra từ CATALOG theo `(scenarioId, phase)`, tuyệt đối không nhận từ
   * input. Đó là ranh giới duy nhất chặn "gửi script tuỳ ý vào pod" — gateway
   * không phân biệt được một chuỗi đến từ đĩa với một chuỗi đến từ form.
   */
  checkStep: protectedProcedure.input(checkStepInput).mutation(async ({ ctx, input }) => {
    const scenario = await requireScenario(input.scenarioId);
    const phase = resolvePhase(scenario, input.phase);

    if (phase.verifyScript === null) {
      // KHÔNG trả `passed: true`. Một bài không có script chấm mà tự động "đúng"
      // là cách một lỗi vendor nội dung (quên file verify) hiện ra dưới dạng một
      // bài học ai cũng qua. `loki-quickstart` không có verify nào — nút Check
      // của 2.D phải ẨN, không phải luôn xanh.
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Phần này không có bước chấm tự động',
      });
    }

    const expiresAtSeconds = await sessionExpiry(ctx, input.sessionId);
    const outcome = await runScriptInSession({
      sessionId: input.sessionId,
      userId: ctx.user.id,
      expiresAtSeconds,
      script: phase.verifyScript,
    });

    // Chỉ step mới đẩy tiến độ — intro/finish không có chỗ trong `stepIndex`.
    let current = await readProgress(ctx.db, ctx.user.id, scenario.id);
    if (outcome.passed && input.phase.kind === 'step') {
      const isLast = input.phase.index === scenario.steps.length - 1;
      await upsertProgress(
        ctx.db,
        ctx.user.id,
        scenario.id,
        // Qua step i thì vị trí học tiếp là i+1; step cuối thì đứng lại ở đó.
        Math.min(input.phase.index + 1, scenario.steps.length - 1),
        isLast ? new Date() : null,
      );
      current = await readProgress(ctx.db, ctx.user.id, scenario.id);
    }

    return { ...outcome, progress: current };
  }),
});

/**
 * Upsert một dòng tiến độ.
 *
 * `onConflictDoUpdate` trên `(user_id, lesson_id)` chứ không phải select-rồi-ghi:
 * hai tab cùng mở một bài là ca thường, và đường select-rồi-ghi sẽ hoặc ném lỗi
 * unique, hoặc (tệ hơn) mất một lượt ghi.
 *
 * `completedAt` chỉ ĐI LÊN: một lượt `saveProgress` (truyền `null`) không được
 * xoá dấu hoàn thành mà `checkStep` đã ghi — nếu không, người học mở lại bài đã
 * xong để xem lại và mất luôn thành tích.
 */
async function upsertProgress(
  db: Database,
  userId: string,
  lessonId: string,
  stepIndex: number,
  completedAt: Date | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(progress)
    .values({ userId, lessonId, stepIndex, completedAt, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [progress.userId, progress.lessonId],
      set: {
        stepIndex,
        updatedAt: now,
        ...(completedAt === null ? {} : { completedAt }),
      },
    });
}
