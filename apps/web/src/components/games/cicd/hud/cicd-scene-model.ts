/**
 * Từ kết quả một lượt chấm ⇒ cảnh để vẽ (19.D.4.1).
 *
 * Hàm THUẦN, tách khỏi `cicd-level-screen.tsx` để test được mà không dựng DOM —
 * và vì phần dễ sai nhất ở đây không phải JSX mà là **chọn đúng lượt chạy nào để
 * vẽ**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MỘT LƯỢT CHẠY, VÀ CẢ MÀN PHẢI ĐỌC CÙNG MỘT LƯỢT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `EvaluationRecord` chở NHIỀU lượt mô phỏng (`passes`), mỗi lượt nhiều commit
 * (`runs`). Cảnh chỉ vẽ được một. `firstRun()` là nơi DUY NHẤT chọn, và cả cảnh
 * lẫn bảng thông số (D.4.5) đều gọi nó: hai chỗ tự chọn riêng sẽ cho một bảng
 * thông số mô tả một lượt chạy KHÁC với lượt đang hiện trên sân — không lỗi,
 * không cảnh báo, chỉ là hai câu trả lời khác nhau cho "job này chạy bao lâu".
 *
 * Chọn lượt đầu của lượt mô phỏng đầu: `flake` được rút theo hạt giống dẫn xuất
 * nên mỗi lượt mô phỏng ra một kết quả khác nhau, và "lượt đầu tiên" là lượt duy
 * nhất người chơi có thể trỏ tay vào mà không cần một bộ chọn lượt (19.D.2.6 mới
 * mở phần tua lại).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI TỰ DÒ CHU TRÌNH TRƯỚC KHI ĐẶT CHỖ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `placeWorkflow` gọi `layoutDag`, và cái tên đã nói hết: nó nhận một đồ thị
 * KHÔNG CHU TRÌNH. Một `needs:` vòng tròn là thứ người chơi gõ ra được trong hai
 * giây, và engine chấm thì đã có nhánh `engine-error` cho nó — nhưng đường vẽ
 * chạy TRƯỚC khi bấm "Chạy thử", trên YAML đang soạn dở. Đưa một vòng tròn vào
 * tầng đặt chỗ là đánh cược cả tab trình duyệt vào việc nó có thoát được vòng
 * lặp hay không.
 *
 * Nên: dò trước, và khi có vòng thì trả một CÂU nói ra điều đó. ⛔ Không vẽ một
 * sân trống im lặng — sân trống đọc ra thành "workflow của tôi chẳng có gì" và
 * người chơi sẽ đi sửa nhầm chỗ (`development-principles.md` § "Errors Over
 * Silent Fallbacks": fallback duy nhất được phép là fallback nói ra).
 */

import {
  buildGraphView,
  placeWorkflow,
  type CicdGraphView,
  type CicdPlacement,
  type RunRecord,
  type StageId,
  type WorkflowSpec,
} from '@devops-platform/games';

import type { CicdRunOutcome } from '../cicd-run';

export type CicdSceneModel =
  | { readonly ok: true; readonly view: CicdGraphView; readonly placement: CicdPlacement }
  | { readonly ok: false; readonly note: string };

/**
 * Lượt chạy đem ra vẽ, hoặc `null` khi chưa có lượt nào chấm được.
 *
 * `null` KHÔNG phải lỗi: nó là trạng thái "người chơi vừa mở màn" — mọi node vẽ
 * ở `pending`, cạnh phụ thuộc vẽ đủ.
 */
export function firstRun(outcome: CicdRunOutcome | null): RunRecord | null {
  if (outcome === null || outcome.kind !== 'scored') return null;
  return outcome.record.passes[0]?.runs[0] ?? null;
}

/**
 * Workflow đem ra vẽ.
 *
 * Ưu tiên bản ĐÃ GHÉP của lượt chấm (`outcome.workflow`) chứ không bản vừa quét
 * từ YAML: YAML của GitHub Actions không chở nổi `durationTicks`/`cache`/
 * `runnerSlots`, nên bản chưa ghép vẽ ra một đồ thị đúng hình mà mọi thời lượng
 * bằng mặc định trung tính. Chưa chạy lượt nào thì bản vừa quét là thứ duy nhất
 * có, và ở đó mọi node đằng nào cũng `pending`.
 */
export function sceneWorkflow(
  outcome: CicdRunOutcome | null,
  parsed: WorkflowSpec,
): WorkflowSpec {
  if (outcome === null) return parsed;
  if (outcome.kind === 'scored' || outcome.kind === 'engine-error' || outcome.kind === 'cd-error') {
    return outcome.workflow;
  }
  return parsed;
}

/**
 * Có `needs:` vòng tròn không.
 *
 * DFS ba màu trên chính `dependsOn`. Cạnh trỏ tới một stage không tồn tại KHÔNG
 * tính là chu trình — đó là `unknown-dependency`, một lỗi khác, và tầng vẽ bỏ
 * qua cạnh đó vì `cicdSceneEdges` chỉ giữ cạnh có đủ hai đầu.
 */
export function hasDependencyCycle(workflow: WorkflowSpec): boolean {
  const deps = new Map<StageId, readonly StageId[]>();
  for (const stage of workflow.stages) deps.set(stage.id, stage.dependsOn);

  const state = new Map<StageId, 'open' | 'done'>();

  const walk = (id: StageId): boolean => {
    const mark = state.get(id);
    if (mark === 'open') return true;
    if (mark === 'done') return false;
    state.set(id, 'open');
    for (const next of deps.get(id) ?? []) {
      if (!deps.has(next)) continue;
      if (walk(next)) return true;
    }
    state.set(id, 'done');
    return false;
  };

  for (const stage of workflow.stages) {
    if (walk(stage.id)) return true;
  }
  return false;
}

export interface BuildSceneInput {
  readonly workflow: WorkflowSpec;
  readonly run: RunRecord | null;
  readonly yAxis: CicdGraphView['yAxis'];
}

export function buildCicdScene(input: BuildSceneInput): CicdSceneModel {
  if (input.workflow.stages.length === 0) {
    return {
      ok: false,
      note: 'Chưa có job nào trong workflow. Thêm một job vào ô soạn để thấy đồ thị hiện ra ở đây.',
    };
  }

  if (hasDependencyCycle(input.workflow)) {
    return {
      ok: false,
      note: 'Phụ thuộc vòng tròn: có một nhóm job đang đợi lẫn nhau, nên không job nào chạy được và đồ thị không xếp được thứ tự. Gỡ một "needs" trong vòng đó là đồ thị hiện lại.',
    };
  }

  /*
   * `try/catch` là lưới cuối, KHÔNG phải đường xử lý chính — chu trình đã bị
   * chặn ở trên. Nó ở đây vì tầng đặt chỗ còn ném được vì những lý do chưa lường
   * (dữ liệu level hỏng, một hình dạng quạt chưa gặp), và một ngoại lệ lúc dựng
   * cây React sẽ trắng cả màn chơi. Câu trả về nói rõ là chưa dựng được, không
   * giả vờ sân trống.
   */
  try {
    const view = buildGraphView({ workflow: input.workflow, run: input.run, yAxis: input.yAxis });
    return { ok: true, view, placement: placeWorkflow(view) };
  } catch {
    return {
      ok: false,
      note: 'Chưa dựng được đồ thị từ workflow này. Bấm “Chạy thử” để xem engine báo lỗi cụ thể.',
    };
  }
}
