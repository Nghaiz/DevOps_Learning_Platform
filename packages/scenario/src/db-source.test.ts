import { describe, expect, it } from 'vitest';
import type { ContentKind, ContentVisibility } from '@devops-platform/shared-types/authoring';
import {
  dbContentSource,
  type ContentBodyRow,
  type ContentItemRow,
  type ContentRepository,
  type ContentSourceLogger,
} from './db-source.ts';
import { matchesContentFilter, paginateSorted } from './source.ts';

function recorder(): ContentSourceLogger & { entries: { message: string; detail: Record<string, unknown> }[] } {
  const entries: { message: string; detail: Record<string, unknown> }[] = [];
  return {
    entries,
    warn(message, detail) {
      entries.push({ message, detail });
    },
  };
}

function itemRow(over: Partial<ContentItemRow> = {}): ContentItemRow {
  return {
    id: 'bai-mau',
    kind: 'lesson',
    state: 'published',
    authorId: 'author-1',
    title: 'Bài mẫu',
    description: null,
    difficulty: 'beginner',
    estimatedMinutes: null,
    tier: 'sysbox',
    capabilities: [],
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    passThresholdPercent: null,
    leaderboard: null,
    ttlSeconds: null,
    stepCount: 1,
    ...over,
  };
}

function bodyRow(item: ContentItemRow, over: Partial<ContentBodyRow> = {}): ContentBodyRow {
  return {
    item,
    steps: [
      {
        ordinal: 0,
        taskId: null,
        title: 'Bước 1',
        markdown: '# xin chào',
        setupForeground: null,
        setupBackground: null,
        verifyScript: null,
        weight: null,
        hint: null,
      },
    ],
    intro: null,
    finish: null,
    setup: null,
    assets: [],
    ...over,
  };
}

/** Repository giả — cũng ĐẾM lời gọi, để kiểm "không cache" và "list không đọc thân". */
function fakeRepo(
  rows: readonly ContentItemRow[],
  bodies: ReadonlyMap<string, ContentBodyRow> = new Map(),
): ContentRepository & { calls: { listItems: number; getItem: number; visibilities: ContentVisibility[] } } {
  const calls = { listItems: 0, getItem: 0, visibilities: [] as ContentVisibility[] };
  return {
    calls,
    async listItems(kind: ContentKind, visibility: ContentVisibility) {
      calls.listItems += 1;
      calls.visibilities.push(visibility);
      return rows.filter((r) => r.kind === kind);
    },
    async getItem(id: string, kind: ContentKind, visibility: ContentVisibility) {
      calls.getItem += 1;
      calls.visibilities.push(visibility);
      const body = bodies.get(id);
      return body === undefined || body.item.kind !== kind ? null : body;
    },
    // D9 (phase-13) — repository giả tối thiểu cho `listItemsPage`: cùng khuôn
    // `listItems` (không đếm/không cache khác), dựng trên `paginateSorted` +
    // `matchesContentFilter` thật (không phải một bản chép SQL-giả).
    async listItemsPage(kind: ContentKind, visibility: ContentVisibility, options) {
      calls.listItems += 1;
      calls.visibilities.push(visibility);
      const sorted = rows
        .filter((r) => r.kind === kind)
        .sort((a, b) => a.id.localeCompare(b.id))
        .filter((r) => matchesContentFilter(r, options.filter));
      const page = paginateSorted(sorted, options);
      return { items: page.items, hasMore: page.nextCursor !== null };
    },
  };
}

