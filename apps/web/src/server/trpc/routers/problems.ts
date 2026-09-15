import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { GAME_IDS, type ProblemHintTeaser } from '@devops-platform/games';
import { problems } from '../../db/schema';
import { findProblemForWrite } from '../../problems/authz';
import {
  archiveProblem,
  createProblem,
  deleteProblem,
  publishProblem,
  updateProblem,
} from '../../problems/crud';
import { findHint, toProblemDTO } from '../../problems/dto';
import { getProblemForViewer } from '../../problems/get';
import { codeInput, listProblemsInput, toListOptions } from '../../problems/list-input';
import { listProblems, listProblemsForSolver } from '../../problems/list';
import { recordHintReveal } from '../../problems/reveals';
import { listMySubmissions } from '../../problems/submissions';
import { submitProblem, tryGradeProblem } from '../../problems/submit';
import type { Database } from '../../db/client';
import { examSubmissionRejection } from '../../exams/attempt-seed';
import { getAttemptFor, getExamForStudent } from '../../exams/crud';
import { problemBodySchema, problemCodeSchema, problemUpdateSchema } from '../../problems/validate';
import { problemVisibilityFor, visibleProblemWhere } from '../../problems/visibility';
import { authorProcedure, createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

/**
 * Trần số hành động trong một `RunLog` gửi lên — §18.C.4.
 *
 * Xem khối chú thích tại chỗ dùng (`submit.input.runLog.actions`) về vì sao trần
 * nằm ở schema input chứ không nằm trong `submitProblem`, và vì sao con số này.
 */
const MAX_LOG_ACTIONS = 20_000;

/**
 * `problems.*` — hệ bài tập kiểu OJ (P14 lane D).
 *
 * Hợp đồng: `packages/games/src/k8s/problem.ts`. File này hiện thực đúng nó và
 * không mở rộng nó — mọi kiểu trả về đều là kiểu khai ở đó.
 *
 * ## Hai đường, hai cổng
 *
 * | Đường | Cổng | Thấy gì |
 * |---|---|---|
 * | Người học (`list`/`byCode`/`submit`/`revealHint`/`mySubmissions`) | `protectedProcedure` | Chỉ bài `published`; gợi ý đã che |
 * | Người soạn (`mine`/`create`/`update`/`publish`/`archive`/`delete`) | `authorProcedure` + `assertProblemOwner` | Bài của mình mọi state; gợi ý nguyên văn |
 *
 * `authorProcedure` một mình KHÔNG đủ: nó chỉ trả lời "người này có được soạn
 * bài nói chung không". Câu hỏi "bài NÀY có phải của họ không" là
 * `assertProblemOwner`, và nó chạy trong `findProblemForWrite` trên MỌI thao tác
 * ghi. Gộp hai câu hỏi vào một cổng là cách IDOR lọt — cùng bài học `authoring.ts`.
 *
 * ## Luật 1 ở dạng mạnh
 *
 * Không input schema nào dưới đây khai `authorId` hay `userId`. Chủ sở hữu chỉ
 * tới từ `ctx.user.id` khi TẠO và từ cột `author_id` ĐỌC TỪ DB khi SỬA. Một
 * field như thế trong input là field kẻ tấn công điền được, và mọi kiểm tra sau
 * đó sẽ so giá trị họ cung cấp với chính nó.
 */

/**
 * Hình dạng `runLog` gửi lên — DÙNG CHUNG cho `submit` và `tryGrade`.
 *
 * ⛔ Một bản thứ hai ở `tryGrade` là chỗ hai đường lệch nhau trong im lặng: chấm
 * thử sẽ nhận một nhật ký mà đường nộp từ chối (hoặc ngược lại), và người dùng
 * thấy "thử thì đạt, nộp thì trượt" mà không có cách nào biết vì sao. Trần
 * `MAX_LOG_ACTIONS` và phép thừa kế `gameId` vì thế áp cho CẢ HAI ở đúng một chỗ.
 */
const runLogInput = z.object({
  gameId: z.enum(GAME_IDS).default('k8s'),
  levelId: z.string().min(1),
  seed: z.number().int(),
  /*
    * Trần độ dài — §18.C.4, nửa "giới hạn độ dài `actions[]`".
    *
    * ⛔ Trần phải nằm ở ĐÂY, trong schema input, chứ không ở trong
    * `submitProblem`. Một mảng mười triệu phần tử đã được phân tích,
    * cấp phát và giữ trong bộ nhớ TRƯỚC khi bất kỳ dòng nào của
    * `submitProblem` chạy; kiểm `actions.length` ở đó là kiểm sau khi
    * đã trả giá. Zod từ chối ngay tại biên.
    *
    * Vì sao là một con số chứ không phải "đủ lớn để không ai chạm":
    * máy chủ phát lại nhật ký HAI lần (`verifyRun` bắt engine không
    * tất định) rồi chạy mọi vị từ, nên độ dài nhật ký nhân thẳng vào
    * thời gian CPU của một lượt nộp. Cùng với trần nhịp 6 lượt/phút ở
    * `submit.ts`, hai con số này chốt được trần tải của một tài khoản.
    *
    * 20.000 chọn theo cái nó phải cho phép: `parMoves` của bài khó
    * nhất trong repo là hai chữ số, và một lượt chơi thật gồm lệnh +
    * tick + gợi ý vẫn nằm trong hàng nghìn. Hai chục nghìn rộng hơn
    * một lượt chơi thật rất xa và hẹp hơn một vòng lặp sinh dữ liệu.
    *
    * ⚠ Thông điệp nói ra con số. Một `400` trần trên một nhật ký dài
    * đọc ra như "lượt chơi của tôi hỏng", và người chơi sẽ chơi lại
    * rồi hỏng y hệt.
    */
  actions: z
    .array(
      z.looseObject({
        // Vắng ⇒ thừa kế `runLog.gameId` ở `.transform()` dưới, KHÔNG
        // mặc định `'k8s'`. Xem khối chú thích đầu `runLog`.
        gameId: z.enum(GAME_IDS).optional(),
        kind: z.string(),
        tick: z.number(),
      }),
    )
    .max(MAX_LOG_ACTIONS, {
      message: `Nhật ký lượt chơi vượt trần ${String(MAX_LOG_ACTIONS)} hành động`,
    })
    .readonly(),
})
  /*
   * Điền `gameId` thiếu cho từng action TỪ chính nhật ký chứa nó.
   *
   * Giữ nguyên lá chắn cho client cũ: một tab trước 17.A không gửi
   * `gameId` ở đâu cả, nên `runLog.gameId` rơi về `'k8s'` và mọi action
   * thừa kế `'k8s'` — đúng hành vi cũ từng bit. Cái được thêm là một
   * client Git chỉ cần khai `gameId` MỘT lần ở gốc.
   *
   * ⚠ Bộ phát lại kiểm `action.gameId` trước khi đưa xuống reducer và
   * NÉM khi lệch, nên một action thiếu trường này thành `phat-lai-loi`
   * — một lỗi CẤU HÌNH đọc ra thành "bộ mô phỏng hỏng".
   */
  .transform((log) => ({
    ...log,
    actions: log.actions.map((action) => ({
      ...action,
      gameId: action.gameId ?? log.gameId,
    })),
  }));

export const problemsRouter = createTRPCRouter({
  // ── Người học ─────────────────────────────────────────────────────────────

  /**
   * Kho bài cho người học.
   *
   * ⛔ `listProblemsForSolver`, KHÔNG phải `listProblems` — §18.B.4. Bản kia giữ
   * `objectives` nguyên vẹn cho trang soạn bài; gọi nhầm nó ở đây là gửi `check`
   * và `args` của cả hai mươi bài mỗi trang xuống trình duyệt.
   */
  list: protectedProcedure.input(listProblemsInput).query(async ({ ctx, input }) =>
    listProblemsForSolver(ctx.db, {
      visibility: problemVisibilityFor(ctx.user),
      viewerId: ctx.user.id,
      options: toListOptions(input),
    }),
  ),

  byCode: protectedProcedure.input(codeInput).query(async ({ ctx, input }) =>
    getProblemForViewer(ctx.db, problemVisibilityFor(ctx.user), ctx.user.id, input.code),
  ),

  /**
   * Mở một gợi ý.
   *
   * Là MUTATION chứ không phải query, và đó không phải chuyện quy ước REST: lời
   * gọi này GHI một dòng vào `problem_hint_reveals`, và dòng đó là thứ quyết
   * định điểm trừ lúc nộp bài. Một query có tác dụng phụ sẽ bị mọi tầng cache
   * (React Query, prefetch của Next) chạy lại tuỳ ý.
   *
   * Chỉ mở được gợi ý của bài NHÌN THẤY ĐƯỢC — mệnh đề tầm nhìn nằm trong câu
   * `WHERE`, nên biết mã một bài `draft` cũng không rút được gợi ý của nó ra.
   */
  revealHint: protectedProcedure
    .input(codeInput.extend({ hintId: z.string().min(1).max(64) }).strict())
    .mutation(async ({ ctx, input }): Promise<ProblemHintTeaser> => {
      const rows = await ctx.db
        .select()
        .from(problems)
        .where(
          and(eq(problems.code, input.code), visibleProblemWhere(problemVisibilityFor(ctx.user))),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
      }
      const hint = findHint(row.hints, input.hintId);
      if (hint === null) {
        // Khác thông điệp với ca trên: "bài không có" nghĩa là sai đường dẫn,
        // còn "gợi ý không có" nghĩa là giao diện đang giữ một bản đề đã cũ.
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bài này không có gợi ý đó' });
      }
      await recordHintReveal(ctx.db, ctx.user.id, input.code, hint.id);
      return { id: hint.id, penaltyPoints: hint.penaltyPoints, revealed: true, text: hint.text };
    }),

  /**
   * Nộp bài — máy chủ CHẤM LẠI bằng phát lại nhật ký.
   *
   * `runLog` và `claimed` đều do client gửi, và cả hai đều KHÔNG được tin: điểm
   * chỉ được công nhận khi chạy lại `runLog` cho ra đúng `claimed`. Xem
   * `server/problems/submit.ts`.
   *
   * Input CỐ Ý không `.strict()` ở phần `runLog`/`claimed`: chúng là kiểu của
   * `packages/games` và sẽ dày lên khi engine dày lên, còn `verifyRun` đã tự
   * kiểm hình dạng nhật ký (`logShapeError`) và tự từ chối `kind` lạ. Một
   * `.strict()` ở đây sẽ biến mỗi lần engine thêm field thành một 400 cho mọi
   * người chơi đang mở tab.
   */
  submit: protectedProcedure
    .input(
      z
        .object({
          code: problemCodeSchema,
          /*
           * `gameId` thêm ở 17.A và CÓ `.default('k8s')` ở cả hai tầng, cố ý.
           *
           * Nhật ký do client dựng và một tab đang mở vẫn đang chạy bản trước
           * 17.A — nhật ký nó gửi lên KHÔNG có `gameId` ở đâu cả. Bắt buộc
           * trường này là biến mọi lượt nộp đang bay trên dây thành 400, và
           * người chơi mất lượt vừa chơi xong mà không hiểu vì sao.
           *
           * Giá trị mặc định vẫn là `'k8s'` vì mọi nhật ký THIẾU trường này đều
           * tới từ một client trước 17.A, và hồi đó chỉ có game K8s.
           *
           * ⛔ **Chú thích cũ ở đây viết "Một game khác sẽ có endpoint của nó,
           * không dùng lại chỗ này". Câu đó KHÔNG còn đúng, và giữ nó lại sẽ dẫn
           * người sau đi dựng một endpoint thứ hai không cần thiết.**
           *
           * Nó được viết khi máy chủ mới chấm được K8s. Từ 18.C, `submitProblem`
           * tự tách đường theo `gameId` bên trong (`problemAsGitLevel` và
           * `gitProblemReplayEngine` đứng cạnh bản K8s). Một endpoint thứ hai khi
           * đó sẽ nhân đôi bốn thứ không liên quan gì tới game: xác thực, trần
           * nhịp nộp, `MAX_LOG_ACTIONS`, và ba cổng của kỳ thi — rồi chúng sẽ
           * trôi khỏi nhau ở đúng cái ai đó chỉ sửa một bên.
           *
           * ⚠ `actions[].gameId` KHÔNG mặc định `'k8s'` mà **thừa kế từ
           * `runLog.gameId`** ngay dưới. Chốt cứng `'k8s'` ở đó là một cái bẫy chỉ
           * lộ ra khi game thứ hai tới: một client Git gửi action không kèm
           * `gameId` sẽ nhận `'k8s'`, rồi phép kiểm nhất quán bên dưới từ chối
           * chính lượt nộp hợp lệ của nó.
           */
          runLog: runLogInput,
          /*
           * §18.G — lượt nộp TRONG một kỳ thi mang theo `examId`.
           *
           * `.optional()`, và đó là điều kiện để nó không phá gì: mọi lượt nộp
           * ngoài kỳ thi (toàn bộ lưu lượng hôm nay) đi qua đây không đổi một
           * dòng nào. Chỉ khi trường này có mặt thì ba cổng của kỳ thi mới chạy.
           *
           * ⚠ Nó KHÔNG phải một lời khai đáng tin: ai cũng gửi lên được một
           * `examId` bất kỳ. Thứ làm nó an toàn là `getExamForStudent` lọc theo
           * tư cách thành viên lớp, và `getAttemptFor` lọc theo `ctx.user.id` —
           * một `examId` của lớp khác trả NOT_FOUND. Nói cách khác, trường này
           * chọn LUẬT áp dụng, không cấp quyền nào.
           */
          examId: z.string().uuid().optional(),
          claimed: z.object({
            // Không `.default()` ở đây, khác `runLog.gameId`: `claimed` do client
            // dựng TƯỜNG MINH ở mỗi lượt nộp, không có bản cũ nào thiếu nó.
            gameId: z.enum(GAME_IDS),
            levelId: z.string().min(1),
            seed: z.number().int(),
            startedAt: z.number().int(),
            finishedAt: z.number().int(),
            objectivesMet: z.array(z.string()).readonly(),
            objectivesTotal: z.number().int().min(0),
            commandsUsed: z.number().int().min(0),
            hintsUsed: z.number().int().min(0),
            score: z.number().int().min(0),
          }),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(problems)
        // `published` bắt buộc, không chỉ "nhìn thấy được": một tác giả nộp bài
        // vào bản nháp của chính mình sẽ đẩy `attemptCount` của một bài chưa ra
        // mắt, và số liệu đó là thứ người học dựa vào để chọn bài.
        .where(and(eq(problems.code, input.code), eq(problems.state, 'published')))
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
      }
      /*
       * ⚠ Chú thích cũ ở đây ghi rằng cổng theo `gameId` "đã báo lead" và chưa
       * có. Đo lại 2026-09-15: nó CÓ, ở `problems/submit.ts` — một bài không
       * phải K8s nhận `INTERNAL_SERVER_ERROR` với câu gọi đúng tên game. Giữ
       * câu này thay vì xoá đè, vì một dòng "chưa làm" còn lại trên một việc đã
       * làm sẽ khiến người sau đi làm lần thứ hai.
       */
      /*
       * ⚠ Phép kiểm *"`gameId` của nhật ký và của lời khai phải khớp `gameId` của
       * CHÍNH BÀI"* KHÔNG nằm ở đây — nó ở `submitProblem` (`problems/submit.ts`).
       *
       * Nó sinh ra CÙNG LÚC với việc nới ba `z.literal('k8s')` ở trên, không phải
       * sau đó: trước khi nới, schema chỉ nhận đúng một giá trị nên không có gì
       * để lệch. Nới mà không kèm nó là mở một lỗ trong cùng một lượt sửa — hai
       * nguồn trả lời cùng một câu hỏi (`verifyProblemRun` tra engine theo
       * `problem.gameId`, `gradeSubmission` tra plugin theo `log.gameId`), nên
       * một nhật ký khai `'k8s'` nộp vào bài Git sẽ phát lại trên engine Git rồi
       * **chấm bằng plugin K8s**.
       *
       * Đặt ở tầng hàm chứ không tầng router vì `submitProblem` có caller khác
       * ngoài đường HTTP này. Một bản sao ở đây sẽ là cổng thứ hai cho cùng một
       * luật, và hai bản của một luật thì trôi khỏi nhau ở đúng cái ai đó chỉ sửa
       * một bên.
       */
      await assertExamRules(ctx, input, row.code);
      return submitProblem(
        ctx.db,
        toProblemDTO(row),
        ctx.user.id,
        input.runLog as never,
        input.claimed as never,
      );
    }),

  /**
   * Chấm THỬ một lượt chơi — không ghi gì, không tính là một lượt nộp.
   *
   * Vì sao nó tồn tại (và vì sao hai đường kia bị loại) nằm ở khối chú thích của
   * `tryGradeProblem` trong `problems/submit.ts`. Tóm tắt: `toTestcaseTeasers`
   * cắt `check`/`args` của mọi testcase nên client **không tự chấm được**, và
   * không có đường này thì mọi lượt chơi ĐÚNG của người học trả về `CE`.
   *
   * ⛔ Là MUTATION chứ không phải query, dù nó không ghi một dòng nào. Hai lý do,
   * cả hai đều cơ học chứ không phải quy ước REST:
   *
   *  1. Nó tiêu một suất của trần nhịp dùng chung với `submit`. Một query bị mọi
   *     tầng cache (React Query, prefetch của Next) chạy lại tuỳ ý, và mỗi lượt
   *     chạy lại đó ăn một suất người dùng không hề tiêu.
   *  2. Nhật ký là một mảng tới 20.000 phần tử. Query của tRPC đi bằng `GET` với
   *     input trong URL, và một nhật ký thật sẽ vượt trần độ dài URL của proxy
   *     trước khi tới được máy chủ.
   *
   * ⚠ KHÔNG nhận `examId`. Trong một kỳ thi, "thử xem đạt chưa" là một câu hỏi
   * khác hẳn và nó phải đi qua ba cổng của kỳ thi (`assertExamRules`) chứ không
   * đi vòng — mở nó ở đây là mở một đường chấm không bị đồng hồ thi ràng buộc.
   */
  tryGrade: protectedProcedure
    .input(z.object({ code: problemCodeSchema, runLog: runLogInput }).strict())
    .mutation(async ({ ctx, input }) => {
      // `published` bắt buộc, cùng lý do và cùng mệnh đề với `submit`: một bài
      // nháp chấm thử được nghĩa là nội dung chưa ra mắt đã rò qua kết quả chấm.
      const rows = await ctx.db
        .select()
        .from(problems)
        .where(and(eq(problems.code, input.code), eq(problems.state, 'published')))
        .limit(1);
      const row = rows[0];
      if (row === undefined) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
      }
      return tryGradeProblem(toProblemDTO(row), ctx.user.id, input.runLog as never);
    }),

  mySubmissions: protectedProcedure
    .input(listInputSchema.extend({ code: problemCodeSchema }))
    .query(async ({ ctx, input }) =>
      listMySubmissions(ctx.db, ctx.user.id, input.code, input.limit, input.cursor),
    ),

  // ── Người soạn ────────────────────────────────────────────────────────────

  /**
   * Bài CỦA TÔI, mọi state.
   *
   * Thủ tục riêng chứ không phải một cờ trên `list`: `ProblemFilter` của hợp
   * đồng KHÔNG có field chủ sở hữu, và thêm một field vào đó là sửa hợp đồng của
   * lead. `admin` thấy mọi bài, cùng luật `assertProblemOwner`.
   */
  mine: authorProcedure.input(listProblemsInput).query(async ({ ctx, input }) =>
    listProblems(ctx.db, {
      visibility: problemVisibilityFor(ctx.user),
      viewerId: ctx.user.id,
      options: toListOptions(input),
      authorScope: ctx.user.role === 'admin' ? null : ctx.user.id,
    }),
  ),

  create: authorProcedure
    .input(problemBodySchema)
    .mutation(async ({ ctx, input }) => createProblem(ctx.db, ctx.user.id, input)),

  update: authorProcedure
    .input(problemUpdateSchema)
    .mutation(async ({ ctx, input }) => updateProblem(ctx.db, ctx.user, input.code, input.body)),

  publish: authorProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => publishProblem(ctx.db, ctx.user, input.code)),

  archive: authorProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => archiveProblem(ctx.db, ctx.user, input.code)),

  delete: authorProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => deleteProblem(ctx.db, ctx.user, input.code)),

  /** Bản ĐẦY ĐỦ để nạp vào trình soạn — gợi ý nguyên văn, kèm cổng chủ sở hữu. */
  forEdit: authorProcedure.input(codeInput).query(async ({ ctx, input }) => {
    const row = await findProblemForWrite(ctx.db, ctx.user, input.code);
    return toProblemDTO(row);
  }),
});

