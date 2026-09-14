import { describe, expect, it } from 'vitest';
import {
  buildSceneLayouts,
  laneHints,
  laneLabels,
  refsAt,
  sceneEdgeKeys,
  sceneEdges,
  sceneNodeIds,
  sceneNodes,
  toDagNodes,
  type SceneCommitNode,
  type SceneLayout,
  type SceneProps,
  type SceneView,
} from './scene-props.ts';

/**
 * Hợp đồng `SceneProps` — ô nghiệm thu AC-B và hai phát hiện về hợp đồng engine.
 *
 * ⚠ Layout trong file này viết TAY, không gọi `layoutDag`. Hai lý do, cả hai
 * đều là lý do tốt chứ không phải hệ quả của việc barrel chưa mở:
 *
 *  1. Test này gác PHÉP GHÉP view ↔ layout, không gác thuật toán phân tầng —
 *     `packages/games/src/core/layout/dag-layout.test.ts` đã gác cái đó.
 *  2. Một fixture viết tay cho phép dựng đúng những ca lệch mà thuật toán thật
 *     không sinh ra được theo yêu cầu: node có trong view mà KHÔNG có chỗ đứng,
 *     và mục layout KHÔNG có node. Cả hai đều xảy ra thật (một khung hình bắt
 *     được giữa hai lần tính), và cả hai phải không vẽ ra gì.
 */

function node(
  oid: string,
  parents: readonly string[],
  extra: Partial<SceneCommitNode> = {},
): SceneCommitNode {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    message: `Thông điệp ${oid}`,
    author: 'Bạn',
    parents,
    logicalTime: 1,
    reachable: true,
    repo: 'local',
    accent: 'normal',
    ...extra,
  };
}

const VIEW: SceneView = {
  nodes: [
    node('c1', []),
    node('c2', ['c1']),
    node('c3', ['c2']),
    node('c4', ['c2']),
    node('c9', ['c2'], { reachable: false, accent: 'orphaned' }),
    node('c1', [], { repo: 'origin' }),
    node('c2', ['c1'], { repo: 'origin' }),
  ],
  edges: [
    { from: 'c2', to: 'c1', kind: 'parent' },
    { from: 'c3', to: 'c2', kind: 'parent' },
    { from: 'c4', to: 'c2', kind: 'parent' },
    { from: 'c9', to: 'c2', kind: 'parent' },
    // Trùng lặp CÓ THẬT: `buildView` nối cạnh của hai kho, nên cạnh đã push
    // xuất hiện hai lần dưới dạng hai object bằng nhau từng trường.
    { from: 'c2', to: 'c1', kind: 'parent' },
    { from: 'c1', to: 'c1', kind: 'remote-mirror' },
    { from: 'c2', to: 'c2', kind: 'remote-mirror' },
  ],
  refs: [
    {
      name: 'refs/heads/main',
      shortName: 'main',
      oid: 'c3',
      kind: 'branch',
      repo: 'local',
      isCurrent: true,
    },
    {
      name: 'refs/heads/feature',
      shortName: 'feature',
      oid: 'c4',
      kind: 'branch',
      repo: 'local',
      isCurrent: false,
    },
    {
      name: 'refs/remotes/origin/main',
      shortName: 'origin/main',
      oid: 'c2',
      kind: 'remote',
      repo: 'local',
      isCurrent: false,
    },
    {
      name: 'refs/heads/main',
      shortName: 'main',
      oid: 'c2',
      kind: 'branch',
      repo: 'origin',
      isCurrent: false,
    },
  ],
  files: [],
  detached: false,
  hasOrigin: true,
  logicalTime: 7,
};

