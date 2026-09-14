import { describe, expect, it } from 'vitest';
import { type DagNode, layoutDag } from './dag-layout.ts';
import { countDiagonalSegments } from './edge-route.ts';

/** Tra nhanh `id -> {depth, lane}` cho gọn phần khẳng định. */
function index(nodes: readonly { id: string; depth: number; lane: number }[]): Record<
  string,
  { depth: number; lane: number }
> {
  const out: Record<string, { depth: number; lane: number }> = {};
  for (const n of nodes) out[n.id] = { depth: n.depth, lane: n.lane };
  return out;
}

describe('layoutDag — hình dạng cơ bản', () => {
  it('DAG rỗng', () => {
    expect(layoutDag([])).toEqual({ nodes: [], edges: [], laneCount: 0, depthCount: 0 });
  });

  it('một node duy nhất', () => {
    const out = layoutDag([{ id: 'c1', parents: [] }]);
    expect(out.nodes).toEqual([{ id: 'c1', depth: 0, lane: 0 }]);
    expect(out.edges).toEqual([]);
    expect(out.laneCount).toBe(1);
    expect(out.depthCount).toBe(1);
  });

  it('DAG tuyến tính — một làn, tầng tăng đều', () => {
    const out = layoutDag([
      { id: 'c1', parents: [] },
      { id: 'c2', parents: ['c1'] },
      { id: 'c3', parents: ['c2'] },
    ]);
    const at = index(out.nodes);
    expect(at['c1']).toEqual({ depth: 0, lane: 0 });
    expect(at['c2']).toEqual({ depth: 1, lane: 0 });
    expect(at['c3']).toEqual({ depth: 2, lane: 0 });
    expect(out.laneCount).toBe(1);
    expect(out.depthCount).toBe(3);
    expect(out.edges).toHaveLength(2);
  });

  it('DAG có nhánh rẽ — hai con của một cha nằm KHÁC làn, CÙNG tầng', () => {
    const out = layoutDag([
      { id: 'c1', parents: [] },
      { id: 'c2', parents: ['c1'] },
      { id: 'f1', parents: ['c1'] },
    ]);
    const at = index(out.nodes);
    expect(at['c2']?.depth).toBe(1);
    expect(at['f1']?.depth).toBe(1);
    expect(at['c2']?.lane).not.toBe(at['f1']?.lane);
    expect(out.laneCount).toBe(2);
  });

  it('DAG có merge — commit merge đứng SAU cả hai cha (đường dài nhất)', () => {
    /*
     * Hai nhánh dài không bằng nhau. Với độ sâu theo đường NGẮN nhất, `m1` sẽ
     * nhận depth 2 (qua `f1`) và cạnh `c3 -> m1` phải chạy ngược thời gian. Đây
     * là case chứng minh ta không dùng đường ngắn nhất.
     */
    const out = layoutDag([
      { id: 'c1', parents: [] },
      { id: 'c2', parents: ['c1'] },
      { id: 'c3', parents: ['c2'] },
      { id: 'f1', parents: ['c1'] },
      { id: 'm1', parents: ['c3', 'f1'] },
    ]);
    const at = index(out.nodes);
    expect(at['c3']?.depth).toBe(2);
    expect(at['f1']?.depth).toBe(1);
    expect(at['m1']?.depth).toBe(3);

    for (const edge of out.edges) {
      const from = at[edge.from];
      const to = at[edge.to];
      expect(from, edge.from).toBeDefined();
      expect(to, edge.to).toBeDefined();
      expect(
        (to?.depth ?? 0) > (from?.depth ?? 0),
        `cạnh ${edge.from} -> ${edge.to} chạy ngược chiều thời gian`,
      ).toBe(true);
    }
  });

  it('commit merge giữ parentIndex để phân biệt cha thứ nhất với cha thứ hai', () => {
    const out = layoutDag([
      { id: 'c1', parents: [] },
      { id: 'a1', parents: ['c1'] },
      { id: 'b1', parents: ['c1'] },
      { id: 'm1', parents: ['a1', 'b1'] },
    ]);
    const into = out.edges.filter((e) => e.to === 'm1');
    expect(into).toHaveLength(2);
    expect(into.map((e) => [e.from, e.parentIndex])).toEqual([
      ['a1', 0],
      ['b1', 1],
    ]);
  });

  it('commit mồ côi — không ai trỏ tới, vẫn được vẽ', () => {
    const out = layoutDag([
      { id: 'c1', parents: [] },
      { id: 'c2', parents: ['c1'] },
      { id: 'lost', parents: [] },
    ]);
    const at = index(out.nodes);
    expect(at['lost']).toBeDefined();
    expect(at['lost']?.depth).toBe(0);
    // Nó mở chuỗi riêng nên phải có làn riêng, không chồng lên `c1`.
    expect(at['lost']?.lane).not.toBe(at['c1']?.lane);
    expect(out.nodes).toHaveLength(3);
  });

  it('cha không tồn tại — giữ node, bỏ cạnh, không ném', () => {
    const out = layoutDag([{ id: 'c2', parents: ['khong-co-that'] }]);
    expect(out.nodes).toEqual([{ id: 'c2', depth: 0, lane: 0 }]);
    expect(out.edges).toEqual([]);
  });

  it('node tự trỏ vào chính nó — bỏ cạnh, không treo', () => {
    const out = layoutDag([{ id: 'c1', parents: ['c1'] }]);
    expect(out.nodes).toEqual([{ id: 'c1', depth: 0, lane: 0 }]);
    expect(out.edges).toEqual([]);
  });

  /**
   * Chu trình không xảy ra với một DAG commit thật, nhưng dữ liệu tới từ level
   * viết tay và từ 17.Q nhập JSON — đó là biên hệ thống. Yêu cầu ở đây là KHÔNG
   * TREO và không ném, chứ không phải vẽ ra thứ có nghĩa.
   */
  it('chu trình — không treo, không ném', () => {
    const out = layoutDag([
      { id: 'a', parents: ['b'] },
      { id: 'b', parents: ['a'] },
    ]);
    expect(out.nodes).toHaveLength(2);
    expect(Number.isFinite(out.depthCount)).toBe(true);
  });
});

