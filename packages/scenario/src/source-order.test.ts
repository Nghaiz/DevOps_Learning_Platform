import { describe, expect, it } from 'vitest';
import type { Scenario, ScenarioSummary } from '@devops-platform/shared-types/scenario';
import { compositeContentSource } from './composite-source.ts';
import type { ContentSourceLogger } from './db-source.ts';
import { InvalidCursorError } from './errors.ts';
import {
  CONTENT_ORDER_KEYS,
  compareContent,
  decodeContentCursor,
  encodeContentCursor,
  matchesContentFilter,
  paginateSorted,
  type ContentOrderKey,
  type ContentPage,
  type ContentSource,
  type ListPageOptions,
} from './source.ts';

/**
 * Phân trang keyset theo THỨ TỰ KHÁC `id` (phase-13, mở rộng D9).
 *
 * ## Câu hỏi mà bộ này trả lời
 *
 * Một cursor chỉ ổn định khi khoá sắp xếp là **duy nhất** và **khớp cursor**.
 * Sắp theo `difficulty` (bốn giá trị cho hàng chục bài) hay `duration` (nhiều
 * bài cùng 30 phút, nhiều bài `null`) nghĩa là khoá KHÔNG duy nhất, nên cursor
 * phải là cặp `(sortValue, id)`. Nếu quên vế `id`, biên trang vừa lặp vừa mất
 * dòng — và cả hai đều **không sinh lỗi nào**: client nhận một danh sách hợp lệ
 * trông y hệt một danh sách đúng.
 *
 * Nên phép kiểm ở đây không phải "trang 1 trông đúng" mà là một BẤT BIẾN đi hết
 * mọi trang:
 *
 * > hợp của mọi trang == đúng tập đầy đủ, không lặp một mục nào, và dãy nối lại
 * > đúng bằng thứ tự toàn phần đã khai.
 *
 * Chạy ở `limit` 1, 2, 3 — ba kích thước cho biên trang rơi vào những chỗ khác
 * nhau của các nhóm trùng khoá. `limit: 1` là ca gắt nhất: mỗi mục là một biên,
 * nên mọi lỗi `>=`/`>` lộ ra ngay ở bước thứ hai.
 *
 * ## Vì sao KHÔNG có `orderBy: 'title'` trong bộ này
 *
 * Vì nó không tồn tại, có chủ ý. Lý do đã đo nằm ở `CONTENT_ORDER_KEYS`
 * (`source.ts`): Postgres và `localeCompare('vi')` cho hai thứ tự khác nhau
 * trên tiêu đề tiếng Việt, nên một keyset theo `title` không thể vừa đúng bảng
 * chữ vừa không mất dòng ở ranh giới đĩa/DB.
 */

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

interface Fixture {
  readonly id: string;
  readonly difficulty: (typeof DIFFICULTIES)[number];
  readonly estimatedMinutes: number | null;
  readonly capabilities: readonly ('docker' | 'kubernetes' | 'multi-node')[];
}

/**
 * Bộ dữ liệu cố ý ĐỘC: khoá sắp xếp trùng nhau nhiều, và thứ tự `id` NGƯỢC với
 * thứ tự `difficulty`/`duration` ở vài chỗ.
 *
 * Một fixture mà `id` tăng dần đã sẵn khớp mọi thứ tự khác sẽ xanh kể cả khi
 * cursor bỏ hẳn vế khoá — tức không chứng minh gì. Ở đây `a` là `advanced`
 * (hạng 2) còn `f` là `beginner` (hạng 0), nên sắp theo độ khó BẮT BUỘC phải
 * đảo `a` xuống sau `f`.
 */
const FIXTURES: readonly Fixture[] = [
  { id: 'a-lesson', difficulty: 'advanced', estimatedMinutes: 30, capabilities: ['docker'] },
  { id: 'b-lesson', difficulty: 'beginner', estimatedMinutes: null, capabilities: [] },
  { id: 'c-lesson', difficulty: 'intermediate', estimatedMinutes: 30, capabilities: ['docker', 'kubernetes'] },
  { id: 'd-lesson', difficulty: 'beginner', estimatedMinutes: 5, capabilities: ['kubernetes'] },
  { id: 'e-lesson', difficulty: 'advanced', estimatedMinutes: null, capabilities: [] },
  { id: 'f-lesson', difficulty: 'beginner', estimatedMinutes: 30, capabilities: ['docker'] },
  { id: 'g-lesson', difficulty: 'intermediate', estimatedMinutes: 5, capabilities: [] },
];