const LOCAL_LAYOUT: SceneLayout = {
  nodes: [
    { id: 'c1', depth: 0, lane: 0 },
    { id: 'c2', depth: 1, lane: 0 },
    { id: 'c3', depth: 2, lane: 0 },
    { id: 'c4', depth: 2, lane: 1 },
    { id: 'c9', depth: 2, lane: 2 },
  ],
  edges: [
    { from: 'c1', to: 'c2', points: [[0, 0], [1, 0]] },
    { from: 'c2', to: 'c3', points: [[1, 0], [2, 0]] },
    { from: 'c2', to: 'c4', points: [[1, 0], [1, 1], [2, 1]] },
    { from: 'c2', to: 'c9', points: [[1, 0], [1, 2], [2, 2]] },
  ],
  laneCount: 3,
  depthCount: 3,
};

const ORIGIN_LAYOUT: SceneLayout = {
  nodes: [
    { id: 'c1', depth: 0, lane: 0 },
    { id: 'c2', depth: 1, lane: 0 },
  ],
  edges: [{ from: 'c1', to: 'c2', points: [[0, 0], [1, 0]] }],
  laneCount: 1,
  depthCount: 2,
};

function props(overrides: Partial<SceneProps> = {}): SceneProps {
  return {
    view: VIEW,
    layouts: { local: LOCAL_LAYOUT, origin: ORIGIN_LAYOUT },
    interaction: { selectedId: null, hoveredId: null, onSelect: () => {}, onHover: () => {} },
    ...overrides,
  };
}

