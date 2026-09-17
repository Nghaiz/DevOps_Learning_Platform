/**
 * Ô nghiệm thu AC-G cho chương CD (C15–C28) — lead sở hữu, hai lane KHÔNG sửa.
 *
 * Cùng ba ô của AC-F (`ci-som.test.ts` giải thích từng ô), nay áp cho một LỜI
 * GIẢI gồm hai nửa: `(workflow, cd policies)`. Thêm những ô chỉ chương CD cần:
 *
 * - **Khối `cd` nhất quán.** Kịch bản có mặt ⇔ chính sách có mặt, ở cả ba bộ.
 *   Một chính sách không có kịch bản là một núm không làm gì; một kịch bản
 *   không có chính sách thì `runLevelCd` lặng lẽ bỏ qua nó và mọi vị từ đọc nó
 *   trả `false` — level không giải được mà không ô nào nói vì sao.
 * - **Lời giải ĐI TỚI ĐƯỢC bằng bảng điều khiển** (`cd-contract.ts` §5.3): qua
 *   `mergeCdPolicies` mà không đổi. Bài học S2 của đợt 3.
 * - **Dữ liệu level không làm bộ mô phỏng ném** — với cả ba bộ chính sách. Nhờ ô
 *   này, nhánh `ok: false` của `runLevelCd` lúc chơi chỉ còn đến từ người chơi.
 *
 * Chạy riêng một level: `vitest run src/cicd/levels/cd-levels.test.ts -t c18`.
 */

import { describe, expect, it } from 'vitest';

import type { CicdCdPolicies } from '../cd-contract.ts';
import { mergeCdPolicies, runLevelCd } from '../cd-run.ts';
import type { CicdLevel, CicdObjective, WorkflowSpec } from '../contract.ts';
import { criticalPath } from '../critical-path.ts';
import { evaluate } from '../engine.ts';
import type { CicdScoringContext } from '../predicates.ts';
import { checkObjective, failingObjectiveIds, validateObjectiveArgs } from '../predicates.ts';
import { isBadCandidate } from '../release.ts';
import { summarizeEvaluation } from '../score.ts';
import { CD_LEVELS } from './index.ts';

type LoiGiai = 'initial' | 'solution' | 'altSolution';

function workflowCua(level: CicdLevel, which: LoiGiai): WorkflowSpec {
  if (which === 'initial') return level.initialWorkflow;
  return which === 'solution' ? level.solutionWorkflow : level.altSolutionWorkflow;
}

/** Chấm MỘT lời giải trọn vẹn: engine trên workflow + ba bộ mô phỏng trên chính sách. */
function cham(level: CicdLevel, which: LoiGiai): CicdScoringContext {
  const workflow = workflowCua(level, which);
  const record = evaluate(workflow, level.workload, level.evaluation);
  if (level.cd === undefined) return { workflow, record };
  const run = runLevelCd(level.cd, level.cd[which]);
  if (!run.ok) throw new Error(`${level.id} ${which}: ${run.simulator} ném — ${run.message}`);
  return { workflow, record, cd: run.records };
}

function mucThuong(level: CicdLevel): CicdObjective {
  const thuong = level.objectives.filter((muc) => !muc.required);
  const dau = thuong[0];
  if (thuong.length !== 1 || dau === undefined) {
    throw new Error(`${level.id}: cần đúng 1 mục thưởng, đang có ${String(thuong.length)}`);
  }
  return dau;
}

const MOI_LEVEL = CD_LEVELS.map((level) => [level.id, level] as const);
const CO_KHOI_CD = CD_LEVELS.filter((level) => level.cd !== undefined).map((level) => [level.id, level] as const);

/** `it.each` với mảng rỗng là LỖI của vitest, không phải một ô xanh — nên gác trước. */
const coLevel = MOI_LEVEL.length > 0;
const coKhoiCd = CO_KHOI_CD.length > 0;

// ═══════════════════════════════════════════════════════════════════════════
// 1. Hình dạng
// ═══════════════════════════════════════════════════════════════════════════

