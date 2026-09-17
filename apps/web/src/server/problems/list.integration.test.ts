import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { inArray } from 'drizzle-orm';
import type { ProblemListOptions } from '@devops-platform/games';
import { createDatabase } from '../db/client';
import { problemHintReveals, problems, problemSubmissions, users } from '../db/schema';
import type { AuthedUser } from '../trpc/init';
import { getProblemForViewer } from './get';
import { listProblems, type AuthorProblemWithStats } from './list';
import { problemStats } from './stats';
import { problemVisibilityFor } from './visibility';

/**
 * Bằng chứng rằng lọc, sắp và phân trang keyset thật sự chạy TRÊN POSTGRES.
 *
 * Vì sao không kiểm bằng một repository giả trong bộ nhớ: câu khẳng định cần
 * chứng minh là *"Postgres nhận `WHERE (khoá, code) > (…) ORDER BY … LIMIT n+1`
 * và trả đúng"*, và một bản giả sẽ kiểm lại chính TypeScript của ta hai lần rồi
 * kiểm SQL không lần nào. Nó cũng bắt được đúng chế độ hỏng mà một bản viết lại
 * "cho gọn" hay mắc: đổi keyset thành `OFFSET`, hoặc bỏ vế tie-break `code` —
 * cả hai đều xanh trên mọi test in-memory.
 *
 * ⚠ ĐÒI Postgres đang chạy (`docker compose up -d postgres` + `pnpm db:migrate`).
 */

const { db, sql } = createDatabase();

const AUTHOR: AuthedUser = { id: 'u-p14d-author', role: 'author' };
const OTHER_AUTHOR: AuthedUser = { id: 'u-p14d-author2', role: 'author' };
const LEARNER: AuthedUser = { id: 'u-p14d-learner', role: 'user' };
const LEARNER_2: AuthedUser = { id: 'u-p14d-learner2', role: 'user' };
const ADMIN: AuthedUser = { id: 'u-p14d-admin', role: 'admin' };
const USER_IDS = [AUTHOR.id, OTHER_AUTHOR.id, LEARNER.id, LEARNER_2.id, ADMIN.id];

/**
 * Mã cao cố ý: `ORDER BY code ASC` đặt chúng ở CUỐI bảng, nên dữ liệu thật của
 * repo (bài seed `K8S-00xx`) không chen vào giữa các ca dưới đây.
 */
const CODES = ['K8S-9901', 'K8S-9902', 'K8S-9903', 'K8S-9904', 'K8S-9905', 'K8S-9906'] as const;

const CLUSTER = {
  nodes: [{ name: 'n1', cpu: 1000, memory: 1024, ready: true }],
  namespaces: ['ns'],
  resources: [],
};

/**
 * Hình dạng dòng TRƯỚC 18.B — có `required`, KHÔNG có `visible`.
 *
 * ⚠ Cố ý giữ nguyên, đừng "cập nhật" sang hình dạng `Testcase`. Mọi dòng đang
 * nằm trong bảng thật đều trông như thế này, và ô này là chỗ duy nhất trong bộ
 * test chạy cả đường truy vấn danh sách TRÊN dữ liệu cũ — tức nó gác luôn cái
 * mặc định `visible: true` của `problemTestcases` ở quy mô một trang, không chỉ
 * ở mức một hàm. Dựng dữ liệu mới ở đây là bỏ mất phép gác đó mà không ai thấy.
 */
const OBJECTIVES = [
  { id: 'o1', label: 'Xong', check: 'resource-exists', args: { kind: 'Pod' }, required: true },
];

async function seed(): Promise<void> {
  await cleanup();
  await db.insert(users).values(
    USER_IDS.map((id) => ({ id, name: id, email: `${id}@test.local`, role: 'user' as const })),
  );
  await db.insert(problems).values([
    row('K8S-9901', { difficulty: 'medium', topics: ['networking'], tags: ['a', 'b'] }),
    row('K8S-9902', { difficulty: 'medium', topics: ['storage'], tags: ['a'] }),
    row('K8S-9903', { difficulty: 'medium', topics: ['networking', 'storage'], tags: ['b'] }),
    row('K8S-9904', { difficulty: 'easy', topics: ['security'], tags: ['a', 'b', 'c'] }),
    row('K8S-9905', { difficulty: 'expert', topics: ['workload'], tags: [] }),
    // Bản nháp của AUTHOR — vế "draft không lộ" xoay quanh dòng này.
    row('K8S-9906', { difficulty: 'easy', topics: ['workload'], tags: [], state: 'draft' }),
  ]);
  await db.insert(problemSubmissions).values([
    // LEARNER thử ba lần trên 9901, giải được một lần ⇒ vẫn là MỘT người thử,
    // MỘT người giải. Đây là chỗ `count(*)` và `count(distinct user)` khác nhau.
    sub('K8S-9901', LEARNER.id, false, 0),
    sub('K8S-9901', LEARNER.id, false, 0),
    sub('K8S-9901', LEARNER.id, true, 800),
    sub('K8S-9901', LEARNER_2.id, false, 0),
    sub('K8S-9902', LEARNER_2.id, true, 900),
  ]);
}

