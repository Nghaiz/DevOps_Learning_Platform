import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from '../db/schema';
import { contentItems, contentSteps, users } from '../db/schema';
import { databaseUrl } from '../env';
import { contentRepository } from './repository';

/**
 * D9 (phase-13) — **bằng chứng** rằng phân trang nằm Ở TẦNG NGUỒN, không phải
 * ở TypeScript.
 *
 * Vì sao bộ này tồn tại khi `db-source.test.ts` đã "kiểm listPage": bộ kia dựng
 * một repository GIẢ trên chính `paginateSorted` — tức nó kiểm helper trong bộ
 * nhớ HAI LẦN và kiểm SQL KHÔNG LẦN NÀO. Câu khẳng định D9 ("DB đẩy
 * `WHERE id > $cursor … ORDER BY id LIMIT n+1` xuống Postgres") chỉ đúng nếu
 * `repository.listItemsPage` thật sự sinh ra câu đó — và cách duy nhất biết
 * điều đó là ĐỌC SQL ĐÃ SINH, không phải đọc TypeScript rồi tin.
 *
 * Nó bắt được đúng chế độ hỏng mà một bản viết lại "cho gọn" hay mắc: đổi
 * keyset thành `OFFSET`, hoặc bỏ `ORDER BY` (Postgres khi đó được phép trả thứ
 * tự bất kỳ ⇒ cursor mất nghĩa mà mọi test in-memory vẫn xanh).
 *
 * ⚠ ĐÒI Postgres (`docker compose up -d postgres` + `pnpm db:migrate`).
 */

const captured: string[] = [];
const sql = postgres(databaseUrl(), { max: 1 });
const loggedDb = drizzle(sql, {
  schema,
  logger: {
    logQuery(query) {
      captured.push(query);
    },
  },
});
const repo = contentRepository(loggedDb);

const AUTHOR = 'u-p13sql-author';
// Tiền tố `zzz-` cố ý: `ORDER BY id ASC` đặt chúng ở CUỐI bảng, nên các ca
// "cursor vượt mọi id" bên dưới không bị nội dung thật của repo chen vào.
const IDS = ['zzz-p13sql-a', 'zzz-p13sql-b', 'zzz-p13sql-c', 'zzz-p13sql-d'] as const;

