import { and, asc, count, eq, inArray, or, sql } from 'drizzle-orm';
import {
  ownDraftsAuthorId,
  visibleStates,
  type ContentKind,
  type ContentVisibility,
} from '@devops-platform/shared-types/authoring';
import type {
  ContentBodyRow,
  ContentItemRow,
  ContentRepository,
  ContentStepRow,
} from '@devops-platform/scenario';
import type { Database, DbOrTx } from '../db/client';
import { contentItems, contentSteps, type ContentItemRecord } from '../db/schema';

/**
 * Hiện thực Postgres của port `ContentRepository` (P9 9.C).
 *
 * Đây là NỬA CÓ DRIZZLE của nguồn DB; nửa kia (`packages/scenario/src/db-source.ts`)
 * không được biết ORM nào tồn tại. Ranh giới đó không phải nghi thức: nó là thứ
 * giữ `packages/scenario` dùng được từ một tiến trình không có Postgres (test,
 * và bất kỳ consumer nào sau này), theo `rules/library-third-party-decoupling.md`.
 *
 * ⛔ File này KHÔNG chứa luật "ai thấy gì". Nó nhận `ContentVisibility` và dịch
 * sang mệnh đề WHERE bằng `visibleStates`/`ownDraftsAuthorId` — hai hàm THUẦN
 * sống ở `shared-types` và kiểm được không cần DB. Viết lại luật đó thành SQL
 * ở đây là dựng bản thứ hai của một quy tắc bảo mật.
 */

/**
 * Mệnh đề "được nhìn thấy", dựng từ tầm nhìn.
 *
 * Với `author` nó là: `state = 'published'` **HOẶC** (`author_id = tôi` **VÀ**
 * `state` ∈ mọi state). Vế thứ hai KHÔNG được viết thành `author_id = tôi`
 * trần: một tác giả vẫn phải thấy bài `published` của người khác trong nguồn,
 * nếu không thì trang soạn của họ trở thành cả catalog của họ.
 */
function visibleWhere(visibility: ContentVisibility) {
  const states = visibleStates(visibility);
  const ownerId = ownDraftsAuthorId(visibility);
  if (ownerId === null) {
    return inArray(contentItems.state, [...states]);
  }
  return or(
    eq(contentItems.state, 'published'),
    and(eq(contentItems.authorId, ownerId), inArray(contentItems.state, [...states])),
  );
}

