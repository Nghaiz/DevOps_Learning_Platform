/**
 * Ghim hợp đồng props chung của hai renderer CI/CD (19.D).
 *
 * Ô nặng nhất: `cicdSceneNodes` là phép GIAO chứ không phải phép hợp. Một
 * placement dựng từ view KHÁC (giữ lại của lượt chạy trước trong lúc chuyển
 * cảnh) không được làm renderer vẽ một node không có chỗ đứng — vẽ nó ở gốc
 * toạ độ là bịa ra một thông tin sai.
 */
import { describe, expect, it } from 'vitest';
import {
  buildGraphView,
  placeWorkflow,
  type StageSpec,
  type StepSpec,
  type WorkflowSpec,
} from '@devops-platform/games';

import {
  cicdEdgeKey,
  cicdSceneEdgeKeys,
  cicdSceneNodeIds,
  cicdSceneNodes,
  project2d,
  sceneAxes,
  type CicdSceneProps,
} from './scene-props';

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

describe('tập được vẽ', () => {
  it('node và cạnh khớp đúng view khi placement dựng từ chính nó', () => {
    const props = propsFor([st('a', []), st('b', ['a']), st('c', ['a'])]);

    expect(cicdSceneNodeIds(props)).toHaveLength(3);
    expect(cicdSceneEdgeKeys(props)).toEqual([cicdEdgeKey('a', 'b'), cicdEdgeKey('a', 'c')]);
  });

  it('quạt ra: mỗi thực thể là một node riêng trong cảnh', () => {
    const props = propsFor([
      st('kiem-tra', [], { fanOut: { axes: [{ name: 'node', values: ['20', '22', '24'] }] } }),
    ]);

    expect(cicdSceneNodeIds(props)).toEqual(['kiem-tra#20', 'kiem-tra#22', 'kiem-tra#24']);
  });

  it('GIAO chứ không hợp: node thiếu chỗ đứng thì KHÔNG vẽ', () => {
    const props = propsFor([st('a', []), st('b', ['a'])]);
    // Placement của một cảnh khác — chỉ có `a`.
    const cuc_bo: CicdSceneProps = {
      ...props,
      placement: {
        ...props.placement,
        nodes: props.placement.nodes.filter((n) => n.instance === 'a'),
      },
    };

    expect(cicdSceneNodeIds(cuc_bo)).toEqual(['a']);
    // Và cạnh a→b rụng theo, vì một đầu của nó không được vẽ.
    expect(cicdSceneEdgeKeys(cuc_bo)).toEqual([]);
  });

  it('thứ tự trả về ổn định, không phụ thuộc thứ tự stage gõ vào', () => {
    const stages = [st('a', []), st('b', ['a']), st('c', ['a']), st('d', ['b', 'c'])];

    const xuoi = cicdSceneNodeIds(propsFor(stages));
    const nguoc = cicdSceneNodeIds(propsFor([...stages].reverse()));

    expect(nguoc).toEqual(xuoi);
  });
});

describe('phép chiếu 2D', () => {
  it('chương CI vẽ X ngang, Z dọc; gập trục Y', () => {
    const axes = sceneAxes('ci');

    expect(axes).toEqual({ horizontal: 'x', vertical: 'z', folded: 'y' });
    expect(project2d({ x: 3, y: 7, z: 2 }, axes)).toEqual([3, 2]);
  });

  it('chương CD vẽ X ngang, Y dọc; gập trục Z', () => {
    const axes = sceneAxes('cd');

    expect(axes).toEqual({ horizontal: 'x', vertical: 'y', folded: 'z' });
    expect(project2d({ x: 3, y: 7, z: 2 }, axes)).toEqual([3, 7]);
  });

  it('CD: promote đi LÊN — dải prod cao hơn dải dev sau khi chiếu', () => {
    const props = propsFor(
      [
        st('dung', []),
        st('dev', ['dung'], { kind: 'deploy', environment: 'dev' }),
        st('prod', ['dev'], { kind: 'deploy', environment: 'prod' }),
      ],
      'cd',
    );
    const axes = sceneAxes('cd');
    const doCao = (id: string) => {
      const found = cicdSceneNodes(props).find((n) => n.id === id);
      return found === undefined ? 0 : project2d(found.spot, axes)[1];
    };

    expect(doCao('prod')).toBeGreaterThan(doCao('dev'));
    expect(doCao('dev')).toBeGreaterThan(doCao('dung'));
  });
});
