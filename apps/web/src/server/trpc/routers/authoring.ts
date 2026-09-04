import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  CONTENT_KINDS,
  MAX_CONTENT_ASSET_BYTES,
  contentAssetFilenameSchema,
  contentStorageKeySchema,
  type ContentKind,
} from '@devops-platform/shared-types/authoring';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
  SCENARIO_DIFFICULTIES,
  scenarioIdSchema,
} from '@devops-platform/shared-types/scenario';
import { labTaskIdSchema } from '@devops-platform/shared-types/lab';
import { normalizeNewlines } from '@devops-platform/scenario/content-blocks';
import { assertContentOwner, visibilityFor } from '../../content/authz';
import {
  deleteContentAsset,
  listContentAssets,
  storeContentAsset,
} from '../../content/assets';
import { isPublishTrialStale, runPublishTrial } from '../../content/publish';
import {
  contentIdTaken,
  findContentForWrite,
  listAuthoredBy,
  loadBodyForWrite,
} from '../../content/repository';
import { contentSourceFor } from '../../content/source';
import { validateForPublish } from '../../content/validate';
import { contentItems, contentSteps } from '../../db/schema';
import { authorProcedure, createTRPCRouter } from '../init';

/**
 * Router SOẠN BÀI (P9) — API GHI, và là bề mặt rủi ro cao nhất của cả dự án
 * theo bảng của phase-9 (IDOR score **20**).
 *
 * ## Luật 1 ở dạng mạnh: KHÔNG procedure nào nhận `authorId`
 *
 * Task 3 nói thẳng: *"procedure soạn bài không nhận `authorId` từ input — lấy
 * từ `ctx.user.id`"*. Đó không phải một quy ước phong cách. Một field
 * `authorId` trong input schema là một field kẻ tấn công điền được, và mọi
 * kiểm tra sau đó so sánh giá trị họ cung cấp với chính nó.
 *
 * Cách làm ở đây là **field đó không tồn tại**: không có input schema nào dưới
 * đây khai `authorId`, và chủ sở hữu luôn tới từ hai chỗ — `ctx.user.id` khi
 * TẠO, và cột `author_id` ĐỌC TỪ DB khi SỬA (`assertContentOwner`). Test
 * `authoring-idor.test.ts` khẳng định điều đó bằng cách duyệt chính input
 * schema, chứ không bằng cách đọc file này.
 *
 * ## Hai cổng, không phải một
 *
 * 1. `authorProcedure` — "có được soạn bài nói chung không" (role).
 * 2. `assertContentOwner` — "bài NÀY có phải của bạn không" (object-level).
 *
 * Bỏ cổng 2 thì mọi `author` sửa được bài của mọi `author` khác. Cổng 1 một
 * mình *trông như* đã đủ, và đó chính là hình dạng của lỗi.
 */

/**
 * Text người soạn nhập, CHUẨN HOÁ về `
` ngay tại biên ghi.
 *
 * ⛔ Không phải chuyện thẩm mỹ. Hai hậu quả cụ thể của việc để `` lọt vào DB:
 *
 * 1. **Script chạy bằng bash.** `verifyScript` / `setup.*` đi thẳng tới
 *    `GATEWAY_EXEC_SHELL` (mặc định `bash`) mà không qua parser nào. CRLF ở đó
 *    là `$'': command not found` ở MỖI dòng — cùng chế độ hỏng mà
 *    `.gitattributes` đã ghi cho `*.sh` và `images/sandbox-base/skel/**`.
 * 2. **Markdown mất sạch nút bấm.** `parseContentBlocks` đã tự chuẩn hoá nên
 *    đường đọc an toàn, nhưng lưu bản CRLF nghĩa là byte trong DB khác byte mọi
 *    consumer khác thấy — một phép so, một lượt tìm kiếm, hay một cổng đọc thô
 *    sẽ lệch mà không ai biết vì sao.
 *
 * Dùng LẠI `normalizeNewlines` của `packages/scenario` (SSOT) thay vì một
 * `replace` thứ hai ở đây.
 */
const lfText = z.string().transform(normalizeNewlines);

/** Như `lfText` nhưng cho phép `null` (script/hint vắng mặt là hợp lệ). */
const lfTextNullable = z.string().transform(normalizeNewlines).nullable().default(null);

