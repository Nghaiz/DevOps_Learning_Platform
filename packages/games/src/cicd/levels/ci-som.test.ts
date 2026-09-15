/**
 * Ô nghiệm thu AC-F cho bảy level đầu chương CI.
 *
 * ## Vì sao file này chạy ENGINE THẬT chứ không so dữ liệu
 *
 * `CicdLevel.solutionWorkflow` là một **lời khai**: "đường ống này qua được
 * level". Một lời khai không ai chạy là một lời khai không ai kiểm — và cái giá
 * không phải một test đỏ, mà một level không giải được nằm im trong danh mục cho
 * tới khi có người chơi tới đó. Nên mọi khẳng định ở đây đi qua `evaluate()`,
 * `summarizeEvaluation()` và `criticalPath()`, đúng ba hàm mà tầng chơi thật sẽ
 * gọi.
 *
 * ## Ba ô, và ô thứ ba là ô giữ cho hai ô đầu không rỗng
 *
 * 1. **Hai lời giải đều AC.** Mọi mục tiêu `required` của cả bảy level đều đạt,
 *    trên CẢ `solutionWorkflow` lẫn `altSolutionWorkflow`.
 * 2. **`initialWorkflow` KHÔNG đạt.** Ít nhất một mục `required` phải hỏng ở
 *    trạng thái ban đầu. Thiếu ô này thì ô 1 xanh một cách rỗng: một bộ kiểm vị
 *    từ viết sai theo hướng "luôn trả true" sẽ làm ô 1 xanh trên mọi đầu vào, và
 *    không có gì trong file này phát hiện ra. Ô 2 là đối chứng âm của ô 1
 *    (`rules/green-that-proves-nothing.md`).
 * 3. **Hai lời giải KHÁC NHAU thật.** Mỗi level có đúng một mục THƯỞNG, và ô này
 *    khẳng định **đúng một trong hai** lời giải ăn được nó. Đó là phép đo cơ học
 *    cho câu "khác nhau về cách tiếp cận": nếu ai đó sửa cho hai lời giải hội tụ
 *    về cùng một hình dạng, mục thưởng sẽ cùng đạt hoặc cùng trượt, và ô này đỏ.
 *
 * ## Bộ kiểm vị từ nằm ở đây, có chủ ý
 *
 * Kho chưa có `cicd/predicates.ts` — hợp đồng khai `CICD_PREDICATE_NAMES` nhưng
 * chưa lane nào hiện thực bộ chấm. Bộ kiểm dưới đây vì thế là bản ĐỌC HIỂU của
 * lane này về hợp đồng, phạm vi test, không phải một bản thứ hai của tầng chấm:
 * nó cố ý KHÔNG được export, để không ai lỡ tay dùng nó như tầng chấm thật rồi
 * hai bản trôi khỏi nhau trong im lặng. Khi bộ chấm chính tắc lên, thay lời gọi
 * ở đây và xoá bộ kiểm này — đừng để hai bản cùng sống.
 *
 * `danhSachVoTu` ném khi gặp một vị từ chưa hiện thực, thay vì trả `false` hay
 * `true`. Trả `true` biến một vị từ chưa viết thành một mục tiêu luôn đạt; trả
 * `false` biến nó thành một level không giải được. Cả hai đều sai im lặng.
 */

import { describe, expect, it } from 'vitest';

import { criticalPath } from '../critical-path.ts';
import { evaluate } from '../engine.ts';
import { summarizeEvaluation } from '../score.ts';
import type {
  CicdLevel,
  CicdObjective,
  EvaluationRecord,
  StageId,
  StageSpec,
  WorkflowSpec,
} from '../contract.ts';
import { CI_LEVELS_SOM } from './ci-som.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Bộ kiểm vị từ — phạm vi test, KHÔNG export
// ═══════════════════════════════════════════════════════════════════════════

function soNguyen(args: Readonly<Record<string, unknown>> | undefined, khoa: string): number {
  const gia = args?.[khoa];
  if (typeof gia !== 'number' || !Number.isFinite(gia)) {
    throw new Error(`mục tiêu thiếu tham số số học "${khoa}"`);
  }
  return gia;
}

function chuoi(args: Readonly<Record<string, unknown>> | undefined, khoa: string): string {
  const gia = args?.[khoa];
  if (typeof gia !== 'string' || gia.length === 0) {
    throw new Error(`mục tiêu thiếu tham số chuỗi "${khoa}"`);
  }
  return gia;
}

