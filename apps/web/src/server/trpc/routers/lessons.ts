import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { SandboxTier } from '@devops-platform/shared-types';
import {
  scenarioIdSchema,
  type Scenario,
  type SandboxTierName,
} from '@devops-platform/shared-types/scenario';
import type { Database } from '../../db/client';
import { progress } from '../../db/schema';
import { attachSandboxCookie } from '../../auth/sandbox-cookie';
import { mintAccessTokenFor } from '../../auth/jwt';
import { callOrchestrator, orchestratorClient } from '../../grpc/orchestrator-client';
import { toJsonSession } from '../../grpc/session-json';
import { resolveScenarioAssets } from '@devops-platform/scenario';
import { scenarioDir, scenarioSource, unsupportedCapabilities } from '../../lessons/catalog';
import { buildAssetPushScript, isAssetPushPhase } from '../../lessons/asset-push';
import { phaseRefSchema, resolvePhase } from '../../lessons/phase';
import { runScriptInSession } from '../../lessons/validate';
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

const sessionStatusInput = z.object({ sessionId: z.string().min(1) }).strict();
const endSessionInput = z.object({ sessionId: z.string().min(1) }).strict();

// ---------------------------------------------------------------- router

export const lessonsRouter = createTRPCRouter({
  /**
   * Danh sách bài cho trang `/lessons`.
   *
   * Luật 4: `limit` bị ÉP về ≤ 100 bởi `listInputSchema` (không phải bị reject).
   * Phân trang trên danh sách đã sắp theo `id` — cursor LÀ id của mục cuối trang
   * trước, không phải offset: offset nhảy mục khi nội dung thay đổi giữa hai
   * trang, còn id thì không.
   */
  list: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const all = await scenarioSource().list();

    let start = 0;
    if (input.cursor !== undefined) {
      const at = all.findIndex((s) => s.id === input.cursor);
      if (at < 0) {
        // Cursor trỏ vào một bài không còn tồn tại. NÉM chứ không lặng lẽ quay
        // về trang 1: một infinite-scroll nhận lại trang 1 sẽ nối nó vào cuối
        // danh sách và lặp vô hạn — lỗi hiện ra dưới dạng "danh sách bài lặp
        // lại mãi", không trỏ về một cursor cũ.
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
      }
      start = at + 1;
    }

    const page = all.slice(start, start + input.limit);
    const next = start + input.limit;

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
      nextCursor: next < all.length ? (page[page.length - 1]?.id ?? null) : null,
    };
  }),

  /** Nội dung đầy đủ một bài + tiến độ của chính người gọi. */
  get: protectedProcedure.input(getInput).query(async ({ ctx, input }) => {
    const scenario = await requireScenario(input.scenarioId);
    return {
      scenario,
      progress: await readProgress(ctx.db, ctx.user.id, scenario.id),
      // FE (2.D) BẮT BUỘC hiện cảnh báo này — xem `catalog.unsupportedCapabilities`.
      unsupportedCapabilities: unsupportedCapabilities(scenario.capabilities),
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
        },
        { headers },
      ),
    );
    await attachSandboxCookie(ctx, ctx.user.id, response.session);

    return {
      session: toJsonSession(response.session),
      scenarioId: scenario.id,
      unsupportedCapabilities: unsupportedCapabilities(scenario.capabilities),
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

    if (phase.setup.background === null && pushScript === null) {
      return { ran: false, assetsPushed: 0, foreground: phase.setup.foreground };
    }

    const expiresAtSeconds = await sessionExpiry(ctx, input.sessionId);

    if (pushScript !== null) {
      const push = await runScriptInSession({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        expiresAtSeconds,
        script: pushScript,
      });
      if (!push.passed) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Đẩy file kèm bài học thất bại (exit ${String(push.exitCode)}). Hãy khởi động lại phiên.`,
        });
      }
    }

    if (phase.setup.background === null) {
      return {
        ran: false,
        assetsPushed: pushable.length,
        foreground: phase.setup.foreground,
      };
    }

    const outcome = await runScriptInSession({
      sessionId: input.sessionId,
      userId: ctx.user.id,
      expiresAtSeconds,
      script: phase.setup.background,
    });

    // Script setup hỏng KHÔNG được im lặng: mọi step sau đó sẽ sai, và triệu
    // chứng ("lệnh trong bài không có tác dụng") không trỏ về một script setup
    // thoát non-zero từ ba phút trước.
    if (!outcome.passed) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Script chuẩn bị môi trường thất bại (exit ${outcome.exitCode}). Hãy khởi động lại phiên.`,
      });
    }
    return { ran: true, assetsPushed: pushable.length, foreground: phase.setup.foreground };
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