const stepInput = z
  .object({
    /** LAB: id BỀN của task. LESSON: `null` — vị trí LÀ định danh. */
    taskId: labTaskIdSchema.nullable().default(null),
    title: z.string().min(1).nullable().default(null),
    markdown: lfText,
    setupForeground: lfTextNullable,
    setupBackground: lfTextNullable,
    verifyScript: lfTextNullable,
    weight: z.number().int().positive().nullable().default(null),
    hint: lfTextNullable,
  })
  .strict();

const phaseInput = z
  .object({
    title: z.string().nullable().default(null),
    markdown: lfText,
    setup: z
      .object({
        foreground: lfTextNullable,
        background: lfTextNullable,
      })
      .strict(),
    verifyScript: lfTextNullable,
  })
  .strict();

/**
 * Phần soạn được của một bài.
 *
 * ⛔ Cố ý VẮNG MẶT: `authorId` (luật 1), `state` (đổi qua `publish`/`archive`,
 * không qua một field), `publishedAt`/`publishError` (output của hệ thống, không
 * phải đầu vào của người soạn), `source` (bài soạn trên UI không có upstream).
 *
 * `.strict()` — một field lạ bị từ chối 400 thay vì bị nuốt. Đó là thứ chặn
 * `{ ..., authorId: "nạn-nhân" }` khỏi lọt vào một `insert` mở rộng sau này.
 */
const contentDraftInput = z
  .object({
    title: z.string().min(1),
    description: z.string().nullable().default(null),
    difficulty: z.enum(SCENARIO_DIFFICULTIES).nullable().default(null),
    estimatedMinutes: z.number().int().positive().nullable().default(null),
    tier: z.enum(SANDBOX_TIER_NAMES),
    capabilities: z.array(z.enum(SCENARIO_CAPABILITIES)).default([]),
    backendImageId: z.string().min(1),
    interfaceLayout: z.string().nullable().default(null),
    /** `ScenarioAsset[]` — chỉ thị copy file vào pod. KHÁC asset tải lên. */
    assets: z
      .array(
        z
          .object({
            host: z.string().min(1),
            file: z.string().min(1),
            target: z.string().min(1),
            chmod: z.string().nullable().default(null),
          })
          .strict(),
      )
      .default([]),
    intro: phaseInput.nullable().default(null),
    finish: phaseInput.nullable().default(null),
    setup: z
      .object({
        foreground: lfTextNullable,
        background: lfTextNullable,
      })
      .strict()
      .nullable()
      .default(null),
    passThresholdPercent: z.number().int().min(1).max(100).nullable().default(null),
    leaderboard: z.boolean().nullable().default(null),
    ttlSeconds: z.number().int().min(300).max(7200).nullable().default(null),
    steps: z.array(stepInput).default([]),
  })
  .strict();

const createInput = contentDraftInput
  .extend({ id: scenarioIdSchema, kind: z.enum(CONTENT_KINDS) })
  .strict();

const updateInput = contentDraftInput.extend({ id: scenarioIdSchema }).strict();

const idInput = z.object({ id: scenarioIdSchema }).strict();

type DraftInput = z.infer<typeof contentDraftInput>;

/** Cột của `content_items` suy từ input — KHÔNG bao gồm `authorId`/`state`. */
function itemColumns(input: DraftInput) {
  return {
    title: input.title,
    description: input.description,
    difficulty: input.difficulty,
    estimatedMinutes: input.estimatedMinutes,
    tier: input.tier,
    capabilities: input.capabilities,
    backendImageId: input.backendImageId,
    interfaceLayout: input.interfaceLayout,
    assets: input.assets,
    intro: input.intro,
    finish: input.finish,
    setup: input.setup,
    passThresholdPercent: input.passThresholdPercent,
    leaderboard: input.leaderboard,
    ttlSeconds: input.ttlSeconds,
  };
}

function stepRows(contentId: string, steps: readonly z.infer<typeof stepInput>[]) {
  return steps.map((step, ordinal) => ({
    id: randomUUID(),
    contentId,
    // `ordinal` từ VỊ TRÍ trong mảng, không từ input: cho người soạn tự đặt số
    // thứ tự nghĩa là nhận được một dãy có lỗ hoặc trùng, và
    // `scenarioStepSchema` đòi `index` liên tục 0-based.
    ordinal,
    taskId: step.taskId,
    title: step.title,
    markdown: step.markdown,
    setupForeground: step.setupForeground,
    setupBackground: step.setupBackground,
    verifyScript: step.verifyScript,
    weight: step.weight,
    hint: step.hint,
  }));
}

