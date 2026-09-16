/**
 * Ghim tầng ghép YAML ↔ dữ liệu level (19.E).
 *
 * ⚠ **Ô đắt nhất ở cuối file, và nó là lý do file này tồn tại:** ghi mỗi lời
 * giải của cả 14 level ra YAML, đọc lại, ghép, rồi khẳng định ba trục điểm
 * KHÔNG ĐỔI. Không có tầng ghép thì phép đo đó cho `leadTimeSeconds: 0` và
 * `runnerMinutes: 0` trên mọi level — đo được 2026-09-16, và đó là hình dạng
 * hỏng mà 19.E sẽ mang nếu ai gỡ tầng này đi.
 *
 * Ba ô đối chứng đứng cạnh nó, vì một ô "vòng đọc-ghi giữ nguyên điểm" MỘT
 * MÌNH là ô dễ xanh khống nhất trong file: một `hydrateWorkflow` bỏ qua hẳn
 * `edited` và trả về catalogue cũng làm nó xanh — và khi đó mọi bài làm sai đều
 * được chấm như lời giải.
 */
import { describe, expect, it } from 'vitest';

import { EDITABLE_PARTS, type EditablePart, type WorkflowSpec } from './contract.ts';
import { evaluate } from './engine.ts';
import { CI_LEVELS } from './levels/index.ts';
import { scoreAxes } from './score.ts';
import { readWorkflowYaml } from './yaml-read.ts';
import { writeWorkflowYaml } from './yaml-write.ts';
import {
  cacheOverrideKey,
  hydrateWorkflow,
  mergeStageCatalogue,
  HYDRATED_PARTS,
  type CicdPlayerOverrides,
} from './hydrate.ts';

const MOI_PHAN: readonly EditablePart[] = EDITABLE_PARTS;

/** Đi qua đúng con đường người chơi đi: `WorkflowSpec` → YAML → `WorkflowSpec`. */
function vongYaml(spec: WorkflowSpec): WorkflowSpec {
  const { yaml } = writeWorkflowYaml(spec);
  const ket = readWorkflowYaml(yaml);
  if (!ket.ok) {
    throw new Error(`YAML tự sinh mà đọc không được: ${ket.errors.map((e) => e.message).join(' | ')}`);
  }
  return ket.workflow;
}

/**
 * `retries` và `cache` người chơi đặt qua ô điều khiển riêng — ở đây rút từ
 * chính lời giải, vì ô test đang đóng vai một người chơi đã đặt chúng đúng.
 */
function overridesTu(spec: WorkflowSpec): CicdPlayerOverrides {
  const retries: Record<string, number> = {};
  const cache: Record<string, ReturnType<typeof capCache>> = {};
  for (const stage of spec.stages) {
    retries[stage.id] = stage.retries;
    for (const step of stage.steps) {
      cache[cacheOverrideKey(stage.id, step.id)] = capCache(step.cache);
    }
  }
  return { retries, cache };
}

