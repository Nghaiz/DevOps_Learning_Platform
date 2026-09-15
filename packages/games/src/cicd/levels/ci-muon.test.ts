import { describe, expect, it } from 'vitest';

import type {
  CicdLevel,
  CicdObjective,
  EvaluationRecord,
  StageId,
  WorkflowSpec,
} from '../contract.ts';
import { criticalPath } from '../critical-path.ts';
import { evaluate } from '../engine.ts';
import { summarizeEvaluation } from '../score.ts';
import { CI_LEVELS_MUON } from './ci-muon.ts';

/**
 * Ô nghiệm thu AC-F cho bảy level C08–C14.
 *
 * ## Vì sao file này tự hiện thực bộ vị từ
 *
 * `CICD_PREDICATE_NAMES` là một mảng TÊN trong hợp đồng; bảng tra thật sự
 * (lane A.9) chưa có mặt lúc bảy level này được viết. Không có bộ chấm thì câu
 * "level này giải được" chỉ là một lời khai của người viết level — đúng cái mà
 * AC-F tồn tại để bác bỏ.
 *
 * Nên bộ vị từ dưới đây là bản hiện thực **của riêng test này**, đọc thẳng từ
 * `EvaluationRecord` mà engine thật trả về. Nó cố ý bám sát từng câu mô tả
 * trong `contract.ts`; hai chỗ hợp đồng để ngỏ thì file này ghi ra cách đọc của
 * mình ngay tại chỗ (`stageDependsOn` và `escapedDefectsAtMost`), để khi bảng
 * tra chính thức lên, chỗ lệch nhau là một dòng đọc được chứ không phải một
 * khác biệt hành vi không ai truy ra.
 *
 * ⚠ Đây KHÔNG phải bản chính tắc. Khi `predicates.ts` của A.9 xuất hiện, file
 * này phải chuyển sang gọi nó và xoá bộ dưới đây đi — hai bản khai cùng hình
 * dạng sẽ trôi khỏi nhau ở lần đầu tiên ai đó thêm một vị từ mới, và cả hai vẫn
 * biên dịch.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Bộ vị từ (bản của test)
// ═══════════════════════════════════════════════════════════════════════════

/** Phụ thuộc BẮC CẦU, đúng như `CICD_PREDICATE_NAMES` mô tả `stageDependsOn`. */
function dependsOnTransitively(workflow: WorkflowSpec, from: StageId, target: StageId): boolean {
  const seen = new Set<StageId>();
  const stack: StageId[] = [from];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    const stage = workflow.stages.find((one) => one.id === current);
    if (stage === undefined) continue;
    for (const dep of stage.dependsOn) {
      if (dep === target) return true;
      stack.push(dep);
    }
  }
  return false;
}

function everyAttempt(record: EvaluationRecord) {
  return record.passes.flatMap((pass) =>
    pass.runs.flatMap((run) => run.instances.flatMap((instance) => instance.attempts)),
  );
}

function everyStepRecord(record: EvaluationRecord) {
  return everyAttempt(record).flatMap((attempt) => attempt.steps);
}

/**
 * Khiếm khuyết LỌT XUỐNG: một lần đỏ `latent-defect` mà một lần thử lại sau đó
 * đã che đi.
 *
 * Cách đọc bám đúng chữ của hợp đồng — *"đỏ `latent-defect` bị retry che"*. Nên
 * điều kiện là: thực thể có một lần thử đỏ vì `latent-defect`, VÀ lần thử cuối
 * cùng của nó xanh. Một thực thể đỏ tới cùng thì lỗi đó đã hiện ra, không lọt
 * xuống đâu cả.
 *
 * ⚠ Cách đọc này KHÔNG bắt được lối tránh bằng `blocking: false`: một stage
 * không chặn vẫn ghi `outcome: 'failed'` nên không tính là bị che, dù lỗi vẫn
 * đi thẳng xuống bản phát hành. C11 đóng lối đó bằng CẤU TRÚC — `'blocking'`
 * không nằm trong `editable` của nó — chứ không bằng một vị từ rộng hơn, vì
 * nới định nghĩa ở đây sẽ làm bản test lệch khỏi hợp đồng ở một chỗ không ai
 * đọc lại.
 */