/** Tập stage mà `stageId` phụ thuộc BẮC CẦU. Vắng mặt ⇒ tập rỗng. */
function phuThuocBacCau(stages: readonly StageSpec[], stageId: StageId): readonly StageId[] {
  const thay: StageId[] = [];
  const hang: StageId[] = [...(stages.find((s) => s.id === stageId)?.dependsOn ?? [])];
  while (hang.length > 0) {
    const ke = hang.shift();
    if (ke === undefined || thay.includes(ke)) continue;
    thay.push(ke);
    hang.push(...(stages.find((s) => s.id === ke)?.dependsOn ?? []));
  }
  return thay;
}

function demTrungCache(record: EvaluationRecord): number {
  let n = 0;
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const inst of run.instances) {
        for (const lanThu of inst.attempts) {
          for (const buoc of lanThu.steps) {
            if (buoc.cacheHit === true) n += 1;
          }
        }
      }
    }
  }
  return n;
}

function coNguyenNhan(record: EvaluationRecord, kind: string): boolean {
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const inst of run.instances) {
        for (const lanThu of inst.attempts) {
          if (lanThu.cause?.kind === kind) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Tỷ lệ lượt chạy (mỗi commit của mỗi lượt mô phỏng) có `stage` nằm trên đường
 * găng.
 *
 * ⚠ Một chuỗi `blockedBy` bị cắt cụt (`truncated`) được tính là KHÔNG có stage
 * đó, kể cả khi stage đó có thể nằm ở phần đã mất. Chiều sai này là chiều an
 * toàn cho `stageOnCriticalPath` (không khai bừa), và ô `duong-gang-khong-dut`
 * dưới đây khẳng định chuyện cắt cụt không xảy ra ở bảy level này — nên nó không
 * lặng lẽ làm mềm phép đo.
 */
function tyLeTrenDuongGang(record: EvaluationRecord, stage: StageId): number {
  let tong = 0;
  let trung = 0;
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      tong += 1;
      const duong = criticalPath(run.instances);
      if (duong !== null && !duong.truncated && duong.nodes.some((n) => n.stageId === stage)) {
        trung += 1;
      }
    }
  }
  return tong === 0 ? 0 : trung / tong;
}

interface BoiCanh {
  readonly workflow: WorkflowSpec;
  readonly record: EvaluationRecord;
}

function datMucTieu(muc: CicdObjective, ctx: BoiCanh): boolean {
  const { workflow, record } = ctx;
  const stages = workflow.stages;
  const tomTat = summarizeEvaluation(record, workflow);

  switch (muc.check) {
    case 'graphAcyclic':
      return record.error?.kind !== 'cycle';

    case 'stageExists':
      return stages.some((s) => s.id === chuoi(muc.args, 'stage'));

    case 'stageDependsOn':
      return phuThuocBacCau(stages, chuoi(muc.args, 'stage')).includes(chuoi(muc.args, 'on'));

    case 'stageNotDependsOn':
      return !phuThuocBacCau(stages, chuoi(muc.args, 'stage')).includes(chuoi(muc.args, 'on'));

    case 'stageCountAtMost':
      return stages.length <= soNguyen(muc.args, 'max');

    case 'leadTimeUnder':
      return tomTat !== null && tomTat.axes.leadTimeSeconds < soNguyen(muc.args, 'seconds');

    case 'throughputAtLeast':
      return tomTat !== null && tomTat.axes.throughputPerHour >= soNguyen(muc.args, 'perHour');

    case 'runnerMinutesUnder':
      return tomTat !== null && tomTat.axes.runnerMinutes < soNguyen(muc.args, 'minutes');

    case 'greenRateAtLeast':
      return tomTat !== null && tomTat.axes.greenRate >= soNguyen(muc.args, 'rate');

    case 'cacheHitsAtLeast':
      return demTrungCache(record) >= soNguyen(muc.args, 'count');

    case 'noFailureCause':
      return !coNguyenNhan(record, chuoi(muc.args, 'cause'));

    case 'stageNonBlocking': {
      const stage = stages.find((s) => s.id === chuoi(muc.args, 'stage'));
      return stage !== undefined && !stage.blocking;
    }

    case 'stageOnCriticalPath':
      return tyLeTrenDuongGang(record, chuoi(muc.args, 'stage')) >= soNguyen(muc.args, 'rate');

    case 'stageOffCriticalPath':
      return 1 - tyLeTrenDuongGang(record, chuoi(muc.args, 'stage')) >= soNguyen(muc.args, 'rate');

    default:
      // Ném, không trả bừa. Một vị từ chưa hiện thực mà trả `true` là một mục
      // tiêu luôn đạt; trả `false` là một level không giải được. Cả hai sai im.
      throw new Error(`vị từ "${muc.check}" chưa có trong bộ kiểm của ci-som.test.ts`);
  }
}

