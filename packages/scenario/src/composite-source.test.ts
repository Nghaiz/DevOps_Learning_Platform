import { describe, expect, it } from 'vitest';
import type { Scenario, ScenarioSummary } from '@devops-platform/shared-types/scenario';
import { compositeContentSource } from './composite-source.ts';
import type { ContentSourceLogger } from './db-source.ts';
import { InvalidCursorError } from './errors.ts';
import { matchesContentFilter, paginateSorted, type ContentSource } from './source.ts';

/** Logger thu vào mảng — cảnh báo là một HÀNH VI được kiểm, không phải rác log. */
function recorder(): ContentSourceLogger & { entries: { message: string; detail: Record<string, unknown> }[] } {
  const entries: { message: string; detail: Record<string, unknown> }[] = [];
  return {
    entries,
    warn(message, detail) {
      entries.push({ message, detail });
    },
  };
}

function summary(id: string, title: string): ScenarioSummary {
  return {
    id,
    title,
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'sysbox',
    capabilities: [],
    stepCount: 1,
  };
}

function scenario(id: string, title: string): Scenario {
  return {
    id,
    title,
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu',
    requiresCapabilities: null,
    interfaceLayout: null,
    assets: [],
    source: null,
    intro: null,
    finish: null,
    steps: [
      {
        index: 0,
        title: null,
        markdown: '#',
        setup: { foreground: null, background: null },
        verifyScript: null,
      },
    ],
    ignoredUpstreamFields: [],
  };
}

/** Nguồn giả tối thiểu — chỉ lesson; ba method còn lại trả rỗng. */
function fakeSource(
  kind: string,
  items: readonly { id: string; title: string }[],
  overrides: Partial<ContentSource> = {},
): ContentSource {
  return {
    kind,
    async list() {
      return items.map((i) => summary(i.id, i.title));
    },
    async get(id: string) {
      const found = items.find((i) => i.id === id);
      return found === undefined ? null : scenario(found.id, found.title);
    },
    // D9 (phase-13) — dựng trên chính `list()`/`get()` giả ở trên bằng đúng
    // helper mà `filesystemScenarioSource` thật dùng, để test composite-level
    // pagination không phải tự dựng lại logic keyset một lần nữa.
    async listPage(options) {
      const all = items
        .map((i) => summary(i.id, i.title))
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter((s) => matchesContentFilter(s, options.filter));
      return paginateSorted(all, options);
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
    ...overrides,
  };
}

describe('compositeContentSource — luật ưu tiên', () => {
  it('trùng id ⇒ nguồn ĐỨNG TRƯỚC (đĩa) thắng, và WARN nêu ĐÍCH DANH cả hai nguồn', async () => {
    const log = recorder();
    const source = compositeContentSource(
      [
        fakeSource('filesystem:/content', [{ id: 'shared', title: 'bản trên đĩa' }]),
        fakeSource('db:published-only', [{ id: 'shared', title: 'bản trong DB' }]),
      ],
      { logger: log },
    );

    const items = await source.list();

    // Một mục, không hai — bài hiện MỘT lần dù có ở cả hai nguồn.
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('bản trên đĩa');

    // Ô AC: "log WARN nêu cả hai nguồn". Kiểm đúng điều đó, không chỉ kiểm có warn.
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]?.detail).toMatchObject({
      id: 'shared',
      winnerSourceKind: 'filesystem:/content',
      shadowedSourceKind: 'db:published-only',
    });
  });

  it('get cũng theo cùng luật: nguồn đầu trả khác null thì dừng', async () => {
    const source = compositeContentSource([
      fakeSource('filesystem:/content', [{ id: 'shared', title: 'bản trên đĩa' }]),
      fakeSource('db:published-only', [{ id: 'shared', title: 'bản trong DB' }]),
    ]);
    expect((await source.get('shared'))?.title).toBe('bản trên đĩa');
  });

  it('KHÔNG trùng id ⇒ cả hai cùng hiện, sắp theo id chứ không theo nguồn', async () => {
    const source = compositeContentSource([
      // Cố tình đặt id sắp SAU id của nguồn hai: nếu composite chỉ nối hai danh
      // sách, kết quả sẽ là ['z-disk','a-db'] — không đơn điệu, và cursor phân
      // trang sẽ bỏ sót ở đúng chỗ nối.
      fakeSource('filesystem:/content', [{ id: 'z-disk', title: 'đĩa' }]),
      fakeSource('db:published-only', [{ id: 'a-db', title: 'db' }]),
    ]);
    expect((await source.list()).map((s) => s.id)).toEqual(['a-db', 'z-disk']);
  });
});

