/**
 * Dựng `WorkflowSpec` ví dụ cho `teaching.cheatsheet` mà không phải khai đủ mười
 * trường cho từng stage.
 *
 * Chỉ nhận đúng những phần YAML chở được — cạnh, hạng máy, không chặn, quạt ra.
 * Không có tham số cho thời lượng, cache, retries: một ví dụ mang chúng sẽ bị
 * `writeWorkflowYaml` bỏ đi (`dropped`), tức cheatsheet in ra một thứ khác thứ
 * level khai. `levels/cheatsheet.test.ts` đỏ nếu chuyện đó xảy ra.
 */

import type { FanOutSpec, RunnerClassId, StageId, StageKind, StageSpec, StepId, WorkflowSpec } from './contract.ts';

export type ExampleStep = StepId | { readonly id: StepId; readonly nonBlocking: true };

export interface ExampleJob {
  readonly id: StageId;
  /**
   * Vắng ⇒ `'build'`. YAML không chở loại stage, nhưng bộ đọc SUY nó từ id, nên
   * một job tên `clone` đọc lại thành `'clone'`; khai lệch là `writeWorkflowYaml`
   * báo `dropped` và ô gác đỏ.
   */
  readonly kind?: StageKind;
  readonly dependsOn?: readonly StageId[];
  readonly nonBlocking?: true;
  readonly fanOut?: FanOutSpec;
  readonly steps: readonly ExampleStep[];
}

/** Tên chung của mọi ví dụ. Có mặt vì bộ ghi luôn in tên đường ống. */
export const EXAMPLE_WORKFLOW_NAME = 'Ví dụ';

/**
 * `runner` là tham số BẮT BUỘC chứ không có mặc định: hạng máy là hằng của từng
 * level (`linux`, `chung`, ...), và một ví dụ in ra hạng máy mà level không có
 * dạy người chơi chép một job không bao giờ xếp lịch được.
 */
export function cheatsheetExample(runner: RunnerClassId, jobs: readonly ExampleJob[]): WorkflowSpec {
  return {
    name: EXAMPLE_WORKFLOW_NAME,
    stages: jobs.map(
      (job): StageSpec => ({
        id: job.id,
        kind: job.kind ?? 'build',
        name: job.id,
        dependsOn: job.dependsOn ?? [],
        blocking: job.nonBlocking !== true,
        retries: 0,
        runnerClass: runner,
        ...(job.fanOut === undefined ? {} : { fanOut: job.fanOut }),
        steps: job.steps.map((step) =>
          typeof step === 'string'
            ? { id: step, name: step, durationTicks: 0, blocking: true }
            : { id: step.id, name: step.id, durationTicks: 0, blocking: false },
        ),
      }),
    ),
  };
}
