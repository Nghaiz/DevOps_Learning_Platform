import { TRPCError } from '@trpc/server';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
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
import { createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

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
 * `terminalTheme` — DÙNG LẠI danh sách ba theme của `packages/terminal/src/themes.ts`
 * (`THEME_NAMES`), nhưng CHÉP TAY thành hằng cục bộ thay vì `import` gói đó.
 *
 * ⛔ ĐÃ ĐO, KHÔNG PHẢI SỞ THÍCH: `@devops-platform/terminal` chỉ có MỘT subpath
 * export (`"."` → `src/index.ts`), và file đó re-export luôn `terminal-surface.tsx`
 * + `terminal-core.ts` — hai file kéo theo `@xterm/*` (browser-only, dùng
 * `self`/`window`). `import { THEME_NAMES } from '@devops-platform/terminal'`
 * ở CODE PHÍA SERVER làm toàn bộ `appRouter` (và mọi test import nó) ném
 * `ReferenceError: self is not defined` ngay lúc import — đo được: thêm dòng
 * import đó khiến 9/12 file test của `apps/web` báo "0 test" vì module load
 * chết trước khi có bài test nào đăng ký được.
 *
 * Sửa ĐÚNG là `packages/terminal` mở thêm subpath export server-an-toàn (vd
 * `"./themes": "./src/themes.ts"`) — nhưng file đó nằm ngoài quyền sở hữu của
 * lane này (`packages/terminal/**` thuộc lane D1/13.A). Đã báo lead kèm patch
 * đề xuất trong report; ĐÂY LÀ CHỖ DUY NHẤT chép tay ba giá trị, và nếu
 * `themes.ts` đổi danh sách mà quên sửa ở đây, `me.updatePreferences` sẽ từ
 * chối một theme hợp lệ — chấp nhận được tạm thời, không chấp nhận được vĩnh
 * viễn.
 */
const TERMINAL_THEME_NAMES = ['dlp-dark', 'dlp-light', 'dlp-contrast'] as const;

const updatePreferencesInput = z
  .object({
    defaultShell: z.enum(['bash', 'zsh', 'pwsh']).optional(),
    terminalTheme: z.enum(TERMINAL_THEME_NAMES).nullable().optional(),
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
        .where(and(eq(progress.id, input.cursor), eq(progress.userId, ctx.user.id)))
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
      items: page,
      limit: input.limit,
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }),
});

// Giữ hằng số mặc định có thể tham chiếu được từ test — không phải một phần của router.
export { DEFAULT_PREFERENCES };