function escapedDefects(record: EvaluationRecord): number {
  let total = 0;
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const instance of run.instances) {
        const last = instance.attempts.at(-1);
        if (last === undefined || last.outcome !== 'passed') continue;
        total += instance.attempts.filter(
          (attempt) =>
            attempt.cause?.kind === 'flake' && attempt.cause.nature === 'latent-defect',
        ).length;
      }
    }
  }
  return total;
}

/** Tỷ lệ lượt chạy (theo commit) mà stage KHÔNG nằm trên đường găng. */
function offCriticalPathRate(record: EvaluationRecord, stage: StageId): number {
  let total = 0;
  let off = 0;
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      const path = criticalPath(run.instances);
      total += 1;
      if (path === null || !path.nodes.some((node) => node.stageId === stage)) off += 1;
    }
  }
  return total === 0 ? 0 : off / total;
}

function num(args: CicdObjective['args'], key: string): number {
  const value = args?.[key];
  if (typeof value !== 'number') {
    throw new Error(`mục tiêu thiếu tham số số học "${key}"`);
  }
  return value;
}

function text(args: CicdObjective['args'], key: string): string {
  const value = args?.[key];
  if (typeof value !== 'string') {
    throw new Error(`mục tiêu thiếu tham số chuỗi "${key}"`);
  }
  return value;
}

/**
 * Chấm MỘT mục tiêu trên một workflow đã chạy thật.
 *
 * Ném khi gặp một vị từ file này chưa hiện thực. Cố ý ném thay vì trả `false`:
 * một vị từ chưa hiện thực trả `false` sẽ đọc ra thành "lời giải sai", và người
 * đọc kết quả sẽ đi sửa level thay vì sửa bộ chấm.
 */
function checkObjective(
  objective: CicdObjective,
  workflow: WorkflowSpec,
  record: EvaluationRecord,
): boolean {
  const summary = summarizeEvaluation(record, workflow);
  const axes = summary?.axes ?? null;

  switch (objective.check) {
    case 'graphAcyclic':
      return record.error?.kind !== 'cycle';
    case 'stageExists':
      return workflow.stages.some((one) => one.id === text(objective.args, 'stage'));
    case 'stageDependsOn':
      return dependsOnTransitively(
        workflow,
        text(objective.args, 'stage'),
        text(objective.args, 'on'),
      );
    case 'stageNotDependsOn':
      return !dependsOnTransitively(
        workflow,
        text(objective.args, 'stage'),
        text(objective.args, 'on'),
      );
    case 'stageCountAtMost':
      return workflow.stages.length <= num(objective.args, 'max');
    case 'leadTimeUnder':
      return axes !== null && axes.leadTimeSeconds < num(objective.args, 'seconds');
    case 'throughputAtLeast':
      return axes !== null && axes.throughputPerHour >= num(objective.args, 'perHour');
    case 'runnerMinutesUnder':
      return axes !== null && axes.runnerMinutes < num(objective.args, 'minutes');
    case 'greenRateAtLeast':
      return axes !== null && axes.greenRate >= num(objective.args, 'rate');
    case 'cacheHitsAtLeast':
      return (
        everyStepRecord(record).filter((step) => step.cacheHit === true).length >=
        num(objective.args, 'count')
      );
    case 'cacheNeverHits': {
      const cache = text(objective.args, 'cache');
      return !workflow.stages.some((stage) =>
        stage.steps.some((step) => step.cache?.id === cache && hasHit(record, step.id)),
      );
    }
    case 'noFailureCause':
      return !everyAttempt(record).some(
        (attempt) => attempt.cause?.kind === text(objective.args, 'cause'),
      );
    case 'retriesAtMost': {
      const stage = workflow.stages.find((one) => one.id === text(objective.args, 'stage'));
      return stage === undefined || stage.retries <= num(objective.args, 'max');
    }
    case 'stageOnCriticalPath':
      return (
        1 - offCriticalPathRate(record, text(objective.args, 'stage')) >=
        num(objective.args, 'rate')
      );
    case 'stageOffCriticalPath':
      return (
        offCriticalPathRate(record, text(objective.args, 'stage')) >= num(objective.args, 'rate')
      );
    case 'escapedDefectsAtMost':
      return escapedDefects(record) <= num(objective.args, 'max');
    case 'stageNonBlocking': {
      const stage = workflow.stages.find((one) => one.id === text(objective.args, 'stage'));
      return stage !== undefined && !stage.blocking;
    }
    default:
      throw new Error(`vị từ "${objective.check}" chưa có trong bộ chấm của test này`);
  }
}

