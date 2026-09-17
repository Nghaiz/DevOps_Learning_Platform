/**
 * Ghim mô hình vẽ của cảnh 3D (19.D.3) — chạy ở env `node`, không cần WebGL.
 *
 * Ô nặng nhất là ô AC-D2: **tập được vẽ phải bằng ĐÚNG `cicdSceneNodes()` /
 * `cicdSceneEdges()`**, không phải một phép lọc riêng của lane 3D. Nếu ai đó
 * thay bằng `props.view.nodes` thì ô e2e AC-D2 vẫn XANH (nó so hai renderer, mà
 * lúc đó cả hai đều sai theo cùng một kiểu ở đa số level) — chỉ ô dưới đây bắt
 * được, vì nó dựng đúng cảnh mà hai con số tách nhau: một level có `fanOut`.
 */
import { describe, expect, it } from 'vitest';
import {
  buildGraphView,
  placeWorkflow,
  type StageSpec,
  type StepSpec,
  type WorkflowSpec,
} from '@devops-platform/games';

import { cicdSceneEdgeKeys, cicdSceneNodeIds, type CicdSceneProps } from '../scene-props';
import { BODY_STYLES } from './node-visuals';
import { buildSceneDraw, countEdgeSegments, pathLength } from './scene-draw';

function step(id: string): StepSpec {
  return { id, name: id, durationTicks: 1, blocking: true };
}

function st(id: string, dependsOn: readonly string[], them: Partial<StageSpec> = {}): StageSpec {
  return {
    id,
    kind: 'build',
    name: id,
    dependsOn,
    steps: [step(`${id}-b1`)],
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
    ...them,
  };
}

function propsFor(stages: readonly StageSpec[], yAxis: 'ci' | 'cd' = 'ci'): CicdSceneProps {
  const workflow: WorkflowSpec = { name: 'thu', stages };
  const view = buildGraphView({ workflow, run: null, yAxis });
  return {
    view,
    placement: placeWorkflow(view),
    interaction: { selectedId: null, hoveredId: null, onSelect: () => {}, onHover: () => {} },
  };
}

describe('AC-D2 — tập được vẽ lấy từ hợp đồng chung', () => {
  it('vẽ đúng tập node mà `cicdSceneNodes()` trả về', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['a'])]);
    const draw = buildSceneDraw(props);

    expect(draw.nodes.map((n) => n.id)).toEqual(cicdSceneNodeIds(props));
  });

  it('vẽ đúng tập cạnh mà `cicdSceneEdges()` trả về', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['b'])]);
    const draw = buildSceneDraw(props);

    expect(draw.edges.map((e) => e.key)).toEqual(cicdSceneEdgeKeys(props));
  });

  /*
   * Đây là ca mà đếm-theo-`stageId` và đếm-theo-`InstanceKey` TÁCH NHAU. Một
   * renderer đếm theo stage cho ra 1 ở chỗ đáng lẽ phải là 3, và AC-D1 tồn tại
   * để bắt đúng con bug đó — nên ô này phải chạy trên một level có `fanOut`.
   */
  it('quạt ra: ba thực thể là BA node, không phải một', () => {
    const props = propsFor([
      st('kiem-tra', [], { fanOut: { axes: [{ name: 'node', values: ['20', '22', '24'] }] } }),
    ]);
    const draw = buildSceneDraw(props);

    expect(draw.nodes.map((n) => n.id)).toEqual(['kiem-tra#20', 'kiem-tra#22', 'kiem-tra#24']);
    expect(draw.nodeCount).toBe(3);
  });

  it('bộ đếm của AC-D1 khớp tập được vẽ khi không có toạ độ nào hỏng', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['a']), st('d', ['b', 'c'])]);
    const draw = buildSceneDraw(props);

    expect(draw.nodeCount).toBe(draw.nodes.length);
    expect(draw.edgeCount).toBe(draw.edges.length);
    expect(draw.droppedNodes).toBe(0);
    expect(draw.droppedEdges).toBe(0);
  });

  it('GIAO chứ không hợp: node thiếu chỗ đứng thì KHÔNG vẽ, và cạnh của nó rụng theo', () => {
    const props = propsFor([st('a', []), st('b', ['a'])]);
    const cut: CicdSceneProps = {
      ...props,
      placement: {
        ...props.placement,
        nodes: props.placement.nodes.filter((n) => n.instance === 'a'),
      },
    };
    const draw = buildSceneDraw(cut);

    expect(draw.nodes.map((n) => n.id)).toEqual(['a']);
    expect(draw.edges).toEqual([]);
  });
});