describe('layoutDag — bất biến của đầu ra', () => {
  const GRAPH: readonly DagNode[] = [
    { id: 'c1', parents: [] },
    { id: 'c2', parents: ['c1'] },
    { id: 'c3', parents: ['c2'] },
    { id: 'f1', parents: ['c1'] },
    { id: 'f2', parents: ['f1'] },
    { id: 'm1', parents: ['c3', 'f2'] },
    { id: 'g1', parents: ['c2'] },
  ];

  it('node sắp theo (depth, lane, id)', () => {
    const nodes = layoutDag(GRAPH).nodes;
    for (let i = 1; i < nodes.length; i += 1) {
      const a = nodes[i - 1];
      const b = nodes[i];
      if (a === undefined || b === undefined) continue;
      const ordered =
        a.depth < b.depth ||
        (a.depth === b.depth && a.lane < b.lane) ||
        (a.depth === b.depth && a.lane === b.lane && a.id < b.id);
      expect(ordered, `${a.id} đứng trước ${b.id} là sai thứ tự`).toBe(true);
    }
  });

  it('làn nằm trong [0, laneCount) và mọi làn đều có người dùng', () => {
    const out = layoutDag(GRAPH);
    const used = new Set(out.nodes.map((n) => n.lane));
    for (const lane of used) {
      expect(lane).toBeGreaterThanOrEqual(0);
      expect(lane).toBeLessThan(out.laneCount);
    }
    expect(used.size).toBe(out.laneCount);
  });

  it('tầng nằm trong [0, depthCount)', () => {
    const out = layoutDag(GRAPH);
    for (const node of out.nodes) {
      expect(node.depth).toBeGreaterThanOrEqual(0);
      expect(node.depth).toBeLessThan(out.depthCount);
    }
  });

  it('mọi cạnh đều góc vuông — không một đoạn chéo nào', () => {
    for (const edge of layoutDag(GRAPH).edges) {
      expect(
        countDiagonalSegments(edge.points),
        `cạnh ${edge.from} -> ${edge.to} có đoạn chéo`,
      ).toBe(0);
    }
  });

  it('đường của mỗi cạnh bắt đầu ở cha và kết thúc ở con', () => {
    const out = layoutDag(GRAPH);
    const at = index(out.nodes);
    for (const edge of out.edges) {
      const from = at[edge.from];
      const to = at[edge.to];
      const first = edge.points[0];
      const last = edge.points[edge.points.length - 1];
      expect(first).toEqual([from?.depth, from?.lane]);
      expect(last).toEqual([to?.depth, to?.lane]);
    }
  });

  it('số cạnh bằng tổng số cha còn tồn tại', () => {
    const expected = GRAPH.reduce((sum, n) => sum + n.parents.length, 0);
    expect(layoutDag(GRAPH).edges).toHaveLength(expected);
  });

  /**
   * Ràng buộc "làn cố định" của design §3.5, đo trên chính kịch bản đã loại
   * `d3-dag`: thêm một commit vào cuối một nhánh KHÔNG được làm commit cũ nhảy làn.
   */
  it('thêm một commit không làm commit cũ đổi làn', () => {
    const before = index(layoutDag(GRAPH).nodes);
    const after = index(layoutDag([...GRAPH, { id: 'c4', parents: ['m1'] }]).nodes);
    for (const node of GRAPH) {
      expect(after[node.id]?.lane, `${node.id} nhảy làn khi thêm commit`).toBe(
        before[node.id]?.lane,
      );
    }
  });
});

describe('layoutDag — laneHint', () => {
  it('các node cùng laneHint dùng chung một làn dù khác chuỗi cha', () => {
    const out = layoutDag([
      { id: 'c1', parents: [], laneHint: 'main' },
      { id: 'a1', parents: ['c1'] },
      { id: 'b1', parents: ['c1'], laneHint: 'main' },
    ]);
    const at = index(out.nodes);
    expect(at['b1']?.lane).toBe(at['c1']?.lane);
    expect(at['a1']?.lane).not.toBe(at['c1']?.lane);
  });

  it('laneHint khác nhau thì làn khác nhau', () => {
    const out = layoutDag([
      { id: 'c1', parents: [], laneHint: 'main' },
      { id: 'f1', parents: ['c1'], laneHint: 'feature' },
      { id: 'f2', parents: ['f1'], laneHint: 'feature' },
    ]);
    const at = index(out.nodes);
    expect(at['f1']?.lane).toBe(at['f2']?.lane);
    expect(at['f1']?.lane).not.toBe(at['c1']?.lane);
  });
});