function summaryOf(fixture: Fixture): ScenarioSummary {
  return {
    id: fixture.id,
    title: `Bài ${fixture.id}`,
    description: null,
    difficulty: fixture.difficulty,
    estimatedMinutes: fixture.estimatedMinutes,
    tier: 'sysbox',
    capabilities: [...fixture.capabilities],
    stepCount: 1,
  };
}

function scenarioOf(fixture: Fixture): Scenario {
  return {
    ...summaryOf(fixture),
    requiresCapabilities: null,
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    assets: [],
    source: null,
    intro: null,
    finish: null,
    steps: [
      {
        index: 0,
        title: 'Bước 1',
        markdown: '# nội dung',
        setup: { foreground: null, background: null },
        verifyScript: null,
      },
    ],
    ignoredUpstreamFields: [],
  };
}

const silentLogger: ContentSourceLogger = {
  warn() {
    /* bộ này không kiểm log; `composite-source.test.ts` mới là chỗ đó. */
  },
};

/** Nguồn giả tối thiểu, dựng trên CHÍNH `paginateSorted` mà nguồn đĩa thật dùng. */
function fakeSource(kind: string, fixtures: readonly Fixture[]): ContentSource {
  const page = (options: ListPageOptions): ContentPage<ScenarioSummary> =>
    paginateSorted(
      fixtures.map(summaryOf).filter((s) => matchesContentFilter(s, options.filter)),
      options,
    );
  return {
    kind,
    async list() {
      return fixtures.map(summaryOf);
    },
    async get(id: string) {
      const found = fixtures.find((f) => f.id === id);
      return found === undefined ? null : scenarioOf(found);
    },
    async listPage(options) {
      return page(options);
    },
    async listLabs() {
      return [];
    },
    async getLab() {
      return null;
    },
    async listLabsPage() {
      return { items: [], nextCursor: null };
    },
    async listPlaygrounds() {
      return [];
    },
    async getPlayground() {
      return null;
    },
    async listPlaygroundsPage() {
      return { items: [], nextCursor: null };
    },
  };
}

/**
 * Đi HẾT mọi trang và trả về dãy nối lại.
 *
 * ⛔ Có chốt chặn số vòng: một cursor không tiến (`nextCursor` trỏ lại đúng mục
 * đã trả) làm vòng lặp chạy mãi, và một test treo là một test không ai đọc kết
 * quả. Chốt ở `items.length * 4 + 8` — dư cho `limit: 1` trên mọi fixture.
 */
async function walkAllPages(
  source: ContentSource,
  options: Omit<ListPageOptions, 'cursor'>,
): Promise<readonly ScenarioSummary[]> {
  const seen: ScenarioSummary[] = [];
  let cursor: string | undefined;
  const maxPages = FIXTURES.length * 4 + 8;
  for (let pageNo = 0; pageNo <= maxPages; pageNo += 1) {
    const page: ContentPage<ScenarioSummary> = await source.listPage(
      cursor === undefined ? options : { ...options, cursor },
    );
    seen.push(...page.items);
    if (page.nextCursor === null) {
      return seen;
    }
    cursor = page.nextCursor;
  }
  throw new Error(`đi quá ${String(maxPages)} trang — cursor KHÔNG tiến`);
}

/** Thứ tự đúng, tính độc lập với mọi thứ liên quan tới phân trang. */
function expectedOrder(orderBy: ContentOrderKey, fixtures = FIXTURES): readonly string[] {
  return [...fixtures.map(summaryOf)].sort(compareContent(orderBy)).map((s) => s.id);
}

const LIMITS = [1, 2, 3] as const;