describe('compositeContentSource — một nguồn chết', () => {
  it('list bỏ qua nguồn ném lỗi, vẫn trả nguồn còn lại, và WARN nêu tên nguồn hỏng', async () => {
    const log = recorder();
    const broken = fakeSource('db:published-only', [], {
      list: async () => {
        throw new Error('Postgres sập');
      },
    });
    const source = compositeContentSource(
      [fakeSource('filesystem:/content', [{ id: 'ok', title: 'đĩa' }]), broken],
      { logger: log },
    );

    expect((await source.list()).map((s) => s.id)).toEqual(['ok']);
    expect(log.entries[0]?.detail).toMatchObject({
      method: 'list',
      sourceKind: 'db:published-only',
      error: 'Postgres sập',
    });
  });

  it('get: MỌI nguồn hỏng ⇒ NÉM, không trả null', async () => {
    // Đây là phân biệt quan trọng nhất của file này. `null` sẽ thành 404, và 404
    // nói "bài không tồn tại" — một khẳng định ta vừa mất hết cơ sở để đưa ra.
    const boom = (kind: string): ContentSource =>
      fakeSource(kind, [], {
        get: async () => {
          throw new Error('down');
        },
      });
    const source = compositeContentSource([boom('a'), boom('b')], { logger: recorder() });
    await expect(source.get('bất-kỳ')).rejects.toThrow(/Mọi nguồn nội dung đều lỗi/);
  });

  it('get: một nguồn hỏng nhưng nguồn khác trả null ⇒ null (không tìm thấy thật)', async () => {
    const source = compositeContentSource(
      [
        fakeSource('db', [], {
          get: async () => {
            throw new Error('down');
          },
        }),
        fakeSource('filesystem', []),
      ],
      { logger: recorder() },
    );
    expect(await source.get('không-có')).toBeNull();
  });
});

describe('compositeContentSource — biên', () => {
  it('không nguồn nào ⇒ NÉM lúc dựng, không lặng lẽ trả danh sách rỗng', () => {
    // Errors over silent fallbacks: một `/lessons` trắng trơn trông y hệt "chưa
    // có bài nào".
    expect(() => compositeContentSource([])).toThrow(/ít nhất một nguồn/);
  });
});

/**
 * D9 (phase-13) — trang hợp nhất từ hai nguồn ĐỘC LẬP (đĩa `a*`, DB giả `b*`).
 * Đây là bài test trực tiếp cho vấn đề mà `errors.ts` § `InvalidCursorError`
 * mô tả: một cursor do NGUỒN NÀY phát ra hoàn toàn hợp lệ khi bị hỏi lại ở
 * NGUỒN KIA (không tồn tại ở đó), và điều đó KHÔNG được phép 400 oan.
 */
