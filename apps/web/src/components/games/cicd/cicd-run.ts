import {
  checkJobShapes,
  evaluate,
  failingObjectiveIds,
  hydrateWorkflow,
  readWorkflowYaml,
  scoreAxes,
  summarizeEvaluation,
  type CicdHydrateSources,
  type CicdLevel,
  type CicdObjective,
  type CicdPlayerOverrides,
  type EvaluationError,
  type EvaluationRecord,
  type EvaluationSpec,
  type JobShapeProblem,
  type EvaluationSummary,
  type ScoreAxes,
  type WorkflowSpec,
  type WorkloadSpec,
  type YamlDiagnostic,
} from '@devops-platform/games';

/**
 * Một lượt chấm: YAML người chơi ⇒ ba trục điểm + danh sách mục tiêu còn trượt.
 *
 * ## Vì sao là một module riêng, không nằm trong màn chơi
 *
 * Màn level và màn sandbox chạy ĐÚNG chuỗi năm bước này, chỉ khác nguồn
 * `baseline`/`catalogue`. Chép nó hai lần là mời một lần sửa chỉ chạm một bản —
 * và bước dễ rơi nhất (`hydrateWorkflow`) hỏng CÂM: bỏ nó đi thì mọi thứ vẫn
 * chạy, vẫn ra ba con số, chỉ là `leadTimeSeconds` và `runnerMinutes` bằng 0
 * trên MỌI level. Không lỗi, không cảnh báo, không ô nào đỏ.
 *
 * ## Vì sao bốn nhánh chứ không một
 *
 * `scoreAxes` và `summarizeEvaluation` trả `null` khi `record.error !== null`
 * (đồ thị hỏng thì không có lượt nào chạy để mà chiếu ra ba trục). Nếu kiểu trả
 * về gộp chung, tầng giao diện buộc phải `?? 0` — và ba số 0 trông y hệt "một
 * workflow cực nhanh chẳng tốn gì", tức là NÓI DỐI đúng vào lúc người chơi cần
 * biết mình vừa tạo một chu trình phụ thuộc. Tách nhánh ở đây làm việc đó thành
 * lỗi biên dịch thay vì một lựa chọn hiển thị.
 */

/** Nguồn ghép, tính SAU khi đọc xong YAML (sandbox lấy chính workflow vừa đọc). */
export type CicdHydrateSourcesFor = (parsed: WorkflowSpec) => CicdHydrateSources;

/**
 * `readonly EditablePart[]`, lấy GIÁN TIẾP qua `CicdLevel`.
 *
 * `packages/games` xuất `CicdLevel` nhưng KHÔNG xuất `EditablePart` lẫn
 * `EDITABLE_PARTS` (kiểm 2026-09-16 trên `packages/games/src/index.ts`). Chép
 * lại bảy chuỗi literal ở đây sẽ tạo một bản thứ hai của một tập đóng — và bản
 * đó sẽ trôi khỏi bản gốc trong im lặng, vì không gì đối chiếu hai bên.
 * Suy từ chính kiểu của level thì không thể lệch.
 */
export type CicdEditableParts = CicdLevel['editable'];

export interface CicdRunInput {
  readonly yaml: string;
  readonly sourcesFor: CicdHydrateSourcesFor;
  /**
   * Workflow level ĐÃ KHAI — khuôn job (`job-shapes.ts`). Màn chơi: ban đầu + hai
   * lời giải. Bàn thử: chính workflow vừa đọc (không có level nào để đối chiếu).
   */
  readonly knownFor: (parsed: WorkflowSpec) => readonly WorkflowSpec[];
  readonly editable: CicdEditableParts;
  readonly overrides: CicdPlayerOverrides;
  readonly workload: WorkloadSpec;
  readonly evaluation: EvaluationSpec;
  readonly objectives: readonly CicdObjective[];
}

export type CicdRunOutcome =
  /** YAML không quét được. `errors` đã sắp theo (dòng, cột) và có ≥ 1 phần tử. */
  | { readonly kind: 'parse-error'; readonly errors: readonly YamlDiagnostic[] }
  /**
   * Quét được, ghép xong, và KHÔNG CÓ JOB NÀO.
   *
   * Nhánh riêng chứ không để engine chạy: engine chạy một đồ thị rỗng rất vui vẻ
   * và trả `0 giây / 0 runner-phút` — đọc ra thành "cực nhanh, chẳng tốn gì",
   * đúng hình dạng nói dối mà nhánh `engine-error` đã cấm. Đo được 2026-09-16 ở
   * c01 (bắt đầu từ số không), bấm "Chạy thử" ngay khi chưa gõ gì.
   */
  | { readonly kind: 'empty' }
  /**
   * Quét được, nhưng job/bước không khớp cấu hình nào level đã khai — KHÔNG chấm.
   * Đổi tên hay xoá bước làm thời lượng về 0 hoặc bỏ việc kiểm thử; chấm những
   * bản đó là thưởng cho việc lách (review PR #141, đo được 9–10/13 level).
   */
  | { readonly kind: 'shape-error'; readonly problems: readonly JobShapeProblem[] }
  /**
   * Quét được nhưng KHÔNG chạy được: chu trình, phụ thuộc trỏ vào hư không, hoặc
   * một job đòi hạng máy mà workload không cấp. `error` có thể `null` trong một
   * trường hợp duy nhất — engine trả về 0 lượt — và câu chữ ở tầng vẽ nói ra
   * đúng điều đó thay vì bịa một nguyên nhân.
   */
  | {
      readonly kind: 'engine-error';
      readonly error: EvaluationError | null;
      readonly workflow: WorkflowSpec;
    }
  | {
      readonly kind: 'scored';
      readonly workflow: WorkflowSpec;
      readonly record: EvaluationRecord;
      readonly axes: ScoreAxes;
      readonly summary: EvaluationSummary;
      /** Mục tiêu BẮT BUỘC còn trượt. Rỗng ⇒ thắng. */
      readonly failingRequired: readonly string[];
      /** Mục tiêu THƯỞNG còn trượt. Không chặn thắng. */
      readonly failingOptional: readonly string[];
      readonly won: boolean;
    };

