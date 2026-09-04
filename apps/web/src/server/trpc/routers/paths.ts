import { TRPCError } from '@trpc/server';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { normalizeNewlines } from '@devops-platform/scenario/content-blocks';
import {
  isItemUnlocked,
  nextItemIdOf,
  passedCountOf,
  pathItemKey,
  viewPathItems,
  type PathItemRef,
  type PathItemRow,
} from '@devops-platform/scenario/path-progress';
import { scenarioIdSchema } from '@devops-platform/shared-types/scenario';
import {
  PATH_ITEM_KINDS,
  type LearningPathDetail,
  type LearningPathSummary,
} from '@devops-platform/shared-types/path';
import { assertContentOwner } from '../../content/authz';
import type { Database } from '../../db/client';
import { learningPathItems, learningPaths } from '../../db/schema';
import { loadItemTitles, loadPassedItemKeys } from '../../paths/progress';
import {
  authorProcedure,
  createTRPCRouter,
  listInputSchema,
  protectedProcedure,
  MAX_LIST_LIMIT,
} from '../init';

/**
 * `paths.*` — lộ trình (P10 10.A).
 *
 * ⛔ RANH GIỚI: một lộ trình CHỈ là cách nhóm nội dung có thứ tự. Không giá,
 * không gói cước, không entitlement. Quyền truy cập vẫn chỉ là ĐĂNG NHẬP —
 * `protectedProcedure` là toàn bộ cổng, và không có cổng thứ hai nào kiểm "đã
 * mua chưa". Nếu một procedure ở đây bắt đầu cần điều đó, phạm vi đã trượt sang
 * thương mại: dừng và hỏi chủ dự án.
 *
 * ## Luật 1: `paths.get` không nhận `userId`
 *
 * Trạng thái từng item là trạng thái của CHÍNH người gọi, lấy từ `ctx.user.id`.
 * Không có field nào để client nói mình là ai — hình thức mạnh nhất của luật 1
 * (không phải "kiểm rồi cho qua" mà "không có gì để kiểm").
 */

const idInput = z.object({ pathId: scenarioIdSchema }).strict();

const itemInput = z
  .object({
    kind: z.enum(PATH_ITEM_KINDS),
    itemId: scenarioIdSchema,
  })
  .strict();

const lfText = z.string().transform(normalizeNewlines);

/**
 * ⛔ CỐ Ý VẮNG MẶT: `authorId` (luật 1), `state` (đổi qua `publish`/`archive`).
 *
 * `items` mang thứ tự Ở CHÍNH MẢNG — `ordinal` sinh từ vị trí, không phải một
 * số người soạn tự đánh. Hai item cùng số sẽ là một lỗi unique-index khó hiểu
 * thay vì một thứ tự rõ ràng.
 */
const pathBodyInput = z
  .object({
    title: z.string().min(1),
    description: lfText.nullable().default(null),
    sequential: z.boolean().default(false),
    items: z.array(itemInput).max(MAX_LIST_LIMIT),
  })
  .strict();

const createInput = pathBodyInput.extend({ id: scenarioIdSchema }).strict();
const updateInput = pathBodyInput.extend({ id: scenarioIdSchema }).strict();
const openItemInput = idInput.extend(itemInput.shape).strict();

// ---------------------------------------------------------------- helper

async function findPathForWrite(db: Database, pathId: string) {
  const [row] = await db
    .select()
    .from(learningPaths)
    .where(eq(learningPaths.id, pathId))
    .limit(1);
  return row ?? null;
}

/**
 * Chi tiết lộ trình KÈM trạng thái từng item cho một người học cụ thể.
 *
 * Dùng ở HAI chỗ và đó là điều làm ổ khoá thành ổ khoá thật: `get` (để vẽ) và
 * `openItem` (để chặn). Xem `path-progress.ts` — nếu luật chỉ chạy ở chỗ vẽ thì
 * nó là một hình minh hoạ, không phải một ràng buộc.
 */
async function readPathDetail(
  db: Database,
  userId: string,
  pathId: string,
  visible: readonly ('draft' | 'published' | 'archived')[],
): Promise<LearningPathDetail> {
  const [path] = await db
    .select()
    .from(learningPaths)
    .where(eq(learningPaths.id, pathId))
    .limit(1);

  if (path === undefined || !visible.includes(path.state)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có lộ trình đó' });
  }

  const itemRows = await db
    .select()
    .from(learningPathItems)
    .where(eq(learningPathItems.pathId, pathId))
    .orderBy(asc(learningPathItems.ordinal))
    // Luật 4 — cap cứng ở server. Một lộ trình dài hơn 100 item là một lộ trình
    // cần chia nhỏ, không phải một trang cần cuộn lâu hơn.
    .limit(MAX_LIST_LIMIT);

  const refs: PathItemRef[] = itemRows.map((row) => ({ kind: row.itemKind, itemId: row.itemId }));
  const [passedKeys, titles] = await Promise.all([
    loadPassedItemKeys(db, userId, refs),
    loadItemTitles(db, refs),
  ]);

  const rows: PathItemRow[] = itemRows.map((row) => {
    const key = pathItemKey({ kind: row.itemKind, itemId: row.itemId });
    return {
      ordinal: row.ordinal,
      kind: row.itemKind,
      itemId: row.itemId,
      title: titles.get(key) ?? null,
      passed: passedKeys.has(key),
    };
  });

  const items = viewPathItems(rows, path.sequential);

  return {
    id: path.id,
    title: path.title,
    description: path.description,
    sequential: path.sequential,
    // Cả ba con số dưới đây TÍNH lúc đọc — không cột nào lưu chúng (AC #2).
    itemCount: items.length,
    passedCount: passedCountOf(items),
    nextItemId: nextItemIdOf(items),
    items: [...items],
  };
}

