import { describe, expect, it } from 'vitest';
import {
  sceneEdgeKeys,
  sceneNodeIds,
  type SceneCommitNode,
  type SceneFileCell,
  type SceneLayout,
  type SceneProps,
  type SceneView,
} from '../../shared/scene-props.ts';
import {
  assertPlanesClearOfDag,
  deviationY,
  laneZ,
  MAIN_LANE,
  maxDeviationOf,
  NODE_RADIUS,
  PLATE_CELL_STEP,
  PLATE_FLOOR,
  PLATE_OVERHANG,
  PLATE_Y,
  PLATE_Z,
  place3d,
  REPO_LANE_GAP,
  X_STEP,
  Y_STEP,
  Z_STEP,
} from './scene3d-contract.ts';

/**
 * Nền hợp đồng tầng 3D (17.K) — **lớp bảo vệ DUY NHẤT** cho phép toán mà bốn
 * lane khác dựng lên trên.
 *
 * ⚠ Mọi ô ở đây khẳng định một **bất biến**, không khẳng định "hàm chạy không
 * ném". Một `place3d()` trả đúng số phần tử với toạ độ sai vẫn qua được mọi
 * phép kiểm hình thức, và sai số đó chỉ lộ ra khi có người nhìn ảnh chụp —
 * nghĩa là không cổng tự động nào bắt được. Những khẳng định dưới đây bắt được.
 *
 * Layout ở đây viết TAY, không gọi `layoutDag`, vì cùng hai lý do đã ghi ở
 * `shared/scene-props.test.ts`: file này gác phép ĐẶT CHỖ, không gác thuật toán
 * phân tầng, và fixture tay dựng được những ca lệch mà thuật toán thật không
 * sinh ra theo yêu cầu.
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

/**
 * Ba đường dẫn, và `src/app.ts` nằm ở GIỮA theo thứ tự sắp xếp.
 *
 * ⚠ Vị trí giữa là cả điểm của fixture. File bị thiếu ở Index là file giữa, nên
 * nếu cột được đánh theo thứ tự DUYỆT thay vì theo đường dẫn, `src/util.ts` sẽ
 * tụt từ cột 2 xuống cột 1 trên riêng mặt phẳng Index — và `git add` đọc ra
 * thành "rơi chéo sang bên" thay vì "rơi thẳng xuống". Một file thiếu ở CUỐI
 * không bao giờ lộ ra lỗi đó.
 */
const PATHS = ['README.md', 'src/app.ts', 'src/util.ts'] as const;

const FILES: readonly SceneFileCell[] = [
  { path: 'README.md', zone: 'worktree', status: 'modified' },
  { path: 'src/app.ts', zone: 'worktree', status: 'untracked' },
  { path: 'src/util.ts', zone: 'worktree', status: 'modified' },
  // `src/app.ts` CỐ Ý vắng mặt ở Index — chưa `git add`.
  { path: 'README.md', zone: 'index', status: 'added' },
  { path: 'src/util.ts', zone: 'index', status: 'added' },
  { path: 'README.md', zone: 'head', status: 'unchanged' },
  { path: 'src/util.ts', zone: 'head', status: 'unchanged' },
];

const VIEW: SceneView = {
  nodes: [
    node('c1', []),
    node('c2', ['c1']),
    node('c3', ['c2']),
    node('c4', ['c2']),
    node('c5', ['c2']),
    node('c1', [], { repo: 'origin' }),
    node('c2', ['c1'], { repo: 'origin' }),
  ],
  edges: [
    { from: 'c2', to: 'c1', kind: 'parent' },
    { from: 'c3', to: 'c2', kind: 'parent' },
    { from: 'c4', to: 'c2', kind: 'parent' },
    { from: 'c5', to: 'c2', kind: 'parent' },
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
  ],
  files: FILES,
  detached: false,
  hasOrigin: true,
  logicalTime: 9,
};

/** Ba làn ⇒ độ lệch 0, 1, 2 — đủ để phân biệt "Y theo làn" với "Y hằng số". */
const LOCAL_LAYOUT: SceneLayout = {
  nodes: [
    { id: 'c1', depth: 0, lane: 0 },
    { id: 'c2', depth: 1, lane: 0 },
    { id: 'c3', depth: 2, lane: 0 },
    { id: 'c4', depth: 2, lane: 1 },
    { id: 'c5', depth: 3, lane: 2 },
  ],
  edges: [],
  laneCount: 3,
  depthCount: 4,
};