/** Cột `jsonb` về từ driver dưới dạng đã parse; ép kiểu ở MỘT chỗ thay vì mỗi call-site. */
function capabilitiesOf(record: ContentItemRecord): readonly string[] {
  const raw = record.capabilities;
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function toItemRow(record: ContentItemRecord, stepCount: number): ContentItemRow {
  return {
    id: record.id,
    kind: record.kind,
    state: record.state,
    authorId: record.authorId,
    title: record.title,
    description: record.description,
    difficulty: record.difficulty,
    estimatedMinutes: record.estimatedMinutes,
    tier: record.tier,
    capabilities: capabilitiesOf(record),
    backendImageId: record.backendImageId,
    interfaceLayout: record.interfaceLayout,
    passThresholdPercent: record.passThresholdPercent,
    leaderboard: record.leaderboard,
    ttlSeconds: record.ttlSeconds,
    stepCount,
  };
}

/**
 * `stepCount` TÍNH bằng `count(content_steps)`, không đọc từ cột (task 6 cấm cột đó).
 *
 * ## ⛔ Vì sao KHÔNG dùng subquery tương quan viết bằng `sql` template
 *
 * Bản đầu của hàm này viết:
 *
 * ```ts
 * sql`(select count(*)::int from ${contentSteps}
 *      where ${contentSteps.contentId} = ${contentItems.id})`
 * ```
 *
 * và nó **luôn trả 0**. Lý do: với một `select` một-bảng, Drizzle render cột
 * KHÔNG có tiền tố bảng, nên câu trên thành
 * `where "content_id" = "id"` — và bên trong subquery, `"id"` phân giải thành
 * `content_steps.id` chứ không phải `content_items.id`. Điều kiện không bao giờ
 * đúng, `count` luôn 0, và **mọi lesson bị `scenarioSummarySchema` loại** vì nó
 * đòi `stepCount` dương. Triệu chứng ở tầng trên là `/lessons` rỗng — không lỗi,
 * không cảnh báo ngoài một dòng WARN "bỏ qua lesson không hợp lệ".
 *
 * Không unit test nào với repository giả bắt được: chúng cấp thẳng `stepCount`.
 * Chỉ `repository.integration.test.ts` (SQL thật) mới thấy.
 *
 * Bản này dùng subquery CÓ ALIAS + `leftJoin`: alias buộc Postgres qualify cột,
 * nên không còn chỗ cho nhập nhằng tên. Nó cũng tránh `GROUP BY` trên câu ngoài,
 * thứ sẽ buộc mọi cột jsonb to vào mệnh đề đó.
 *
 * `list()` vẫn KHÔNG chạm `markdown`: subquery chỉ đếm dòng.
 */
function stepCountSubquery(db: DbOrTx) {
  return db
    .select({ contentId: contentSteps.contentId, n: count().as('n') })
    .from(contentSteps)
    .groupBy(contentSteps.contentId)
    .as('step_counts');
}

/** `leftJoin` cho `null` khi bài chưa có bước nào — 0, không phải `null`. */
function stepCountOf(counts: ReturnType<typeof stepCountSubquery>) {
  return sql<number>`coalesce(${counts.n}, 0)::int`;
}

/**
 * Repository đọc — thứ `dbContentSource` dùng.
 *
 * `db` được truyền vào chứ không lấy từ `getDb()` bên trong: test dựng
 * repository trên một transaction đã rollback được, và một singleton ẩn làm
 * điều đó bất khả thi.
 */
export function contentRepository(db: Database): ContentRepository {
  return {
    async listItems(kind: ContentKind, visibility: ContentVisibility) {
      const counts = stepCountSubquery(db);
      const rows = await db
        .select({ item: contentItems, stepCount: stepCountOf(counts) })
        .from(contentItems)
        .leftJoin(counts, eq(counts.contentId, contentItems.id))
        .where(and(eq(contentItems.kind, kind), visibleWhere(visibility)))
        .orderBy(asc(contentItems.id));

      return rows.map((row) => toItemRow(row.item, row.stepCount));
    },

    async getItem(id: string, kind: ContentKind, visibility: ContentVisibility) {
      const found = await db
        .select()
        .from(contentItems)
        .where(and(eq(contentItems.id, id), eq(contentItems.kind, kind), visibleWhere(visibility)))
        .limit(1);
      const record = found[0];
      if (record === undefined) {
        return null;
      }

      const steps = await db
        .select()
        .from(contentSteps)
        .where(eq(contentSteps.contentId, id))
        // Thứ tự là DỮ LIỆU: không có ORDER BY thì Postgres được phép trả về
        // bất kỳ thứ tự nào, và triệu chứng là "bài nhảy bước" — ngắt quãng,
        // phụ thuộc plan, và không tái hiện được trên máy có ít dòng.
        .orderBy(asc(contentSteps.ordinal));

      const stepRows: ContentStepRow[] = steps.map((step) => ({
        ordinal: step.ordinal,
        taskId: step.taskId,
        title: step.title,
        markdown: step.markdown,
        setupForeground: step.setupForeground,
        setupBackground: step.setupBackground,
        verifyScript: step.verifyScript,
        weight: step.weight,
        hint: step.hint,
      }));

      const body: ContentBodyRow = {
        item: toItemRow(record, stepRows.length),
        steps: stepRows,
        intro: record.intro,
        finish: record.finish,
        setup: record.setup,
        assets: record.assets,
      };
      return body;
    },
  };
}

/**
 * Đọc một bài BỎ QUA tầm nhìn — chỉ dùng cho đường GHI, sau khi
 * `assertContentOwner` đã chạy.
 *
 * ⚠ Tồn tại vì `getItem` lọc theo tầm nhìn, và đường ghi cần đọc `author_id`
 * TRƯỚC khi biết người gọi có quyền hay không. Dùng nó ở đường đọc là bỏ qua
 * toàn bộ luật 9.
 */
export async function findContentForWrite(
  db: DbOrTx,
  id: string,
): Promise<ContentItemRecord | null> {
  const found = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
  return found[0] ?? null;
}

/** Thân đầy đủ, bỏ qua tầm nhìn — cho `publish` (validate + chạy thử bài của chính mình). */
export async function loadBodyForWrite(db: DbOrTx, id: string): Promise<ContentBodyRow | null> {
  const record = await findContentForWrite(db, id);
  if (record === null) {
    return null;
  }
  const steps = await db
    .select()
    .from(contentSteps)
    .where(eq(contentSteps.contentId, id))
    .orderBy(asc(contentSteps.ordinal));
  return {
    item: toItemRow(record, steps.length),
    steps: steps.map((step) => ({
      ordinal: step.ordinal,
      taskId: step.taskId,
      title: step.title,
      markdown: step.markdown,
      setupForeground: step.setupForeground,
      setupBackground: step.setupBackground,
      verifyScript: step.verifyScript,
      weight: step.weight,
      hint: step.hint,
    })),
    intro: record.intro,
    finish: record.finish,
    setup: record.setup,
    assets: record.assets,
  };
}

/** Bài của MỘT tác giả, mọi state — nguồn của danh sách trang soạn. */
export async function listAuthoredBy(
  db: DbOrTx,
  authorId: string | null,
): Promise<readonly { record: ContentItemRecord; stepCount: number }[]> {
  const counts = stepCountSubquery(db);
  const rows = await db
    .select({ item: contentItems, stepCount: stepCountOf(counts) })
    .from(contentItems)
    .leftJoin(counts, eq(counts.contentId, contentItems.id))
    // `null` = admin, xem mọi bài. Không phải "không lọc vì quên": caller duy
    // nhất truyền `null` là nhánh admin của `authoring.list`.
    .where(authorId === null ? undefined : eq(contentItems.authorId, authorId))
    .orderBy(asc(contentItems.id));
  return rows.map((row) => ({ record: row.item, stepCount: row.stepCount }));
}

/** Đếm bài đang giữ một id — dùng để từ chối trùng id NGAY khi tạo, không đợi tới publish. */
export async function contentIdTaken(db: DbOrTx, id: string): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(contentItems).where(eq(contentItems.id, id));
  return (row?.n ?? 0) > 0;
}