function row(code: string, over: Record<string, unknown>) {
  return {
    code,
    slug: `p14d-${code.toLowerCase()}`,
    title: `Bài ${code}`,
    statement: 'Đề ngắn.',
    difficulty: 'medium' as const,
    topics: ['workload' as const],
    tags: [] as string[],
    timeLimitSec: null,
    initialState: CLUSTER,
    objectives: OBJECTIVES,
    allowedResources: null,
    hints: [{ id: 'h1', text: 'bí mật', penaltyPoints: 40 }],
    parMoves: 1,
    state: 'published' as const,
    authorId: AUTHOR.id,
    ...over,
    // `unknown` ở giữa là BẮT BUỘC chứ không phải thói quen: cột `objectives` nay
    // khai `Testcase[]`, còn `OBJECTIVES` cố ý là hình dạng cũ (xem khối trên),
    // và hai hình dạng đó không so sánh được nên `as` một nhịp bị TS từ chối.
    // Phép ép mô tả đúng thứ đi xuống jsonb — nó không giấu một field sai.
  } as unknown as typeof problems.$inferInsert;
}

function sub(problemCode: string, userId: string, solved: boolean, score: number) {
  return {
    problemCode,
    userId,
    solved,
    score,
    durationSeconds: 60,
    movesUsed: 3,
    hintsRevealed: [] as string[],
  };
}

async function cleanup(): Promise<void> {
  await db.delete(problemHintReveals).where(inArray(problemHintReveals.problemCode, [...CODES]));
  await db.delete(problemSubmissions).where(inArray(problemSubmissions.problemCode, [...CODES]));
  await db.delete(problems).where(inArray(problems.code, [...CODES]));
  await db.delete(users).where(inArray(users.id, USER_IDS));
}

/** Đi hết mọi trang bằng chính `nextCursor` mà tầng dịch vụ trả ra. */
async function walkAllPages(
  viewer: AuthedUser,
  options: Omit<ProblemListOptions, 'cursor'>,
): Promise<readonly AuthorProblemWithStats[]> {
  const collected: AuthorProblemWithStats[] = [];
  let cursor: string | null = null;
  /*
   * Trần vòng lặp: một keyset hỏng theo chiều "không tiến" sẽ lặp vô hạn, và một
   * test treo đọc ra như một test chậm.
   *
   * ⛔ Suy TỪ SỐ DÒNG THẬT, không phải một hằng. Bản đầu ghi cứng `20`, và với
   * `limit: 1` điều đó có nghĩa là ô này chỉ sống khi DB cục bộ có ≤ 20 bài nhìn
   * thấy được. Nó đỏ thật ngày 2026-09-18 sau hai lượt `@flow` soạn bài (mỗi
   * lượt thêm một bài `published`) — *"phân trang không kết thúc sau 20 trang"*,
   * một câu đọc ra như "keyset hỏng" trong khi keyset hoàn toàn lành. Máy dùng
   * chung thì bài chỉ có thêm, nên hằng đó chắc chắn sẽ sai lần nữa.
   *
   * `+ 2` là biên an toàn cho trang cuối rỗng và cho một dòng chen vào giữa lượt
   * đi; vẫn hữu hạn nên vế "không tiến" vẫn bị bắt.
   */
  const tong = await db.$count(problems);
  const tranTrang = Math.ceil(tong / Math.max(1, options.limit ?? 20)) + 2;
  for (let page = 0; page < tranTrang; page += 1) {
    const result = await listProblems(db, {
      visibility: problemVisibilityFor(viewer),
      viewerId: viewer.id,
      options: cursor === null ? options : { ...options, cursor },
    });
    collected.push(...result.items);
    if (result.nextCursor === null) {
      return collected;
    }
    cursor = result.nextCursor;
  }
  throw new Error(`phân trang không kết thúc sau ${String(tranTrang)} trang (${String(tong)} bài trong DB)`);
}

function codesOf(items: readonly AuthorProblemWithStats[]): readonly string[] {
  return items.map((item) => item.problem.code);
}

