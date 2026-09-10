import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  computeAttemptDurationSeconds,
  computeLabScore,
  computeLabStatus,
  CONTENT_ORDER_KEYS,
} from '@devops-platform/scenario';
import {
  labTaskIdSchema,
  scenarioIdSchema,
  type Lab,
  type LabAttempt,
  type LabLeaderboardRow,
  type LabTaskResult,
} from '@devops-platform/shared-types/lab';
import {
  effectiveCapabilities,
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
  SCENARIO_DIFFICULTIES,
} from '@devops-platform/shared-types/scenario';
import type { Database } from '../../db/client';
import { labAttempts, labTaskResults, users, type LabAttemptRow, type LabTaskResultRow } from '../../db/schema';
import { readUserPreferences } from '../../me/preferences';
import { profileForCapabilities, unsupportedCapabilities } from '../../lessons/catalog';
import { setupFailureDetail, setupScriptPlan } from '../../lessons/setup-plan';
import { buildToolsEnableScript } from '../../lessons/tools-enable';
import { runScriptInSession } from '../../lessons/validate';
import { labSource, requireLab } from '../../labs/catalog';
import { rethrowContentSourceError } from '../../content/source-errors';
import { truncateLabOutput } from '../../labs/output';
import {
  launchedBackgroundStep,
  parseSetupProbe,
  SETUP_PROBE_SCRIPT,
  type SetupProbe,
} from '../../labs/setup-background';
import { createSandboxSession, reapUnusableSession, sessionExpiry } from '../../labs/session';
import { applySessionPreferences } from '../../sessions/preferences';
import { createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

/**
 * `labs.*` — trụ cột ② (P8 / 8.B + 8.C).
 *
 * Contract:
 * `plans/devops-learning-platform/reports/harness/2026-09-04-p8-contract/contract.md`
 * §3. File này hiện thực CHÍNH XÁC chín procedure + bảy ràng buộc hành vi ở đó.
 *
 * `computeLabScore`/`computeLabStatus`/`computeAttemptDurationSeconds` tới từ
 * `@devops-platform/scenario` (`packages/scenario/src/lab-score.ts`, 8.A —
 * lane khác, đã merge). File này KHÔNG dựng lại chúng cục bộ — đó sẽ là NGUỒN
 * SỰ THẬT THỨ HAI cho cách tính điểm, đúng điều `docs/lab-format.md` cấm.
 */

// ---------------------------------------------------------------- DTO

/**
 * Dòng DB → DTO đi qua dây.
 *
 * `toISOString()` KHÔNG phải trang trí: client tRPC của app này cố ý không có
 * transformer, nên một `Date` trả thẳng ra sẽ tới trình duyệt dưới dạng CHUỖI
 * trong khi kiểu suy ra vẫn nói `Date` — hợp đồng nói dối, và chỗ vỡ nằm ở call
 * site đầu tiên gọi `.getTime()`. Cùng khuôn `toJsonSession` đã làm cho session.
 */
export function toLabTaskResultDTO(row: LabTaskResultRow): LabTaskResult {
  return {
    taskId: row.taskId,
    exitCode: row.exitCode,
    output: row.output,
    checkedAt: row.checkedAt.toISOString(),
  };
}

/** Export (P13 — `me.listLabAttempts` dùng lại, xem SSOT bàn giao ở đầu file đó). */
export function toLabAttemptDTO(row: LabAttemptRow, results: LabTaskResultRow[]): LabAttempt {
  return {
    id: row.id,
    labId: row.labId,
    sessionId: row.sessionId,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
    displayNamePublic: row.displayNamePublic,
    results: results.map(toLabTaskResultDTO),
  };
}

export async function loadResults(db: Database, attemptId: string): Promise<LabTaskResultRow[]> {
  return db.select().from(labTaskResults).where(eq(labTaskResults.attemptId, attemptId));
}

export function scoreAndStatus(lab: Lab, results: LabTaskResultRow[], submittedAt: Date | null) {
  const score = computeLabScore(lab, results.map(toLabTaskResultDTO));
  const status = computeLabStatus(lab, score, submittedAt);
  return { score, status };
}

// ---------------------------------------------------------------- authz (luật 1, luật 5)

/**
 * Nạp attempt rồi so `userId` với `ctx.user.id` — khác `NOT_FOUND` không phải
 * `FORBIDDEN` (contract §3 luật 5): không xác nhận sự TỒN TẠI của attempt
 * người khác cho một `attemptId` đoán mò.
 */
async function requireOwnAttempt(
  ctx: { db: Database; user: { id: string } },
  attemptId: string,
): Promise<LabAttemptRow> {
  const rows = await ctx.db.select().from(labAttempts).where(eq(labAttempts.id, attemptId)).limit(1);
  const row = rows[0];
  if (row === undefined || row.userId !== ctx.user.id) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không tìm thấy lần thử này' });
  }
  return row;
}