describe.runIf(coLevel)('chương CD — hình dạng dữ liệu', () => {
  it('id theo mẫu `cicd-cNN-slug`, số tăng dần từ 15 không nhảy cóc', () => {
    const so = CD_LEVELS.map((level) => {
      const m = /^cicd-c(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/u.exec(level.id);
      expect(m, `${level.id} sai mẫu id`).not.toBeNull();
      return Number(m?.[1]);
    });
    expect(so).toEqual(so.map((_, i) => 15 + i));
  });

  it.each(MOI_LEVEL)('%s — thuộc chương cd, mục tiêu/ngưỡng/dạy học hợp lệ', (_id, level) => {
    expect(level.chapter).toBe('cd');
    expect(level.objectives.filter((muc) => muc.required).length).toBeGreaterThan(0);
    expect(new Set(level.objectives.map((muc) => muc.id)).size).toBe(level.objectives.length);
    expect(level.objectives.map((muc) => validateObjectiveArgs(muc)).filter((m) => m !== null)).toEqual([]);
    mucThuong(level);

    for (const workflow of [level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow]) {
      const ids = workflow.stages.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const stage of workflow.stages) {
        expect(stage.dependsOn.every((canh) => ids.includes(canh))).toBe(true);
        expect(stage.steps.length).toBeGreaterThan(0);
        expect(level.workload.runners.some((pool) => pool.id === stage.runnerClass)).toBe(true);
      }
    }

    const nguong = level.thresholds;
    expect(nguong.parLeadSeconds).toBeLessThanOrEqual(nguong.budgetLeadSeconds);
    expect(nguong.minThroughputPerHour).toBeLessThanOrEqual(nguong.parThroughputPerHour);
    expect(nguong.parRunnerMinutes).toBeLessThanOrEqual(nguong.budgetRunnerMinutes);
    expect(nguong.minGreenRate).toBeGreaterThan(0);
    expect(level.hints.length).toBeGreaterThanOrEqual(3);
    expect(level.teaching.takeaways.length).toBeGreaterThanOrEqual(2);
    expect(level.teaching.cheatsheet.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Khối `cd`
// ═══════════════════════════════════════════════════════════════════════════

const KHOI = ['release', 'gitops', 'masking'] as const;

describe.runIf(coKhoiCd)('chương CD — khối `cd` nhất quán', () => {
  it.each(CO_KHOI_CD)('%s — kịch bản có mặt ⇔ chính sách có mặt, ở cả ba bộ', (_id, level) => {
    const cd = level.cd!;
    for (const khoi of KHOI) {
      const coKichBan = cd[khoi] !== undefined;
      for (const bo of [cd.initial, cd.solution, cd.altSolution] satisfies CicdCdPolicies[]) {
        expect(bo[khoi] !== undefined, `${khoi}`).toBe(coKichBan);
      }
    }
    expect(KHOI.some((khoi) => cd[khoi] !== undefined), 'khối cd không khai kịch bản nào').toBe(true);
    if (cd.release !== undefined) expect(cd.release.scenarios.length).toBeGreaterThan(0);
  });

  it.each(CO_KHOI_CD)('%s — mọi núm `editable` trỏ vào một khối có kịch bản, không trùng', (_id, level) => {
    const cd = level.cd!;
    expect(new Set(cd.editable).size).toBe(cd.editable.length);
    for (const part of cd.editable) {
      const khoi = part.split('.')[0] as (typeof KHOI)[number];
      expect(cd[khoi], `núm ${part} không có kịch bản`).toBeDefined();
    }
  });

  it.each(CO_KHOI_CD)('%s — hai lời giải ĐI TỚI ĐƯỢC bằng bảng điều khiển', (_id, level) => {
    const cd = level.cd!;
    expect(mergeCdPolicies(cd.initial, cd.solution, cd.editable)).toEqual(cd.solution);
    expect(mergeCdPolicies(cd.initial, cd.altSolution, cd.editable)).toEqual(cd.altSolution);
  });

  it.each(CO_KHOI_CD)('%s — dữ liệu level không làm bộ mô phỏng nào ném, và chạy tất định', (_id, level) => {
    const cd = level.cd!;
    for (const which of ['initial', 'solution', 'altSolution'] as const) {
      const lan1 = runLevelCd(cd, cd[which]);
      expect(lan1.ok ? null : `${lan1.simulator}: ${lan1.message}`, which).toBeNull();
      expect(runLevelCd(cd, cd[which])).toEqual(lan1);
    }
  });

  it('mục cheatsheet `cd-panel` chỉ tới núm level thật sự mở', () => {
    for (const level of CD_LEVELS) {
      for (const entry of level.teaching.cheatsheet) {
        if (entry.where !== 'cd-panel') continue;
        expect(level.cd?.editable ?? [], `${level.id}`).toContain(entry.control);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. AC-G — hai lời giải qua, trạng thái ban đầu trượt, mục thưởng chia đôi
// ═══════════════════════════════════════════════════════════════════════════

describe.runIf(coLevel)('AC-G — hai lời giải chạy qua engine + bộ mô phỏng thật', () => {
  it.each(MOI_LEVEL)('%s — lời giải chính đạt MỌI mục tiêu bắt buộc', (_id, level) => {
    const ctx = cham(level, 'solution');
    expect(ctx.record.error).toBeNull();
    expect(failingObjectiveIds(level.objectives, ctx, true)).toEqual([]);
  });

  it.each(MOI_LEVEL)('%s — lời giải thứ hai đạt MỌI mục tiêu bắt buộc', (_id, level) => {
    const ctx = cham(level, 'altSolution');
    expect(ctx.record.error).toBeNull();
    expect(failingObjectiveIds(level.objectives, ctx, true)).toEqual([]);
  });

  it.each(MOI_LEVEL)('%s — trạng thái ban đầu TRƯỢT ít nhất một mục bắt buộc', (_id, level) => {
    expect(failingObjectiveIds(level.objectives, cham(level, 'initial'), true).length).toBeGreaterThan(0);
  });

  it.each(MOI_LEVEL)('%s — mục thưởng chia đôi hai lời giải', (_id, level) => {
    const thuong = mucThuong(level);
    expect(checkObjective(thuong, cham(level, 'solution'))).not.toBe(
      checkObjective(thuong, cham(level, 'altSolution')),
    );
  });

  it.each(MOI_LEVEL)('%s — hai lời giải khác nhau thật (workflow hoặc chính sách)', (_id, level) => {
    const dauVet = (which: LoiGiai): string =>
      JSON.stringify({
        stages: [...workflowCua(level, which).stages]
          .map((s) => ({ id: s.id, dependsOn: [...s.dependsOn].sort(), steps: s.steps.map((b) => b.id) }))
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        cd: which === 'initial' ? null : level.cd?.[which] ?? null,
      });
    expect(dauVet('solution')).not.toBe(dauVet('altSolution'));
  });

  it.each(MOI_LEVEL)('%s — cả hai lời giải nằm trong ngân sách ba trục, đường găng không đứt', (_id, level) => {
    const nguong = level.thresholds;
    for (const which of ['solution', 'altSolution'] as const) {
      const ctx = cham(level, which);
      const tomTat = summarizeEvaluation(ctx.record, ctx.workflow);
      expect(tomTat).not.toBeNull();
      if (tomTat === null) return;
      expect(tomTat.axes.leadTimeSeconds).toBeLessThanOrEqual(nguong.budgetLeadSeconds);
      expect(tomTat.axes.throughputPerHour).toBeGreaterThanOrEqual(nguong.minThroughputPerHour);
      expect(tomTat.axes.runnerMinutes).toBeLessThanOrEqual(nguong.budgetRunnerMinutes);
      expect(tomTat.axes.greenRate).toBeGreaterThanOrEqual(nguong.minGreenRate);
      for (const pass of ctx.record.passes) {
        for (const run of pass.runs) {
          expect(criticalPath(run.instances)?.truncated).toBe(false);
        }
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Luật sư phạm có tên — quyết định chủ dự án 2026-09-17
// ═══════════════════════════════════════════════════════════════════════════

function theoSo(so: number): CicdLevel | undefined {
  return CD_LEVELS.find((level) => level.id.startsWith(`cicd-c${String(so)}-`));
}

describe('chương CD — luật sư phạm', () => {
  it.runIf(theoSo(21) !== undefined)('C21 có CẢ bản ứng viên tốt lẫn xấu (§5.2)', () => {
    const scenarios = theoSo(21)?.cd?.release?.scenarios ?? [];
    expect(scenarios.some((s) => isBadCandidate(s)), 'thiếu bản xấu').toBe(true);
    expect(scenarios.some((s) => !isBadCandidate(s)), 'thiếu bản tốt').toBe(true);
  });

  it.each([18, 19, 20].filter((so) => theoSo(so) !== undefined))(
    'C%i khoá chiến lược phát hành — ba level dạy ba chiến lược, không sụp thành một (§5.3)',
    (so) => {
      const level = theoSo(so)!;
      expect(level.cd?.release, 'level chiến lược phải có kịch bản phát hành').toBeDefined();
      expect(level.cd?.editable ?? []).not.toContain('release.strategy');
    },
  );

  it.runIf(theoSo(18) !== undefined && theoSo(19) !== undefined && theoSo(20) !== undefined)(
    'C18/C19/C20 dạy đúng rolling / blue-green / canary',
    () => {
      expect(theoSo(18)?.cd?.initial.release?.strategy).toBe('rolling');
      expect(theoSo(19)?.cd?.initial.release?.strategy).toBe('blue-green');
      expect(theoSo(20)?.cd?.initial.release?.strategy).toBe('canary');
    },
  );
});