/** Chỉ giữ những mã của bộ dữ liệu này — repo có thể đã có bài seed thật. */
function mine(items: readonly AuthorProblemWithStats[]): readonly string[] {
  return codesOf(items).filter((code) => (CODES as readonly string[]).includes(code));
}

beforeAll(seed);
afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe('phân trang keyset', () => {
  it('không mất dòng và không lặp dòng khi khoá sắp xếp TRÙNG NHAU', async () => {
    // Ba bài cùng `difficulty: 'medium'`. Không có vế tie-break `code`, trang sau
    // sẽ bắt đầu sau CẢ NHÓM trùng đó — mất dòng, im lặng, không lỗi.
    const all = await walkAllPages(LEARNER, { orderBy: 'difficulty', direction: 'asc', limit: 2 });
    const got = mine(all);
    expect(new Set(got).size, 'có dòng bị LẶP giữa hai trang').toBe(got.length);
    expect([...got].sort()).toEqual(['K8S-9901', 'K8S-9902', 'K8S-9903', 'K8S-9904', 'K8S-9905']);
  });

  it('cùng một tập dòng bất kể kích thước trang', async () => {
    const big = mine(await walkAllPages(LEARNER, { orderBy: 'difficulty', limit: 100 }));
    const small = mine(await walkAllPages(LEARNER, { orderBy: 'difficulty', limit: 1 }));
    expect([...small].sort()).toEqual([...big].sort());
  });

  it('sắp theo độ khó dùng thứ tự KHAI BÁO của enum, không phải thứ tự chữ cái', async () => {
    // Chữ cái sẽ cho `easy < expert < hard < medium`. Thang thật là
    // `easy < medium < hard < expert`, và Postgres biết điều đó vì kiểu enum
    // được tạo theo đúng thứ tự `PROBLEM_DIFFICULTIES`.
    const all = await walkAllPages(LEARNER, { orderBy: 'difficulty', direction: 'asc', limit: 100 });
    const levels = all
      .filter((item) => (CODES as readonly string[]).includes(item.problem.code))
      .map((item) => item.problem.difficulty);
    expect(levels[0]).toBe('easy');
    expect(levels[levels.length - 1]).toBe('expert');
  });

  it('keyset trên solverCount — một cột GỘP, không phải cột lưu sẵn', async () => {
    const all = mine(await walkAllPages(LEARNER, { orderBy: 'solverCount', direction: 'desc', limit: 2 }));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(5);
  });

  it('cursor rác bị từ chối bằng 400, không phải 500', async () => {
    await expect(
      listProblems(db, {
        visibility: problemVisibilityFor(LEARNER),
        viewerId: LEARNER.id,
        options: { orderBy: 'difficulty', limit: 5, cursor: 'rác' },
      }),
    ).rejects.toThrow(TRPCError);
  });
});

describe('luật lọc: chủ đề HOẶC, tag VÀ', () => {
  it('nhiều chủ đề = HOẶC', async () => {
    const got = mine(
      await walkAllPages(LEARNER, { filter: { topics: ['networking', 'storage'] }, limit: 100 }),
    );
    expect([...got].sort()).toEqual(['K8S-9901', 'K8S-9902', 'K8S-9903']);
  });

  it('nhiều tag = VÀ — cố ý khác luật của chủ đề', async () => {
    const got = mine(await walkAllPages(LEARNER, { filter: { tags: ['a', 'b'] }, limit: 100 }));
    expect([...got].sort()).toEqual(['K8S-9901', 'K8S-9904']);
  });

  it('một tag vẫn là phép chứa, không phải phép bằng', async () => {
    const got = mine(await walkAllPages(LEARNER, { filter: { tags: ['c'] }, limit: 100 }));
    expect(got).toEqual(['K8S-9904']);
  });

  it('tìm theo mã và tiêu đề, KHÔNG tìm trong đề bài', async () => {
    const byCode = mine(await walkAllPages(LEARNER, { filter: { query: '9903' }, limit: 100 }));
    expect(byCode).toEqual(['K8S-9903']);
    // "Đề ngắn." là `statement` của MỌI bài trong bộ này; tìm ra nó nghĩa là
    // phép tìm đã lan sang cột mà hợp đồng cấm.
    const byStatement = mine(await walkAllPages(LEARNER, { filter: { query: 'Đề ngắn' }, limit: 100 }));
    expect(byStatement).toEqual([]);
  });
});