describe('dbContentSource — hợp đồng của seam', () => {
  it('list() KHÔNG gọi getItem — bản rút gọn dựng thẳng từ hàng metadata', async () => {
    const repo = fakeRepo([itemRow()]);
    const items = await dbContentSource(repo).list();

    expect(items.map((s) => s.id)).toEqual(['bai-mau']);
    // Toàn bộ lý do ranh giới rút-gọn-vs-đầy-đủ tồn tại: một `list()` đi qua
    // `get()` sẽ đọc markdown của mọi bước của mọi bài để vẽ một lưới thẻ.
    expect(repo.calls.getItem).toBe(0);
    expect(items[0]).not.toHaveProperty('steps');
  });

  it('KHÔNG cache: hai lời gọi list() = hai truy vấn', async () => {
    // Task 11 — "một bài vừa sửa mà 5 phút sau mới thấy là một lỗi người soạn
    // sẽ báo là 'mất bài'". Khác hẳn `filesystemScenarioSource`, vốn cache
    // promise cả vòng đời tiến trình.
    const repo = fakeRepo([itemRow()]);
    const source = dbContentSource(repo);
    await source.list();
    await source.list();
    expect(repo.calls.listItems).toBe(2);
  });

  it('sửa bài xong THẤY NGAY — lượt đọc kế tiếp trả nội dung mới', async () => {
    // Đối chứng thời gian của ô AC: repository trả tiêu đề khác ở lượt thứ hai;
    // nếu nguồn cache thì lượt đó vẫn trả tiêu đề cũ.
    let title = 'Tiêu đề cũ';
    const repo: ContentRepository = {
      async listItems() {
        return [itemRow({ title })];
      },
      async getItem() {
        return null;
      },
      async listItemsPage() {
        return { items: [itemRow({ title })], hasMore: false };
      },
    };
    const source = dbContentSource(repo);
    expect((await source.list())[0]?.title).toBe('Tiêu đề cũ');
    title = 'Tiêu đề mới';
    expect((await source.list())[0]?.title).toBe('Tiêu đề mới');
  });

  it('tầm nhìn mặc định là published-only — fail-closed khi caller quên truyền', async () => {
    const repo = fakeRepo([]);
    await dbContentSource(repo).list();
    expect(repo.calls.visibilities[0]).toEqual({ kind: 'published-only' });
  });

  it('tầm nhìn author đi NGUYÊN VẸN xuống repository', async () => {
    const repo = fakeRepo([]);
    await dbContentSource(repo, { visibility: { kind: 'author', authorId: 'u-9' } }).list();
    expect(repo.calls.visibilities[0]).toEqual({ kind: 'author', authorId: 'u-9' });
  });

  it('kind mang tầm nhìn — để log/chẩn đoán phân biệt được hai instance', async () => {
    expect(dbContentSource(fakeRepo([])).kind).toBe('db:published-only');
    expect(dbContentSource(fakeRepo([]), { visibility: { kind: 'admin' } }).kind).toBe('db:admin');
  });
});

describe('dbContentSource — hàng hỏng bị BỎ QUA kèm WARN, không ném', () => {
  it('lesson 0 bước không lọt vào list() của người học', async () => {
    // `scenarioSummarySchema` đòi `stepCount` DƯƠNG. Một bài nháp 0 bước lọt vào
    // catalog sẽ là một thẻ bấm vào ra trang trắng.
    const log = recorder();
    const items = await dbContentSource(fakeRepo([itemRow({ stepCount: 0 })]), {
      logger: log,
    }).list();

    expect(items).toEqual([]);
    expect(log.entries[0]?.detail).toMatchObject({ id: 'bai-mau' });
  });

  it('get() trả null cho hàng không qua được schema, và ghi TÊN FIELD sai', async () => {
    const bad = itemRow({ difficulty: 'siêu-khó' });
    const log = recorder();
    const source = dbContentSource(fakeRepo([bad], new Map([[bad.id, bodyRow(bad)]])), {
      logger: log,
    });

    expect(await source.get('bai-mau')).toBeNull();
    const issues = log.entries[0]?.detail['issues'];
    expect(Array.isArray(issues) && issues.some((i) => String(i).startsWith('difficulty'))).toBe(true);
  });

  it('một hàng hỏng KHÔNG làm hỏng cả danh sách', async () => {
    // Cùng kỷ luật ba-cache-tách-rời của `filesystemScenarioSource`: một bài
    // soạn sai không được phép làm `/lessons` ngừng phục vụ.
    const items = await dbContentSource(
      fakeRepo([itemRow({ id: 'hong', stepCount: 0 }), itemRow({ id: 'tot' })]),
      { logger: recorder() },
    ).list();
    expect(items.map((s) => s.id)).toEqual(['tot']);
  });
});

describe('dbContentSource — hằng số của nguồn, không phải cột', () => {
  it('bài soạn trên UI luôn có source: null và ignoredUpstreamFields: []', async () => {
    const row = itemRow();
    const source = dbContentSource(fakeRepo([row], new Map([[row.id, bodyRow(row)]])));
    const lesson = await source.get('bai-mau');

    // Không có cột nào cho hai field này, và đó là một khẳng định: bài soạn trên
    // UI KHÔNG có upstream để dẫn nguồn.
    expect(lesson?.source).toBeNull();
    expect(lesson?.ignoredUpstreamFields).toEqual([]);
  });

  it('setup của bước dựng từ HAI cột, không một', async () => {
    // Task 5 của phase-9 phác một cột `setupScript`; DTO thật có
    // `setup.{foreground,background}` và `runSetup` chạy chúng khác nhau.
    const row = itemRow();
    const body = bodyRow(row, {
      steps: [
        {
          ordinal: 0,
          taskId: null,
          title: null,
          markdown: '#',
          setupForeground: 'echo thấy được',
          setupBackground: 'apt-get update',
          verifyScript: null,
          weight: null,
          hint: null,
        },
      ],
    });
    const lesson = await dbContentSource(fakeRepo([row], new Map([[row.id, body]]))).get('bai-mau');
    expect(lesson?.steps[0]?.setup).toEqual({
      foreground: 'echo thấy được',
      background: 'apt-get update',
    });
  });
});
