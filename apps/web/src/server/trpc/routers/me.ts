import { TRPCError } from '@trpc/server';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { THEME_NAMES } from '@devops-platform/terminal/themes';
import { computeAttemptDurationSeconds } from '@devops-platform/scenario';
import { gradeQuiz } from '@devops-platform/scenario/quiz-score';
import { contentSourceFor } from '../../content/source';
import type { Database } from '../../db/client';
import { accounts, labAttempts, progress, quizAnswers, quizAttempts, users } from '../../db/schema';
import { DEFAULT_PREFERENCES, readUserPreferences, writeUserPreferences } from '../../me/preferences';
import { endSessionAs, listSessionsPage } from '../../sessions/list';
import { loadResults, scoreAndStatus } from './labs';
import { loadQuizFull, type QuizVisibility } from '../../quiz/repository';
import { toAnswerInputs } from './quiz';
import { assertUuidCursor, createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

/**
 * `me.*` — trang "của tôi" (P13 C4). Mọi procedure ở đây đọc/ghi resource của
 * ĐÚNG người gọi — không input schema nào nhận `userId` (luật 1 ở dạng mạnh,
 * cùng khuôn `lessons.ts`/`labs.ts`).
 *
 * ⚠ `me.listLabAttempts`/`me.listQuizAttempts` là lịch sử CÁ NHÂN, xuyên suốt
 * MỌI lab/quiz — khác `labs.listAttempts`/`quiz.listAttempts` (scoped vào MỘT
 * lab/quiz). Vì thế chúng cần nạp NHIỀU lab/quiz khác nhau cho một trang, và
 * dùng `contentSourceFor({kind:'admin'})` (thấy MỌI state, kể cả archived) chứ
 * không phải `labSource()`/`published-only`: lịch sử CỦA CHÍNH người học không
 * được phép biến mất chỉ vì tác giả đã archive bài sau đó.
 */

/**
 * Một dòng `progress` ở dạng ĐI ĐƯỢC QUA DÂY.
 *
 * ⛔ VÌ SAO KHÔNG TRẢ THẲNG DÒNG DRIZZLE: dây tRPC của app này cố ý không có
 * transformer (`server/trpc/init.ts`), nên payload đi qua `JSON.stringify` trần.
 * Một cột `timestamp` là `Date` trong TS nhưng là **chuỗi ISO** sau khi qua dây
 * — nghĩa là kiểu mà `api.me.listProgress` suy ra cho client NÓI `Date` trong
 * khi trình duyệt nhận `string`. Không typecheck nào bắt được: cả hai phía tự
 * nhất quán với chính mình, chỉ có sự thật lúc chạy là khác.
 *
 * Cùng lớp lỗi với `bigint` từng làm 500 thật ở P2 (`lab-score.ts`). Trước khi
 * router được sửa, `formatMoment` phải nhận CẢ `string` LẪN `Date` để chịu được
 * dòng thô này; nay `lib/format-moment.ts` chỉ nhận `string | null`, nên kiểu
 * hẹp đó là cổng: trả thẳng một cột `timestamp` ra dây sẽ đỏ typecheck ở chỗ
 * gọi. Chỗ sửa đúng là ở đây, không phải ở chỗ gọi.
 *
 * `lessons.ts` đã làm đúng việc này từ P2 với `toProgressView`; hàm đó KHÔNG
 * dùng lại được nguyên bản ở đây vì nó bỏ `id` (cursor keyset cần) và `lessonId`
 * (trang "Của tôi" cần để dựng link), lại thêm một trường `status` suy-ra-được
 * mà `summarizeLessonProgress` phía client đã tự tính — trả cả hai là dựng
 * nguồn sự thật thứ hai.
 */
export interface ProgressRowDTO {
  readonly id: string;
  readonly userId: string;
  readonly lessonId: string;
  readonly stepIndex: number;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function toProgressRowDTO(row: typeof progress.$inferSelect): ProgressRowDTO {
  return {
    id: row.id,
    userId: row.userId,
    lessonId: row.lessonId,
    stepIndex: row.stepIndex,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Bracket ADMIN THEO NGHĨA "thấy mọi state", KHÔNG cấp quyền ghi — chỉ dùng để đọc lại lịch sử. */
const HISTORY_QUIZ_VISIBILITY: QuizVisibility = { authorId: null, isAdmin: true };

async function hasCredentialAccount(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')))
    .limit(1);
  return rows.length > 0;
}

const updateProfileInput = z.object({ name: z.string().min(1).max(80) }).strict();

/**
 * `terminalTheme` — danh sách theme đến TỪ `packages/terminal`, không chép tay.
 *
 * Trước 2026-09-06 đây là một hằng cục bộ chép tay ba giá trị, vì lúc đó
 * `@devops-platform/terminal` chỉ có MỘT subpath export (`"."`) và file đó
 * re-export `terminal-surface.tsx` + `terminal-core.ts` — hai file kéo theo
 * `@xterm/*` (browser-only, chạm `self`/`window` NGAY lúc nạp module). Import
 * gói đó từ code phía server làm cả `appRouter` ném `ReferenceError: self is
 * not defined` tại thời điểm import, tức 9/12 file test báo "0 test" — một
 * con số đọc lẫn với thành công nếu chỉ nhìn số ca đỏ.
 *
 * Lane D1 đã mở subpath `"./themes" → "./src/themes.ts"`, và `themes.ts` không
 * có phụ thuộc runtime nào (`ITheme` là `import type`, bị xoá lúc biên dịch)
 * nên nó nạp sạch ở node. Cổng giữ điều đó:
 * `apps/web/src/components/session/terminal-theme.test.ts`.
 *
 * Xuất `updatePreferencesInput` để test khẳng định được rằng schema này CHẤP
 * NHẬN đúng `THEME_NAMES` — cùng lý do file này đã xuất `DEFAULT_PREFERENCES`.
 */
export const updatePreferencesInput = z
  .object({
    defaultShell: z.enum(['bash', 'zsh', 'pwsh']).optional(),
    terminalTheme: z.enum(THEME_NAMES).nullable().optional(),
    leaderboardNamePublic: z.boolean().optional(),
  })
  .strict();

const sessionIdInput = z.object({ sessionId: z.string().min(1) }).strict();

export const meRouter = createTRPCRouter({
  /** Luôn chỉ đọc resource của CHÍNH ctx.user — không nhận userId từ input. */
  get: protectedProcedure.input(z.object({}).strict()).query(async ({ ctx }) => {
    const [row] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!row) {
      // Session hợp lệ nhưng user đã bị xoá khỏi DB — không nên xảy ra, nhưng
      // errors-over-silent-fallbacks: báo rõ thay vì trả undefined im lặng.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User của session không còn tồn tại' });
    }
    const [preferences, hasPassword] = await Promise.all([
      readUserPreferences(ctx.db, ctx.user.id),
      hasCredentialAccount(ctx.db, ctx.user.id),
    ]);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      preferences,
      hasPassword,
    };
  }),

  updateProfile: protectedProcedure.input(updateProfileInput).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .update(users)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(users.id, ctx.user.id))
      .returning();
    if (!row) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User của session không còn tồn tại' });
    }
    return { id: row.id, name: row.name };
  }),

  /** Vắng field = giữ nguyên giá trị hiện có — merge, không phải thay toàn bộ. */
  updatePreferences: protectedProcedure.input(updatePreferencesInput).mutation(async ({ ctx, input }) => {
    const current = await readUserPreferences(ctx.db, ctx.user.id);
    const next = {
      defaultShell: input.defaultShell ?? current.defaultShell,
      terminalTheme: input.terminalTheme === undefined ? current.terminalTheme : input.terminalTheme,
      leaderboardNamePublic: input.leaderboardNamePublic ?? current.leaderboardNamePublic,
    };
    await writeUserPreferences(ctx.db, ctx.user.id, next);
    return next;
  }),

  /** `ListSessions(user_id = tôi)` — KHÔNG được truyền rỗng (đó là quyền của `admin.sessions.list`). */
  activeSessions: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    return listSessionsPage(ctx, { userId: ctx.user.id, limit: input.limit, cursor: input.cursor });
  }),

  /** Kết thúc SỚM một phiên của chính mình — orchestrator tự kiểm chủ sở hữu (luật 1). */
  endSession: protectedProcedure.input(sessionIdInput).mutation(async ({ ctx, input }) => {
    return endSessionAs(ctx, input.sessionId, 'user_ended');
  }),

  /**
   * Lịch sử lab CỦA TÔI — mới nhất trước, keyset trên `(startedAt, id)` (cùng
   * khuôn `labs.listAttempts`). Lab không còn ở BẤT KỲ nguồn nào (đĩa lẫn DB —
   * khác `archived`, vốn vẫn đọc được qua tầm nhìn admin) ⇒ bỏ qua dòng đó:
   * không có `Lab` thì không tính được `score`/`status` (`computeLabScore` cần
   * `tasks[]`), và bịa một điểm 0 giả sẽ nói dối nặng hơn việc thiếu một dòng
   * lịch sử hiếm gặp.
   */
  listLabAttempts: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
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

    const ownership = eq(labAttempts.userId, ctx.user.id);
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
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const distinctLabIds = [...new Set(page.map((row) => row.labId))];
    const source = contentSourceFor({ kind: 'admin' });
    const labEntries = await Promise.all(
      distinctLabIds.map(async (labId) => [labId, await source.getLab(labId)] as const),
    );
    const labs = new Map(labEntries);

    const items = [];
    for (const row of page) {
      const lab = labs.get(row.labId) ?? null;
      if (lab === null) {
        continue;
      }
      const results = await loadResults(ctx.db, row.id);
      const { score, status } = scoreAndStatus(lab, results, row.submittedAt);
      items.push({
        attempt: {
          id: row.id,
          labId: row.labId,
          sessionId: row.sessionId,
          startedAt: row.startedAt.toISOString(),
          submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
          displayNamePublic: row.displayNamePublic,
        },
        labId: row.labId,
        labTitle: lab.title,
        score,
        status,
        durationSeconds: computeAttemptDurationSeconds(row.startedAt, row.submittedAt),
      });
    }

    return { items, nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null };
  }),

  /**
   * Lịch sử quiz CỦA TÔI. Quiz KHÔNG BAO GIỜ bị xoá vật lý (chỉ `archived`),
   * nên khác lab, không có ca "quiz biến mất hoàn toàn" cần bỏ qua — mọi dòng
   * `quiz_attempts` luôn tra được quiz của nó.
   */
  listQuizAttempts: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    let cursorRow: { submittedAt: Date; id: string } | undefined;
    if (input.cursor !== undefined) {
      const rows = await ctx.db
        .select({ submittedAt: quizAttempts.submittedAt, id: quizAttempts.id })
        .from(quizAttempts)
        .where(and(eq(quizAttempts.id, input.cursor), eq(quizAttempts.userId, ctx.user.id)))
        .limit(1);
      cursorRow = rows[0];
      if (cursorRow === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
      }
    }

    const ownership = eq(quizAttempts.userId, ctx.user.id);
    const rows = await ctx.db
      .select()
      .from(quizAttempts)
      .where(
        cursorRow === undefined
          ? ownership
          : and(
              ownership,
              or(
                lt(quizAttempts.submittedAt, cursorRow.submittedAt),
                and(eq(quizAttempts.submittedAt, cursorRow.submittedAt), lt(quizAttempts.id, cursorRow.id)),
              ),
            ),
      )
      .orderBy(desc(quizAttempts.submittedAt), desc(quizAttempts.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;

    const distinctQuizIds = [...new Set(page.map((row) => row.quizId))];
    const quizEntries = await Promise.all(
      distinctQuizIds.map(async (quizId) => [quizId, await loadQuizFull(ctx.db, quizId, HISTORY_QUIZ_VISIBILITY)] as const),
    );
    const quizzesById = new Map(quizEntries);

    const items = [];
    for (const row of page) {
      const quiz = quizzesById.get(row.quizId) ?? null;
      if (quiz === null) {
        continue;
      }
      const answerRows = await ctx.db.select().from(quizAnswers).where(eq(quizAnswers.attemptId, row.id));
      const grading = gradeQuiz(quiz, toAnswerInputs(answerRows));
      items.push({
        attemptId: row.id,
        quizId: row.quizId,
        quizTitle: quiz.title,
        submittedAt: row.submittedAt.toISOString(),
        score: grading.score,
      });
    }

    return { items, nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null };
  }),

  /**
   * Luật 4 — dùng `listInputSchema` dùng chung, limit bị ép về ≤100.
   *
   * D9 (phase-13): `nextCursor` THẬT — keyset trên `(updatedAt desc, id)`
   * (không phải `lessonId`: hai dòng cùng `updatedAt` millisecond thì `id`
   * (uuid) mới là khoá phụ ổn định, `lessonId` không unique theo thời gian).
   */
  listProgress: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    let cursorRow: { updatedAt: Date; id: string } | undefined;
    if (input.cursor !== undefined) {
      const rows = await ctx.db
        .select({ updatedAt: progress.updatedAt, id: progress.id })
        .from(progress)
        // `progress.id` là `uuid` — cursor PHẢI qua `assertUuidCursor` trước,
        // xem chú thích của helper (một chuỗi lạ làm Postgres NÉM 22P02 ⇒ 500
        // + rò nguyên câu SQL kèm user_id ra trình duyệt).
        .where(and(eq(progress.id, assertUuidCursor(input.cursor)), eq(progress.userId, ctx.user.id)))
        .limit(1);
      cursorRow = rows[0];
      if (cursorRow === undefined) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
      }
    }

    const ownership = eq(progress.userId, ctx.user.id);
    const rows = await ctx.db
      .select()
      .from(progress)
      .where(
        cursorRow === undefined
          ? ownership
          : and(
              ownership,
              or(
                lt(progress.updatedAt, cursorRow.updatedAt),
                and(eq(progress.updatedAt, cursorRow.updatedAt), lt(progress.id, cursorRow.id)),
              ),
            ),
      )
      .orderBy(desc(progress.updatedAt), desc(progress.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: page.map(toProgressRowDTO),
      limit: input.limit,
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }),
});

// Giữ hằng số mặc định có thể tham chiếu được từ test — không phải một phần của router.
export { DEFAULT_PREFERENCES };