/**
 * ⚠ `depth` của `c1`/`c2` TRÙNG với layout cục bộ — và đó không phải trùng hợp
 * mà là điều kiện tiên quyết của bất biến "X dùng chung cho cả hai kho". Xem ô
 * test cùng tên: `place3d()` KHÔNG tự bảo đảm điều này, nó thừa hưởng.
 */
const ORIGIN_LAYOUT: SceneLayout = {
  nodes: [
    { id: 'c1', depth: 0, lane: 0 },
    { id: 'c2', depth: 1, lane: 0 },
  ],
  edges: [],
  laneCount: 1,
  depthCount: 2,
};

const EMPTY_LAYOUT: SceneLayout = { nodes: [], edges: [], laneCount: 0, depthCount: 0 };

function props(overrides: Partial<SceneProps> = {}): SceneProps {
  return {
    view: VIEW,
    layouts: { local: LOCAL_LAYOUT, origin: ORIGIN_LAYOUT },
    interaction: { selectedId: null, hoveredId: null, onSelect: () => {}, onHover: () => {} },
    ...overrides,
  };
}

describe('T0 · đối chứng chống-rỗng', () => {
  /*
    Chạy TRƯỚC mọi ô khác. Một `place3d()` trả cảnh rỗng làm MỌI ô `for (const
    n of nodes)` bên dưới xanh mà không đo gì — đúng hình dạng `--shard` chia
    theo file đã cắn repo này một lần (`rules/green-that-proves-nothing.md`).
  */
  it('fixture có node ở CẢ HAI kho, có nhiều làn, và có ô file ở CẢ BA mặt phẳng', () => {
    const p = place3d(props());
    expect(p.nodes.filter((n) => n.repo === 'local').length).toBeGreaterThan(3);
    expect(p.nodes.filter((n) => n.repo === 'origin').length).toBeGreaterThan(1);
    expect(new Set(p.nodes.map((n) => n.lane)).size).toBeGreaterThan(1);
    expect(new Set(p.plates.map((c) => c.zone))).toEqual(new Set(['worktree', 'index', 'head']));
    expect(maxDeviationOf(p.nodes)).toBeGreaterThan(0);
  });
});

describe('K.2 · ba trục, mỗi trục MỘT nghĩa', () => {
  const p = place3d(props());

  it('X = thời gian logic, và CHỈ thời gian logic', () => {
    for (const n of p.nodes) {
      expect(n.position[0]).toBe(n.depth * X_STEP);
    }
    // Cùng depth ⇒ cùng X bất kể làn hay kho; khác depth ⇒ khác X.
    const byDepth = new Map<number, Set<number>>();
    for (const n of p.nodes) {
      const seen = byDepth.get(n.depth) ?? new Set<number>();
      seen.add(n.position[0]);
      byDepth.set(n.depth, seen);
    }
    expect(byDepth.size).toBeGreaterThan(1);
    for (const seen of byDepth.values()) expect(seen.size).toBe(1);
    const xs = [...byDepth.values()].map((s) => [...s][0]);
    expect(new Set(xs).size).toBe(byDepth.size);
  });

  it('Z = làn nhánh, cộng khoảng trống giữa hai kho', () => {
    for (const n of p.nodes) {
      expect(n.position[2]).toBe(laneZ(n.repo, n.lane, p.localLaneCount));
    }
    const localZ = p.nodes.filter((n) => n.repo === 'local').map((n) => n.position[2]);
    const originZ = p.nodes.filter((n) => n.repo === 'origin').map((n) => n.position[2]);
    expect(Math.min(...originZ) - Math.max(...localZ)).toBeGreaterThanOrEqual(
      REPO_LANE_GAP * Z_STEP,
    );
  });

  it('Y = độ lệch khỏi nhánh chính, luôn >= 0 (nhánh phụ DÂNG LÊN)', () => {
    for (const n of p.nodes) {
      expect(n.deviation).toBe(Math.abs(n.lane - MAIN_LANE));
      expect(n.position[1]).toBe(deviationY(n.lane));
      expect(n.position[1]).toBe(n.deviation * Y_STEP);
      expect(n.position[1]).toBeGreaterThanOrEqual(0);
    }
    // Không hằng số: có cả node trên nhánh chính lẫn node lệch.
    expect(new Set(p.nodes.map((n) => n.position[1])).size).toBeGreaterThan(1);
  });

  it('chiều Y KHÔNG bị đảo — không node nào nằm dưới nhánh chính', () => {
    const onMain = p.nodes.filter((n) => n.lane === MAIN_LANE);
    const offMain = p.nodes.filter((n) => n.lane !== MAIN_LANE);
    expect(onMain.length).toBeGreaterThan(0);
    expect(offMain.length).toBeGreaterThan(0);
    for (const n of offMain) {
      expect(n.position[1]).toBeGreaterThan(0);
    }
  });
});

