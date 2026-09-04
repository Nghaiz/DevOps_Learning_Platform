import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { closeTestDb, testDb, uniqueId } from '../../security/test-helpers';
import { contentItems, contentSteps, users } from '../db/schema';
import { publishedAtCoalesce } from './publish';

/**
 * Ô AC "publish chạy thử thật trong sandbox" của P9 được chạy lần đầu trên cụm
 * thật ngày 2026-09-04, và nó tìm ra một bug mà **không một test nào trước đó có
 * thể tìm được**:
 *
 *     ERROR: COALESCE types timestamp with time zone and text cannot be matched
 *
 * `publishedAt: sql\`coalesce(..., ${now})\`` bind một `Date` THÔ — bên trong một
 * `sql` template Drizzle không đưa giá trị qua mapper của cột — nên nó ra đường
 * dây dưới dạng TEXT. Postgres từ chối.
 *
 * Hậu quả: **đường THÀNH CÔNG của publish chưa bao giờ chạy được.** Lượt chạy
 * thử ĐẠT → update ném → bài kẹt vĩnh viễn ở `publishing`. Đường THẤT BẠI thì
 * chạy tốt vì nó không có `coalesce` — nên hệ thống *trông* như hoạt động: bài
 * sai bị từ chối đúng, chỉ bài ĐÚNG là không bao giờ lên được.
 *
 * ⛔ ĐIỀU KIỆN KÍCH HOẠT — đừng thu hẹp câu lệnh trong bộ test này.
 *
 * Bản đầu của bộ test chỉ set ba cột (state/publishedAt/updatedAt) và nó XANH
 * kể cả với mã lỗi. Lỗi chỉ nổ khi câu lệnh mang KÈM hai tham số NULL
 * (`publish_started_at`, `publish_error`) đúng như production: có chúng thì
 * Postgres suy kiểu cho $4 theo một đường khác và nó rơi về `text`.
 *
 * Nên phép `set(...)` dưới đây phải giữ ĐÚNG hình dạng của `runPublishTrial`.
 * Bớt một cột là bộ test quay lại thành một ô xanh không chứng minh gì — và nó
 * ĐÃ từng là như vậy trong đúng một lượt chạy.
 *
 * ⛔ VÌ SAO BỘ NÀY PHẢI CHẠM POSTGRES THẬT. Lỗi nằm ở phép suy kiểu của
 * Postgres, không ở TypeScript. Typecheck xanh, lint xanh, và mọi unit test
 * dùng DB giả cũng xanh — vì một DB giả không có hệ thống kiểu. Bộ test này là
 * chỗ duy nhất câu lệnh ấy gặp một Postgres thật ngoài production.
 *
 * ⚠ ĐÒI Postgres (`docker compose up -d postgres` + `pnpm db:migrate`).
 */

const AUTHOR = uniqueId('u-pub-ts');
const ids: string[] = [];

async function seed(state: 'publishing', publishedAt: Date | null): Promise<string> {
  const db = testDb();
  const id = uniqueId('c-pub-ts').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  await db.insert(contentItems).values({
    id,
    kind: 'lesson',
    authorId: AUTHOR,
    state,
    title: `Bài ${id}`,
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    assets: [],
    intro: null,
    finish: null,
    setup: null,
    passThresholdPercent: null,
    leaderboard: null,
    ttlSeconds: null,
    publishedAt,
  });
  await db.insert(contentSteps).values({
    id: uniqueId('step'),
    contentId: id,
    ordinal: 0,
    taskId: null,
    title: 'Bước 1',
    markdown: 'Nội dung.',
    setupForeground: null,
    setupBackground: null,
    verifyScript: 'exit 0',
    weight: null,
    hint: null,
  });
  ids.push(id);
  return id;
}

beforeAll(async () => {
  await testDb().insert(users).values({ id: AUTHOR, name: AUTHOR, email: `${AUTHOR}@example.test` });
});

afterAll(async () => {
  const db = testDb();
  if (ids.length > 0) {
    await db.delete(contentSteps).where(inArray(contentSteps.contentId, ids));
    await db.delete(contentItems).where(inArray(contentItems.id, ids));
  }
  await db.delete(users).where(eq(users.id, AUTHOR));
  await closeTestDb();
});

describe('publishedAtCoalesce trên Postgres thật', () => {
  it('bài chưa từng xuất bản ⇒ đóng dấu `now`', async () => {
    const db = testDb();
    const id = await seed('publishing', null);
    const now = new Date();

    // ⛔ Đây là ca gác chính: TRƯỚC bản sửa, chính dòng này ném
    // "COALESCE types timestamp with time zone and text cannot be matched".
    await db
      .update(contentItems)
      .set({
        state: 'published',
        publishStartedAt: null,
        publishError: null,
        publishedAt: publishedAtCoalesce(now),
        updatedAt: now,
      })
      .where(eq(contentItems.id, id));

    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(row?.state).toBe('published');
    expect(row?.publishedAt).not.toBeNull();
    // Trong vòng một phút quanh `now` — không so bằng, vì Postgres làm tròn
    // microgiây và múi giờ của phiên có thể khác của tiến trình test.
    expect(Math.abs((row?.publishedAt?.getTime() ?? 0) - now.getTime())).toBeLessThan(60_000);
  });

  it('bài ĐÃ xuất bản trước đó ⇒ GIỮ mốc cũ, không ghi đè', async () => {
    // Đây là lý do dùng `coalesce` ngay từ đầu: `published_at` trả lời câu "bài
    // này lên từ bao giờ". Ghi đè nó ở lần xuất bản thứ hai làm mất câu trả lời
    // đó, và `updated_at` đã trả lời câu còn lại rồi.
    const db = testDb();
    const first = new Date('2026-01-02T03:04:05.000Z');
    const id = await seed('publishing', first);
    const now = new Date();

    await db
      .update(contentItems)
      .set({
        state: 'published',
        publishStartedAt: null,
        publishError: null,
        publishedAt: publishedAtCoalesce(now),
        updatedAt: now,
      })
      .where(eq(contentItems.id, id));

    const [row] = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(row?.publishedAt?.toISOString()).toBe(first.toISOString());
  });

  it('đối chứng: phép seed thật sự tạo hàng đọc lại được', async () => {
    // Thiếu ca này thì một `seed` hỏng làm hai ca trên chạy trên 0 hàng —
    // `update ... where id = <không tồn tại>` KHÔNG ném, nên cả hai sẽ xanh mà
    // chưa từng chạm câu lệnh cần kiểm.
    const db = testDb();
    const id = await seed('publishing', null);
    const rows = await db.select().from(contentItems).where(eq(contentItems.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('publishing');
  });
});
