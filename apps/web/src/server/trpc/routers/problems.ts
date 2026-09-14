import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ProblemHintTeaser } from '@devops-platform/games';
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
import { submitProblem } from '../../problems/submit';
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
           * Giá trị mặc định đúng là `'k8s'` vì đây là endpoint nộp bài OJ của
           * game K8s — `claimed.gameId` ngay bên dưới đã chốt `z.literal('k8s')`
           * từ trước. Một game khác sẽ có endpoint của nó, không dùng lại chỗ này.
           *
           * ⚠ Mặc định ở CẢ `actions[]`, không chỉ ở gốc: `sessionReplayEngine`
           * kiểm `action.gameId !== 'k8s'` trước khi đưa xuống reducer K8s và
           * NÉM khi lệch, nên một action thiếu `gameId` sẽ thành `phat-lai-loi`
           * cho mọi lượt nộp từ client cũ.
           */
          runLog: z.object({
            gameId: z.literal('k8s').default('k8s'),
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
                  gameId: z.literal('k8s').default('k8s'),
                  kind: z.string(),
                  tick: z.number(),
                }),
              )
              .max(MAX_LOG_ACTIONS, {
                message: `Nhật ký lượt chơi vượt trần ${String(MAX_LOG_ACTIONS)} hành động`,
              })
              .readonly(),
          }),
          claimed: z.object({
            gameId: z.literal('k8s'),
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
       * ⚠ NỢ ĐÃ GHI TÊN, phát hiện khi dọn 18.A nhưng KHÔNG sửa được ở đây.
       *
       * Thủ tục này tra bài CHỈ theo `code` + `state`. Từ migration 0015 bảng có
       * cột `game_id`, nên một bài `game_id = 'git'` đi lọt vào đây rồi được giao
       * cho một đường chấm chỉ biết K8s. Trước 0015 chuyện đó bất khả vì mọi
       * dòng đều là K8s — cổng thiếu này KHÔNG phải mã chết, nó mới vừa thành
       * mã có đường tới. Cổng theo `gameId` thuộc `submit.ts`/§18.G. Đã báo lead.
       */
      return submitProblem(
        ctx.db,
        toProblemDTO(row),
        ctx.user.id,
        input.runLog as never,
        input.claimed as never,
      );
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