// ---------------------------------------------------------------- profile tài nguyên

/**
 * Năng lực mà pod của lab này được dựng theo — SSOT trong file này.
 *
 * ⛔ MỘT biểu thức, HAI chỗ đọc: `startAttempt` đưa nó cho `createSandboxSession`
 * (quyết định RAM pod thật), `get` đưa nó qua `profileForCapabilities` để FE nói
 * "còn N chỗ cho bài NÀY". Hai lời gọi chép tay ở hai chỗ là chế độ hỏng ngày
 * 2026-09-07: màn hình in một con số của pod KHÁC với pod sắp tạo.
 *
 * ⚠ `lab.capabilities` THÔ, KHÔNG phải `effectiveCapabilities(lab)` — và đó là
 * chép theo hiện trạng chứ không phải một lựa chọn: `startAttempt` hôm nay đưa
 * đúng `lab.capabilities`. Sự lệch với `lessons.*` (dùng `effectiveCapabilities`)
 * là NỢ CÓ THẬT — một lab khai `requiresCapabilities` hẹp hơn image sẽ nhận
 * profile lớn hơn mức nó cần. Sửa nó là đổi RAM pod, cần số đo trên cụm, nên nó
 * KHÔNG được sửa lén ở đây; ghi ra để lần sau ai đó "dọn cho nhất quán" thì biết
 * mình đang đổi cái gì.
 */
function sandboxCapabilities(lab: Lab): Lab['capabilities'] {
  return lab.capabilities;
}

// ---------------------------------------------------------------- setup chạy nền

/**
 * Đọc sentinel setup trong pod của một lần thử (P15 / 15.C — hướng B).
 *
 * `null` = lab KHÔNG khai `setup.background`, nên không có gì để chờ. Trả `null`
 * thay vì `'ready'` để hai người gọi tự quyết: `setupStatus` dịch nó thành
 * "sẵn sàng" cho FE, còn `checkTask` bỏ hẳn lượt exec probe. Đó cũng là lý do
 * điều kiện đọc `lab.setup.background`, KHÔNG đọc state `'absent'` của probe:
 * "bài này không có setup" là một sự thật của NỘI DUNG, biết được mà không cần
 * hỏi pod — còn `'absent'` từ probe là một sự thật về POD, và nó nhập nhằng giữa
 * "không có gì để chạy" với "lượt phóng chưa từng xảy ra". Nhập nhằng đó, nếu
 * đọc thành "sẵn sàng", là chấm trên sandbox trắng — đúng lỗi `4a67043` đã sửa.
 */
async function probeSetup(
  ctx: { user: { id: string; role: string } },
  lab: Lab,
  sessionId: string,
  /**
   * `expiresAt` đã hỏi orchestrator rồi, nếu caller có sẵn.
   *
   * ⛔ Tham số này tồn tại vì `checkTask` cần `sessionExpiry` CHO CẢ lượt probe
   * LẪN lượt chấm. Để probe tự hỏi lại là thêm một vòng gRPC tới orchestrator
   * trên ĐƯỜNG NÓNG của mọi lượt bấm Chấm — chính đường mà P15 đang cố làm nhẹ
   * đi. Một lượt chấm phải đi đúng MỘT lượt `GetSession`, như trước P15.
   */
  expiresAtSeconds?: number,
): Promise<SetupProbe | null> {
  if (lab.setup.background === null) {
    return null;
  }
  const expiry = expiresAtSeconds ?? (await sessionExpiry(ctx, sessionId));
  const outcome = await runScriptInSession({
    sessionId,
    userId: ctx.user.id,
    expiresAtSeconds: expiry,
    script: SETUP_PROBE_SCRIPT,
  });
  return parseSetupProbe(outcome.output);
}