describe('chặn toạ độ hỏng', () => {
  const props = propsFor([st('a', []), st('b', ['a'])]);

  it('loại node có toạ độ không hữu hạn và ĐẾM nó lại', () => {
    const broken: CicdSceneProps = {
      ...props,
      placement: {
        ...props.placement,
        nodes: props.placement.nodes.map((n) =>
          n.instance === 'b' ? { ...n, y: Number.NaN } : n,
        ),
      },
    };
    const draw = buildSceneDraw(broken);

    expect(draw.nodes.map((n) => n.id)).toEqual(['a']);
    expect(draw.droppedNodes).toBe(1);
    // ⚠ Bộ đếm hợp đồng KHÔNG trừ đi phần bị loại. Hai con số lệch nhau CHÍNH LÀ
    // tín hiệu; gộp lại là xoá mất nó.
    expect(draw.nodeCount).toBe(2);
  });

  it('loại cạnh có điểm hỏng và đếm nó lại', () => {
    const broken: CicdSceneProps = {
      ...props,
      placement: {
        ...props.placement,
        edges: props.placement.edges.map((e) => ({
          ...e,
          points: e.points.map((p, index) => (index === 0 ? { ...p, x: Number.NaN } : p)),
        })),
      },
    };
    const draw = buildSceneDraw(broken);

    expect(draw.edges).toEqual([]);
    expect(draw.droppedEdges).toBe(1);
    expect(draw.edgeCount).toBe(1);
  });
});

describe('gom lô', () => {
  it('mỗi khoá của `byStyle` là một kiểu thân có thật', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['b'])]);
    const draw = buildSceneDraw(props);

    for (const style of draw.byStyle.keys()) {
      expect(BODY_STYLES).toContain(style);
    }
  });

  it('gom hết node, không sót và không nhân đôi', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['a']), st('d', ['c'])]);
    const draw = buildSceneDraw(props);

    let total = 0;
    for (const bucket of draw.byStyle.values()) {
      total += bucket.length;
    }
    expect(total).toBe(draw.nodes.length);
  });

  /*
   * Trước lượt chạy đầu tiên MỌI node ở trạng thái `pending` (`scene-encoding.ts`
   * nói rõ điều đó), tức cả cảnh rơi vào đúng MỘT kiểu thân. Ô này ghim rằng lúc
   * đó cảnh tốn đúng một lô — nền của lời hứa "số lệnh vẽ không theo số node".
   */
  it('cảnh chưa chạy lần nào gom vào đúng một lô', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['a']), st('d', ['b', 'c'])]);
    const draw = buildSceneDraw(props);

    expect(draw.byStyle.size).toBe(1);
    expect(draw.ringSlots).toEqual([]);
    expect(draw.glowNodes).toEqual([]);
  });
});

describe('đường gấp khúc', () => {
  it('mọi cạnh có ít nhất một đoạn', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['b'])]);
    const draw = buildSceneDraw(props);

    expect(draw.edges.length).toBeGreaterThan(0);
    for (const edge of draw.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
    }
    expect(countEdgeSegments(draw.edges)).toBeGreaterThanOrEqual(draw.edges.length);
  });

  it('`pathLength` cộng đúng theo từng đoạn', () => {
    expect(
      pathLength([
        { x: 0, y: 0, z: 0 },
        { x: 3, y: 0, z: 0 },
        { x: 3, y: 4, z: 0 },
      ]),
    ).toBeCloseTo(7, 10);
  });

  it('`pathLength` của một điểm là 0 — không có đoạn nào', () => {
    expect(pathLength([{ x: 1, y: 2, z: 3 }])).toBe(0);
  });
});
