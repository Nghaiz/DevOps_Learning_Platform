/**
 * Danh tính artifact và "môi trường nào đang chạy bản nào" — 19.B.1–B.2.
 *
 * Hai PHÉP CHIẾU đọc `RunRecord` + `WorkflowSpec`. Không trường nào ở đây được
 * lưu: engine chỉ GHI kẻ cấp (`StageInstanceRecord.suppliers`), vì đó là quyết
 * định lúc xếp lịch; danh tính và bản phát hành suy ra từ quyết định đó.
 *
 * ## Danh tính — quyết định 3 của `cd-contract.ts`
 *
 * `băm(commit, sản phẩm, thực thể đã dựng)`. Dựng lại cùng một commit ở một stage
 * khác ⇒ danh tính khác, LUÔN LUÔN. Đúng với image thật (dấu thời gian, phụ
 * thuộc trôi), và là điều làm bài C16 dạy được: thứ đã thử ở staging không phải
 * thứ lên prod.
 *
 * ⚠ Băm, không nối chuỗi: một danh tính đọc được ra `commit|san-pham|stage` mời
 * người chơi so hai CHUỖI bằng mắt và tự kết luận "gần giống nhau là được". Một
 * mã băm ngắn chỉ cho phép một câu hỏi — giống hệt, hay không.
 */

import type {
  CommitId,
  EnvironmentId,
  InstanceKey,
  OutputId,
  RunRecord,
  StageId,
  WorkflowSpec,
} from './contract.ts';
import { hashDrawKey } from './rng-keys.ts';

export type ArtifactId = string;

/** Tám chữ số hex của FNV-1a — cùng hàm băm engine đã dùng cho khoá rút ngẫu nhiên. */
export function artifactIdOf(commitId: CommitId, output: OutputId, builtBy: InstanceKey): ArtifactId {
  return `art-${hashDrawKey(`artifact|${commitId}|${output}|${builtBy}`).toString(16).padStart(8, '0')}`;
}

export interface DeploymentView {
  readonly environment: EnvironmentId;
  readonly stageId: StageId;
  readonly instance: InstanceKey;
  readonly finishedTick: number;
  /** Sắp theo `output`. Sản phẩm stage phát hành đòi mà không ai cấp thì vắng ở đây. */
  readonly artifacts: readonly { readonly output: OutputId; readonly artifact: ArtifactId }[];
}

/**
 * Những lần phát hành THÀNH CÔNG trong một commit: thực thể của stage có
 * `environment`, lần thử cuối xanh. Sắp theo (`finishedTick`, `instance`).
 *
 * Stage phát hành đỏ không có mặt — một lần phát hành hỏng không đổi thứ môi
 * trường đang chạy.
 */
export function deploymentsOf(run: RunRecord, workflow: WorkflowSpec): readonly DeploymentView[] {
  const moiTruong: Record<StageId, EnvironmentId> = {};
  for (const stage of workflow.stages) {
    if (stage.environment !== undefined) {
      moiTruong[stage.id] = stage.environment;
    }
  }
  return run.instances
    .filter((instance) => {
      const cuoi = instance.attempts.at(-1);
      return moiTruong[instance.stageId] !== undefined && cuoi !== undefined && cuoi.outcome === 'passed';
    })
    .map((instance) => ({
      environment: moiTruong[instance.stageId] ?? '',
      stageId: instance.stageId,
      instance: instance.instance,
      finishedTick: instance.finishedTick,
      artifacts: instance.suppliers.map((s) => ({
        output: s.output,
        artifact: artifactIdOf(run.commitId, s.output, s.instance),
      })),
    }))
    .sort((a, b) =>
      a.finishedTick !== b.finishedTick ? a.finishedTick - b.finishedTick : a.instance < b.instance ? -1 : a.instance > b.instance ? 1 : 0,
    );
}