describe('keyset theo orderBy — đi HẾT trang, hợp = tập đầy đủ, không lặp', () => {
  const cases = CONTENT_ORDER_KEYS.flatMap((orderBy) =>
    LIMITS.map((limit) => ({ orderBy, limit })),
  );

  it.each(cases)('một nguồn · orderBy=$orderBy · limit=$limit', async ({ orderBy, limit }) => {
    const source = fakeSource('fake:one', FIXTURES);
    const walked = await walkAllPages(source, { limit, orderBy });
    const ids = walked.map((s) => s.id);

    // 1. Không lặp.
    expect(new Set(ids).size).toBe(ids.length);
    // 2. Hợp = tập đầy đủ (không mất dòng nào ở biên trang).
    expect([...ids].sort()).toEqual([...FIXTURES.map((f) => f.id)].sort());
    // 3. Dãy nối lại ĐÚNG thứ tự toàn phần đã khai — mạnh hơn (1)+(2): một hiện
    //    thực trả đủ mục nhưng sai thứ tự vẫn qua được hai câu trên.
    expect(ids).toEqual(expectedOrder(orderBy));
  });

  /**
   * Cùng bất biến, nhưng qua `compositeContentSource` với hai nguồn RỜI NHAU.
   *
   * Đây mới là ca mà "sắp lại theo `id` ở tầng gộp" chết: mỗi nguồn trả trang
   * đúng theo `orderBy`, composite trộn lại rồi phát `nextCursor` từ mục cuối
   * của thứ tự nó vừa dùng. Hai thứ tự khác nhau ⇒ mốc sai ⇒ mất dòng, im lặng.
   */
  it.each(cases)('composite hai nguồn · orderBy=$orderBy · limit=$limit', async ({ orderBy, limit }) => {
    const onDisk = FIXTURES.filter((_f, index) => index % 2 === 0);
    const inDb = FIXTURES.filter((_f, index) => index % 2 === 1);
    const source = compositeContentSource(
      [fakeSource('fake:disk', onDisk), fakeSource('fake:db', inDb)],
      { logger: silentLogger },
    );

    const ids = (await walkAllPages(source, { limit, orderBy })).map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...FIXTURES.map((f) => f.id)].sort());
    expect(ids).toEqual(expectedOrder(orderBy));
  });

  /**
   * Đối chứng dương cho chính bất biến trên: nếu fixture đã tình cờ khớp thứ tự
   * `id` thì ba câu khẳng định trên xanh với MỌI hiện thực, kể cả một hiện thực
   * bỏ hẳn vế khoá trong cursor. Câu này chứng minh fixture KHÔNG tình cờ.
   */
  it('fixture thật sự đảo thứ tự — nếu không, bộ test trên không chứng minh gì', () => {
    expect(expectedOrder('difficulty')).not.toEqual(expectedOrder('id'));
    expect(expectedOrder('duration')).not.toEqual(expectedOrder('id'));
    // …và khoá sắp xếp KHÔNG duy nhất (nếu duy nhất thì cursor một-vế cũng đúng).
    expect(new Set(FIXTURES.map((f) => f.difficulty)).size).toBeLessThan(FIXTURES.length);
    expect(new Set(FIXTURES.map((f) => f.estimatedMinutes)).size).toBeLessThan(FIXTURES.length);
  });

  it('"chưa khai thời lượng" xuống CUỐI, không lên đầu như thể bằng 0', async () => {
    const ids = (await walkAllPages(fakeSource('fake:one', FIXTURES), {
      limit: 3,
      orderBy: 'duration',
    })).map((s) => s.id);
    const noMinutes = FIXTURES.filter((f) => f.estimatedMinutes === null).map((f) => f.id);
    const tail = ids.slice(-noMinutes.length);
    expect([...tail].sort()).toEqual([...noMinutes].sort());
  });
});