/**
 * Ba cổng của một lượt nộp TRONG kỳ thi (§18.G, "cổng số 1").
 *
 * Không có `examId` thì không làm gì cả — mọi lượt nộp ngoài kỳ thi đi qua đây
 * không đổi một dòng nào, và seed do người nộp mang lên vẫn là hành vi CỐ Ý của
 * hợp đồng (`core/problem.ts` § `Submission.seed`).
 *
 * ## Vì sao cổng nằm ở ĐÂY chứ không trong `submitProblem`
 *
 * `submitProblem` trả lời câu "bài làm này đúng tới đâu". Cổng này trả lời câu
 * "lượt nộp này có được tính không" — hai câu khác nhau, và gộp chúng sẽ bắt
 * `submitProblem` phải biết về kỳ thi, tức nó không dùng lại được cho đường nộp
 * thường. Cổng chạy TRƯỚC, nên một lượt bị từ chối không tốn một lượt phát lại
 * toàn bộ nhật ký.
 *
 * ## `FORBIDDEN` chứ không `BAD_REQUEST`
 *
 * Người nộp không gửi lên dữ liệu hỏng; họ gửi một lượt hợp lệ mà luật kỳ thi
 * không nhận. `BAD_REQUEST` sẽ dẫn họ đi sửa bài làm, trong khi thứ cần sửa là
 * việc họ đã hết giờ, hoặc đang làm một bài ngoài đề.
 */
async function assertExamRules(
  ctx: { db: Database; user: { id: string } },
  input: { examId?: string | undefined; runLog: { seed: number } },
  problemCode: string,
): Promise<void> {
  if (input.examId === undefined) {
    return;
  }
  const now = new Date();
  // Lọc theo tư cách thành viên lớp. Một `examId` của lớp khác trả NOT_FOUND ở
  // đây, nên trường `examId` trên dây không cấp thêm quyền nào.
  const exam = await getExamForStudent(ctx.db, input.examId, ctx.user.id);
  const attempt = await getAttemptFor(ctx.db, input.examId, ctx.user.id);
  if (attempt === null) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Bạn chưa mở lượt thi này, nên bài nộp không được tính',
    });
  }
  const rejection = examSubmissionRejection(
    {
      problemCodes: exam.problemCodes,
      attemptSeed: attempt.seed,
      attempt,
      closesAt: exam.closesAt,
    },
    { problemCode, seed: input.runLog.seed },
    now,
  );
  if (rejection !== null) {
    throw new TRPCError({ code: 'FORBIDDEN', message: rejection });
  }
}