/** `itemCount` cho danh sách — TÍNH bằng một truy vấn đếm, không phải một cột. */
async function withItemCounts(
  db: Database,
  paths: readonly { id: string; title: string; description: string | null; sequential: boolean }[],
): Promise<readonly LearningPathSummary[]> {
  if (paths.length === 0) {
    return [];
  }
  const rows = await db
    .select({ pathId: learningPathItems.pathId })
    .from(learningPathItems)
    .where(
      inArray(
        learningPathItems.pathId,
        paths.map((path) => path.id),
      ),
    );

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.pathId, (counts.get(row.pathId) ?? 0) + 1);
  }

  return paths.map((path) => ({
    id: path.id,
    title: path.title,
    description: path.description,
    sequential: path.sequential,
    itemCount: counts.get(path.id) ?? 0,
  }));
}

// ---------------------------------------------------------------- router

export const pathsRouter = createTRPCRouter({
  /** Lộ trình đã xuất bản. Luật 4 — `limit` bị ÉP về ≤100. */
  list: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(learningPaths)
      .where(
        input.cursor === undefined
          ? eq(learningPaths.state, 'published')
          : and(eq(learningPaths.state, 'published'), gt(learningPaths.id, input.cursor)),
      )
      .orderBy(asc(learningPaths.id))
      .limit(input.limit + 1);

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: await withItemCounts(ctx.db, page),
      limit: input.limit,
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }),

  /** Chi tiết + trạng thái từng item của CHÍNH người gọi (task 5). */
  get: protectedProcedure
    .input(idInput)
    .query(async ({ ctx, input }): Promise<LearningPathDetail> => {
      return readPathDetail(ctx.db, ctx.user.id, input.pathId, ['published']);
    }),

  /**
   * Cổng MỞ một item trong lộ trình — đây là chỗ ổ khoá `sequential` được THI
   * HÀNH (AC #3: *"gọi thẳng API item bị khoá vẫn bị từ chối"*).
   *
   * ⚠ Phạm vi, nói thẳng vì nó dễ bị đọc rộng hơn thực tế: khoá là thuộc tính
   * của MỘT LỘ TRÌNH, không phải của bài. Cùng một lab nằm ở hai lộ trình có
   * thể bị khoá ở lộ trình này và mở ở lộ trình kia, và một bài truy cập trực
   * tiếp qua `/lessons/<id>` (ngoài mọi lộ trình) vẫn mở — đúng như thiết kế,
   * vì học tự do là mặc định của cả hệ thống (task 4).
   *
   * Điều procedure này bảo đảm: KHÔNG có đường nào đi *qua lộ trình* để lấy một
   * item đang khoá, kể cả khi client bỏ qua giao diện và gọi thẳng API. Luật
   * được tính lại ở server từ tiến độ thật, không đọc bất cứ thứ gì client gửi.
   */
  openItem: protectedProcedure.input(openItemInput).mutation(async ({ ctx, input }) => {
    const detail = await readPathDetail(ctx.db, ctx.user.id, input.pathId, ['published']);
    const ref: PathItemRef = { kind: input.kind, itemId: input.itemId };

    const belongs = detail.items.some((item) => pathItemKey(item) === pathItemKey(ref));
    if (!belongs) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Item không thuộc lộ trình này' });
    }
    if (!isItemUnlocked(detail.items, ref)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Item còn khoá — hoàn thành item trước đó đã',
      });
    }

    return { kind: ref.kind, itemId: ref.itemId };
  }),

  /**
   * Trang "của tôi" (10.E task 14) — lộ trình đang học kèm item kế tiếp.
   *
   * ⚠ Task 15, bẫy đã trả giá ở P2: nhãn phải nói ĐÚNG thứ nó biết. Ở đây hệ
   * thống biết đúng hai điều — "đã đạt bao nhiêu item trên bao nhiêu" và "item
   * nào nên làm tiếp". Nó KHÔNG biết người học đã bỏ ra bao lâu, và không field
   * nào dưới đây cho phép một nhãn khẳng định điều đó.
   *
   * "Đang học" = có ít nhất một item đã đạt và chưa đạt hết. Suy lúc đọc, không
   * có bảng `enrollments` nào — và nếu một ngày cần một bảng như thế, hãy đọc
   * lại phần ranh giới ở đầu file.
   */
  mine: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(learningPaths)
      .where(eq(learningPaths.state, 'published'))
      .orderBy(asc(learningPaths.id))
      .limit(input.limit);

    const details = await Promise.all(
      rows.map(async (row) => readPathDetail(ctx.db, ctx.user.id, row.id, ['published'])),
    );

    return {
      items: details
        .filter((detail) => detail.passedCount > 0 && detail.passedCount < detail.itemCount)
        .map((detail) => ({
          id: detail.id,
          title: detail.title,
          itemCount: detail.itemCount,
          passedCount: detail.passedCount,
          nextItemId: detail.nextItemId,
        })),
      limit: input.limit,
    };
  }),

  // ─────────────────────────────────────────────── soạn lộ trình

  listMine: authorProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(learningPaths)
      .where(eq(learningPaths.authorId, ctx.user.id))
      .orderBy(asc(learningPaths.id))
      .limit(input.limit);
    const summaries = await withItemCounts(ctx.db, rows);
    return {
      items: summaries.map((summary, index) => ({
        ...summary,
        state: rows[index]?.state ?? 'draft',
      })),
      limit: input.limit,
    };
  }),

  create: authorProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const existing = await findPathForWrite(ctx.db, input.id);
    if (existing !== null) {
      throw new TRPCError({ code: 'CONFLICT', message: `Id đã được dùng: ${input.id}` });
    }
    await ctx.db.transaction(async (tx) => {
      await tx.insert(learningPaths).values({
        id: input.id,
        // Chủ sở hữu từ `ctx.user.id`, KHÔNG từ input (luật 1).
        authorId: ctx.user.id,
        state: 'draft',
        title: input.title,
        description: input.description,
        sequential: input.sequential,
      });
      if (input.items.length > 0) {
        await tx.insert(learningPathItems).values(
          input.items.map((item, index) => ({
            pathId: input.id,
            ordinal: index,
            itemKind: item.kind,
            itemId: item.itemId,
          })),
        );
      }
    });
    return { id: input.id };
  }),

  update: authorProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const record = await findPathForWrite(ctx.db, input.id);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có lộ trình đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    await ctx.db.transaction(async (tx) => {
      await tx
        .update(learningPaths)
        .set({
          title: input.title,
          description: input.description,
          sequential: input.sequential,
          updatedAt: new Date(),
        })
        .where(eq(learningPaths.id, input.id));
      // Thay TOÀN BỘ danh sách — cùng lý lẽ `authoring.update`: xoá-rồi-chèn
      // trong MỘT transaction là nguyên tử; ngoài nó là một cửa sổ mà lộ trình
      // rỗng.
      await tx.delete(learningPathItems).where(eq(learningPathItems.pathId, input.id));
      if (input.items.length > 0) {
        await tx.insert(learningPathItems).values(
          input.items.map((item, index) => ({
            pathId: input.id,
            ordinal: index,
            itemKind: item.kind,
            itemId: item.itemId,
          })),
        );
      }
    });
    return { id: input.id };
  }),

  publish: authorProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const record = await findPathForWrite(ctx.db, input.pathId);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có lộ trình đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    /**
     * Cổng DUY NHẤT: lộ trình phải có ít nhất một item. Cố ý KHÔNG kiểm rằng
     * mọi item nạp được — một bài bị archive sau khi lộ trình lên là chuyện xảy
     * ra thật, và chặn xuất bản vì nó sẽ biến một lỗi của người khác thành cửa
     * chặn của tác giả này. Mắt xích thủng hiện ra với `title: null` (xem
     * `learningPathItemViewSchema`), tức là nhìn thấy được chứ không im lặng.
     */
    const [item] = await ctx.db
      .select({ id: learningPathItems.id })
      .from(learningPathItems)
      .where(eq(learningPathItems.pathId, input.pathId))
      .limit(1);
    if (item === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lộ trình rỗng — thêm item trước đã' });
    }

    await ctx.db
      .update(learningPaths)
      .set({ state: 'published', updatedAt: new Date() })
      .where(eq(learningPaths.id, input.pathId));
    return { id: input.pathId, state: 'published' as const };
  }),

  /** `archive` thay cho XOÁ — tiến độ người học trỏ vào các item của lộ trình này. */
  archive: authorProcedure.input(idInput).mutation(async ({ ctx, input }) => {
    const record = await findPathForWrite(ctx.db, input.pathId);
    if (record === null) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có lộ trình đó' });
    }
    assertContentOwner(ctx.user, record.authorId);

    await ctx.db
      .update(learningPaths)
      .set({ state: 'archived', updatedAt: new Date() })
      .where(eq(learningPaths.id, input.pathId));
    return { id: input.pathId, state: 'archived' as const };
  }),
});