describe('AC-B · tập node và cạnh là một hàm THUẦN của SceneProps', () => {
  /*
    Ô chống-rỗng chạy TRƯỚC mọi ô khác, theo khuôn T0 đã dùng ở các cổng khác
    của repo. Không có nó thì một `sceneNodes` trả mảng rỗng làm MỌI ô dưới đây
    xanh trong khi không đo gì cả — đúng hình dạng `--shard` chia theo file đã
    cắn repo này một lần.
  */
  it('fixture thật sự có node ở CẢ HAI kho', () => {
    const ids = sceneNodeIds(props());
    expect(ids.length).toBeGreaterThan(5);
    expect(ids.some((id) => id.startsWith('local:'))).toBe(true);
    expect(ids.some((id) => id.startsWith('origin:'))).toBe(true);
  });

  it('cùng SceneProps ⇒ cùng tập, ổn định qua nhiều lượt gọi', () => {
    const a = props();
    expect(sceneNodeIds(a)).toEqual(sceneNodeIds(a));
    expect(sceneEdgeKeys(a)).toEqual(sceneEdgeKeys(a));
  });

  it('tập node KHÔNG phụ thuộc thứ tự mảng đầu vào', () => {
    const shuffled = props({ view: { ...VIEW, nodes: [...VIEW.nodes].reverse() } });
    expect(sceneNodeIds(shuffled)).toEqual(sceneNodeIds(props()));
  });

  it('định danh là repo:oid — cùng Oid ở hai kho là HAI node', () => {
    const ids = sceneNodeIds(props());
    expect(ids).toContain('local:c1');
    expect(ids).toContain('origin:c1');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('node không có chỗ đứng trong layout thì KHÔNG được vẽ', () => {
    const thin: SceneLayout = {
      ...LOCAL_LAYOUT,
      nodes: LOCAL_LAYOUT.nodes.filter((n) => n.id !== 'c9'),
    };
    const ids = sceneNodeIds(props({ layouts: { local: thin, origin: ORIGIN_LAYOUT } }));
    expect(ids).not.toContain('local:c9');
    expect(ids).toContain('local:c3');
  });

  it('mục layout không có node tương ứng thì cũng không vẽ ra gì', () => {
    const ghost: SceneLayout = {
      ...LOCAL_LAYOUT,
      nodes: [...LOCAL_LAYOUT.nodes, { id: 'khong-ton-tai', depth: 9, lane: 9 }],
    };
    const ids = sceneNodeIds(props({ layouts: { local: ghost, origin: ORIGIN_LAYOUT } }));
    expect(ids).not.toContain('local:khong-ton-tai');
    expect(ids).toEqual(sceneNodeIds(props()));
  });

  it('level một kho: origin layout null ⇒ không node origin nào', () => {
    const single = props({
      view: { ...VIEW, hasOrigin: false },
      layouts: { local: LOCAL_LAYOUT, origin: null },
    });
    expect(sceneNodeIds(single).every((id) => id.startsWith('local:'))).toBe(true);
  });
});

describe('phát hiện #2 · GitEdgeView không mang repo, và có phần tử trùng', () => {
  it('cạnh trùng bị khử theo khoá', () => {
    const keys = sceneEdgeKeys(props());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cạnh cha-con có ở CẢ HAI kho được nở ra hai cạnh, mỗi kho một', () => {
    const keys = sceneEdgeKeys(props());
    expect(keys).toContain('local:c2->local:c1#parent');
    expect(keys).toContain('origin:c2->origin:c1#parent');
  });

  it('remote-mirror luôn bắc từ local sang origin', () => {
    const mirror = sceneEdges(props()).filter((e) => e.kind === 'remote-mirror');
    expect(mirror).toHaveLength(2);
    for (const edge of mirror) {
      expect(edge.from.startsWith('local:')).toBe(true);
      expect(edge.to.startsWith('origin:')).toBe(true);
      expect(edge.repo).toBeNull();
    }
  });

  it('cạnh có đầu không được vẽ thì cũng không được vẽ', () => {
    const thin: SceneLayout = {
      ...LOCAL_LAYOUT,
      nodes: LOCAL_LAYOUT.nodes.filter((n) => n.id !== 'c9'),
    };
    const keys = sceneEdgeKeys(props({ layouts: { local: thin, origin: ORIGIN_LAYOUT } }));
    expect(keys.some((k) => k.includes('c9'))).toBe(false);
  });
});

describe('phát hiện #1 · layoutDag phải chạy MỘT LẦN MỖI KHO', () => {
  it('buildSceneLayouts gọi layoutDag hai lần, mỗi lần một tập id của riêng kho', () => {
    const calls: (readonly string[])[] = [];
    const fake = (nodes: readonly { readonly id: string }[]): SceneLayout => {
      calls.push(nodes.map((n) => n.id));
      return { nodes: [], edges: [], laneCount: 0, depthCount: 0 };
    };
    buildSceneLayouts(VIEW, fake);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(['c1', 'c2', 'c3', 'c4', 'c9']);
    expect(calls[1]).toEqual(['c1', 'c2']);
  });

  it('một kho ⇒ một lượt gọi', () => {
    let count = 0;
    buildSceneLayouts({ ...VIEW, hasOrigin: false }, () => {
      count++;
      return { nodes: [], edges: [], laneCount: 0, depthCount: 0 };
    });
    expect(count).toBe(1);
  });

  it('toDagNodes bỏ cha nằm ngoài kho đang xét', () => {
    const origin = toDagNodes(VIEW, 'origin');
    expect(origin.map((n) => n.id)).toEqual(['c1', 'c2']);
    expect(origin.find((n) => n.id === 'c2')?.parents).toEqual(['c1']);
  });

  it('toDagNodes KHÔNG đưa cạnh remote-mirror vào parents', () => {
    for (const dag of toDagNodes(VIEW, 'local')) {
      expect(dag.parents).not.toContain(dag.id);
    }
  });
});

describe('làn mang danh tính NHÁNH', () => {
  it('THÂN CHUNG thuộc về nhánh HEAD đang đứng, không phải nhánh tên nhỏ hơn', () => {
    /*
      Ô này gác một lỗi thật đã bắt được: bản đầu duyệt ref theo `shortName`
      tăng dần, nên `feature` < `main` và nó chiếm luôn c1←c2 — làn chính của
      đồ thị mang nhãn `feature` trong khi đó là đường của `main`.
    */
    const hints = laneHints(VIEW, 'local');
    expect(hints['c1']).toBe('main');
    expect(hints['c2']).toBe('main');
    expect(hints['c3']).toBe('main');
    expect(hints['c4']).toBe('feature');
  });

  it('không có nhánh nào là current thì chuỗi DÀI HƠN chiếm thân', () => {
    const noCurrent = {
      ...VIEW,
      refs: VIEW.refs.map((ref) => ({ ...ref, isCurrent: false })),
    };
    // main: c3-c2-c1 = 3; feature: c4-c2-c1 = 3; hoà ⇒ cắt theo tên, `feature` trước.
    expect(laneHints(noCurrent, 'local')['c2']).toBe('feature');
    // Kéo dài main thêm một commit thì nó thắng bằng độ dài, không cần là current.
    const longer = {
      ...noCurrent,
      nodes: [...noCurrent.nodes, node('c5', ['c3'])],
      refs: noCurrent.refs.map((ref) =>
        ref.shortName === 'main' && ref.repo === 'local' ? { ...ref, oid: 'c5' } : ref,
      ),
    };
    expect(laneHints(longer, 'local')['c2']).toBe('main');
  });

  it('laneHints không phụ thuộc thứ tự mảng refs', () => {
    const reversed = laneHints({ ...VIEW, refs: [...VIEW.refs].reverse() }, 'local');
    expect(reversed).toEqual(laneHints(VIEW, 'local'));
  });

  it('commit mồ côi không ref nào tới thì không có làn mang tên', () => {
    expect(laneHints(VIEW, 'local')['c9']).toBeUndefined();
  });

  it('laneLabels cho mỗi làn đúng một tên, tất định', () => {
    const labels = laneLabels(VIEW, LOCAL_LAYOUT, 'local');
    expect(labels[0]).toBe('main');
    expect(labels[1]).toBe('feature');
    expect(labels[2]).toBeUndefined();
    expect(laneLabels({ ...VIEW, refs: [...VIEW.refs].reverse() }, LOCAL_LAYOUT, 'local')).toEqual(
      labels,
    );
  });
});

describe('refsAt', () => {
  it('chỉ trả ref của đúng kho và đúng commit', () => {
    expect(refsAt(VIEW, 'local', 'c3').map((r) => r.shortName)).toEqual(['main']);
    expect(refsAt(VIEW, 'origin', 'c2').map((r) => r.shortName)).toEqual(['main']);
    expect(refsAt(VIEW, 'local', 'c2').map((r) => r.shortName)).toEqual(['origin/main']);
  });
});

describe('thứ tự trả về ổn định', () => {
  it('sceneNodes sắp theo (repo, depth, lane, oid)', () => {
    expect(sceneNodes(props()).map((n) => n.id)).toEqual([
      'local:c1',
      'local:c2',
      'local:c3',
      'local:c4',
      'local:c9',
      'origin:c1',
      'origin:c2',
    ]);
  });
});

/*
 * ══════════════════════════════════════════════════════════════════════════
 * SHIM GUARD — BẬT KHI LEAD MỞ BARREL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `packages/games` hiện không export gì của `git/` hay `core/layout/`, và
 * `exports` của package chỉ có một subpath nên deep import bị chặn. Chừng nào
 * khối dưới còn là chú thích, các kiểu ở `scene-props.ts` là một SHIM CẤU TRÚC
 * chưa được đối chứng với hợp đồng thật — một khoản nợ có tên, không phải một
 * thiết kế.
 *
 * Việc của lead: thêm ba dòng export vào `packages/games/src/index.ts` (danh
 * sách chính xác ghi ở đầu `scene-props.ts`), rồi BỎ CHÚ THÍCH khối này. Nó
 * không cần chạy gì — nó là một phép khẳng định lúc BIÊN DỊCH, và đó đúng là
 * thứ cần: nếu hợp đồng xoá hay đổi kiểu một trường renderer đọc, dòng gán dưới
 * đây đỏ ngay.
 *
 * import type { DagLayout, GitView } from '@devops-platform/games';
 * import type { SceneLayout, SceneView } from './scene-props.ts';
 *
 * it('GitView thật gán được vào SceneView, DagLayout thật gán được vào SceneLayout', () => {
 *   const viewGuard = (v: GitView): SceneView => v;
 *   const layoutGuard = (l: DagLayout): SceneLayout => l;
 *   expect(typeof viewGuard).toBe('function');
 *   expect(typeof layoutGuard).toBe('function');
 * });
 */