function hasHit(record: EvaluationRecord, stepId: string): boolean {
  return everyStepRecord(record).some((step) => step.id === stepId && step.cacheHit === true);
}

function runLevel(level: CicdLevel, workflow: WorkflowSpec): EvaluationRecord {
  return evaluate(workflow, level.workload, level.evaluation);
}

function failedRequired(level: CicdLevel, workflow: WorkflowSpec): readonly string[] {
  const record = runLevel(level, workflow);
  return level.objectives
    .filter((objective) => objective.required)
    .filter((objective) => !checkObjective(objective, workflow, record))
    .map((objective) => objective.id);
}

// ═══════════════════════════════════════════════════════════════════════════
// AC-F — hai lời giải, và một đối chứng âm
// ═══════════════════════════════════════════════════════════════════════════

describe('C08–C14 — hợp lệ về cấu trúc', () => {
  it('bảy level, id duy nhất, đều thuộc chương CI', () => {
    expect(CI_LEVELS_MUON).toHaveLength(7);
    expect(new Set(CI_LEVELS_MUON.map((level) => level.id)).size).toBe(7);
    for (const level of CI_LEVELS_MUON) {
      expect(level.chapter).toBe('ci');
      expect(level.objectives.some((objective) => objective.required)).toBe(true);
      // Hai lời giải phải KHÁC nhau. So sâu chứ không so tham chiếu: một lần
      // chép-dán rồi quên sửa cho ra hai object khác tham chiếu mà giống hệt
      // nội dung, và đó đúng là thứ AC-F tồn tại để bắt.
      expect(level.solutionWorkflow).not.toEqual(level.altSolutionWorkflow);
    }
  });
});