/** Câu người học đọc cho mỗi trạng thái setup chưa xong. */
function describeUnreadySetup(probe: SetupProbe): string {
  if (probe.state === 'running') {
    return 'Môi trường của bài đang được dựng — đợi vài giây rồi chấm lại.';
  }
  if (probe.state === 'absent') {
    // Lab CÓ khai `background` mà pod không có dấu phóng nào: phiên này có trước
    // P15, hoặc lượt phóng đã mất. Chấm bây giờ là chấm trên sandbox trắng.
    return 'Môi trường của bài chưa được dựng trong phiên này. Hãy bấm Bắt đầu để mở lần thử mới.';
  }
  const detail =
    probe.log === null
      ? 'Hãy bấm Bắt đầu để mở lần thử mới.'
      : (setupFailureDetail(probe.log) ?? 'Hãy bấm Bắt đầu để mở lần thử mới.');
  const exit = probe.exitCode === null ? '' : ` (exit ${String(probe.exitCode)})`;
  return `Dựng môi trường của bài thất bại${exit}: ${detail}`;
}

/**
 * Profile mà pod của lab này xin.
 *
 * ⚠ MỘT đối số, cố ý: `createSandboxSession` (`server/labs/session.ts`) gọi
 * `profileForCapabilities(params.capabilities)` và KHÔNG chuyển `interfaceLayout`
 * xuống. Nên với lab, `interface.layout: ide` hôm nay KHÔNG nâng profile. Thêm
 * đối số thứ hai ở đây sẽ làm nhãn hứa một profile mà pod không xin — tức đổi
 * một lời nói dối lấy một lời nói dối khác. Đường đúng là sửa
 * `createSandboxSession` rồi sửa CẢ HAI cùng lúc; file đó ngoài sở hữu lượt này.
 */
function profileForLab(lab: Lab): string {
  return profileForCapabilities(sandboxCapabilities(lab));
}

/** `attemptId` là khoá duy nhất thật sự; `labId` trong input chỉ để đối chiếu — lệch cũng NOT_FOUND, không lộ thêm gì. */
/**
 * Một dòng đã chấm điểm của bảng xếp hạng, ở dạng tối thiểu mà THỨ TỰ cần.
 * `leaderboard` mang thêm `userId`/`displayName`, nhưng chúng không tham gia
 * xếp hạng nên không nằm trong kiểu này.
 */
export interface LeaderboardEntry {
  readonly attemptId: string;
  readonly percent: number;
  readonly durationSeconds: number;
  readonly submittedAt: Date;
}

/**
 * Điểm cao trước, rồi nhanh hơn, rồi nộp sớm hơn — và cuối cùng `attemptId`.
 *
 * ⛔ VẾ PHÁ HOÀ KHÔNG PHẢI TRANG TRÍ. Không có nó, comparator trả `0` cho hai
 * dòng hoà nhau tuyệt đối, `Array.prototype.sort` (ổn định) giữ nguyên thứ tự
 * ĐẦU VÀO, và thứ tự đầu vào là thứ Postgres trả về — vốn không xác định. Hai
 * lượt F5 giống hệt nhau ra hai thứ hạng khác nhau, và vì `cursor` được tra
 * bằng `findIndex` trên chính mảng này, trang 2 còn nhảy dòng theo.
 *
 * So sánh chuỗi bằng `<`/`>` chứ KHÔNG `localeCompare`: collation của
 * `localeCompare` phụ thuộc ICU/locale của tiến trình, tức cùng một dữ liệu có
 * thể ra hai thứ tự trên hai máy — đúng cái bệnh đang chữa. Điểm mã là tất
 * định ở mọi nơi, và `attemptId` là uuid nên thứ tự "đẹp" không có nghĩa gì.
 */
export function compareLeaderboardEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.percent !== a.percent) return b.percent - a.percent;
  if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
  const theoLucNop = a.submittedAt.getTime() - b.submittedAt.getTime();
  if (theoLucNop !== 0) return theoLucNop;
  if (a.attemptId === b.attemptId) return 0;
  return a.attemptId < b.attemptId ? -1 : 1;
}

function assertAttemptBelongsToLab(attempt: LabAttemptRow, labId: string): void {
  if (attempt.labId !== labId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không tìm thấy lần thử này' });
  }
}

// ---------------------------------------------------------------- input

const IDEMPOTENCY_KEY_SCHEMA = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'idempotencyKey chỉ nhận [A-Za-z0-9_-], tối đa 64 ký tự');

/**
 * D9 (phase-13) — bộ lọc SERVER + thứ tự SERVER, cùng khuôn `lessons.list`.
 * `orderBy` không nhận `'title'`; lý do đo được nằm ở `CONTENT_ORDER_KEYS`
 * (`packages/scenario/src/source.ts`).
 */