function chamWorkflow(level: CicdLevel, workflow: WorkflowSpec): BoiCanh {
  return { workflow, record: evaluate(workflow, level.workload, level.evaluation) };
}

function mucTruot(level: CicdLevel, ctx: BoiCanh, batBuoc: boolean): readonly string[] {
  return level.objectives
    .filter((muc) => muc.required === batBuoc && !datMucTieu(muc, ctx))
    .map((muc) => muc.id);
}

function mucThuong(level: CicdLevel): CicdObjective {
  const thuong = level.objectives.filter((muc) => !muc.required);
  const dau = thuong[0];
  if (thuong.length !== 1 || dau === undefined) {
    throw new Error(`${level.id}: cần đúng 1 mục thưởng, đang có ${String(thuong.length)}`);
  }
  return dau;
}

// ═══════════════════════════════════════════════════════════════════════════
// Ô nghiệm thu
// ═══════════════════════════════════════════════════════════════════════════

describe('C01–C07 — hình dạng dữ liệu', () => {
  it('có đúng bảy level, id duy nhất, đều thuộc chương ci', () => {
    const ids = CI_LEVELS_SOM.map((level) => level.id);
    expect(ids).toEqual([
      'cicd-c01-mot-job-mot-step',
      'cicd-c02-canh-phu-thuoc',
      'cicd-c03-song-song-tren-may',
      'cicd-c04-duong-gang',
      'cicd-c05-viec-khong-chan',
      'cicd-c06-cache-la-buffer',
      'cicd-c07-khoa-cache-qua-rong',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CI_LEVELS_SOM.every((level) => level.chapter === 'ci')).toBe(true);
  });

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — mục tiêu, ngưỡng và stage hợp lệ',
    (_id, level) => {
      // Mỗi level cần ≥ 1 mục bắt buộc, nếu không "AC" không phát biểu được.
      expect(level.objectives.filter((muc) => muc.required).length).toBeGreaterThan(0);
      expect(new Set(level.objectives.map((muc) => muc.id)).size).toBe(level.objectives.length);

      for (const workflow of [level.initialWorkflow, level.solutionWorkflow, level.altSolutionWorkflow]) {
        const ids = workflow.stages.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const stage of workflow.stages) {
          // Cạnh treo: hợp đồng bắt engine trả `unknown-dependency`, và một
          // level tự mang cạnh treo là một level không chạy được.
          expect(stage.dependsOn.every((canh) => ids.includes(canh))).toBe(true);
          expect(stage.steps.length).toBeGreaterThan(0);
          const buocIds = stage.steps.map((b) => b.id);
          expect(new Set(buocIds).size).toBe(buocIds.length);
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
    },
  );
});

describe('C01–C07 — hai lời giải chạy qua engine thật', () => {
  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — lời giải chính đạt MỌI mục tiêu bắt buộc',
    (_id, level) => {
      const ctx = chamWorkflow(level, level.solutionWorkflow);
      expect(ctx.record.error).toBeNull();
      expect(mucTruot(level, ctx, true)).toEqual([]);
    },
  );

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — lời giải thứ hai đạt MỌI mục tiêu bắt buộc',
    (_id, level) => {
      const ctx = chamWorkflow(level, level.altSolutionWorkflow);
      expect(ctx.record.error).toBeNull();
      expect(mucTruot(level, ctx, true)).toEqual([]);
    },
  );

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — cả hai lời giải nằm trong ngân sách ba trục',
    (_id, level) => {
      const nguong = level.thresholds;
      for (const workflow of [level.solutionWorkflow, level.altSolutionWorkflow]) {
        const ctx = chamWorkflow(level, workflow);
        const tomTat = summarizeEvaluation(ctx.record, workflow);
        expect(tomTat).not.toBeNull();
        if (tomTat === null) return;
        expect(tomTat.axes.leadTimeSeconds).toBeLessThanOrEqual(nguong.budgetLeadSeconds);
        expect(tomTat.axes.throughputPerHour).toBeGreaterThanOrEqual(nguong.minThroughputPerHour);
        expect(tomTat.axes.runnerMinutes).toBeLessThanOrEqual(nguong.budgetRunnerMinutes);
        expect(tomTat.axes.greenRate).toBeGreaterThanOrEqual(nguong.minGreenRate);
      }
    },
  );

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — lời giải chính đạt mốc `par` của cả ba trục',
    (_id, level) => {
      const nguong = level.thresholds;
      const ctx = chamWorkflow(level, level.solutionWorkflow);
      const tomTat = summarizeEvaluation(ctx.record, level.solutionWorkflow);
      expect(tomTat).not.toBeNull();
      if (tomTat === null) return;
      // `par` là mốc trọn điểm. Một `par` không lời giải nào chạm tới là đúng
      // lỗi mà hợp đồng gọi tên ở `CicdThresholds`: hệ chấm nói dối, và nói dối
      // khác nhau ở mỗi bài nên không test nào viết cho một bài phát hiện được.
      expect(tomTat.axes.leadTimeSeconds).toBeLessThanOrEqual(nguong.parLeadSeconds);
      expect(tomTat.axes.throughputPerHour).toBeGreaterThanOrEqual(nguong.parThroughputPerHour);
      expect(tomTat.axes.runnerMinutes).toBeLessThanOrEqual(nguong.parRunnerMinutes);
    },
  );

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — đường găng không đứt ở lời giải nào',
    (_id, level) => {
      // Chuỗi `blockedBy` đứt khi một thực thể chờ máy do commit KHÁC giữ:
      // `InstanceKey` không mang `commitId`, nên khoá trỏ ra ngoài
      // `RunRecord.instances` của chính nó. Bảy level này giãn commit đủ rộng
      // để chuyện đó không xảy ra — và ô này là thứ giữ cho lời khẳng định ấy
      // không ôi đi khi có người chỉnh `CommitArrival.tick`.
      for (const workflow of [level.solutionWorkflow, level.altSolutionWorkflow]) {
        const ctx = chamWorkflow(level, workflow);
        for (const pass of ctx.record.passes) {
          for (const run of pass.runs) {
            const duong = criticalPath(run.instances);
            expect(duong).not.toBeNull();
            expect(duong?.truncated).toBe(false);
          }
        }
      }
    },
  );
});