describe.each(CI_LEVELS_MUON.map((level) => [level.id, level] as const))(
  '%s',
  (_id, level: CicdLevel) => {
    it('lời giải chính chạy được và đạt HẾT mục tiêu bắt buộc', () => {
      expect(runLevel(level, level.solutionWorkflow).error).toBeNull();
      expect(failedRequired(level, level.solutionWorkflow)).toEqual([]);
    });

    it('lời giải thứ hai chạy được và đạt HẾT mục tiêu bắt buộc', () => {
      expect(runLevel(level, level.altSolutionWorkflow).error).toBeNull();
      expect(failedRequired(level, level.altSolutionWorkflow)).toEqual([]);
    });

    /**
     * ĐỐI CHỨNG ÂM. Thiếu vế này thì hai ô trên xanh một cách rỗng: một level có
     * mục tiêu dễ tới mức workflow ban đầu cũng đạt sẽ cho cả hai lời giải qua
     * mà chẳng chứng minh được gì (`rules/green-that-proves-nothing.md`).
     */
    it('workflow ban đầu KHÔNG đạt — level thật sự có việc để làm', () => {
      expect(failedRequired(level, level.initialWorkflow).length).toBeGreaterThan(0);
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// C09 — cỡ mẫu, đo chứ không kể
// ═══════════════════════════════════════════════════════════════════════════

describe('C09 — một lượt xanh không chứng minh gì', () => {
  const c09 = CI_LEVELS_MUON.find((level) => level.id.startsWith('cicd-c09'));

  it('cùng hạt giống: 1 lượt cho XANH TRỌN VẸN, 20 lượt cho dưới 95%', () => {
    expect(c09).toBeDefined();
    if (c09 === undefined) return;

    const motLuot = evaluate(c09.initialWorkflow, c09.workload, {
      baseSeed: c09.evaluation.baseSeed,
      passes: 1,
    });
    const haiMuoiLuot = evaluate(c09.initialWorkflow, c09.workload, c09.evaluation);

    const mot = summarizeEvaluation(motLuot, c09.initialWorkflow);
    const haiMuoi = summarizeEvaluation(haiMuoiLuot, c09.initialWorkflow);

    // Đây là toàn bộ bài học của level, viết thành một phép đo: cùng workflow,
    // cùng hạt giống, hai cỡ mẫu, hai kết luận trái ngược nhau.
    expect(mot?.axes.greenRate).toBe(1);
    expect(haiMuoi?.axes.greenRate).toBeLessThan(0.95);
    expect(c09.evaluation.passes).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C11 — khiếm khuyết lọt xuống, đo chứ không kể
// ═══════════════════════════════════════════════════════════════════════════

describe('C11 — chạy lại che mất lỗi thật', () => {
  const c11 = CI_LEVELS_MUON.find((level) => level.id.startsWith('cicd-c11'));

  it('workflow ban đầu: tỷ lệ xanh CAO HƠN cả hai lời giải, mà vẫn che lỗi', () => {
    expect(c11).toBeDefined();
    if (c11 === undefined) return;

    const ban_dau = runLevel(c11, c11.initialWorkflow);
    const loi_giai = runLevel(c11, c11.solutionWorkflow);
    const loi_giai_hai = runLevel(c11, c11.altSolutionWorkflow);

    expect(escapedDefects(ban_dau)).toBeGreaterThan(0);
    expect(escapedDefects(loi_giai)).toBe(0);
    expect(escapedDefects(loi_giai_hai)).toBe(0);

    const xanh = (record: EvaluationRecord, workflow: WorkflowSpec): number =>
      summarizeEvaluation(record, workflow)?.axes.greenRate ?? 0;

    // Cái giá phải trả, viết thành một phép so sánh: sửa xong thì con số ĐẸP đi
    // xuống. Ô này đỏ nếu ai đó "cân bằng lại" level cho tử tế hơn và vô tình
    // xoá mất chính cái đánh đổi mà level tồn tại để dạy.
    expect(xanh(ban_dau, c11.initialWorkflow)).toBeGreaterThan(
      xanh(loi_giai, c11.solutionWorkflow),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C08 — cache trúng NHIỀU HƠN ở bản hỏng
// ═══════════════════════════════════════════════════════════════════════════

describe('C08 — khoá cache quá hẹp', () => {
  const c08 = CI_LEVELS_MUON.find((level) => level.id.startsWith('cicd-c08'));

  it('bản hỏng trúng cache NHIỀU HƠN bản đã sửa', () => {
    expect(c08).toBeDefined();
    if (c08 === undefined) return;

    const dem = (workflow: WorkflowSpec): number =>
      everyStepRecord(runLevel(c08, workflow)).filter((step) => step.cacheHit === true).length;

    // Chính vì bất đẳng thức này mà `cacheHitsAtLeast` ở C08 là mục tiêu THƯỞNG
    // chứ không bắt buộc: một ô nghiệm thu dựng trên số lần trúng sẽ được thoả
    // mãn bởi đúng cái workflow mà level đang bảo người chơi sửa đi.
    expect(dem(c08.initialWorkflow)).toBeGreaterThan(dem(c08.solutionWorkflow));
    expect(dem(c08.altSolutionWorkflow)).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Bảng đo — nguồn của mọi ngưỡng trong bảy level
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mọi ngưỡng trong bảy level được ĐO từ một lượt chạy engine thật, và mỗi file
 * level ghi lại con số đó trong một khối chú thích cạnh `thresholds`.
 *
 * Một con số chép vào chú thích rồi không ai kiểm lại là một con số sẽ ôi trong
 * im lặng. Ba ô dưới đây ghim đúng những QUAN HỆ mà các khối chú thích đó viện
 * dẫn — không ghim cả 21 hàng số, vì một bảng số nguyên vẹn sẽ đỏ vì mọi thay
 * đổi vô hại của engine và rồi bị ai đó cập nhật cho khớp mà không đọc.
 */
function axesOf(level: CicdLevel, workflow: WorkflowSpec) {
  return summarizeEvaluation(runLevel(level, workflow), workflow)?.axes ?? null;
}

describe('ba trục — những quan hệ mà chú thích ngưỡng viện dẫn', () => {
  const byId = (prefix: string): CicdLevel => {
    const level = CI_LEVELS_MUON.find((one) => one.id.startsWith(prefix));
    if (level === undefined) throw new Error(`không có level ${prefix}`);
    return level;
  };

  it('C12: quạt ra hạ lead time mà KHÔNG động tới runner-phút', () => {
    const level = byId('cicd-c12');
    const banDau = axesOf(level, level.initialWorkflow);
    const loiGiai = axesOf(level, level.solutionWorkflow);
    expect(banDau).not.toBeNull();
    expect(loiGiai).not.toBeNull();
    if (banDau === null || loiGiai === null) return;

    // Trục ③ bằng nhau tới từng chữ số, trục ① giảm một nửa. Đây là nhân chứng
    // rẻ nhất cho "ba trục không suy ra được từ nhau", và nó nằm trong một level
    // người chơi chơi thật chứ không trong một fixture dựng riêng.
    expect(loiGiai.runnerMinutes).toBeCloseTo(banDau.runnerMinutes, 6);
    expect(loiGiai.leadTimeSeconds).toBeLessThan(banDau.leadTimeSeconds / 1.5);
  });

  it('C14: tách nhánh giữ nguyên runner-phút, thêm cache mới hạ được nó', () => {
    const level = byId('cicd-c14');
    const banDau = axesOf(level, level.initialWorkflow);
    const tachNhanh = axesOf(level, level.solutionWorkflow);
    const themCache = axesOf(level, level.altSolutionWorkflow);
    expect(banDau).not.toBeNull();
    expect(tachNhanh).not.toBeNull();
    expect(themCache).not.toBeNull();
    if (banDau === null || tachNhanh === null || themCache === null) return;

    expect(tachNhanh.runnerMinutes).toBeCloseTo(banDau.runnerMinutes, 6);
    expect(tachNhanh.leadTimeSeconds).toBeLessThan(banDau.leadTimeSeconds);
    expect(themCache.runnerMinutes).toBeLessThan(tachNhanh.runnerMinutes);
  });

  it('C10 và C13: hai lời giải khác nhau ĐO ĐƯỢC, không chỉ khác tên stage', () => {
    const c10 = byId('cicd-c10');
    const songSong = axesOf(c10, c10.solutionWorkflow);
    const noiTiep = axesOf(c10, c10.altSolutionWorkflow);
    expect(songSong?.leadTimeSeconds).toBeLessThan(noiTiep?.leadTimeSeconds ?? 0);

    const c13 = byId('cicd-c13');
    const congTongHop = axesOf(c13, c13.solutionWorkflow);
    const gomThang = axesOf(c13, c13.altSolutionWorkflow);
    // Cổng tổng hợp có giá: thêm một tick lead và thêm runner-phút của chính nó.
    expect(gomThang?.leadTimeSeconds).toBeLessThan(congTongHop?.leadTimeSeconds ?? 0);
    expect(gomThang?.runnerMinutes).toBeLessThan(congTongHop?.runnerMinutes ?? 0);
  });
});
