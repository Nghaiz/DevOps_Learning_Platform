/**
 * Ghim: định danh `constructor` (hợp lệ theo `[a-z0-9-]`) đi được qua MỌI đường chấm.
 *
 * Đo 2026-09-17 (review PR #141): một job tên `constructor` làm `evaluate`,
 * `criticalPath`, `scoreAxes`, các vị từ đồ thị và vòng đọc-ghi YAML cùng ném
 * "before is not iterable"; một sản phẩm tên `constructor` đỏ `missing-output`
 * giả; và `overrides.retries` rỗng trả về HÀM `Object` cho stage đó. Mỗi ô dưới
 * đây đỏ trên mã trước bản vá.
 */
import { describe, expect, it } from 'vitest';

import { deploymentsOf } from './artifacts.ts';
import type { StageSpec, WorkflowSpec, WorkloadSpec } from './contract.ts';
import { criticalPath } from './critical-path.ts';
import { evaluate } from './engine.ts';
import { hydrateWorkflow } from './hydrate.ts';
import { idDict, ownValue } from './id-dict.ts';
import { CICD_PREDICATES } from './predicates.ts';
import { scoreAxes } from './score.ts';
import { readWorkflowYaml } from './yaml-read.ts';
import { writeWorkflowYaml } from './yaml-write.ts';

function st(id: string, dependsOn: readonly string[], them: Partial<StageSpec> = {}): StageSpec {
  return {
    id,
    kind: 'build',
    name: id,
    dependsOn,
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
    steps: [{ id: `buoc-${id}`, name: id, durationTicks: 2, blocking: true }],
    ...them,
  };
}

const WL: WorkloadSpec = { runners: [{ id: 'linux', label: 'Máy', count: 2 }], inputs: [], commits: [{ id: 'c1', tick: 0 }] };
const CHAM = { baseSeed: 1, passes: 1 };
const WF: WorkflowSpec = { name: 'x', stages: [st('constructor', []), st('b', ['constructor'])] };

describe('định danh `constructor` không đụng prototype', () => {
  it('job tên `constructor`: chấm được, có đường găng, có ba trục, vị từ đồ thị trả lời được', () => {
    const record = evaluate(WF, WL, CHAM);
    expect(record.error).toBeNull();
    expect(scoreAxes(record, WF)?.leadTimeSeconds).toBeGreaterThan(0);
    const run = record.passes[0]?.runs[0];
    expect(criticalPath(run?.instances ?? [])?.nodes.map((n) => n.stageId)).toContain('constructor');
    expect(CICD_PREDICATES.stageDependsOn({ workflow: WF, record }, { stage: 'b', on: 'constructor' })).toBe(true);
  });

  it('vòng đọc-ghi YAML giữ nguyên job `constructor`', () => {
    const doc = readWorkflowYaml(writeWorkflowYaml(WF).yaml);
    expect(doc.ok && doc.workflow.stages.map((s) => s.id)).toEqual(['constructor', 'b']);
  });

  it('sản phẩm tên `constructor` được cấp như mọi sản phẩm khác — không đỏ `missing-output` giả', () => {
    const wf: WorkflowSpec = {
      name: 'x',
      stages: [
        st('a', [], { steps: [{ id: 'p', name: 'p', durationTicks: 1, blocking: true, produces: ['constructor'] }] }),
        st('b', ['a'], { environment: 'prod', steps: [{ id: 'q', name: 'q', durationTicks: 1, blocking: true, requires: ['constructor'] }] }),
      ],
    };
    const run = evaluate(wf, WL, CHAM).passes[0]?.runs[0];
    expect(run?.instances.map((i) => i.attempts.at(-1)?.outcome)).toEqual(['passed', 'passed']);
    expect(run === undefined ? 0 : deploymentsOf(run, wf).length).toBe(1);
  });

  it('overrides rỗng dựng bằng `{}` (như giao diện) không trả hàm cho stage `constructor`', () => {
    const ra = hydrateWorkflow(WF, { baseline: WF, catalogue: WF }, ['retries'], { retries: {} });
    expect(ra.stages[0]?.retries).toBe(0);
  });

  it('hai tiện ích: từ điển không prototype, và chỉ đọc khoá riêng', () => {
    expect(idDict<number>()['constructor']).toBeUndefined();
    expect(ownValue({}, 'constructor')).toBeUndefined();
    expect(ownValue({ constructor: 3 }, 'constructor')).toBe(3);
  });
});