const listLabsInput = listInputSchema
  .extend({
    difficulty: z.enum(SCENARIO_DIFFICULTIES).optional(),
    tier: z.enum(SANDBOX_TIER_NAMES).optional(),
    capability: z.enum(SCENARIO_CAPABILITIES).optional(),
    orderBy: z.enum(CONTENT_ORDER_KEYS).optional(),
  })
  .strict();

const getInput = z.object({ labId: scenarioIdSchema }).strict();
const startAttemptInput = z
  .object({ labId: scenarioIdSchema, idempotencyKey: IDEMPOTENCY_KEY_SCHEMA })
  .strict();
const attemptIdInput = z.object({ attemptId: z.string().min(1) }).strict();
const listAttemptsInput = listInputSchema.extend({ labId: scenarioIdSchema }).strict();
const checkTaskInput = z
  .object({ labId: scenarioIdSchema, attemptId: z.string().min(1), taskId: labTaskIdSchema })
  .strict();
const submitInput = z.object({ labId: scenarioIdSchema, attemptId: z.string().min(1) }).strict();
const setDisplayPreferenceInput = z
  .object({ attemptId: z.string().min(1), displayNamePublic: z.boolean() })
  .strict();
const leaderboardInput = listInputSchema.extend({ labId: scenarioIdSchema }).strict();

// ---------------------------------------------------------------- router