describe('K.8 · X dùng CHUNG cho cả hai kho — điều kiện để push/fetch bay NGANG', () => {
  const p = place3d(props());

  it('cùng một commit đã push đứng ở cùng X ở khối local và khối origin', () => {
    const shared = ['c1', 'c2'];
    for (const oid of shared) {
      const local = p.nodes.find((n) => n.id === `local:${oid}`);
      const origin = p.nodes.find((n) => n.id === `origin:${oid}`);
      expect(local).toBeDefined();
      expect(origin).toBeDefined();
      expect(local?.position[0]).toBe(origin?.position[0]);
      // …và KHÁC nhau ở Z, vì đó là trục phân tách hai kho.
      expect(local?.position[2]).not.toBe(origin?.position[2]);
    }
  });

  it('cạnh remote-mirror bắc ngang: hai đầu cùng X, lệch Z ít nhất một khoảng trống', () => {
    const mirrors = p.edges.filter((e) => e.kind === 'remote-mirror');
    expect(mirrors.length).toBeGreaterThan(0);
    for (const e of mirrors) {
      expect(e.crossesGap).toBe(true);
      expect(e.from[0]).toBe(e.to[0]);
      expect(e.from[1]).toBe(e.to[1]);
      expect(Math.abs(e.to[2] - e.from[2])).toBeGreaterThanOrEqual(REPO_LANE_GAP * Z_STEP);
    }
    for (const e of p.edges) {
      if (e.kind !== 'remote-mirror') expect(e.crossesGap).toBe(false);
    }
  });

  it('⚠ bất biến này THỪA HƯỞNG từ layout, place3d() không tự bảo đảm', () => {
    /*
      `place3d()` tính X bằng `depth * X_STEP`, mà `depth` đến từ layout RIÊNG
      của từng kho — hai lượt `layoutDag` tách biệt (phát hiện #1 ở
      `scene-props.ts`). Bất biến "cùng X" vì vậy là một tính chất của ĐẦU VÀO,
      không phải thứ hàm này áp đặt: nếu một ngày layout của `origin` đánh
      `depth` khác cho cùng một commit, push/fetch sẽ bay chéo và KHÔNG cổng nào
      ở đây đỏ.

      Ô này ghim tiền đề đó ra mặt chữ để nó là một giả định CÓ TÊN, thay vì một
      may mắn không ai biết mình đang dựa vào.
    */
    for (const oid of ['c1', 'c2']) {
      const inLocal = LOCAL_LAYOUT.nodes.find((n) => n.id === oid)?.depth;
      const inOrigin = ORIGIN_LAYOUT.nodes.find((n) => n.id === oid)?.depth;
      expect(inLocal).toBeDefined();
      expect(inLocal).toBe(inOrigin);
    }
  });
});

