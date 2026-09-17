/**
 * Ghim phép đặt chỗ (19.D.1.2).
 *
 * Ô nặng nhất là "trục Y chỉ mang MỘT biến", và nó ghim CẢ HAI CHIỀU: Y của
 * chương CI không được nhúc nhích khi đổi môi trường, Y của chương CD không được
 * nhúc nhích khi đổi thời gian chờ. Một chiều thôi là nửa cái cổng — nó bắt được
 * việc quên biến đúng, nhưng không bắt được việc lén cộng thêm biến sai.
 */
import { describe, expect, it } from 'vitest';

import type { StageNodeView } from './contract.ts';
import type { CicdGraphView } from './scene-view.ts';
import { countNonAxialSegments, placeWorkflow } from './scene-contract.ts';

function vnode(instance: string, them: Partial<StageNodeView> = {}): StageNodeView {
  return {
    instance,
    stageId: instance,
    kind: 'build',
    name: instance,
    state: 'passed',
    attempt: 0,
    readyTick: 0,
    startedTick: 0,
    finishedTick: 10,
    cacheHit: null,
    environment: null,
    statusToken: 'success',
    ariaLabel: `${instance} — đã xong`,
    ...them,
  };
}

function view(
  nodes: readonly StageNodeView[],
  edges: readonly { from: string; to: string; critical?: boolean; resourceEdge?: boolean }[],
  yAxis: CicdGraphView['yAxis'] = 'ci',
): CicdGraphView {
  return {
    nodes,
    edges: edges.map((e) => ({
      from: e.from,
      to: e.to,
      critical: e.critical ?? false,
      resourceEdge: e.resourceEdge ?? false,
    })),
    yAxis,
  };
}

describe('placeWorkflow — ba trục, mỗi trục một nghĩa', () => {
  it('X là tầng phụ thuộc', () => {
    const p = placeWorkflow(
      view([vnode('a'), vnode('b'), vnode('c')], [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ]),
    );

    const layer = (id: string) => p.nodes.find((n) => n.instance === id)?.layer;
    expect(layer('a')).toBe(0);
    expect(layer('b')).toBe(1);
    expect(layer('c')).toBe(2);
    expect(p.layerCount).toBe(3);
  });

  it('Z tách hai job song song ra hai làn', () => {
    const p = placeWorkflow(
      view([vnode('a'), vnode('b'), vnode('c')], [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ]),
    );

    const lane = (id: string) => p.nodes.find((n) => n.instance === id)?.lane;
    expect(lane('b')).not.toBe(lane('c'));
    expect(p.laneCount).toBeGreaterThanOrEqual(2);
  });

  it('CI: Y là thời gian chờ hàng đợi, và CHỈ nó', () => {
    const cho = placeWorkflow(
      view([vnode('a', { readyTick: 0, startedTick: 8 })], []),
    ).nodes[0];
    const khongCho = placeWorkflow(
      view([vnode('a', { readyTick: 0, startedTick: 0 })], []),
    ).nodes[0];

    expect(cho?.y).toBeGreaterThan(0);
    expect(khongCho?.y).toBe(0);
  });

  it('CI: đổi MÔI TRƯỜNG không được làm Y nhúc nhích', () => {
    const khong = placeWorkflow(view([vnode('a', { readyTick: 0, startedTick: 4 })], [])).nodes[0];
    const co = placeWorkflow(
      view([vnode('a', { readyTick: 0, startedTick: 4, environment: 'prod' })], []),
    ).nodes[0];

    expect(co?.y).toBe(khong?.y);
  });

  it('CD: Y là dải môi trường, và CHỈ nó', () => {
    const p = placeWorkflow(
      view(
        [
          vnode('dung'),
          vnode('dev', { environment: 'dev' }),
          vnode('prod', { environment: 'prod' }),
        ],
        [
          { from: 'dung', to: 'dev' },
          { from: 'dev', to: 'prod' },
        ],
        'cd',
      ),
    );

    const y = (id: string) => p.nodes.find((n) => n.instance === id)?.y ?? 0;
    expect(y('dung')).toBe(0); // không phát hành vào đâu → dải nền
    expect(y('dev')).toBeGreaterThan(y('dung'));
    expect(y('prod')).toBeGreaterThan(y('dev')); // promote đi LÊN
    expect(p.bandCount).toBe(3);
  });

  it('CD: đổi THỜI GIAN CHỜ không được làm Y nhúc nhích', () => {
    const nhanh = placeWorkflow(
      view([vnode('d', { environment: 'dev', readyTick: 0, startedTick: 0 })], [], 'cd'),
    ).nodes[0];
    const cho = placeWorkflow(
      view([vnode('d', { environment: 'dev', readyTick: 0, startedTick: 99 })], [], 'cd'),
    ).nodes[0];

    expect(cho?.y).toBe(nhanh?.y);
  });

  it('thứ tự dải suy từ hình dạng đường ống, không từ một bảng tên ghim sẵn', () => {
    // Tên hoàn toàn lạ: một bảng ['dev','staging','prod'] ghim cứng sẽ dúi cả ba
    // xuống chung một dải.
    const p = placeWorkflow(
      view(
        [
          vnode('a', { environment: 'eu-west' }),
          vnode('b', { environment: 'canary' }),
          vnode('c', { environment: 'toan-cau' }),
        ],
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
        ],
        'cd',
      ),
    );

    const y = (id: string) => p.nodes.find((n) => n.instance === id)?.y ?? 0;
    expect(y('a')).toBeLessThan(y('b'));
    expect(y('b')).toBeLessThan(y('c'));
  });
});