export const labsRouter = createTRPCRouter({
  /**
   * Danh sách lab cho trang `/labs`. Luật 4: `limit` bị ÉP về ≤100
   * (`listInputSchema`).
   *
   * D9 (phase-13) — cùng khuôn `lessons.list`: phân trang thật ở tầng nguồn
   * qua `listLabsPage`, không còn `listLabs()` rồi cắt lát bằng TS.
   */
  list: protectedProcedure.input(listLabsInput).query(async ({ input }) => {
    try {
      const result = await labSource().listLabsPage({
        limit: input.limit,
        cursor: input.cursor,
        orderBy: input.orderBy,
        filter: {
          difficulty: input.difficulty,
          tier: input.tier,
          capability: input.capability,
        },
      });
      return { items: result.items, limit: input.limit, nextCursor: result.nextCursor };
    } catch (cause) {
      // SSOT cho cả ba router phân trang nội dung — `source-errors.ts` giải
      // thích vì sao khối này không được chép tay lần thứ ba, và vì sao câu 503
      // phải là câu TỰ SOẠN chứ không chuyển tiếp `cause.message`.
      rethrowContentSourceError(cause);
    }
  }),

  /** Nội dung đầy đủ một lab. */
  get: protectedProcedure.input(getInput).query(async ({ input }) => {
    const lab = await requireLab(input.labId);
    return {
      lab,
      // Profile tài nguyên của CHÍNH lab này — cùng nguồn với `startAttempt`
      // (xem `sandboxCapabilities`). Thiếu field này, trang lab đếm theo profile
      // mặc định: một lab Kubernetes (1024Mi, trần 5) hiện con số của bài thường
      // (256Mi, trần 23). Prop `profile` của `SessionControls` là TUỲ CHỌN, nên
      // chỗ thiếu đó biên dịch sạch trong khi màn hình nói sai.
      profile: profileForLab(lab),
      unsupportedCapabilities: unsupportedCapabilities(effectiveCapabilities(lab)),
    };
  }),

  /**
   * Mở sandbox cho một lab + tạo dòng `lab_attempts`. Tier suy từ `lab.tier`,
   * cùng lý lẽ `lessons.startSession` — client không chọn được mức cô lập pod
   * của chính mình.
   */
  startAttempt: protectedProcedure.input(startAttemptInput).mutation(async ({ ctx, input }) => {
    const lab = await requireLab(input.labId);
    const { session } = await createSandboxSession(ctx, {
      tier: lab.tier,
      ttlSeconds: 0,
      idempotencyKey: input.idempotencyKey,
      // CÙNG biểu thức mà `get` đưa cho `profileForLab` — xem `sandboxCapabilities`.
      capabilities: sandboxCapabilities(lab),
    });

    /*
      Dựng CẢNH của lab trước khi trả `attemptId`.

      ⛔ Vì sao ở ĐÂY chứ không phải một procedure `labs.runSetup` riêng như
      `lessons.runSetup`: lesson có phase, nên client phải điều phối một lượt
      setup cho mỗi phase. Lab cố ý KHÔNG có phase — cả N task dùng CHUNG một
      lượt setup (xem `labSchema.setup`). Một procedure riêng ở đây chỉ thêm
      một trạng thái trung gian mà client phải nhớ gọi, và "quên gọi" chính là
      lỗi mà chặng này sửa: `lab-loader.ts` nạp đủ `setup.foreground` +
      `setup.background`, nhưng KHÔNG người tiêu thụ nào chạy chúng, nên mọi
      `verify.sh` chấm trên một sandbox TRẮNG. Hậu quả đo được: task kiểu
      "vắng mặt là đạt" (`find-kill-runaway`) đỗ NGAY khi chưa gõ lệnh nào, còn
      task cần cảnh dựng sẵn (`fix-healthcheck-script`,
      `harden-secret-permissions`) không bao giờ đạt được.

      Chạy TRƯỚC khi ghi `labAttempts`: setup hỏng thì không để lại một lần thử
      dở dang trong hồ sơ người học.

      ⛔ P15 / 15.A — setup hỏng còn phải TRẢ LẠI KHE QUOTA, ngay. Câu cũ ở đây
      nói "phiên sandbox thừa đã có reaper thu hồi", và điều đó đúng về chữ nhưng
      sai về hệ quả: reaper là TTL MỘT GIỜ. Lab k8s chỉ có 5 khe, nên năm lượt
      hỏng liên tiếp đóng cửa lab một tiếng và màn hình chỉ nói "Còn 0 chỗ"
      trong khi không ai đang học. Xem `reapUnusableSession`.

      ⛔ P15 / 15.C — hướng B: bước `background` được PHÓNG chạy nền, không chạy
      đồng bộ. Vì sao, và cái giá của nó: `labs/setup-background.ts`. Hai bước
      kia (`tools`, `assets`) vẫn đồng bộ — chúng là hằng số thời gian, không
      phụ thuộc một cụm Kubernetes con lên nhanh hay chậm, nên chúng không nằm
      trong lớp lỗi mà 15.C sửa.
    */
    const setupSteps = setupScriptPlan({
      tools: buildToolsEnableScript(lab.toolset),
      // Lab chưa có asset: `lab-loader.ts` luôn gán `[]`. Ngày có asset thật,
      // thêm ở ĐÂY cùng khuôn `lessons.runSetup` (asset đi TRƯỚC background).
      assets: null,
      background: lab.setup.background,
    }).map(launchedBackgroundStep);
    if (setupSteps.length > 0) {
      const setupExpiresAtSeconds = await sessionExpiry(ctx, session.id);
      for (const step of setupSteps) {
        const outcome = await runScriptInSession({
          sessionId: session.id,
          userId: ctx.user.id,
          expiresAtSeconds: setupExpiresAtSeconds,
          script: step.script,
        });
        if (!outcome.passed) {
          // Thứ tự BẮT BUỘC: reap TRƯỚC, ném SAU. Ném trước là thoát khỏi hàm —
          // không dòng nào sau `throw` chạy, và khe quota ở lại đúng một tiếng.
          await reapUnusableSession(ctx, session.id);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: step.failureMessage({ exitCode: outcome.exitCode, output: outcome.output }),
          });
        }
      }
    }

    // Hồ sơ (P13 C4) — lựa chọn "hiện tên trên bảng xếp hạng" là mặc định
    // TOÀN CỤC của người dùng; `setDisplayPreference` vẫn cho đổi ý SAU khi đã
    // nộp cho TỪNG lần thử riêng (đọc lại ở mỗi lượt xem xếp hạng, không đóng
    // băng — xem chú thích `labAttempts.displayNamePublic`). Đây chỉ là giá trị
    // KHỞI TẠO, không phải ràng buộc.
    const prefs = await readUserPreferences(ctx.db, ctx.user.id);
    const { preferencesApplied } = await applySessionPreferences(ctx, session);

    const now = new Date();
    const attemptId = crypto.randomUUID();
    await ctx.db.insert(labAttempts).values({
      id: attemptId,
      userId: ctx.user.id,
      labId: lab.id,
      sessionId: session.id,
      startedAt: now,
      submittedAt: null,
      displayNamePublic: prefs.leaderboardNamePublic,
      createdAt: now,
      updatedAt: now,
    });

    return { attemptId, sessionId: session.id, preferencesApplied };
  }),

  /**
   * Setup của bài đã dựng xong chưa (P15 / 15.C — hướng B).
   *
   * FE poll procedure này sau `startAttempt` để hiện "đang chuẩn bị môi trường"
   * và, khi hỏng, hiện NGUYÊN NHÂN thật thay vì một mã thoát.
   *
   * ⛔ `query`, và nó KHÔNG tự reap phiên hỏng. Hai lý do, cả hai đều là quyết
   * định chứ không phải thiếu sót:
   *
   * 1. Một `query` có tác dụng phụ là một cái bẫy cho mọi người đọc sau — và cho
   *    react-query, vốn được phép gọi lại nó bất cứ lúc nào (refetch on focus,
   *    retry) mà không coi đó là một hành động.
   * 2. Ở đây người học CÒN một pod sống và một terminal đang mở trong đó. Giết
   *    pod dưới chân họ vì setup của bài hỏng là một quyết định khác hẳn với
   *    `reapUnusableSession` (nơi chưa có ai, chưa có lần thử nào). Khe quota
   *    trong ca này chết theo TTL, y như MỌI phiên bị bỏ giữa chừng — tức không
   *    phải một sự thụt lùi, mà là đúng đường đã có.
   *
   * 15.A chỉ gác ca ĐỒNG BỘ: setup hỏng ngay trong `startAttempt`, khi chưa có
   * lần thử nào và chưa ai nhìn. Đó là ca đã đo được rò khe.
   */
  setupStatus: protectedProcedure.input(attemptIdInput).query(async ({ ctx, input }) => {
    const attempt = await requireOwnAttempt(ctx, input.attemptId);
    const lab = await requireLab(attempt.labId);
    const probe = await probeSetup(ctx, lab, attempt.sessionId);
    if (probe === null) {
      return { state: 'ready' as const, message: null };
    }
    return probe.state === 'ready'
      ? { state: 'ready' as const, message: null }
      : { state: probe.state, message: describeUnreadySetup(probe) };
  }),

  /** Điểm + trạng thái của MỘT lần thử — chỉ chủ sở hữu (luật 5). */
  getAttempt: protectedProcedure.input(attemptIdInput).query(async ({ ctx, input }) => {
    const attempt = await requireOwnAttempt(ctx, input.attemptId);
    const lab = await requireLab(attempt.labId);
    const results = await loadResults(ctx.db, attempt.id);
    const { score, status } = scoreAndStatus(lab, results, attempt.submittedAt);
    return {
      attempt: toLabAttemptDTO(attempt, results),
      score,
      status,
      durationSeconds: computeAttemptDurationSeconds(attempt.startedAt, attempt.submittedAt),
    };
  }),

  /**
   * Lịch sử lần thử CỦA MÌNH trên một lab — mới nhất trước, cursor keyset trên
   * `(startedAt, id)` để tránh nhảy/lặp mục khi có hai lần thử trùng mili-giây.
   */
  listAttempts: protectedProcedure.input(listAttemptsInput).query(async ({ ctx, input }) => {
    const lab = await requireLab(input.labId);

    let cursorRow: { startedAt: Date; id: string } | undefined;
    if (input.cursor !== undefined) {
      const rows = await ctx.db
        .select({ startedAt: labAttempts.startedAt, id: labAttempts.id })
        .from(labAttempts)
        .where(and(eq(labAttempts.id, input.cursor), eq(labAttempts.userId, ctx.user.id)))
        .limit(1);
      cursorRow = rows[0];
      if (cursorRow === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
      }
    }

    const ownership = and(eq(labAttempts.userId, ctx.user.id), eq(labAttempts.labId, input.labId));
    const rows = await ctx.db
      .select()
      .from(labAttempts)
      .where(
        cursorRow === undefined
          ? ownership
          : and(
              ownership,
              or(
                lt(labAttempts.startedAt, cursorRow.startedAt),
                and(eq(labAttempts.startedAt, cursorRow.startedAt), lt(labAttempts.id, cursorRow.id)),
              ),
            ),
      )
      .orderBy(desc(labAttempts.startedAt), desc(labAttempts.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);

    const resultRows =
      page.length === 0
        ? []
        : await ctx.db
            .select()
            .from(labTaskResults)
            .where(
              inArray(
                labTaskResults.attemptId,
                page.map((row) => row.id),
              ),
            );
    const resultsByAttempt = new Map<string, LabTaskResultRow[]>();
    for (const row of resultRows) {
      const list = resultsByAttempt.get(row.attemptId) ?? [];
      list.push(row);
      resultsByAttempt.set(row.attemptId, list);
    }

    return {
      items: page.map((row) => {
        const results = resultsByAttempt.get(row.id) ?? [];
        const { score, status } = scoreAndStatus(lab, results, row.submittedAt);
        return {
          attempt: toLabAttemptDTO(row, results),
          score,
          status,
          durationSeconds: computeAttemptDurationSeconds(row.startedAt, row.submittedAt),
        };
      }),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }),

  /**
   * Chấm MỘT task — tái dùng nguyên `runScriptInSession` (contract §3 luật 2).
   * KHÔNG viết đường `/exec` thứ hai; script tra từ `lab.tasks`, tuyệt đối
   * không nhận từ input (cùng ranh giới với `lessons.checkStep`).
   */
  checkTask: protectedProcedure.input(checkTaskInput).mutation(async ({ ctx, input }) => {
    const attempt = await requireOwnAttempt(ctx, input.attemptId);
    assertAttemptBelongsToLab(attempt, input.labId);
    if (attempt.submittedAt !== null) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Lần thử này đã được nộp — không chấm lại được' });
    }

    const lab = await requireLab(attempt.labId);
    const task = lab.tasks.find((t) => t.id === input.taskId);
    if (task === undefined) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Lab "${lab.id}" không có task "${input.taskId}"` });
    }

    /*
      ⛔ P15 / 15.C — TỪ CHỐI chấm khi setup chưa xong.

      Vế này KHÔNG phải phòng xa: hướng B phóng setup chạy nền, nên từ lúc
      `startAttempt` trả về cho tới khi cụm con lên (đo được 17–26s trên node đã
      lắng, 93s dưới tải) có một cửa sổ mà cảnh của bài dựng DỞ. Chấm trong cửa
      sổ đó cho kết quả sai theo cả hai chiều: task "vắng mặt là đạt" đỗ vì thứ
      phải có còn chưa tạo, task cần cảnh dựng sẵn trượt vì cùng lý do. Đó đúng
      là lỗi `4a67043` vừa sửa, quay lại dưới một hình dạng khác — và plan ô 11
      gọi tên nó trước khi nó xảy ra.

      ⚠ NÉM, không phải `passed: false`. Môi trường chưa dựng xong không phải
      "bài làm sai" (`validate.ts` § `gatewayError`, plan ô 8). Một dấu X đỏ ở
      đây bắt người học đi sửa một bài họ còn chưa kịp làm.
    */
    // MỘT lượt `GetSession` cho cả probe lẫn lượt chấm — xem `probeSetup`.
    const expiresAtSeconds = await sessionExpiry(ctx, attempt.sessionId);

    const setup = await probeSetup(ctx, lab, attempt.sessionId, expiresAtSeconds);
    if (setup !== null && setup.state !== 'ready') {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: describeUnreadySetup(setup),
      });
    }

    // Ném ở đây (lỗi hạ tầng: script hỏng/hết hạn/pod chết) dừng NGAY trước
    // `insert` — không có dòng nào được ghi cho một lần chấm lỗi hạ tầng
    // (contract §3 luật 3, bất biến của `lab_task_results`).
    const outcome = await runScriptInSession({
      sessionId: attempt.sessionId,
      userId: ctx.user.id,
      expiresAtSeconds,
      script: task.verifyScript,
    });

    const output = truncateLabOutput(outcome.output);
    await ctx.db.insert(labTaskResults).values({
      id: crypto.randomUUID(),
      attemptId: attempt.id,
      taskId: task.id,
      exitCode: outcome.exitCode,
      output,
      checkedAt: new Date(),
    });

    return { exitCode: outcome.exitCode, passed: outcome.passed, output };
  }),

  /**
   * Chốt lần nộp — KHÔNG chạy verify script nào (contract §3 luật 1). Chỉ set
   * `submitted_at` rồi tính lại điểm từ các dòng `lab_task_results` ĐÃ LƯU.
   */
  submit: protectedProcedure.input(submitInput).mutation(async ({ ctx, input }) => {
    const attempt = await requireOwnAttempt(ctx, input.attemptId);
    assertAttemptBelongsToLab(attempt, input.labId);
    if (attempt.submittedAt !== null) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Lần thử này đã được nộp rồi' });
    }

    const lab = await requireLab(attempt.labId);
    const now = new Date();
    await ctx.db
      .update(labAttempts)
      .set({ submittedAt: now, updatedAt: now })
      .where(eq(labAttempts.id, attempt.id));

    const results = await loadResults(ctx.db, attempt.id);
    const { score, status } = scoreAndStatus(lab, results, now);
    return {
      attempt: toLabAttemptDTO({ ...attempt, submittedAt: now, updatedAt: now }, results),
      score,
      status,
      durationSeconds: computeAttemptDurationSeconds(attempt.startedAt, now),
    };
  }),

  /** Đổi lựa chọn hiện tên/ẩn danh — đọc LẠI ở mỗi lượt xem xếp hạng, không đóng băng lúc nộp. */
  setDisplayPreference: protectedProcedure
    .input(setDisplayPreferenceInput)
    .mutation(async ({ ctx, input }) => {
      await requireOwnAttempt(ctx, input.attemptId);
      await ctx.db
        .update(labAttempts)
        .set({ displayNamePublic: input.displayNamePublic, updatedAt: new Date() })
        .where(eq(labAttempts.id, input.attemptId));
      return { ok: true as const };
    }),

  /**
   * Xếp hạng — luật 1 ở dạng mạnh (contract §3 luật 6): không nhận `userId`,
   * không select cột email ở bất kỳ đâu trong câu truy vấn này, chỉ attempt đã
   * nộp, `displayName` null khi ẩn danh. Sắp xếp + phân trang ở tầng TS SAU khi
   * nạp — không SQL nào tính điểm.
   */
  leaderboard: protectedProcedure.input(leaderboardInput).query(async ({ ctx, input }) => {
    const lab = await requireLab(input.labId);
    if (!lab.leaderboard) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Lab "${lab.id}" không có bảng xếp hạng` });
    }

    // Chỉ những cột cần cho bảng xếp hạng — KHÔNG có `users.email` ở đây.
    const attemptRows = await ctx.db
      .select({
        id: labAttempts.id,
        userId: labAttempts.userId,
        startedAt: labAttempts.startedAt,
        submittedAt: labAttempts.submittedAt,
        displayNamePublic: labAttempts.displayNamePublic,
        userName: users.name,
      })
      .from(labAttempts)
      .innerJoin(users, eq(users.id, labAttempts.userId))
      .where(and(eq(labAttempts.labId, input.labId), isNotNull(labAttempts.submittedAt)))
      // Thứ tự đọc TẤT ĐỊNH. `compareLeaderboardEntries` mới là thứ bảo đảm
      // thứ hạng (nó là thứ tự toàn phần, nên độc lập với đầu vào) — dòng này
      // là lớp thứ hai: một câu SELECT không `ORDER BY` trả dòng theo plan,
      // theo VACUUM, theo seq-scan song song, nên mọi thứ dựng trên nó đều khó
      // tái hiện khi có sự cố. Rẻ: `lab_attempts.id` là khoá chính.
      .orderBy(asc(labAttempts.id));

    if (attemptRows.length === 0) {
      return { items: [] as LabLeaderboardRow[], nextCursor: null };
    }

    const resultRows = await ctx.db
      .select()
      .from(labTaskResults)
      .where(
        inArray(
          labTaskResults.attemptId,
          attemptRows.map((row) => row.id),
        ),
      );
    const resultsByAttempt = new Map<string, LabTaskResultRow[]>();
    for (const row of resultRows) {
      const list = resultsByAttempt.get(row.attemptId) ?? [];
      list.push(row);
      resultsByAttempt.set(row.attemptId, list);
    }

    const scored = attemptRows.map((row) => {
      const score = computeLabScore(lab, (resultsByAttempt.get(row.id) ?? []).map(toLabTaskResultDTO));
      // `submittedAt` không null — đã lọc bởi `isNotNull` ở câu truy vấn trên.
      const submittedAt = row.submittedAt as Date;
      return {
        attemptId: row.id,
        userId: row.userId,
        displayName: row.displayNamePublic ? row.userName : null,
        percent: score.percent,
        durationSeconds: computeAttemptDurationSeconds(row.startedAt, submittedAt) ?? 0,
        submittedAt,
      };
    });

    scored.sort(compareLeaderboardEntries);

    let start = 0;
    if (input.cursor !== undefined) {
      const at = scored.findIndex((row) => row.attemptId === input.cursor);
      if (at < 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
      }
      start = at + 1;
    }

    const page = scored.slice(start, start + input.limit);
    const items: LabLeaderboardRow[] = page.map((row, i) => ({
      rank: start + i + 1,
      displayName: row.displayName,
      percent: row.percent,
      durationSeconds: row.durationSeconds,
      submittedAt: row.submittedAt.toISOString(),
      isSelf: row.userId === ctx.user.id,
    }));
    const next = start + input.limit;

    return { items, nextCursor: next < scored.length ? (page[page.length - 1]?.attemptId ?? null) : null };
  }),
});
