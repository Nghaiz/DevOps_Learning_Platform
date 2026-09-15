import { describe, expect, it } from 'vitest';

import type { CicdLevel, CicdObjective, EvaluationRecord, WorkflowSpec } from '../contract.ts';
import { evaluate } from '../engine.ts';
import type { CicdScoringContext } from '../predicates.ts';
import {
  checkObjective,
  countCacheHits,
  failingObjectiveIds,
  validateObjectiveArgs,
} from '../predicates.ts';
import { summarizeEvaluation } from '../score.ts';
import { CI_LEVELS_MUON } from './ci-muon.ts';

/**
 * Ô nghiệm thu AC-F cho bảy level C08–C14.
 *
 * ## Bộ chấm: gọi bản CHÍNH TẮC, không giữ bản của riêng mình
 *
 * File này từng tự hiện thực một bộ vị từ, viết khi `cicd/predicates.ts` chưa có
 * mặt. Bộ đó đã bị XOÁ; mọi khẳng định "level này giải được" giờ đi qua
 * `checkObjective()` / `failingObjectiveIds()` của bản chính tắc — cùng ba hàm
 * mà tầng chơi thật sẽ gọi.
 *
 * Đây không phải dọn cho gọn. Hai bản đọc hiểu độc lập cùng một hợp đồng ĐÃ trôi
 * khỏi nhau ở ba chỗ đo được, và cả ba đều biên dịch, đều xanh ở test của chính
 * nó:
 *
 * 1. **`graphAcyclic`** — bản cũ đọc `record.error?.kind !== 'cycle'`. Nhưng
 *    `validateGraph` báo cạnh treo TRƯỚC chu trình, nên một workflow vừa có
 *    cạnh treo vừa có vòng mang `error.kind === 'unknown-dependency'` và bản cũ
 *    trả lời *"không có chu trình"* trong khi nó CÓ.
 * 2. **Cờ `truncated` của đường găng** — `offCriticalPathRate` (đã xoá) tính một
 *    chuỗi cắt cụt là stage KHÔNG nằm trên đường găng (nên "off" được cộng);
 *    bản ở `ci-som.test.ts` tính ngược lại. Cùng một bản ghi, hai câu trả lời.
 *    Bản chính tắc không đoán: lượt cắt cụt vào ô `unknown` và bị loại khỏi mẫu
 *    số (`decided = on + off`).
 * 3. **Thoả bằng cách XOÁ đối tượng đi** — bản cũ để `retriesAtMost` xanh khi
 *    stage không tồn tại (`stage === undefined || …`), nên mục bắt buộc *"stage
 *    đóng gói không còn lần thử lại nào"* của C10 ăn được bằng cách bỏ hẳn
 *    `dong-goi`. Bản chính tắc ĐÒI đối tượng tồn tại (luật 4 của
 *    `predicates.ts`), cho cả `stageNotDependsOn`, `stageOffCriticalPath`,
 *    `retriesAtMost` và `cacheNeverHits`.
 *
 * ## `validateObjectiveArgs` — cổng đi kèm chiều `false`
 *
 * Bản chính tắc trả `false` khi tham số thiếu hoặc sai kiểu, KHÔNG ném: lỗi của
 * một level chỉ được phép làm hỏng một mục tiêu, không được làm sập phiên chơi.
 * Cái giá là lỗi của tác giả level trở nên câm. Ô `tham số mục tiêu hợp lệ` dưới
 * đây là chỗ lỗi đó được nói to, ở tầng test, nơi nó rẻ.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Trợ thủ — chạy engine và ĐO. Chấm điểm là việc của `predicates.ts`.
// ═══════════════════════════════════════════════════════════════════════════

function runLevel(level: CicdLevel, workflow: WorkflowSpec): EvaluationRecord {
  return evaluate(workflow, level.workload, level.evaluation);
}

function scoringContext(level: CicdLevel, workflow: WorkflowSpec): CicdScoringContext {
  return { workflow, record: runLevel(level, workflow) };
}

function failedRequired(level: CicdLevel, workflow: WorkflowSpec): readonly string[] {
  return failingObjectiveIds(level.objectives, scoringContext(level, workflow), true);
}

/**
 * Mục tiêu tổng hợp, dùng để HỎI bộ chấm chính tắc một câu mà bảy level không
 * hỏi sẵn.
 *
 * Có mặt để C11 dưới đây không phải đọc `escapedDefects` bằng một hàm của riêng
 * nó. Một phép đếm khiếm khuyết lọt xuống viết lần thứ hai là đúng cái đã trôi
 * một lần rồi — hỏi bộ chấm thì câu trả lời buộc phải khớp với thứ người chơi
 * nhận được.
 */