describe('cursor mang CẢ HAI vế khoá', () => {
  it('orderBy=id giữ NGUYÊN dạng cũ — cursor là `id` trần', () => {
    const cursor = encodeContentCursor('id', summaryOf(FIXTURES[0] as Fixture));
    expect(cursor).toBe('a-lesson');
    expect(decodeContentCursor(cursor, 'id')).toEqual({ sortValue: null, id: 'a-lesson' });
  });

  it('orderBy khác id ⇒ cursor mang (khoá, id) và khứ hồi được', () => {
    const item = summaryOf(FIXTURES[2] as Fixture); // c-lesson · intermediate(1) · 30 phút
    expect(encodeContentCursor('difficulty', item)).toBe('d:1:c-lesson');
    expect(encodeContentCursor('duration', item)).toBe('m:30:c-lesson');
    expect(decodeContentCursor('d:1:c-lesson', 'difficulty')).toEqual({ sortValue: 1, id: 'c-lesson' });
    expect(decodeContentCursor('m:30:c-lesson', 'duration')).toEqual({ sortValue: 30, id: 'c-lesson' });
  });

  it('cursor của thứ tự KHÁC bị TỪ CHỐI, không đọc bừa theo khoá mới', () => {
    // Đổi cách sắp giữa chừng là chuyện có thật ở UI. Đọc `'d:1:c-lesson'` như
    // một id (hoặc như một cursor `duration`) sẽ cho một trang trông hợp lệ ở
    // sai chỗ — 400 nói thẳng "quay về trang đầu".
    expect(() => decodeContentCursor('d:1:c-lesson', 'id')).toThrow(InvalidCursorError);
    expect(() => decodeContentCursor('d:1:c-lesson', 'duration')).toThrow(InvalidCursorError);
    expect(() => decodeContentCursor('c-lesson', 'difficulty')).toThrow(InvalidCursorError);
  });

  it('cursor rác bị TỪ CHỐI thay vì phân tích ra một mốc bừa', () => {
    for (const bad of ['d::c-lesson', 'd:x:c-lesson', 'd:1:', 'd:1:c:d', 'd:1.5:c-lesson']) {
      expect(() => decodeContentCursor(bad, 'difficulty')).toThrow(InvalidCursorError);
    }
  });

  /**
   * Cursor sai định dạng phải nổ ra ở COMPOSITE, trước `Promise.allSettled`.
   *
   * `collectPages` nuốt lỗi của từng nguồn thành WARN "trang trả về đang
   * THIẾU". Nếu việc giải mã xảy ra bên trong nguồn, một cursor rác sẽ thành
   * một trang RỖNG kèm 200 thay vì 400 — mất mát im lặng, đúng thứ D9 tồn tại
   * để chặn.
   */
  it('composite ném InvalidCursorError cho cursor rác, KHÔNG trả trang rỗng 200', async () => {
    const source = compositeContentSource([fakeSource('fake:disk', FIXTURES)], {
      logger: silentLogger,
    });
    await expect(
      source.listPage({ limit: 3, orderBy: 'difficulty', cursor: 'khong-phai-cursor' }),
    ).rejects.toThrow(InvalidCursorError);
  });
});

describe('lọc theo capability — phép CHỨA, áp TRƯỚC khi cắt trang', () => {
  it('trả đúng tập mang năng lực đó (đối chứng dương: tập KHÁC RỖNG và KHÁC tập đầy đủ)', async () => {
    const source = fakeSource('fake:one', FIXTURES);
    const ids = (
      await walkAllPages(source, { limit: 2, filter: { capability: 'docker' } })
    ).map((s) => s.id);

    const expected = FIXTURES.filter((f) => f.capabilities.includes('docker')).map((f) => f.id);
    expect(ids).toEqual([...expected].sort());
    // Hai câu này là đối chứng: một hiện thực luôn-trả-rỗng, và một hiện thực
    // phớt lờ bộ lọc, đều KHÔNG qua được.
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(FIXTURES.length);
  });

  it('mục mang NHIỀU năng lực khớp khi hỏi MỘT trong số đó — chứa, không phải bằng', async () => {
    const ids = (
      await walkAllPages(fakeSource('fake:one', FIXTURES), {
        limit: 5,
        filter: { capability: 'kubernetes' },
      })
    ).map((s) => s.id);
    // `c-lesson` mang ['docker','kubernetes'] — một phép so bằng mảng sẽ trượt nó.
    expect(ids).toContain('c-lesson');
    expect(ids).toContain('d-lesson');
  });

  it('năng lực không ai có ⇒ rỗng (đối chứng ÂM cho hai câu trên)', async () => {
    const ids = (
      await walkAllPages(fakeSource('fake:one', FIXTURES), {
        limit: 5,
        filter: { capability: 'multi-node' },
      })
    ).map((s) => s.id);
    expect(ids).toEqual([]);
  });

  it('`limit` đếm dòng SAU lọc — trang đầu đầy chứ không vơi vì mục bị loại', async () => {
    // 3 mục mang `docker`. Hỏi limit 2 phải cho ĐÚNG 2 mục + còn trang sau; nếu
    // lọc chạy sau khi cắt, trang đầu sẽ chỉ còn 1 mục (a, b → b bị loại).
    const page = await fakeSource('fake:one', FIXTURES).listPage({
      limit: 2,
      filter: { capability: 'docker' },
    });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).not.toBeNull();
  });

  it('lọc capability + sắp theo difficulty cùng lúc vẫn đi hết được', async () => {
    const matching = FIXTURES.filter((f) => f.capabilities.includes('docker'));
    for (const limit of LIMITS) {
      const ids = (
        await walkAllPages(fakeSource('fake:one', FIXTURES), {
          limit,
          orderBy: 'difficulty',
          filter: { capability: 'docker' },
        })
      ).map((s) => s.id);
      expect(ids).toEqual(expectedOrder('difficulty', matching));
    }
  });
});