describe('bản nháp không lộ ra ngoài', () => {
  it('người học không thấy draft trong danh sách', async () => {
    const got = mine(await walkAllPages(LEARNER, { limit: 100 }));
    expect(got).not.toContain('K8S-9906');
  });

  it('người học biết MÃ vẫn không đọc được draft', async () => {
    await expect(
      getProblemForViewer(db, problemVisibilityFor(LEARNER), LEARNER.id, 'K8S-9906'),
    ).rejects.toThrow(TRPCError);
  });

  it('lọc state draft trả trang RỖNG, không trả lỗi', async () => {
    // Một lỗi ở đây xác nhận rằng có bản nháp tồn tại — đúng thứ `draft` phải giấu.
    const page = await listProblems(db, {
      visibility: problemVisibilityFor(LEARNER),
      viewerId: LEARNER.id,
      options: { filter: { state: ['draft'] }, limit: 100 },
    });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('tác giả KHÁC cũng không thấy draft của người này', async () => {
    const got = mine(await walkAllPages(OTHER_AUTHOR, { limit: 100 }));
    expect(got).not.toContain('K8S-9906');
  });

  it('chính tác giả thì thấy, và admin cũng thấy', async () => {
    expect(mine(await walkAllPages(AUTHOR, { limit: 100 }))).toContain('K8S-9906');
    expect(mine(await walkAllPages(ADMIN, { limit: 100 }))).toContain('K8S-9906');
  });

  it('gợi ý bị che với người học, nguyên văn với tác giả', async () => {
    const forLearner = await getProblemForViewer(
      db,
      problemVisibilityFor(LEARNER),
      LEARNER.id,
      'K8S-9901',
    );
    expect(forLearner.problem.hints[0]?.revealed).toBe(false);
    expect(forLearner.problem.hints[0]?.text).toBeNull();
    // Giá vẫn hiện: người học phải biết mở tốn bao nhiêu mới quyết định được.
    expect(forLearner.problem.hints[0]?.penaltyPoints).toBe(40);

    const forAuthor = await getProblemForViewer(db, problemVisibilityFor(AUTHOR), AUTHOR.id, 'K8S-9901');
    expect(forAuthor.problem.hints[0]?.text).toBe('bí mật');
  });
});

describe('số liệu TÍNH từ bảng nộp bài', () => {
  it('đếm distinct người, không đếm số lượt nộp', async () => {
    // LEARNER nộp ba lần trên 9901; nếu đây đếm dòng thì `attemptCount` ra 4.
    const stats = await problemStats(db, 'K8S-9901');
    expect(stats.attemptCount).toBe(2);
    expect(stats.solverCount).toBe(1);
    expect(stats.acceptanceRate).toBeCloseTo(0.5, 10);
  });

  it('chưa ai thử thì tỉ lệ là 0, không phải NaN', async () => {
    const stats = await problemStats(db, 'K8S-9905');
    expect(stats).toEqual({ attemptCount: 0, solverCount: 0, acceptanceRate: 0 });
  });

  it('danh sách trả cùng số liệu với truy vấn lẻ', async () => {
    const page = await walkAllPages(LEARNER, { limit: 100 });
    const item = page.find((entry) => entry.problem.code === 'K8S-9901');
    expect(item?.stats).toEqual(await problemStats(db, 'K8S-9901'));
  });

  it('viewerStatus phân biệt đủ ba trạng thái', async () => {
    const page = await walkAllPages(LEARNER, { limit: 100 });
    const status = (code: string) => page.find((item) => item.problem.code === code)?.viewerStatus;
    expect(status('K8S-9901')).toBe('solved');
    expect(status('K8S-9905')).toBe('untouched');

    const page2 = await walkAllPages(LEARNER_2, { limit: 100 });
    const status2 = (code: string) => page2.find((item) => item.problem.code === code)?.viewerStatus;
    // LEARNER_2 nộp trượt 9901 và giải được 9902.
    expect(status2('K8S-9901')).toBe('attempted');
    expect(status2('K8S-9902')).toBe('solved');
  });

  it('lọc theo viewerStatus dùng đúng ba nhánh', async () => {
    const solved = mine(await walkAllPages(LEARNER, { filter: { viewerStatus: ['solved'] }, limit: 100 }));
    expect(solved).toEqual(['K8S-9901']);
    const untouched = mine(
      await walkAllPages(LEARNER, { filter: { viewerStatus: ['untouched'] }, limit: 100 }),
    );
    // `untouched` phải bắt được cả những bài `LEFT JOIN` không khớp dòng nào —
    // `solved = false` không diễn đạt được điều đó vì `NULL = false` là `NULL`.
    // LEARNER chỉ nộp trên 9901, nên bốn bài còn lại đều `untouched` — kể cả
    // 9902, bài mà LEARNER_2 đã giải. Trạng thái này là của NGƯỜI ĐANG XEM.
    expect([...untouched].sort()).toEqual(['K8S-9902', 'K8S-9903', 'K8S-9904', 'K8S-9905']);
  });
});