async function seed(): Promise<void> {
  await loggedDb.delete(contentItems).where(inArray(contentItems.id, [...IDS]));
  await loggedDb.delete(users).where(eq(users.id, AUTHOR));
  await loggedDb
    .insert(users)
    .values({ id: AUTHOR, name: 'p13sql', email: `${AUTHOR}@test.local`, role: 'author' });

  for (const [index, id] of IDS.entries()) {
    await loggedDb.insert(contentItems).values({
      id,
      kind: 'lesson',
      authorId: AUTHOR,
      state: 'published',
      title: `Bài ${id}`,
      description: null,
      // `d` mang difficulty KHÁC — để chứng minh filter được áp TRƯỚC `LIMIT`,
      // không phải lọc sau khi trang đã cắt.
      difficulty: id === 'zzz-p13sql-d' ? 'advanced' : 'beginner',
      // `a` có thời lượng, `b`/`c`/`d` KHÔNG — để ca `orderBy: 'duration'` thật
      // sự đi qua nhánh `coalesce`, chứ không phải một cột toàn giá trị.
      estimatedMinutes: id === 'zzz-p13sql-a' ? 5 : null,
      tier: 'sysbox',
      // `a` mang HAI năng lực, `b` một, `c`/`d` không. Đây là điều kiện để phép
      // kiểm `@>` (chứa) phân biệt được với `=` (bằng): một phép so bằng sẽ
      // trượt `a` khi hỏi `docker`, và bộ test sẽ thấy.
      capabilities:
        id === 'zzz-p13sql-a'
          ? ['docker', 'kubernetes']
          : id === 'zzz-p13sql-b'
            ? ['docker']
            : [],
      backendImageId: 'ubuntu',
      interfaceLayout: null,
      assets: [],
      intro: null,
      finish: null,
      setup: null,
      passThresholdPercent: null,
      leaderboard: null,
      ttlSeconds: null,
      publishedAt: new Date(),
    });
    await loggedDb.insert(contentSteps).values({
      id: `step-p13sql-${String(index)}`,
      contentId: id,
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
  }
}

beforeAll(async () => {
  await seed();
});

afterAll(async () => {
  await loggedDb.delete(contentItems).where(inArray(contentItems.id, [...IDS]));
  await loggedDb.delete(users).where(eq(users.id, AUTHOR));
  await sql.end({ timeout: 5 });
});

/** SQL của lượt gọi cuối cùng chạm `content_items` — đọc lại, không đoán. */
function lastContentItemsQuery(): string {
  const found = [...captured].reverse().find((q) => q.includes('"content_items"'));
  if (found === undefined) {
    throw new Error('không bắt được câu SQL nào chạm content_items — logger chưa gắn?');
  }
  return found;
}

describe('repository.listItemsPage — SQL SINH RA, không phải TypeScript đọc được', () => {
  it('có cursor ⇒ SQL mang keyset `"id" > $n`, `order by "id" asc`, `limit $n`, và KHÔNG có offset', async () => {
    captured.length = 0;
    await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 2,
      cursor: 'zzz-p13sql-a',
    });
    const query = lastContentItemsQuery();

    // Ba khẳng định D9, đọc thẳng từ chuỗi Postgres nhận được.
    expect(query).toMatch(/"content_items"\."id"\s*>\s*\$\d+/i);
    expect(query).toMatch(/order by\s+"content_items"\."id"\s+asc/i);
    expect(query).toMatch(/limit\s+\$\d+/i);
    // Chế độ hỏng cụ thể bộ này gác: đổi keyset thành offset.
    expect(query.toLowerCase()).not.toContain('offset');
  });

  it('không cursor ⇒ vẫn `order by "id" asc` + `limit`, KHÔNG có mệnh đề `id >`', async () => {
    captured.length = 0;
    await repo.listItemsPage('lesson', { kind: 'published-only' }, { limit: 2 });
    const query = lastContentItemsQuery();
    expect(query).toMatch(/order by\s+"content_items"\."id"\s+asc/i);
    expect(query).toMatch(/limit\s+\$\d+/i);
    expect(query).not.toMatch(/"content_items"\."id"\s*>\s*\$\d+/i);
  });

  it('`limit + 1` được đẩy XUỐNG Postgres (n+1 để biết hasMore, không phải COUNT riêng)', async () => {
    captured.length = 0;
    const page = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 1,
      cursor: 'zzz-p13sql-a',
    });
    // Tham số cuối của câu là `limit` — Drizzle bind nó, nên phép kiểm ĐÚNG là
    // hành vi: hỏi limit 1 mà biết được "còn trang sau" chỉ khả thi khi n+1
    // dòng thật sự về từ DB.
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(true);
    expect(lastContentItemsQuery().toLowerCase()).not.toContain('offset');
  });
});