function capCache(c: WorkflowSpec['stages'][number]['steps'][number]['cache']): NonNullable<typeof c> | null {
  return c ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Luật ghép, trên dữ liệu nhỏ đọc được bằng mắt
// ═══════════════════════════════════════════════════════════════════════════

const GOC: WorkflowSpec = {
  name: 'goc',
  stages: [
    {
      id: 'a',
      kind: 'build',
      name: 'A',
      dependsOn: [],
      blocking: true,
      retries: 2,
      runnerClass: 'linux',
      steps: [{ id: 'b1', name: 'B1', durationTicks: 7, blocking: true }],
    },
  ],
};

/** Bản "người chơi gõ": mọi trường không-YAML đã về mặc định trung tính. */
const NGUOI_CHOI: WorkflowSpec = {
  name: 'nguoi-choi',
  stages: [
    {
      id: 'a',
      kind: 'unit-test',
      name: 'A đổi tên',
      dependsOn: [],
      blocking: false,
      retries: 0,
      runnerClass: 'windows',
      steps: [{ id: 'b1', name: 'B1', durationTicks: 0, blocking: false }],
    },
  ],
};

describe('hydrate — thời lượng LUÔN của bản gốc', () => {
  it('durationTicks lấy lại từ catalogue, không bao giờ từ YAML', () => {
    const ra = hydrateWorkflow(NGUOI_CHOI, { baseline: GOC, catalogue: GOC }, MOI_PHAN);
    expect(ra.stages[0]?.steps[0]?.durationTicks).toBe(7);
  });

  it('không phần nào của EDITABLE_PARTS mở được durationTicks', () => {
    // Kể cả khi mở HẾT, thời lượng vẫn là của level — đó là tính chất chống
    // gian lận mà quyết định kiến trúc 2026-09-16 đã ghi.
    for (const phan of EDITABLE_PARTS) {
      const ra = hydrateWorkflow(NGUOI_CHOI, { baseline: GOC, catalogue: GOC }, [phan]);
      expect(ra.stages[0]?.steps[0]?.durationTicks, phan).toBe(7);
    }
  });
});

describe('hydrate — `editable` quyết định ai thắng', () => {
  it('phần CÓ trong editable ⇒ giá trị người chơi', () => {
    const ra = hydrateWorkflow(NGUOI_CHOI, { baseline: GOC, catalogue: GOC }, ['runners', 'blocking']);
    expect(ra.stages[0]?.runnerClass).toBe('windows');
    expect(ra.stages[0]?.blocking).toBe(false);
  });

  it('phần KHÔNG có trong editable ⇒ giá trị bản gốc', () => {
    const ra = hydrateWorkflow(NGUOI_CHOI, { baseline: GOC, catalogue: GOC }, []);
    expect(ra.stages[0]?.runnerClass).toBe('linux');
    expect(ra.stages[0]?.blocking).toBe(true);
    expect(ra.stages[0]?.retries).toBe(2);
  });

  it('retries đi qua overrides, KHÔNG qua YAML', () => {
    // Người chơi gõ `retries: 0` trong YAML là không thể — YAML không có khoá
    // đó. Giá trị 0 trong `NGUOI_CHOI` là mặc định của bộ đọc, và nó không
    // được phép thắng bản gốc.
    expect(hydrateWorkflow(NGUOI_CHOI, { baseline: GOC, catalogue: GOC }, ['retries']).stages[0]?.retries).toBe(2);
    expect(
      hydrateWorkflow(NGUOI_CHOI, { baseline: GOC, catalogue: GOC }, ['retries'], { retries: { a: 5 } }).stages[0]?.retries,
    ).toBe(5);
  });

  it('overrides bị BỎ QUA khi level không cho sửa phần đó', () => {
    expect(hydrateWorkflow(NGUOI_CHOI, { baseline: GOC, catalogue: GOC }, [], { retries: { a: 5 } }).stages[0]?.retries).toBe(2);
  });

  it('cache: vắng khoá = chưa đụng tới, null = đã bỏ hẳn', () => {
    const goc: WorkflowSpec = {
      ...GOC,
      stages: [
        {
          ...GOC.stages[0]!,
          steps: [
            {
              id: 'b1',
              name: 'B1',
              durationTicks: 7,
              blocking: true,
              cache: { id: 'c', keyParts: ['lockfile'], invalidatedBy: ['lockfile'], savesTicks: 3 },
            },
          ],
        },
      ],
    };
    expect(hydrateWorkflow(NGUOI_CHOI, { baseline: goc, catalogue: goc }, ['cache']).stages[0]?.steps[0]?.cache?.id).toBe('c');
    expect(
      hydrateWorkflow(NGUOI_CHOI, { baseline: goc, catalogue: goc }, ['cache'], { cache: { 'a/b1': null } }).stages[0]?.steps[0]
        ?.cache,
    ).toBeUndefined();
  });

  it('stages không mở ⇒ stage lạ bị bỏ, stage thiếu được trả lại', () => {
    const them: WorkflowSpec = {
      name: 'x',
      stages: [
        ...NGUOI_CHOI.stages,
        { id: 'la', kind: 'build', name: 'Lạ', dependsOn: [], blocking: true, retries: 0, runnerClass: 'linux', steps: [] },
      ],
    };
    expect(hydrateWorkflow(them, { baseline: GOC, catalogue: GOC }, []).stages.map((s) => s.id)).toEqual(['a']);
    expect(hydrateWorkflow({ name: 'x', stages: [] }, { baseline: GOC, catalogue: GOC }, []).stages.map((s) => s.id)).toEqual(['a']);
    expect(hydrateWorkflow(them, { baseline: GOC, catalogue: GOC }, ['stages']).stages.map((s) => s.id)).toEqual(['a', 'la']);
  });

  it('stage người chơi TỰ THÊM giữ mặc định trung tính, không bịa thời lượng', () => {
    const them: WorkflowSpec = {
      name: 'x',
      stages: [
        { id: 'moi', kind: 'build', name: 'Mới', dependsOn: [], blocking: true, retries: 0, runnerClass: 'linux', steps: [{ id: 's', name: 'S', durationTicks: 0, blocking: true }] },
      ],
    };
    expect(hydrateWorkflow(them, { baseline: GOC, catalogue: GOC }, ['stages']).stages[0]?.steps[0]?.durationTicks).toBe(0);
  });

  it('mọi EditablePart đều có đường đi — thêm phần mới mà quên nối sẽ đỏ', () => {
    expect([...HYDRATED_PARTS].sort()).toEqual([...EDITABLE_PARTS].sort());
  });
});

describe('mergeStageCatalogue', () => {
  it('id trùng ⇒ nguồn ĐẦU thắng, nhưng bước lạ được bổ sung', () => {
    const sau: WorkflowSpec = {
      name: 'sau',
      stages: [
        {
          ...GOC.stages[0]!,
          steps: [
            { id: 'b1', name: 'khác', durationTicks: 99, blocking: true },
            { id: 'b2', name: 'B2', durationTicks: 4, blocking: true },
          ],
        },
      ],
    };
    const gop = mergeStageCatalogue(GOC, sau);
    expect(gop.stages).toHaveLength(1);
    expect(gop.stages[0]?.steps.map((s) => [s.id, s.durationTicks])).toEqual([
      ['b1', 7],
      ['b2', 4],
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC — vòng YAML không được đổi ba trục điểm, trên CẢ 28 lời giải
// ═══════════════════════════════════════════════════════════════════════════

describe('AC — vòng đọc-ghi YAML giữ nguyên ba trục, 14 level × 2 lời giải', () => {
  const ca = CI_LEVELS.flatMap((level) => [
    { level, nhan: 'lời giải', wf: level.solutionWorkflow },
    { level, nhan: 'lời giải thay thế', wf: level.altSolutionWorkflow },
  ]);

  it.each(ca)('$level.id — $nhan', ({ level, wf }) => {
    const catalogue = mergeStageCatalogue(level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow);
    const ghep = hydrateWorkflow(
      vongYaml(wf),
      { baseline: level.initialWorkflow, catalogue },
      level.editable,
      overridesTu(wf),
    );

    const mong = scoreAxes(evaluate(wf, level.workload, level.evaluation), wf);
    const thuc = scoreAxes(evaluate(ghep, level.workload, level.evaluation), ghep);
    expect(thuc).toEqual(mong);
  });

  /*
   * ĐỐI CHỨNG ÂM 1 — catalogue rỗng ⇒ điểm PHẢI hỏng.
   *
   * Không có ô này thì ô trên vẫn xanh nếu `evaluate` bỗng ngừng đọc
   * `durationTicks`, tức cả tầng ghép trở thành thừa mà không ai biết.
   */
  it('catalogue rỗng ⇒ lead time về 0 — bằng chứng tầng ghép đang làm việc thật', () => {
    const level = CI_LEVELS[0];
    if (level === undefined) throw new Error('không có level nào');
    const rong: WorkflowSpec = { name: '', stages: [] };
    const tron = hydrateWorkflow(vongYaml(level.solutionWorkflow), { baseline: rong, catalogue: rong }, level.editable);
    const thuc = scoreAxes(evaluate(tron, level.workload, level.evaluation), tron);
    const mong = scoreAxes(
      evaluate(level.solutionWorkflow, level.workload, level.evaluation),
      level.solutionWorkflow,
    );
    expect(mong?.leadTimeSeconds).toBeGreaterThan(0);
    expect(thuc?.leadTimeSeconds).toBe(0);
  });

  /*
   * ĐỐI CHỨNG ÂM 2 — bài làm KHÁC phải cho điểm KHÁC.
   *
   * Đây là ô chặn tautology thật sự: một `hydrateWorkflow` bỏ qua `edited` và
   * trả thẳng catalogue sẽ làm mọi ô ở trên xanh, đồng thời chấm MỌI bài sai
   * thành lời giải. Ở đây bỏ hết cạnh phụ thuộc — mọi stage chạy song song nên
   * lead time phải ngắn đi hoặc runner-phút phải đổi.
   */
  it('gỡ hết cạnh phụ thuộc ⇒ điểm ĐỔI, không bị catalogue chấm đè', () => {
    const level = CI_LEVELS.find((l) => l.editable.includes('edges') && l.solutionWorkflow.stages.some((s) => s.dependsOn.length > 0));
    if (level === undefined) throw new Error('không có level nào vừa cho sửa cạnh vừa có cạnh');

    const catalogue = mergeStageCatalogue(level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow);
    const goc = level.solutionWorkflow;
    const pha: WorkflowSpec = { ...goc, stages: goc.stages.map((s) => ({ ...s, dependsOn: [] })) };

    const ghep = hydrateWorkflow(
      vongYaml(pha),
      { baseline: level.initialWorkflow, catalogue },
      level.editable,
      overridesTu(goc),
    );
    expect(ghep.stages.every((s) => s.dependsOn.length === 0)).toBe(true);

    const mong = scoreAxes(evaluate(goc, level.workload, level.evaluation), goc);
    const thuc = scoreAxes(evaluate(ghep, level.workload, level.evaluation), ghep);
    expect(thuc).not.toEqual(mong);
  });
});