describe('placeWorkflow — cạnh', () => {
  it('mọi đoạn đổi đúng MỘT toạ độ, ở cả hai chương', () => {
    const ci = placeWorkflow(
      view(
        [
          vnode('a', { readyTick: 0, startedTick: 0 }),
          vnode('b', { readyTick: 0, startedTick: 7 }),
          vnode('c', { readyTick: 0, startedTick: 3 }),
        ],
        [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'c' },
          { from: 'b', to: 'c' },
        ],
      ),
    );
    const cd = placeWorkflow(
      view(
        [vnode('x'), vnode('y', { environment: 'dev' }), vnode('z', { environment: 'prod' })],
        [
          { from: 'x', to: 'y' },
          { from: 'y', to: 'z' },
        ],
        'cd',
      ),
    );

    for (const e of [...ci.edges, ...cd.edges]) {
      expect(countNonAxialSegments(e.points)).toBe(0);
      expect(e.points.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('không đoạn nào dài 0', () => {
    // Hai node cùng tầng, khác làn — chỗ `routeEdge` sinh ra điểm góc TRÙNG điểm
    // cuối, tức một đoạn rỗng nếu không khử.
    const p = placeWorkflow(
      view([vnode('a'), vnode('b')], [{ from: 'a', to: 'b', resourceEdge: true }]),
    );

    for (const e of p.edges) {
      for (let i = 1; i < e.points.length; i += 1) {
        expect(e.points[i]).not.toEqual(e.points[i - 1]);
      }
    }
  });

  it('cạnh MÁY không tham gia phân tầng', () => {
    // `b` chờ máy của `a` nhưng KHÔNG phụ thuộc `a`: cả hai vẫn ở tầng 0.
    const p = placeWorkflow(
      view([vnode('a'), vnode('b')], [{ from: 'a', to: 'b', resourceEdge: true }]),
    );

    expect(p.nodes.find((n) => n.instance === 'a')?.layer).toBe(0);
    expect(p.nodes.find((n) => n.instance === 'b')?.layer).toBe(0);
    expect(p.layerCount).toBe(1);
  });

  it('cờ đường găng đi qua nguyên vẹn từ view sang placement', () => {
    const p = placeWorkflow(
      view([vnode('a'), vnode('b')], [{ from: 'a', to: 'b', critical: true }]),
    );

    expect(p.edges[0]?.critical).toBe(true);
  });
});

describe('placeWorkflow — tất định', () => {
  it('200 lượt gọi cùng đầu vào ra cùng toạ độ từng byte', () => {
    const v = view(
      [
        vnode('a'),
        vnode('b', { startedTick: 5 }),
        vnode('c'),
        vnode('d', { startedTick: 2 }),
        vnode('e'),
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
        { from: 'd', to: 'e' },
      ],
    );

    const dau = JSON.stringify(placeWorkflow(v));
    for (let i = 0; i < 200; i += 1) {
      expect(JSON.stringify(placeWorkflow(v))).toBe(dau);
    }
  });

  it('đảo thứ tự node và cạnh đầu vào không đổi kết quả', () => {
    const nodes = [vnode('a'), vnode('b'), vnode('c'), vnode('d')];
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'c' },
      { from: 'b', to: 'd' },
      { from: 'c', to: 'd' },
    ];

    const xuoi = placeWorkflow(view(nodes, edges));
    const nguoc = placeWorkflow(view([...nodes].reverse(), [...edges].reverse()));

    expect(
      [...nguoc.nodes].sort((a, b) => (a.instance < b.instance ? -1 : 1)),
    ).toEqual([...xuoi.nodes].sort((a, b) => (a.instance < b.instance ? -1 : 1)));
  });
});

describe('placeWorkflow — đồ thị rỗng', () => {
  it('không ném, trả khung 0 và không node nào', () => {
    const p = placeWorkflow(view([], []));

    expect(p.nodes).toHaveLength(0);
    expect(p.edges).toHaveLength(0);
    expect(p.bounds).toEqual({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } });
    expect(p.bandCount).toBe(1);
  });
});