export function runWorkflow(input: CicdRunInput): CicdRunOutcome {
  const read = readWorkflowYaml(input.yaml);
  if (!read.ok) {
    return { kind: 'parse-error', errors: read.errors };
  }

  /*
   * ⛔ BƯỚC KHÔNG ĐƯỢC BỎ. YAML của GitHub Actions không chở nổi chín trường của
   * hợp đồng (`durationTicks`, `flake`, `cache`, `runnerSlots`, …), nên bộ đọc
   * áp mặc định trung tính cho tất cả. `hydrateWorkflow` là chỗ những trường đó
   * quay về từ dữ liệu level — và là lý do ba trục ra số thật chứ không ra 0.
   */
  const sources = input.sourcesFor(read.workflow);
  const problems = checkJobShapes(read.workflow, input.knownFor(read.workflow), sources.baseline, input.editable);
  if (problems.length > 0) {
    return { kind: 'shape-error', problems };
  }

  const workflow = hydrateWorkflow(read.workflow, sources, input.editable, input.overrides);

  if (workflow.stages.length === 0) {
    return { kind: 'empty' };
  }

  const record = evaluate(workflow, input.workload, input.evaluation);
  const axes = scoreAxes(record, workflow);
  const summary = summarizeEvaluation(record, workflow);

  if (axes === null || summary === null) {
    return { kind: 'engine-error', error: record.error, workflow };
  }

  const failingRequired = failingObjectiveIds(input.objectives, { workflow, record }, true);
  const failingOptional = failingObjectiveIds(input.objectives, { workflow, record }, false);

  return {
    kind: 'scored',
    workflow,
    record,
    axes,
    summary,
    failingRequired,
    failingOptional,
    won: failingRequired.length === 0,
  };
}

/** Số giây ⇒ `4m 30s`. Giây là đơn vị engine trả; phút là thứ người đọc nghĩ. */
export function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) {
    return `${total}s`;
  }
  const phut = Math.floor(total / 60);
  const du = total % 60;
  return du === 0 ? `${phut}m` : `${phut}m ${du}s`;
}

/** Một chữ số thập phân, đủ để thấy thay đổi mà không giả vờ chính xác hơn thực tế. */
export function formatNumber(value: number): string {
  return value.toFixed(1);
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/**
 * Câu tiếng Việt cho một lỗi khuôn job.
 *
 * ⚠ KHÔNG liệt kê các tập job hay dãy bước được chấp nhận: chúng là cấu trúc của
 * LỜI GIẢI, và in ra là in đáp án. Nói ra job nào lệch và job nào màn này biết là
 * đủ để sửa.
 */
export function describeJobShapeProblem(problem: JobShapeProblem): string {
  if (problem.kind === 'unknown-job') {
    return `Màn này không có job "${problem.job}". Các job màn này biết: ${problem.knownJobs.join(', ')}.`;
  }
  if (problem.kind === 'unknown-steps') {
    return `Các bước của job "${problem.job}" (${problem.steps.join(', ') || 'không có bước nào'}) không khớp cách chia nào màn này chấm được. Giữ đúng id và thứ tự bước của job, đổi tên hay bỏ bước là không chấm.`;
  }
  return `Tập job (${problem.jobs.join(', ') || 'rỗng'}) không khớp phương án nào màn này chấm được — đang thiếu hoặc thừa job. Bỏ hẳn một job kiểm thử cũng không được tính.`;
}

/** Câu tiếng Việt cho từng dạng lỗi đồ thị. Nói ra TÊN job, không chỉ tên lỗi. */
export function describeEngineError(error: EvaluationError | null): string {
  if (error === null) {
    return 'Engine không dựng được lượt mô phỏng nào từ workflow này. Kiểm tra lại xem có job nào không, và workload có cấp hạng máy chạy tương ứng không.';
  }
  if (error.kind === 'cycle') {
    return `Phụ thuộc vòng tròn: ${error.stages.join(' → ')} → ${error.stages[0] ?? '?'}. Không job nào trong vòng này chạy được, vì mỗi job đang đợi một job khác trong chính vòng đó.`;
  }
  if (error.kind === 'unknown-dependency') {
    return `Job "${error.stage}" khai "needs: ${error.missing}" nhưng không có job nào tên "${error.missing}". Kiểm tra lại chính tả, và nhớ rằng tên job phân biệt chữ hoa chữ thường.`;
  }
  return `Job "${error.stage}" đòi hạng máy chạy "${error.runnerClass}", nhưng kho máy của màn này không có hạng đó. Xem lại giá trị "runs-on".`;
}