describe('K.3 · DAG không được đụng mặt phẳng ô file', () => {
  it('độ lệch bình thường ⇒ null (sạch)', () => {
    expect(assertPlanesClearOfDag(0)).toBeNull();
    expect(assertPlanesClearOfDag(maxDeviationOf(place3d(props()).nodes))).toBeNull();
  });

  it('độ lệch đủ lớn ⇒ MỘT CÂU CÓ SỐ, không phải một cờ boolean', () => {
    const message = assertPlanesClearOfDag(40);
    expect(message).not.toBeNull();
    expect(message).toContain('40');
    expect(message).toContain(String(PLATE_FLOOR));
    // Câu phải nêu độ cao thật của vùng DAG, không chỉ nói "có vi phạm".
    expect(message).toContain((40 * Y_STEP + NODE_RADIUS).toFixed(2));
  });

  it('cổng có một BIÊN thật: d qua được thì d+1 đỏ', () => {
    let last = -1;
    for (let d = 0; d < 200; d += 1) {
      if (assertPlanesClearOfDag(d) !== null) break;
      last = d;
    }
    expect(last).toBeGreaterThan(0);
    expect(assertPlanesClearOfDag(last)).toBeNull();
    expect(assertPlanesClearOfDag(last + 1)).not.toBeNull();
    // Biên khớp với hình học đã khai, không phải một con số rơi từ trên trời.
    expect(last * Y_STEP + NODE_RADIUS).toBeLessThan(PLATE_FLOOR);
    expect((last + 1) * Y_STEP + NODE_RADIUS).toBeGreaterThanOrEqual(PLATE_FLOOR);
  });

  it('ba mặt phẳng xếp từ dưới lên HEAD → Index → Worktree, và đều trên vùng DAG', () => {
    expect(PLATE_Y.head).toBeLessThan(PLATE_Y.index);
    expect(PLATE_Y.index).toBeLessThan(PLATE_Y.worktree);
    /*
      ⚠ `PLATE_FLOOR` KHÔNG bằng `PLATE_Y.head` — nó thấp hơn đúng một
      `PLATE_OVERHANG`, phần mà ô `deleted` được phép nhô xuống. Khẳng định sai
      chỗ này là một cổng nới tay hơn thứ nó gác: sàn khai báo sẽ nằm CAO hơn
      điểm thấp nhất mà mặt phẳng thật sự chiếm, và `assertPlanesClearOfDag()`
      còn báo sạch trong lúc DAG đã chạm vào đáy ô file.
    */
    expect(PLATE_OVERHANG).toBeGreaterThan(0);
    expect(PLATE_FLOOR).toBe(PLATE_Y.head - PLATE_OVERHANG);

    const plates = place3d(props()).plates;
    expect(plates.length).toBeGreaterThan(0);
    for (const cell of plates) {
      // Điểm THẤP NHẤT của ô, không phải tâm ô, mới là thứ phải nằm trên sàn.
      expect(cell.position[1] - PLATE_OVERHANG).toBeGreaterThanOrEqual(PLATE_FLOOR);
    }
  });
});

describe('K.3 · cột ô file KHOÁ THEO ĐƯỜNG DẪN, không theo thứ tự duyệt', () => {
  const plates = place3d(props()).plates;

  it('một đường dẫn giữ NGUYÊN cột trên mọi mặt phẳng nó có mặt', () => {
    for (const path of PATHS) {
      const xs = new Set(plates.filter((c) => c.path === path).map((c) => c.position[0]));
      expect(xs.size).toBe(1);
    }
  });

  it('file GIỮA vắng mặt ở Index không đẩy file sau nó lệch cột', () => {
    // `src/app.ts` chưa `git add`, nên Index chỉ có README.md và src/util.ts.
    expect(plates.some((c) => c.zone === 'index' && c.path === 'src/app.ts')).toBe(false);
    const util = plates.find((c) => c.zone === 'index' && c.path === 'src/util.ts');
    expect(util?.position[0]).toBe(2 * PLATE_CELL_STEP);
    // …tức là ĐÚNG cột nó giữ ở Worktree. Thiếu bất biến này, `git add` đọc ra
    // thành "rơi chéo sang bên" thay vì "rơi thẳng xuống".
    const onWorktree = plates.find((c) => c.zone === 'worktree' && c.path === 'src/util.ts');
    expect(util?.position[0]).toBe(onWorktree?.position[0]);
  });

  it('cột đánh theo thứ tự đường dẫn, bắt đầu từ 0, không có lỗ', () => {
    const columns = PATHS.map(
      (path) => (plates.find((c) => c.path === path)?.position[0] ?? -1) / PLATE_CELL_STEP,
    );
    expect(columns).toEqual([0, 1, 2]);
  });

  it('cả ba mặt phẳng đứng ở cùng một Z, phía TRƯỚC khối local', () => {
    for (const cell of plates) {
      expect(cell.position[2]).toBe(PLATE_Z);
    }
    expect(PLATE_Z).toBeLessThan(0);
  });
});

