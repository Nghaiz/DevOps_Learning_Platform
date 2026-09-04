import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { computeAttemptDurationSeconds, computeLabScore, computeLabStatus } from '@devops-platform/scenario';
import {
  labTaskIdSchema,
  scenarioIdSchema,
  type Lab,
  type LabAttempt,
  type LabLeaderboardRow,
  type LabTaskResult,
} from '@devops-platform/shared-types/lab';
import type { Database } from '../../db/client';
import { labAttempts, labTaskResults, users, type LabAttemptRow, type LabTaskResultRow } from '../../db/schema';
import { unsupportedCapabilities } from '../../lessons/catalog';
import { runScriptInSession } from '../../lessons/validate';
import { labSource, requireLab } from '../../labs/catalog';
import { truncateLabOutput } from '../../labs/output';
import { createSandboxSession, sessionExpiry } from '../../labs/session';
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
function toLabTaskResultDTO(row: LabTaskResultRow): LabTaskResult {
  return {
    taskId: row.taskId,
    exitCode: row.exitCode,
    output: row.output,
    checkedAt: row.checkedAt.toISOString(),
  };
}

function toLabAttemptDTO(row: LabAttemptRow, results: LabTaskResultRow[]): LabAttempt {
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

async function loadResults(db: Database, attemptId: string): Promise<LabTaskResultRow[]> {
  return db.select().from(labTaskResults).where(eq(labTaskResults.attemptId, attemptId));
}

function scoreAndStatus(lab: Lab, results: LabTaskResultRow[], submittedAt: Date | null) {
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

/** `attemptId` là khoá duy nhất thật sự; `labId` trong input chỉ để đối chiếu — lệch cũng NOT_FOUND, không lộ thêm gì. */
function assertAttemptBelongsToLab(attempt: LabAttemptRow, labId: string): void {
  if (attempt.labId !== labId) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không tìm thấy lần thử này' });
  }
}

// ---------------------------------------------------------------- input

const IDEMPOTENCY_KEY_SCHEMA = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'idempotencyKey chỉ nhận [A-Za-z0-9_-], tối đa 64 ký tự');

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
  /** Danh sách lab cho trang `/labs`. Luật 4: `limit` bị ÉP về ≤100 (`listInputSchema`). */
  list: protectedProcedure.input(listInputSchema).query(async ({ input }) => {
    const all = await labSource().listLabs();

    let start = 0;
    if (input.cursor !== undefined) {
      const at = all.findIndex((lab) => lab.id === input.cursor);
      if (at < 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
      }
      start = at + 1;
    }

    const page = all.slice(start, start + input.limit);
    const next = start + input.limit;
    return {
      items: page,
      limit: input.limit,
      nextCursor: next < all.length ? (page[page.length - 1]?.id ?? null) : null,
    };
  }),

  /** Nội dung đầy đủ một lab. */
  get: protectedProcedure.input(getInput).query(async ({ input }) => {
    const lab = await requireLab(input.labId);
    return { lab, unsupportedCapabilities: unsupportedCapabilities(lab.capabilities) };
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
      capabilities: lab.capabilities,
    });

    const now = new Date();
    const attemptId = crypto.randomUUID();
    await ctx.db.insert(labAttempts).values({
      id: attemptId,
      userId: ctx.user.id,
      labId: lab.id,
      sessionId: session.id,
      startedAt: now,
      submittedAt: null,
      displayNamePublic: false,
      createdAt: now,
      updatedAt: now,
    });

    return { attemptId, sessionId: session.id };
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

    const expiresAtSeconds = await sessionExpiry(ctx, attempt.sessionId);
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
      .where(and(eq(labAttempts.labId, input.labId), isNotNull(labAttempts.submittedAt)));

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

    scored.sort((a, b) => {
      if (b.percent !== a.percent) return b.percent - a.percent;
      if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
      return a.submittedAt.getTime() - b.submittedAt.getTime();
    });

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