describe('repository.listItemsPage — hành vi keyset trên Postgres THẬT', () => {
  it('cursor trỏ vào id CHỈ tồn tại ở nguồn DB ⇒ trang sau bắt đầu ngay sau nó', async () => {
    const page = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 10,
      cursor: 'zzz-p13sql-a',
    });
    const ids = page.items.map((row) => row.id).filter((id) => id.startsWith('zzz-p13sql-'));
    expect(ids).toEqual(['zzz-p13sql-b', 'zzz-p13sql-c', 'zzz-p13sql-d']);
  });

  it('cursor VƯỢT QUA mọi id ⇒ trang rỗng, hasMore=false (không quay về trang 1)', async () => {
    const page = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 10,
      cursor: 'zzzzzzzz-vuot-moi-id',
    });
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('filter difficulty áp TRƯỚC limit — `limit` đếm dòng SAU lọc', async () => {
    // 4 mục `zzz-*`, trong đó ĐÚNG MỘT mục là `advanced`. Hỏi limit 10 với
    // filter `advanced` phải trả về đúng mục đó; nếu filter chạy SAU khi cắt
    // trang, một trang đầy `beginner` sẽ nuốt mất nó.
    const page = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 10,
      cursor: 'zzz-p13sql-a',
      filter: { difficulty: 'advanced' },
    });
    const ids = page.items.map((row) => row.id).filter((id) => id.startsWith('zzz-p13sql-'));
    expect(ids).toEqual(['zzz-p13sql-d']);
    expect(lastContentItemsQuery()).toMatch(/"difficulty"\s*=\s*\$\d+/i);
  });

  it('filter difficulty bị BỎ QUA cho playground (cột luôn NULL) — không áp cứng thành 0 dòng', async () => {
    captured.length = 0;
    await repo.listItemsPage('playground', { kind: 'published-only' }, {
      limit: 10,
      filter: { difficulty: 'advanced' },
    });
    expect(lastContentItemsQuery()).not.toMatch(/"difficulty"\s*=\s*\$\d+/i);
  });
});

/**
 * Sắp xếp phía server (phase-13) — **trên SQL SINH RA và trên Postgres THẬT**.
 *
 * Vì sao phần này không thừa dù `source-order.test.ts` đã đi hết trang ở ba mức
 * limit: bộ kia chạy trên `paginateSorted` (bộ nhớ). Câu khẳng định "DB đẩy
 * `ORDER BY <khoá>, id` và `(<khoá>, id) > (cv, ci)` xuống Postgres" chỉ đúng
 * nếu `listItemsPage` thật sự sinh ra câu đó — cùng lý lẽ đã dựng nên chính file
 * này. Và nó gác một chế độ hỏng mà không test bộ nhớ nào thấy được: `ORDER BY`
 * và vị từ keyset dùng HAI biểu thức khác nhau (ví dụ sắp theo `CASE` nhưng lọc
 * theo `difficulty` thô) — SQL vẫn chạy, vẫn trả dòng, chỉ là mất dòng ở biên.
 */
describe('listItemsPage — orderBy đẩy xuống Postgres', () => {
  it('orderBy=difficulty ⇒ ORDER BY <case>, id VÀ vị từ keyset theo HÀNG', async () => {
    captured.length = 0;
    await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 2,
      orderBy: 'difficulty',
      cursor: 'd:0:zzz-p13sql-a',
    });
    const query = lastContentItemsQuery();

    expect(query.toLowerCase()).toContain('case');
    // Vị từ so sánh THEO HÀNG — `(case…, "id") > ($n::int, $n::text)`.
    expect(query).toMatch(/\)\s*,\s*"content_items"\."id"\)\s*>\s*\(\$\d+::int/i);
    // …và `ORDER BY` phải kết thúc bằng `id asc` (vế phá hoà). Thiếu nó thì
    // khoá không duy nhất và cursor mất nghĩa ở mọi nhóm cùng độ khó.
    expect(query).toMatch(/order by\s+.*"content_items"\."id"\s+asc/i);
    expect(query.toLowerCase()).not.toContain('offset');
  });

  it('orderBy=duration ⇒ coalesce(estimated_minutes, 2147483647), KHÔNG để NULL vào so sánh', async () => {
    captured.length = 0;
    await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 2,
      orderBy: 'duration',
      cursor: 'm:5:zzz-p13sql-a',
    });
    const query = lastContentItemsQuery();
    // Một `ORDER BY estimated_minutes` trần + `(estimated_minutes, id) > (…)`
    // sẽ cho vị từ NULL trên mọi bài chưa khai thời lượng ⇒ chúng biến mất khỏi
    // MỌI trang. `coalesce` là thứ chặn điều đó.
    expect(query.toLowerCase()).toContain('coalesce');
    expect(query).toContain('2147483647');
  });

  it('orderBy=id (mặc định) KHÔNG sinh case/coalesce — đường cũ không đổi', async () => {
    captured.length = 0;
    await repo.listItemsPage('lesson', { kind: 'published-only' }, { limit: 2 });
    const query = lastContentItemsQuery().toLowerCase();
    expect(query).not.toContain('case');
    expect(query).not.toContain('2147483647');
  });

  /**
   * Đi HẾT trang trên Postgres THẬT, ở ba mức `limit` — cùng bất biến với
   * `source-order.test.ts` nhưng qua SQL: hợp của mọi trang = đúng tập đầy đủ,
   * không lặp, đúng thứ tự.
   *
   * Fixture có `a`/`b`/`c` cùng `beginner` và `d` là `advanced`, tức khoá sắp
   * xếp KHÔNG duy nhất — điều kiện để một cursor thiếu vế `id` lộ ra.
   */
  it.each([1, 2, 3])('đi hết trang trên Postgres thật · orderBy=difficulty · limit=%i', async (limit) => {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard <= IDS.length * 4 + 8; guard += 1) {
      const page = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
        limit,
        orderBy: 'difficulty',
        ...(cursor === undefined ? {} : { cursor }),
      });
      seen.push(...page.items.map((row) => row.id).filter((id) => id.startsWith('zzz-p13sql-')));
      if (!page.hasMore) {
        break;
      }
      const last = page.items[page.items.length - 1];
      if (last === undefined) {
        break;
      }
      cursor = `d:${String(last.difficulty === 'advanced' ? 2 : 0)}:${last.id}`;
    }

    // `d` là `advanced` (hạng 2) nên nó phải xuống CUỐI, sau a/b/c dù id lớn hơn.
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...IDS].sort());
    expect(seen).toEqual(['zzz-p13sql-a', 'zzz-p13sql-b', 'zzz-p13sql-c', 'zzz-p13sql-d']);
  });
});

