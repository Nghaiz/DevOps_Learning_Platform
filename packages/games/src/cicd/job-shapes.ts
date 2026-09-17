/**
 * Khuôn job: mỗi job người chơi viết phải khớp MỘT cấu hình level đã khai.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO — lỗ hổng chấm điểm đo được 2026-09-17 (review PR #141)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * YAML chở danh sách bước, nhưng "bước" KHÔNG phải một `EditablePart`: thời
 * lượng, đỏ giả, cache, sản phẩm của bước là dữ liệu level, tra theo id bước
 * trong hộp linh kiện. Hai đường lách, cả hai qua mọi ô test cũ:
 *
 * - ĐỔI TÊN bước ⇒ không tra ra được ⇒ `durationTicks: 0`, mất `flake` / `cache`
 *   / `requires`. Thắng 9/13 level có workflow khởi đầu, và bài OJ đổi WA thành AC.
 * - XOÁ bước không tạo sản phẩm (tức bước kiểm thử) ⇒ nhanh hơn, không đỏ gì.
 *   Thắng 10/13 level — kể cả level không cho sửa `stages`.
 *
 * Khoá theo id từng bước không đủ: lời giải THẬT di chuyển, tách và gộp bước
 * (c03, c04, c07, c09, c11, c12). Nên luật chốt (chủ dự án, 2026-09-17) là theo
 * CẢ JOB: `(id job, dãy id bước)` phải trùng đúng một cấu hình mà level đã khai
 * ở một workflow đã biết (khởi đầu / lời giải / lời giải thay thế). Lệch ⇒ báo
 * lỗi, KHÔNG chấm. 28 lời giải đạt theo cấu tạo.
 *
 * Đánh đổi đã chấp nhận: một cách tách job sáng tạo ngoài các cấu hình đã khai bị
 * từ chối; bài OJ chỉ có một workflow nên người làm sửa được đồ thị / blocking /
 * retries nhưng không đổi được cấu trúc bước. Bàn thử truyền chính workflow đang
 * soạn làm workflow đã biết, nên ở đó mọi thứ đều khớp.
 *
 * Dãy chứ không tập: thứ tự bước quyết định bước nào bị bỏ qua sau một bước chặn
 * đỏ, tức quyết định runner-phút. Đổi thứ tự là đổi bài.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÀ TẬP JOB — đường lách thứ ba, đo ngay sau khi chặn hai đường trên
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Level cho sửa `stages` thì người chơi được bỏ job. Bỏ nguyên job kiểm thử (mọi
 * bước của nó khớp khuôn, vì nó không còn bước nào) thắng 7/9 level như vậy (c03
 * c04 c07 c09 c11 c12 c14). Khoá theo id job cũng không được: lời giải thật THAY
 * job (c04 alt tách `kiem-tra` thành hai, c12 alt quạt `kiem-thu` thành ba). Nên
 * (chủ dự án, 2026-09-17) tập id job cũng phải trùng tập job của MỘT workflow đã
 * biết. Phần tự do còn lại đúng là phần `editable` cho: cạnh, blocking, retries,
 * cache, fan-out, máy chạy.
 */

import type { EditablePart, StageId, StepId, WorkflowSpec } from './contract.ts';

export type JobShapeProblem =
  /** Job không có mặt ở workflow đã biết nào. `knownJobs` đã sắp theo mã đơn vị. */
  | { readonly kind: 'unknown-job'; readonly job: StageId; readonly knownJobs: readonly StageId[] }
  /** Job có thật, nhưng dãy bước không trùng cấu hình nào. `allowed` theo thứ tự workflow đã biết. */
  | {
      readonly kind: 'unknown-steps';
      readonly job: StageId;
      readonly steps: readonly StepId[];
      readonly allowed: readonly (readonly StepId[])[];
    }
  /**
   * Từng job đều có thật, nhưng TẬP job không trùng tập nào đã khai — thiếu job
   * (bỏ bớt) hoặc ghép lẫn hai phương án. `jobs` và mỗi tập trong `allowed` đã sắp.
   */
  | {
      readonly kind: 'unknown-job-set';
      readonly jobs: readonly StageId[];
      readonly allowed: readonly (readonly StageId[])[];
    };

/**
 * Rỗng ⇒ mọi job khớp.
 *
 * `baseline` + `editable` quyết định job NÀO được kiểm, đúng như tầng ghép
 * quyết định job nào được chấm: không cho sửa `stages` thì job lạ trong YAML bị
 * `hydrateWorkflow` bỏ đi (chấm trượt, không phải lỗi), nên ở đây cũng bỏ qua.
 */
export function checkJobShapes(
  edited: WorkflowSpec,
  known: readonly WorkflowSpec[],
  baseline: WorkflowSpec,
  editable: readonly EditablePart[],
): readonly JobShapeProblem[] {
  const allowedByJob = new Map<StageId, (readonly StepId[])[]>();
  for (const workflow of known) {
    for (const stage of workflow.stages) {
      const steps = stage.steps.map((step) => step.id);
      const list = allowedByJob.get(stage.id) ?? [];
      if (!list.some((seen) => sameSequence(seen, steps))) {
        list.push(steps);
      }
      allowedByJob.set(stage.id, list);
    }
  }
  const knownJobs = [...allowedByJob.keys()].sort(compareCodeUnits);
  const baselineIds = new Set(baseline.stages.map((stage) => stage.id));

  const problems: JobShapeProblem[] = [];
  for (const stage of edited.stages) {
    if (!editable.includes('stages') && !baselineIds.has(stage.id)) {
      continue;
    }
    const allowed = allowedByJob.get(stage.id);
    if (allowed === undefined) {
      problems.push({ kind: 'unknown-job', job: stage.id, knownJobs });
      continue;
    }
    const steps = stage.steps.map((step) => step.id);
    if (!allowed.some((candidate) => sameSequence(candidate, steps))) {
      problems.push({ kind: 'unknown-steps', job: stage.id, steps, allowed });
    }
  }

  /*
   * Kiểm tập job CHỈ khi được sửa `stages` (không thì tầng ghép đã khoá tập job về
   * bản chuẩn) và CHỈ khi không job nào lạ — một job lạ đã tự làm tập lệch, báo
   * thêm một lỗi tập là nói lại cùng một chuyện bằng câu khó đọc hơn.
   */
  if (editable.includes('stages') && !problems.some((p) => p.kind === 'unknown-job')) {
    const jobs = edited.stages.map((stage) => stage.id).sort(compareCodeUnits);
    const allowedSets: (readonly StageId[])[] = [];
    for (const workflow of known) {
      const set = workflow.stages.map((stage) => stage.id).sort(compareCodeUnits);
      if (!allowedSets.some((seen) => sameSequence(seen, set))) {
        allowedSets.push(set);
      }
    }
    if (!allowedSets.some((set) => sameSequence(set, jobs))) {
      problems.push({ kind: 'unknown-job-set', jobs, allowed: allowedSets });
    }
  }
  return problems;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sameSequence(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
