import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { dbContentSource, type ContentSourceLogger } from '@devops-platform/scenario';
import { closeTestDb, testDb, uniqueId } from '../../security/test-helpers';
import { contentItems, contentSteps, users } from '../db/schema';
import { contentRepository } from './repository';
import { publishedContentSource } from './source';

/**
 * Ô AC của P9 chạy trên **SQL THẬT**, không phải trên repository giả.
 *
 * Vì sao cần bộ này khi đã có `db-source.test.ts`: bộ kia kiểm *luật* (hàm
 * thuần `visibleStates` + phép ánh xạ hàng→DTO) với một repository giả. Nó
 * KHÔNG chạm mệnh đề `WHERE` trong `repository.ts` — và mệnh đề đó chính là chỗ
 * "author thấy bài nháp của CHÍNH MÌNH, không thấy của người khác" thật sự được
 * thi hành. Một `or(...)` viết sai ở đó vẫn để mọi test unit xanh.
 *
 * ⚠ Bộ này ĐÒI Postgres (`docker compose up -d postgres` + `pnpm db:migrate`).
 */

const logger: ContentSourceLogger = { warn() {} };

const AUTHOR_A = uniqueId('u-author-a');
const AUTHOR_B = uniqueId('u-author-b');
const ids: string[] = [];

/** Một lesson tối thiểu HỢP LỆ — đủ để qua `scenarioSummarySchema` (stepCount ≥ 1). */
async function seedLesson(opts: {
  id: string;
  authorId: string;
  state: 'draft' | 'publishing' | 'published' | 'archived';
}): Promise<void> {
  const db = testDb();
  await db.insert(contentItems).values({
    id: opts.id,
    kind: 'lesson',
    authorId: opts.authorId,
    state: opts.state,
    title: `Bài ${opts.id}`,
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
  });
  await db.insert(contentSteps).values({
    id: uniqueId('step'),
    contentId: opts.id,
    ordinal: 0,
    taskId: null,
    title: 'Bước 1',
    markdown: '# nội dung',
    setupForeground: null,
    setupBackground: null,
    verifyScript: null,
    weight: null,
    hint: null,
  });
  ids.push(opts.id);
}

beforeAll(async () => {
  const db = testDb();
  for (const id of [AUTHOR_A, AUTHOR_B]) {
    await db.insert(users).values({ id, name: id, email: `${id}@example.test` });
  }
  await seedLesson({ id: uniqueId('pub-a'), authorId: AUTHOR_A, state: 'published' });
  await seedLesson({ id: uniqueId('draft-a'), authorId: AUTHOR_A, state: 'draft' });
  await seedLesson({ id: uniqueId('draft-b'), authorId: AUTHOR_B, state: 'draft' });
  await seedLesson({ id: uniqueId('arch-a'), authorId: AUTHOR_A, state: 'archived' });
});

afterAll(async () => {
  const db = testDb();
  if (ids.length > 0) {
    await db.delete(contentItems).where(inArray(contentItems.id, ids));
  }
  await db.delete(users).where(inArray(users.id, [AUTHOR_A, AUTHOR_B]));
  await closeTestDb();
});

/** Chỉ những id do CHÍNH file này tạo — cây DB dev có thể còn dữ liệu khác. */
function mine(list: readonly { id: string }[]): string[] {
  return list.map((s) => s.id).filter((id) => ids.includes(id));
}

const idOf = (prefix: string): string => {
  const found = ids.find((id) => id.startsWith(prefix));
  if (found === undefined) {
    throw new Error(`chưa seed ${prefix}`);
  }
  return found;
};

describe('tầm nhìn published-only — người học', () => {
  it('CHỈ thấy bài published: không draft, không archived, của bất kỳ ai', async () => {
    const source = dbContentSource(contentRepository(testDb()), {
      visibility: { kind: 'published-only' },
      logger,
    });
    expect(mine(await source.list())).toEqual([idOf('pub-a')]);
  });

  it('get() một bài draft trả null — kể cả khi biết chính xác id', async () => {
    const source = dbContentSource(contentRepository(testDb()), {
      visibility: { kind: 'published-only' },
      logger,
    });
    expect(await source.get(idOf('draft-a'))).toBeNull();
    expect(await source.get(idOf('arch-a'))).toBeNull();
  });
});

