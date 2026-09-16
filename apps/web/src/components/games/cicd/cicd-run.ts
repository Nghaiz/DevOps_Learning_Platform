import {
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
 * `readonly EditablePart[]`, lay GIAN TIEP qua `CicdLevel`.
 *
 * `packages/games` xuat `CicdLevel` nhung KHONG xuat `EditablePart` lan
 * `EDITABLE_PARTS` (kiem 2026-09-16 tren `packages/games/src/index.ts`). Chep
 * lai bay chuoi literal o day se tao mot ban thu hai cua mot tap dong — va ban
 * do se trôi khoi ban goc trong im lang, vi khong gi doi chieu hai ben.
 * Suy tu chinh kieu cua level thi khong the lech.
 */
export type CicdEditableParts = CicdLevel['editable'];

export interface CicdRunInput {
  readonly yaml: string;
  readonly sourcesFor: CicdHydrateSourcesFor;
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
  const workflow = hydrateWorkflow(
    read.workflow,
    input.sourcesFor(read.workflow),
    input.editable,
    input.overrides,
  );

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