describe('listItemsPage — lọc capability đẩy xuống Postgres', () => {
  it('sinh phép CHỨA jsonb `@>`, không phải so bằng', async () => {
    captured.length = 0;
    await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 10,
      filter: { capability: 'docker' },
    });
    const query = lastContentItemsQuery();
    expect(query).toMatch(/"capabilities"\s*@>\s*\$\d+::jsonb/i);
    // Một `=` ở đây sẽ chỉ khớp mảng GIỐNG HỆT `["docker"]`, tức trượt mọi bài
    // mang thêm năng lực khác.
    expect(query).not.toMatch(/"capabilities"\s*=\s*\$\d+/i);
  });

  it('mục mang NHIỀU năng lực khớp khi hỏi MỘT — và đối chứng ÂM cho năng lực không ai có', async () => {
    // `zzz-p13sql-a` mang ['docker','kubernetes'] (xem seed), `-b` chỉ ['docker'].
    const docker = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 50,
      filter: { capability: 'docker' },
    });
    const ids = docker.items.map((r) => r.id).filter((id) => id.startsWith('zzz-p13sql-'));
    expect(ids).toEqual(['zzz-p13sql-a', 'zzz-p13sql-b']);

    // Đối chứng ÂM: nếu vị từ `@>` bị bỏ qua, câu này trả về cả bốn mục.
    const none = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 50,
      filter: { capability: 'multi-node' },
    });
    expect(none.items.map((r) => r.id).filter((id) => id.startsWith('zzz-p13sql-'))).toEqual([]);
  });

  it('`limit` đếm dòng SAU lọc capability — trang đầy chứ không vơi', async () => {
    const page = await repo.listItemsPage('lesson', { kind: 'published-only' }, {
      limit: 1,
      cursor: 'zzz-p13sql-a',
      filter: { capability: 'docker' },
    });
    // Sau cursor `a`, chỉ `b` mang `docker` (`c`/`d` không) ⇒ đúng 1 dòng, hết.
    expect(page.items.map((r) => r.id)).toEqual(['zzz-p13sql-b']);
    expect(page.hasMore).toBe(false);
  });
});
