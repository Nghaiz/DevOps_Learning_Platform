/**
 * Ghim khuôn job (`job-shapes.ts`) — và quan trọng hơn: ghim rằng HAI đường lách
 * đo được ở review PR #141 nay bị chặn trên CẢ 14 level, trong khi 28 lời giải
 * vẫn qua.
 */
import { describe, expect, it } from 'vitest';

import type { CicdLevel, WorkflowSpec } from './contract.ts';
import { checkJobShapes } from './job-shapes.ts';
import { CI_LEVELS } from './levels/index.ts';
import { readWorkflowYaml } from './yaml-read.ts';
import { writeWorkflowYaml } from './yaml-write.ts';

function knownOf(level: CicdLevel): readonly WorkflowSpec[] {
  return [level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow];
}

/** Đi qua đúng vòng ghi-đọc YAML, như người chơi. */
function quaYaml(wf: WorkflowSpec): WorkflowSpec {
  const doc = readWorkflowYaml(writeWorkflowYaml(wf).yaml);
  if (!doc.ok) throw new Error(doc.errors.map((e) => e.message).join(' | '));
  return doc.workflow;
}

function kiem(level: CicdLevel, wf: WorkflowSpec) {
  return checkJobShapes(quaYaml(wf), knownOf(level), level.initialWorkflow, level.editable);
}

describe('khuôn job — mọi workflow đã khai của 14 level đều khớp', () => {
  it.each(CI_LEVELS.map((level) => ({ level })))('$level.id', ({ level }) => {
    for (const wf of knownOf(level)) {
      expect(kiem(level, wf), wf.name).toEqual([]);
    }
  });
});

const CO_KHOI_DAU = CI_LEVELS.filter((level) => level.initialWorkflow.stages.length > 0);

describe('khuôn job — hai đường lách bị chặn trên mọi level có workflow khởi đầu', () => {
  it.each(CO_KHOI_DAU.map((level) => ({ level })))('$level.id — đổi tên mọi bước', ({ level }) => {
    const doiTen: WorkflowSpec = {
      ...level.initialWorkflow,
      stages: level.initialWorkflow.stages.map((s) => ({ ...s, steps: s.steps.map((st) => ({ ...st, id: `z-${st.id}` })) })),
    };
    expect(kiem(level, doiTen).length).toBeGreaterThan(0);
  });

  it.each(CO_KHOI_DAU.map((level) => ({ level })))('$level.id — xoá bước không tạo sản phẩm', ({ level }) => {
    const xoa: WorkflowSpec = {
      ...level.initialWorkflow,
      stages: level.initialWorkflow.stages.map((s) => ({ ...s, steps: s.steps.filter((st) => (st.produces?.length ?? 0) > 0) })),
    };
    const coXoaThat = xoa.stages.some((s, i) => s.steps.length !== level.initialWorkflow.stages[i]?.steps.length);
    // Đối chứng: level nào mọi bước đều tạo sản phẩm thì phép xoá không đổi gì, và không có gì để chặn.
    expect(kiem(level, xoa).length > 0).toBe(coXoaThat);
  });
});

describe('khuôn job — từng luật', () => {
  const level = CI_LEVELS.find((l) => l.editable.includes('stages') && l.initialWorkflow.stages.length > 0)!;

  it('job không có ở workflow nào ⇒ unknown-job, kèm danh sách job level biết', () => {
    const them: WorkflowSpec = {
      ...level.initialWorkflow,
      stages: [...level.initialWorkflow.stages, { ...level.initialWorkflow.stages[0]!, id: 'job-la' }],
    };
    const [loi] = kiem(level, them);
    expect(loi?.kind).toBe('unknown-job');
    expect(loi?.kind === 'unknown-job' && loi.knownJobs).toContain(level.initialWorkflow.stages[0]!.id);
  });

  it('đổi THỨ TỰ bước cũng là lệch khuôn', () => {
    const nhieuBuoc = level.initialWorkflow.stages.find((s) => s.steps.length > 1);
    if (nhieuBuoc === undefined) return;
    const dao: WorkflowSpec = {
      ...level.initialWorkflow,
      stages: level.initialWorkflow.stages.map((s) => (s.id === nhieuBuoc.id ? { ...s, steps: [...s.steps].reverse() } : s)),
    };
    expect(kiem(level, dao).map((p) => p.kind)).toEqual(['unknown-steps']);
  });

  it('không cho sửa `stages` ⇒ job lạ bị bỏ qua (tầng ghép bỏ nó), không báo', () => {
    const khoa = CI_LEVELS.find((l) => !l.editable.includes('stages') && l.initialWorkflow.stages.length > 0)!;
    const them: WorkflowSpec = {
      ...khoa.initialWorkflow,
      stages: [...khoa.initialWorkflow.stages, { ...khoa.initialWorkflow.stages[0]!, id: 'job-la' }],
    };
    expect(kiem(khoa, them)).toEqual([]);
  });

  it('bàn thử: workflow đang soạn là workflow đã biết ⇒ luôn khớp', () => {
    const wf = quaYaml(level.initialWorkflow);
    expect(checkJobShapes(wf, [wf], wf, ['stages'])).toEqual([]);
  });
});

describe('khuôn tập job — bỏ nguyên job kiểm thử không còn thắng được', () => {
  const choSuaStages = CI_LEVELS.filter((l) => l.editable.includes('stages'));

  it.each(choSuaStages.map((level) => ({ level })))('$level.id — bỏ từng job không tạo sản phẩm của mọi workflow đã khai', ({ level }) => {
    let daThu = 0;
    for (const base of knownOf(level)) {
      for (const victim of base.stages) {
        if (victim.steps.some((s) => (s.produces?.length ?? 0) > 0)) continue;
        const bo: WorkflowSpec = {
          ...base,
          stages: base.stages.filter((s) => s.id !== victim.id).map((s) => ({ ...s, dependsOn: s.dependsOn.filter((d) => d !== victim.id) })),
        };
        // Một phương án khác đã khai có thể TRÙNG đúng tập còn lại — khi đó đó là phương án hợp lệ, không phải lách.
        const trungPhuongAnKhac = knownOf(level).some(
          (wf) => [...wf.stages.map((s) => s.id)].sort().join('|') === [...bo.stages.map((s) => s.id)].sort().join('|'),
        );
        if (trungPhuongAnKhac) continue;
        daThu += 1;
        expect(kiem(level, bo).map((p) => p.kind), `${base.name} bỏ ${victim.id}`).toContain('unknown-job-set');
      }
    }
    // Đối chứng: ô này phải thật sự thử được ít nhất một phép bỏ ở level có job không tạo sản phẩm.
    const coJobKhongSanPham = knownOf(level).some((wf) => wf.stages.some((s) => !s.steps.some((st) => (st.produces?.length ?? 0) > 0)));
    if (coJobKhongSanPham) expect(daThu).toBeGreaterThan(0);
  });

  it('ghép lẫn job của hai phương án khác nhau cũng là lệch tập', () => {
    const c04 = CI_LEVELS.find((l) => l.id.startsWith('cicd-c04'))!;
    const tapLoiGiai = new Set(c04.solutionWorkflow.stages.map((s) => s.id));
    const themTuAlt = c04.altSolutionWorkflow.stages.find((s) => !tapLoiGiai.has(s.id));
    if (themTuAlt === undefined) return;
    const lai: WorkflowSpec = { ...c04.solutionWorkflow, stages: [...c04.solutionWorkflow.stages, themTuAlt] };
    expect(kiem(c04, lai).map((p) => p.kind)).toContain('unknown-job-set');
  });
});