export const authoringRouter = createTRPCRouter({
  /**
   * Bài của CHÍNH tôi (admin: mọi bài), mọi state.
   *
   * ⚠ Đây — không phải `/lessons` — là nơi bài nháp hiện ra. Nguồn của
   * `/lessons` zero-arg và chỉ trả `published`, nên một bản nháp không lọt vào
   * catalog người học kể cả với tác giả của nó (xem `content/source.ts`).
   */
  list: authorProcedure.query(async ({ ctx }) => {
    const rows = await listAuthoredBy(ctx.db, ctx.user.role === 'admin' ? null : ctx.user.id);
    const now = new Date();
    return rows.map(({ record, stepCount }) => ({
      id: record.id,
      kind: record.kind,
      // Một bài `publishing` đã treo được BÁO CÁO là `draft`: đó là trạng thái
      // thật của nó (không có ai đang chạy thử), và hiện "đang xuất bản" mãi
      // mãi là nói dối người soạn. Trạng thái treo được TÍNH, không lưu.
      state:
        record.state === 'publishing' && isPublishTrialStale(record.publishStartedAt, now)
          ? ('draft' as const)
          : record.state,
      authorId: record.authorId,
      title: record.title,
      stepCount,
      publishError: record.publishError,
      updatedAt: record.updatedAt.toISOString(),
      publishedAt: record.publishedAt?.toISOString() ?? null,
    }));
  }),

  /** Xem trước ĐÚNG thứ người học sẽ thấy — qua chính nguồn hợp nhất, kèm tầm nhìn. */
  preview: authorProcedure.input(idInput).query(async ({ ctx, input }) => {
    const record = await findContentForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    const source = contentSourceFor(visibilityFor(ctx.user));
    switch (record.kind) {
      case 'lesson':
        return { kind: 'lesson' as const, lesson: await source.get(input.id) };
      case 'lab':
        return { kind: 'lab' as const, lab: await source.getLab(input.id) };
      case 'playground':
        return { kind: 'playground' as const, playground: await source.getPlayground(input.id) };
    }
  }),

  /**
   * Tạo bài mới — luôn ở `draft`.
   *
   * `authorId: ctx.user.id`, và đó là dòng duy nhất trong cả router đặt chủ sở
   * hữu. Không có nhánh nào cho phép nó tới từ nơi khác.
   */
  create: authorProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    if (await contentIdTaken(ctx.db, input.id)) {
      throw new TRPCError({ code: 'CONFLICT', message: `Id "${input.id}" đã có` });
    }
    // ⚠ KHÔNG kiểm trùng với nội dung trên ĐĨA ở đây, và đó là chủ ý: luật ưu
    // tiên (`docs/content-sources.md`) đã định nghĩa kết quả — đĩa thắng, bài DB
    // bị che, và composite ghi WARN. Chặn ở đây sẽ là một luật thứ hai, và nó sẽ
    // lệch khỏi luật thứ nhất khi nội dung vendored thêm/bớt bài. `publish` là
    // chỗ cảnh báo người soạn (xem dưới).
    await ctx.db.insert(contentItems).values({
      id: input.id,
      kind: input.kind,
      authorId: ctx.user.id,
      state: 'draft',
      ...itemColumns(input),
    });
    if (input.steps.length > 0) {
      await ctx.db.insert(contentSteps).values(stepRows(input.id, input.steps));
    }
    return { id: input.id };
  }),

  /**
   * Sửa bài.
   *
   * ## Sửa bài ĐÃ XUẤT BẢN không đổi nội dung dưới chân người đang học (task 20)
   *
   * Một bài `published` không sửa tại chỗ. Lần sửa đầu tiên tạo một **bản nháp
   * kế nhiệm** với id `<id>__draft`, và bản đang chạy giữ nguyên từng byte cho
   * tới khi bản nháp được `publish` (lúc đó nội dung của nó thay thế bản gốc,
   * atomically, trong một transaction).
   *
   * Cách sai — và cách gần như ai cũng thử trước — là "sửa tại chỗ rồi
   * `updatedAt` mới": người học đang ở bước 4 của bài 6 bước sẽ thấy bước 4 đổi
   * nội dung giữa chừng, hoặc tệ hơn, bài rút còn 3 bước và `progress.step_index
   * = 4` trỏ ra ngoài mảng.
   */
  update: authorProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const record = await findContentForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    if (record.state === 'published') {
      const draftId = draftIdFor(input.id);
      await ctx.db.transaction(async (tx) => {
        const existing = await findContentForWrite(tx, draftId);
        if (existing === null) {
          await tx.insert(contentItems).values({
            id: draftId,
            kind: record.kind,
            // Chủ sở hữu của bản nháp kế nhiệm là chủ của BẢN GỐC, không phải
            // người đang sửa: một admin sửa bài của tác giả khác không được
            // lặng lẽ chiếm quyền sở hữu bài đó.
            authorId: record.authorId,
            state: 'draft',
            ...itemColumns(input),
          });
        } else {
          await tx
            .update(contentItems)
            .set({ ...itemColumns(input), updatedAt: new Date() })
            .where(eq(contentItems.id, draftId));
          await tx.delete(contentSteps).where(eq(contentSteps.contentId, draftId));
        }
        if (input.steps.length > 0) {
          await tx.insert(contentSteps).values(stepRows(draftId, input.steps));
        }
      });
      return { id: draftId, supersedes: input.id };
    }

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(contentItems)
        .set({ ...itemColumns(input), updatedAt: new Date() })
        .where(eq(contentItems.id, input.id));
      // Thay TOÀN BỘ tập bước thay vì diff từng bước: một diff cần khoá bền cho
      // mỗi bước, và lesson không có (vị trí LÀ định danh). Xoá-rồi-chèn trong
      // MỘT transaction là nguyên tử; ngoài transaction nó là một cửa sổ mà bài
      // không có bước nào.
      await tx.delete(contentSteps).where(eq(contentSteps.contentId, input.id));
      if (input.steps.length > 0) {
        await tx.insert(contentSteps).values(stepRows(input.id, input.steps));
      }
    });
    return { id: input.id, supersedes: null };
  }),

  /** Validate + shellcheck mà KHÔNG đổi state — người soạn xem trước phán quyết. */
  check: authorProcedure.input(idInput).query(async ({ ctx, input }) => {
    const record = await findContentForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }
    assertContentOwner(ctx.user, record.authorId);
    const body = await loadBodyForWrite(ctx.db, input.id);
    if (body === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }
    return validateForPublish(record.kind, body);
  }),

  /**
   * Xuất bản: đổi sang `publishing` rồi chạy thử THẬT ngoài request (task 18).
   *
   * Trả về ngay với `state: 'publishing'`. FE hỏi lại `list`/`status` để biết
   * kết quả — `publishError` mang lý do khi trượt.
   */
  publish: authorProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const record = await findContentForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    const now = new Date();
    if (record.state === 'publishing' && !isPublishTrialStale(record.publishStartedAt, now)) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Bài đang chạy thử — đợi kết quả' });
    }

    const body = await loadBodyForWrite(ctx.db, input.id);
    if (body === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }

    // Chặn TRƯỚC khi tốn một sandbox: format sai thì lượt chạy thử không nói
    // thêm được gì, và nó tốn ~49 s cùng một pod của cụm.
    const { issues, scriptWarnings } = await validateForPublish(record.kind, body);
    if (issues.length > 0) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Nội dung không hợp lệ: ${issues.map((i) => `${i.path} — ${i.message}`).join('; ')}`,
      });
    }

    // Nguyên tử: chỉ MỘT lời gọi thắng khi hai pod cùng vào (xem chú thích đầu
    // `content/publish.ts` — thu hẹp cửa sổ, không phải một khoá thật).
    const claimed = await ctx.db
      .update(contentItems)
      .set({ state: 'publishing', publishStartedAt: now, publishError: null, updatedAt: now })
      .where(and(eq(contentItems.id, input.id), ne(contentItems.state, 'publishing')))
      .returning({ id: contentItems.id });
    if (claimed.length === 0) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Bài đang chạy thử — đợi kết quả' });
    }

    const db = ctx.db;
    const actor = { userId: ctx.user.id, role: ctx.user.role };
    // Cố ý KHÔNG `await`: lượt chạy thử sống ngoài request. `runPublishTrial`
    // tự bắt mọi lỗi và tự ghi kết quả — nó không được phép ném, nếu không thì
    // bài kẹt `publishing` cho tới khi hết hạn treo.
    // Bản nháp kế nhiệm (`<id>__draft`) xuất bản bằng cách ĐỔI NGÔI: nội dung
    // của nó thay thế bài gốc và bản nháp biến mất. `promoteTo` là bài gốc đó,
    // và nó được suy từ CHÍNH id chứ không từ input — một field `promoteTo`
    // trong input sẽ là một đường ghi đè lên bài bất kỳ.
    const promoteTo = basePublishedIdFor(input.id);
    void runPublishTrial(db, input.id, record.kind, body, actor, promoteTo).catch((cause: unknown) => {
      console.error('[authoring] lượt chạy thử ném ra ngoài — đây là một bug', {
        id: input.id,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    });

    return { id: input.id, state: 'publishing' as const, scriptWarnings };
  }),

  /**
   * Thu hồi — `archive`, KHÔNG xoá (task 19).
   *
   * `progress.lesson_id` và `lab_attempts.lab_id` là cột text KHÔNG có foreign
   * key, nên xoá một bài không làm chúng lỗi: nó làm chúng trỏ vào hư không
   * trong im lặng, và tiến độ của người học biến mất khỏi màn hình mà không ai
   * biết vì sao.
   */
  archive: authorProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const record = await findContentForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }
    assertContentOwner(ctx.user, record.authorId);
    await ctx.db
      .update(contentItems)
      .set({ state: 'archived', updatedAt: new Date() })
      .where(eq(contentItems.id, input.id));
    return { id: input.id, state: 'archived' as const };
  }),

  listAssets: authorProcedure.input(idInput).query(async ({ ctx, input }) => {
    const record = await findContentForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
    }
    assertContentOwner(ctx.user, record.authorId);
    return listContentAssets(ctx.db, input.id);
  }),

  /**
   * Tải asset lên.
   *
   * Bytes tới dưới dạng base64 vì tRPC là JSON — không phải multipart. Trần
   * được kiểm TRƯỚC khi decode: một chuỗi base64 4 MB decode ra 3 MB, và kiểm
   * sau decode nghĩa là đã cấp phát 3 MB cho một request sẽ bị từ chối.
   */
  uploadAsset: authorProcedure
    .input(
      z
        .object({
          id: scenarioIdSchema,
          filename: contentAssetFilenameSchema,
          base64: z.string().max(Math.ceil((MAX_CONTENT_ASSET_BYTES * 4) / 3) + 8),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      const record = await findContentForWrite(ctx.db, input.id);
      if (record === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
      }
      assertContentOwner(ctx.user, record.authorId);
      const bytes = Buffer.from(input.base64, 'base64');
      return storeContentAsset(ctx.db, input.id, { filename: input.filename, bytes });
    }),

  deleteAsset: authorProcedure
    .input(z.object({ id: scenarioIdSchema, storageKey: contentStorageKeySchema }).strict())
    .mutation(async ({ ctx, input }) => {
      const record = await findContentForWrite(ctx.db, input.id);
      if (record === null) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
      }
      assertContentOwner(ctx.user, record.authorId);
      const removed = await deleteContentAsset(ctx.db, input.id, input.storageKey);
      if (!removed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có asset đó' });
      }
      return { storageKey: input.storageKey };
    }),
});

/**
 * Id của bản nháp kế nhiệm cho một bài đã xuất bản (task 20).
 *
 * `__draft` — hai gạch dưới, và `scenarioIdSchema` KHÔNG cho phép ký tự `_`.
 * Đó là chủ ý: một id nháp không bao giờ va vào một id người soạn tự đặt được,
 * và nó cũng không bao giờ lọt vào `/lessons` (nguồn chỉ trả `published`, và
 * bản nháp luôn `draft`).
 */
export function draftIdFor(publishedId: string): string {
  return `${publishedId}${DRAFT_SUFFIX}`;
}

/**
 * Nghịch đảo của `draftIdFor`: bài đang chạy mà id này kế nhiệm, hoặc `null`.
 *
 * Suy từ chính chuỗi id, KHÔNG từ một cột `supersedes` và KHÔNG từ input. Một
 * cột sẽ cần giữ đồng bộ với id; một field input sẽ cho phép "xuất bản bản nháp
 * của tôi ĐÈ LÊN bài của người khác" — đúng lỗ IDOR mà cả router này được viết
 * để đóng.
 */
export function basePublishedIdFor(id: string): string | null {
  return id.endsWith(DRAFT_SUFFIX) ? id.slice(0, -DRAFT_SUFFIX.length) : null;
}

const DRAFT_SUFFIX = '__draft';

export type ContentKindName = ContentKind;