describe('C01–C07 — đối chứng âm', () => {
  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — `initialWorkflow` TRƯỢT ít nhất một mục tiêu bắt buộc',
    (_id, level) => {
      // Không có ô này thì ô "lời giải qua được" xanh một cách rỗng: một level
      // mà trạng thái ban đầu đã AC là một level không có gì để làm.
      const ctx = chamWorkflow(level, level.initialWorkflow);
      expect(mucTruot(level, ctx, true).length).toBeGreaterThan(0);
    },
  );
});

describe('C01–C07 — hai lời giải khác nhau thật', () => {
  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — mục thưởng chia đôi hai lời giải',
    (_id, level) => {
      // Phép đo cơ học cho "khác nhau về cách tiếp cận": nếu ai đó sửa cho hai
      // lời giải hội tụ về cùng một hình dạng, mục thưởng sẽ cùng đạt hoặc cùng
      // trượt, và ô này đỏ ngay. Một cặp "cùng đồ thị đổi tên stage" không đi
      // qua được ô này.
      const thuong = mucThuong(level);
      const chinh = datMucTieu(thuong, chamWorkflow(level, level.solutionWorkflow));
      const phu = datMucTieu(thuong, chamWorkflow(level, level.altSolutionWorkflow));
      expect(chinh).not.toBe(phu);
    },
  );

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — hai lời giải khác nhau ở cấu trúc, không chỉ ở tên',
    (_id, level) => {
      const dauVet = (workflow: WorkflowSpec): string =>
        [...workflow.stages]
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
          .map((stage) =>
            [
              stage.id,
              stage.blocking ? 'chan' : 'khong-chan',
              `<${[...stage.dependsOn].sort().join('+')}>`,
              stage.steps
                .map(
                  (buoc) =>
                    `${buoc.id}:${String(buoc.durationTicks)}:${buoc.blocking ? 'c' : 'k'}:${
                      buoc.cache === undefined
                        ? '-'
                        : `${buoc.cache.id}[${buoc.cache.keyParts.join('|')}]${String(buoc.cache.savesTicks)}`
                    }`,
                )
                .join(','),
            ].join(' '),
          )
          .join(' ; ');

      expect(dauVet(level.solutionWorkflow)).not.toBe(dauVet(level.altSolutionWorkflow));
    },
  );
});
