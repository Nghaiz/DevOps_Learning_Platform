import { describe, expect, it } from 'vitest';
import type { Scenario, ScenarioSummary } from '@devops-platform/shared-types/scenario';
import { compositeContentSource } from './composite-source.ts';
import type { ContentSourceLogger } from './db-source.ts';
import type { ContentSource } from './source.ts';

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
    async listLabs() {
      return [];
    },
    async getLab() {
      return null;
    },
    async listPlaygrounds() {
      return [];
    },
    async getPlayground() {
      return null;
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