describe('compositeContentSource — listPage (D9)', () => {
  it('phân trang bắc cầu qua ranh giới hai nguồn — cursor của nguồn A không làm nguồn B ném', async () => {
    const a = fakeSource('a', [
      { id: 'a1', title: 'A1' },
      { id: 'a2', title: 'A2' },
    ]);
    const b = fakeSource('b', [
      { id: 'b1', title: 'B1' },
      { id: 'b2', title: 'B2' },
    ]);
    const composite = compositeContentSource([a, b]);

    const page1 = await composite.listPage({ limit: 2 });
    expect(page1.items.map((s) => s.id)).toEqual(['a1', 'a2']);
    expect(page1.nextCursor).toBe('a2');

    // Cursor 'a2' KHÔNG tồn tại ở nguồn `b` — nếu `b.listPage` tự validate và
    // ném, đây sẽ là một 400 oan cho một lượt phân trang hoàn toàn hợp lệ.
    const page2 = await composite.listPage({ limit: 2, cursor: page1.nextCursor as string });
    expect(page2.items.map((s) => s.id)).toEqual(['b1', 'b2']);
    expect(page2.nextCursor).toBeNull();
  });

  it('cursor không tồn tại ở BẤT KỲ nguồn nào ⇒ NÉM InvalidCursorError', async () => {
    const a = fakeSource('a', [{ id: 'a1', title: 'A1' }]);
    const b = fakeSource('b', [{ id: 'b1', title: 'B1' }]);
    const composite = compositeContentSource([a, b]);

    await expect(
      composite.listPage({ limit: 10, cursor: 'khong-ton-tai-o-dau-ca' }),
    ).rejects.toThrow(InvalidCursorError);
  });

  it('trùng id giữa hai nguồn ⇒ đĩa (nguồn đứng trước) thắng, WARN nêu đích danh cả hai', async () => {
    const disk = fakeSource('disk', [{ id: 'trung-id', title: 'Bản trên đĩa' }]);
    const db = fakeSource('db', [{ id: 'trung-id', title: 'Bản trong DB' }]);
    const logger = recorder();
    const composite = compositeContentSource([disk, db], { logger });

    const page = await composite.listPage({ limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('Bản trên đĩa');
    expect(
      logger.entries.some(
        (e) => e.message.includes('trùng id') && e.detail['winnerSourceKind'] === 'disk',
      ),
    ).toBe(true);
  });

  it('một nguồn còn trang sau (nextCursor khác null) dù mọi mục của nó bị đĩa che ⇒ composite vẫn báo còn trang', async () => {
    // `db` có 3 mục nhưng `limit: 1` chỉ hỏi 1 mục của MỖI nguồn — mục đó của
    // `db` ('z1') trùng id với mục của `disk`, nên nó bị che hoàn toàn khỏi
    // trang. Composite vẫn phải biết `db` còn dữ liệu phía sau.
    const disk = fakeSource('disk', [{ id: 'z1', title: 'Đĩa thắng' }]);
    const db = fakeSource('db', [
      { id: 'z1', title: 'Bị che' },
      { id: 'z2', title: 'Còn ở trang sau' },
    ]);
    const composite = compositeContentSource([disk, db]);

    const page = await composite.listPage({ limit: 1 });
    expect(page.items.map((s) => s.id)).toEqual(['z1']);
    expect(page.nextCursor).not.toBeNull();
  });

  it('trang hợp nhất RỖNG nhưng một nguồn còn dữ liệu ⇒ nextCursor KHÔNG null (không mất trang sau)', async () => {
    // Tái hiện chính xác `dbContentSource.pageOf` khi mọi dòng của trang rớt
    // schema: `items: []` NHƯNG `nextCursor` khác null (cursor tính từ dòng
    // RAW, không phải từ dòng đã summarize). Trả `null` ở composite khi đó nói
    // với client "hết rồi" trong khi phía sau còn dữ liệu hợp lệ.
    const empty = fakeSource('db-hong', [], {
      async listPage() {
        return { items: [], nextCursor: 'moc-cua-nguon' };
      },
    });
    const logger = recorder();
    const composite = compositeContentSource([empty], { logger });

    const page = await composite.listPage({ limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBe('moc-cua-nguon');
    expect(logger.entries.some((e) => e.message.includes('trang hợp nhất RỖNG'))).toBe(true);
  });

  it('trang rỗng và KHÔNG nguồn nào còn ⇒ nextCursor null (không bịa cursor)', async () => {
    const empty = fakeSource('db-rong', []);
    const composite = compositeContentSource([empty]);
    const page = await composite.listPage({ limit: 10 });
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('filter đi qua verbatim tới từng nguồn (áp trước khi merge)', async () => {
    const a = fakeSource('a', [
      { id: 'a1', title: 'A1' },
      { id: 'a2', title: 'A2' },
    ]);
    const composite = compositeContentSource([a]);

    // `summary()` helper của file này ghim `tier: 'sysbox'` cho MỌI mục giả —
    // lọc theo một tier khác phải trả về rỗng, chứng minh filter thật sự chạm
    // tới nguồn chứ không phải bị bỏ qua.
    const filtered = await composite.listPage({ limit: 10, filter: { tier: 'gvisor' } });
    expect(filtered.items).toHaveLength(0);

    const unfiltered = await composite.listPage({ limit: 10, filter: { tier: 'sysbox' } });
    expect(unfiltered.items).toHaveLength(2);
  });
});

/**
 * Chế độ hỏng NẶNG NHẤT của file này: một nguồn sập ĐÚNG MỘT NHỊP làm mất dòng
 * VĨNH VIỄN.
 *
 * `nextCursor` không phải một gợi ý — nó là một KHẲNG ĐỊNH gửi cho client: "mọi
 * mục có khoá ≤ mốc này đã được giao". Một trang lắp ráp thiếu một nguồn không
 * còn cơ sở nào để đưa ra khẳng định đó cho BẤT KỲ mốc nào, vì phần chưa đọc
 * được của nguồn hỏng bắt đầu ngay sau cursor vào. Client tin mốc ấy, đi tiếp,
 * và không bao giờ quay lại — khác hẳn `list()` (không có mốc, mỗi lượt hỏi lại
 * toàn bộ, nên một danh sách thiếu tự lành ở lượt sau).
 *
 * Kịch bản: đĩa giữ `d1,d3,d5,d7,d9`, DB giữ `d2,d4,d6,d8`, `limit=2`, DB
 * timeout đúng lần `listPage` thứ hai.
 */
describe('compositeContentSource — một nguồn hỏng MỘT NHỊP không được làm mất dòng', () => {
  // Dựng ở thân `describe`, không trong `it`: gói này đã có tiền sử đỏ vì hết
  // giờ khi chạy song song dưới turbo, và dữ liệu này bất biến giữa các ca.
  const diskItems = ['d1', 'd3', 'd5', 'd7', 'd9'].map((id) => ({ id, title: id }));
  const dbItems = ['d2', 'd4', 'd6', 'd8'].map((id) => ({ id, title: id }));
  const allIds = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd9'];

  /** DB khoẻ ở mọi lần `listPage` TRỪ lần thứ `failOnCall`. `get` luôn khoẻ. */
  function flakyDb(failOnCall: number): ContentSource {
    const healthy = fakeSource('db', dbItems);
    let calls = 0;
    return fakeSource('db', dbItems, {
      async listPage(options) {
        calls += 1;
        if (calls === failOnCall) {
          throw new Error('DB timeout');
        }
        return healthy.listPage(options);
      },
    });
  }

  /**
   * Đi hết các trang đúng như một client thật: lỗi thì refetch CÙNG mốc (nguồn
   * đã khoẻ lại ở nhịp sau), không tự nhảy mốc.
   */
  async function walkAllPages(composite: ContentSource): Promise<string[]> {
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      let page;
      try {
        page = await composite.listPage({ limit: 2, cursor });
      } catch {
        continue;
      }
      seen.push(...page.items.map((s) => s.id));
      if (page.nextCursor === null) {
        return seen;
      }
      cursor = page.nextCursor;
    }
    throw new Error(`phân trang không kết thúc sau 20 lượt — đã thấy: ${seen.join(',')}`);
  }

  it('d4 KHÔNG được biến mất: trang thiếu dữ liệu không được phát cursor như thể nó đầy đủ', async () => {
    const composite = compositeContentSource(
      [fakeSource('disk', diskItems), flakyDb(2)],
      { logger: recorder() },
    );

    expect(await walkAllPages(composite)).toEqual(allIds);
  });

  it('đối chứng: KHÔNG nguồn nào hỏng ⇒ cùng vòng lặp đó trả đủ chín dòng', async () => {
    // Nếu ca trên đỏ, ca này phải xanh — nếu cả hai cùng đỏ thì lỗi nằm ở vòng
    // lặp/dữ liệu của chính test, không phải ở `collectPages`.
    const composite = compositeContentSource(
      [fakeSource('disk', diskItems), fakeSource('db', dbItems)],
      { logger: recorder() },
    );

    expect(await walkAllPages(composite)).toEqual(allIds);
  });
});
