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
 * ## Bộ chấm: gọi bản CHÍNH TẮC, không giữ bản của riêng mình
 *
 * File này từng mang một bộ kiểm vị từ riêng, viết khi `cicd/predicates.ts` chưa
 * tồn tại. Bộ đó đã bị XOÁ và mọi khẳng định dưới đây đi qua `checkObjective()`
 * / `failingObjectiveIds()` của bản chính tắc. Không phải dọn cho gọn: hai bản
 * đọc hiểu độc lập cùng một hợp đồng đã trôi khỏi nhau ở ba chỗ đo được, và cả
 * ba đều chỉ lộ ra khi đặt hai bản cạnh nhau.
 *
 * 1. **`graphAcyclic`** — bản cũ đọc `record.error?.kind !== 'cycle'`. Nhưng
 *    `validateGraph` báo cạnh treo TRƯỚC chu trình, nên một workflow vừa có
 *    cạnh treo vừa có vòng mang `error.kind === 'unknown-dependency'` và bản cũ
 *    trả lời *"không có chu trình"* trong khi nó CÓ. Bản chính tắc hỏi
 *    `findCycle` — đúng câu đang hỏi.
 * 2. **Cờ `truncated` của đường găng** — bản cũ ở đây tính một chuỗi cắt cụt là
 *    stage KHÔNG nằm trên đường găng; bản ở `ci-muon.test.ts` tính NGƯỢC LẠI.
 *    Cùng một bản ghi, hai câu trả lời. Bản chính tắc không đoán: lượt cắt cụt
 *    vào ô `unknown` và bị loại khỏi mẫu số (`decided = on + off`).
 * 3. **Thoả bằng cách XOÁ đối tượng đi** — bản cũ để `stageOffCriticalPath`
 *    xanh khi stage không tồn tại, nên mục thưởng *"đẩy `lint` ra khỏi đường
 *    găng"* của C04 ăn được bằng cách bỏ hẳn `lint`. Bản chính tắc ĐÒI stage
 *    tồn tại (luật 4 của `predicates.ts`).
 *
 * ## `validateObjectiveArgs` — cổng đi kèm chiều `false`
 *
 * Bản chính tắc trả `false` khi tham số thiếu hoặc sai kiểu, KHÔNG ném: một
 * level viết sai chỉ được phép làm hỏng một mục tiêu, không được làm sập phiên
 * chơi. Cái giá là lỗi của tác giả level trở nên câm — một mục tiêu gõ nhầm
 * `stages` thay vì `stage` sẽ vĩnh viễn không đạt và không có gì đỏ ở đâu cả.
 * Ô `tham số mục tiêu hợp lệ` dưới đây là chỗ lỗi đó được nói to, ở tầng test,
 * nơi nó rẻ.
 */

import { describe, expect, it } from 'vitest';

import { criticalPath } from '../critical-path.ts';
import { evaluate } from '../engine.ts';
import { summarizeEvaluation } from '../score.ts';
import type { CicdLevel, CicdObjective, WorkflowSpec } from '../contract.ts';
import type { CicdScoringContext } from '../predicates.ts';
import { checkObjective, failingObjectiveIds, validateObjectiveArgs } from '../predicates.ts';
import { CI_LEVELS_SOM } from './ci-som.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Trợ thủ — chạy engine, lấy mục thưởng. Chấm điểm là việc của `predicates.ts`.
// ═══════════════════════════════════════════════════════════════════════════

function chamWorkflow(level: CicdLevel, workflow: WorkflowSpec): CicdScoringContext {
  return { workflow, record: evaluate(workflow, level.workload, level.evaluation) };
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

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — tham số mục tiêu hợp lệ theo `CICD_PREDICATE_ARGS`',
    (_id, level) => {
      // Cổng đi kèm chiều `false` của bộ chấm chính tắc. Thiếu ô này thì một mục
      // tiêu gõ nhầm `stages` thay vì `stage` chỉ lặng lẽ trả `false` — đọc ra
      // thành "lời giải sai", và người sửa sẽ đi sửa level thay vì sửa mục tiêu.
      const loi = level.objectives.map((muc) => validateObjectiveArgs(muc)).filter((m) => m !== null);
      expect(loi).toEqual([]);
    },
  );
});

describe('C01–C07 — hai lời giải chạy qua engine thật', () => {
  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — lời giải chính đạt MỌI mục tiêu bắt buộc',
    (_id, level) => {
      const ctx = chamWorkflow(level, level.solutionWorkflow);
      expect(ctx.record.error).toBeNull();
      expect(failingObjectiveIds(level.objectives, ctx, true)).toEqual([]);
    },
  );

  it.each(CI_LEVELS_SOM.map((level) => [level.id, level] as const))(
    '%s — lời giải thứ hai đạt MỌI mục tiêu bắt buộc',
    (_id, level) => {
      const ctx = chamWorkflow(level, level.altSolutionWorkflow);
      expect(ctx.record.error).toBeNull();
      expect(failingObjectiveIds(level.objectives, ctx, true)).toEqual([]);
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
      expect(failingObjectiveIds(level.objectives, ctx, true).length).toBeGreaterThan(0);
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
      const chinh = checkObjective(thuong, chamWorkflow(level, level.solutionWorkflow));
      const phu = checkObjective(thuong, chamWorkflow(level, level.altSolutionWorkflow));
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