describe('AC-B · node và cạnh đến từ sceneNodes()/sceneEdges(), không từ view thô', () => {
  /*
    Không có ô này thì ô nghiệm thu AC-B vẫn xanh mà chẳng chứng minh gì: hai
    renderer có thể vẽ hai danh sách khác nhau, mỗi bên nhất quán với chính
    mình. Hợp đồng ở `scene-props.ts` nói thẳng — thứ được vẽ = thứ hai hàm đó
    trả về, và đây là chỗ khẳng định điều đó cho tầng 3D.
  */
  const p = place3d(props());

  it('tập id node BẰNG ĐÚNG sceneNodeIds(props), kể cả thứ tự', () => {
    expect(p.nodes.map((n) => n.id)).toEqual(sceneNodeIds(props()));
  });

  it('tập khoá cạnh BẰNG ĐÚNG sceneEdgeKeys(props), kể cả thứ tự', () => {
    expect(p.edges.map((e) => e.key)).toEqual(sceneEdgeKeys(props()));
  });

  it('mỗi đầu cạnh trùng khít vị trí node mang đúng id đó', () => {
    const at = new Map(p.nodes.map((n) => [n.id, n.position]));
    expect(p.edges.length).toBeGreaterThan(0);
    for (const e of p.edges) {
      const [from, to] = e.key.split('->');
      expect(e.from).toEqual(at.get(from ?? ''));
      expect(e.to).toEqual(at.get((to ?? '').split('#')[0] ?? ''));
    }
  });
});

describe('tất định', () => {
  it('cùng SceneProps ⇒ kết quả bằng nhau từng phần tử, kể cả thứ tự', () => {
    const p = props();
    expect(place3d(p)).toEqual(place3d(p));
  });

  it('KHÔNG phụ thuộc thứ tự mảng đầu vào', () => {
    const shuffled = props({
      view: {
        ...VIEW,
        nodes: [...VIEW.nodes].reverse(),
        edges: [...VIEW.edges].reverse(),
        files: [...FILES].reverse(),
      },
    });
    expect(place3d(shuffled)).toEqual(place3d(props()));
  });
});

describe('hộp bao', () => {
  it('bao trọn mọi node, nới ra đúng một bán kính ô', () => {
    const p = place3d(props());
    const { min, max } = p.bounds;
    for (const n of p.nodes) {
      for (const axis of [0, 1, 2] as const) {
        expect(n.position[axis] - NODE_RADIUS).toBeGreaterThanOrEqual(min[axis]);
        expect(n.position[axis] + NODE_RADIUS).toBeLessThanOrEqual(max[axis]);
      }
    }
    expect(max[0]).toBeGreaterThan(min[0]);
  });
});

describe('cảnh RỖNG', () => {
  const empty = props({
    view: { ...VIEW, nodes: [], edges: [], refs: [], files: [], hasOrigin: false },
    layouts: { local: EMPTY_LAYOUT, origin: null },
  });

  it('không ném, và mọi tập đều rỗng', () => {
    const p = place3d(empty);
    expect(p.nodes).toEqual([]);
    expect(p.edges).toEqual([]);
    expect(p.plates).toEqual([]);
  });

  it('hộp bao vẫn HỮU HẠN — không Infinity lọt vào camera', () => {
    const { min, max } = place3d(empty).bounds;
    for (const axis of [0, 1, 2] as const) {
      expect(Number.isFinite(min[axis])).toBe(true);
      expect(Number.isFinite(max[axis])).toBe(true);
    }
  });

  it('cảnh rỗng thì không có độ lệch nào, và cổng mặt phẳng vẫn sạch', () => {
    expect(maxDeviationOf(place3d(empty).nodes)).toBe(0);
    expect(assertPlanesClearOfDag(0)).toBeNull();
  });
});