function mucTieuTongHop(
  id: string,
  check: CicdObjective['check'],
  args: Readonly<Record<string, unknown>>,
): CicdObjective {
  return { id, label: `phép đo nội bộ của test: ${id}`, check, args, required: true };
}

/** `escapedDefectsAtMost { max: 0 }` — "không khiếm khuyết nào lọt xuống". */
const KHONG_LOT_KHIEM_KHUYET = mucTieuTongHop('khong-lot-khiem-khuyet', 'escapedDefectsAtMost', {
  max: 0,
});

/*
 * `countCacheHits` nhập từ `predicates.ts` — file này từng giữ một bản đếm
 * riêng, XOÁ 2026-09-16 (lead).
 *
 * ⚠ Nó là một PHÉP ĐO, không phải một bộ chấm: không trả lời "đạt hay không" ở
 * đâu cả, chỉ đưa một con số để C08 dưới đây SO SÁNH hai workflow. Bộ chấm chỉ
 * nói được `cacheHitsAtLeast { count }`, tức một NGƯỠNG, và một ngưỡng không
 * phát biểu nổi câu "bản hỏng trúng nhiều hơn bản đã sửa" — vốn là toàn bộ lý
 * do `cacheHitsAtLeast` ở C08 là mục THƯỞNG chứ không bắt buộc. Cả hai bản đều
 * vượt mọi ngưỡng hợp lý, kể cả ngưỡng 30 của chính C08.
 *
 * Nên phép đo này cần tồn tại, nhưng nó không cần tồn tại HAI LẦN. Một phép đếm
 * viết hai nơi sẽ lệch ở lần đầu ai đó đổi nghĩa `cacheHit` (chẳng hạn thôi đếm
 * lần trúng của một lượt thử lại): hai con số vẫn là số, cả hai vẫn chạy, và
 * không gì đỏ. `cacheHitsAtLeast` nay gọi chính hàm này, nên ngưỡng và số thô
 * không bao giờ đọc ra hai con số khác nhau.
 */

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

  it.each(CI_LEVELS_MUON.map((level) => [level.id, level] as const))(
    '%s — tham số mục tiêu hợp lệ theo `CICD_PREDICATE_ARGS`',
    (_id, level: CicdLevel) => {
      // Cổng đi kèm chiều `false` của bộ chấm chính tắc. Thiếu ô này thì một mục
      // tiêu gõ nhầm `stages` thay vì `stage` chỉ lặng lẽ trả `false` — đọc ra
      // thành "lời giải sai", và người sửa sẽ đi sửa level thay vì sửa mục tiêu.
      const loi = level.objectives
        .map((objective) => validateObjectiveArgs(objective))
        .filter((message) => message !== null);
      expect(loi).toEqual([]);
    },
  );
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

    const banDau = scoringContext(c11, c11.initialWorkflow);
    const loiGiai = scoringContext(c11, c11.solutionWorkflow);
    const loiGiaiHai = scoringContext(c11, c11.altSolutionWorkflow);

    // Hỏi bộ chấm chính tắc, không tự đếm: con số ở đây phải là đúng con số
    // người chơi nhận được, chứ không phải một cách đọc thứ hai của cùng câu.
    expect(checkObjective(KHONG_LOT_KHIEM_KHUYET, banDau)).toBe(false);
    expect(checkObjective(KHONG_LOT_KHIEM_KHUYET, loiGiai)).toBe(true);
    expect(checkObjective(KHONG_LOT_KHIEM_KHUYET, loiGiaiHai)).toBe(true);

    const xanh = (ctx: CicdScoringContext): number =>
      summarizeEvaluation(ctx.record, ctx.workflow)?.axes.greenRate ?? 0;

    // Cái giá phải trả, viết thành một phép so sánh: sửa xong thì con số ĐẸP đi
    // xuống. Ô này đỏ nếu ai đó "cân bằng lại" level cho tử tế hơn và vô tình
    // xoá mất chính cái đánh đổi mà level tồn tại để dạy.
    expect(xanh(banDau)).toBeGreaterThan(xanh(loiGiai));
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

    const dem = (workflow: WorkflowSpec): number => countCacheHits(runLevel(c08, workflow));

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