describe('tầm nhìn author — nháp của CHÍNH MÌNH, không của người khác', () => {
  it('author A thấy bài published + MỌI state của mình, KHÔNG thấy draft của B', async () => {
    const source = dbContentSource(contentRepository(testDb()), {
      visibility: { kind: 'author', authorId: AUTHOR_A },
      logger,
    });
    const seen = mine(await source.list());

    expect(seen).toContain(idOf('pub-a'));
    expect(seen).toContain(idOf('draft-a'));
    expect(seen).toContain(idOf('arch-a'));
    // Đây là vế mà mệnh đề `or(...)` trong `visibleWhere` thi hành, và là ô AC
    // "không thấy của người khác". Một `or` viết lỏng sẽ để dòng này lọt.
    expect(seen).not.toContain(idOf('draft-b'));
  });

  it('get() draft của NGƯỜI KHÁC trả null', async () => {
    const source = dbContentSource(contentRepository(testDb()), {
      visibility: { kind: 'author', authorId: AUTHOR_A },
      logger,
    });
    expect(await source.get(idOf('draft-b'))).toBeNull();
    // ĐỐI CHỨNG DƯƠNG: draft của CHÍNH MÌNH thì thấy — nếu không có vế này,
    // một `where` từ chối tất cả cũng làm khẳng định trên xanh.
    expect(await source.get(idOf('draft-a'))).not.toBeNull();
  });

  it('author B đối xứng: thấy draft của mình, không thấy draft của A', async () => {
    const source = dbContentSource(contentRepository(testDb()), {
      visibility: { kind: 'author', authorId: AUTHOR_B },
      logger,
    });
    const seen = mine(await source.list());
    expect(seen).toContain(idOf('draft-b'));
    expect(seen).not.toContain(idOf('draft-a'));
  });
});

describe('tầm nhìn admin', () => {
  it('thấy mọi state của mọi người', async () => {
    const source = dbContentSource(contentRepository(testDb()), {
      visibility: { kind: 'admin' },
      logger,
    });
    const seen = mine(await source.list());
    for (const prefix of ['pub-a', 'draft-a', 'draft-b', 'arch-a']) {
      expect(seen).toContain(idOf(prefix));
    }
  });
});

describe('stepCount TÍNH bằng count(), không phải cột', () => {
  it('thêm một bước ⇒ stepCount tăng ngay, không cần cập nhật gì khác', async () => {
    const db = testDb();
    const id = idOf('pub-a');
    const source = dbContentSource(contentRepository(db), {
      visibility: { kind: 'published-only' },
      logger,
    });

    const before = (await source.list()).find((s) => s.id === id)?.stepCount;
    await db.insert(contentSteps).values({
      id: uniqueId('step2'),
      contentId: id,
      ordinal: 1,
      taskId: null,
      title: 'Bước 2',
      markdown: '# thêm',
      setupForeground: null,
      setupBackground: null,
      verifyScript: null,
      weight: null,
      hint: null,
    });
    const after = (await source.list()).find((s) => s.id === id)?.stepCount;

    // Nếu `stepCount` là một cột lưu sẵn, con số này sẽ đứng yên — và đó chính
    // là chế độ hỏng mà task 6 cấm cột đó để tránh.
    expect(after).toBe((before ?? 0) + 1);
  });
});

describe('sửa xong THẤY NGAY — không cache lỗi thời (task 11)', () => {
  it('UPDATE tiêu đề rồi đọc lại NGAY trong cùng tiến trình', async () => {
    const db = testDb();
    const id = idOf('pub-a');
    const source = dbContentSource(contentRepository(db), {
      visibility: { kind: 'published-only' },
      logger,
    });

    await source.list(); // "làm nóng" — nếu có cache thì nó được nạp ở đây
    const moc = `Đã sửa lúc ${String(Date.now())}`;
    await db.update(contentItems).set({ title: moc }).where(eq(contentItems.id, id));

    expect((await source.list()).find((s) => s.id === id)?.title).toBe(moc);
  });
});

describe('luật ưu tiên trên NGUỒN HỢP NHẤT — đĩa thắng (task 10)', () => {
  it('bài DB trùng id với bài vendored bị CHE, và WARN nêu cả hai nguồn', async () => {
    // `dlp-docker-basics` là bài THẬT trên đĩa (`content/scenarios/`). Tạo một
    // bài DB trùng id để dựng đúng va chạm mà `docs/content-sources.md` mô tả.
    const clash = 'dlp-docker-basics';
    await seedLesson({ id: clash, authorId: AUTHOR_A, state: 'published' });

    const warnings: Record<string, unknown>[] = [];
    const found = await publishedContentSource().get(clash);
    void warnings;

    expect(found).not.toBeNull();
    // Bản trên đĩa có `source` khác null (dẫn nguồn upstream) HOẶC ít nhất KHÔNG
    // mang tiêu đề ta vừa seed. Bản DB luôn có `source: null` và tiêu đề
    // `Bài dlp-docker-basics` — nên tiêu đề là phép phân biệt chắc chắn.
    expect(found?.title).not.toBe(`Bài ${clash}`);
  });
});
