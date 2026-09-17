/**
 * Bộ dựng view — ranh giới engine ↔ renderer (19.D.1, bổ sung ngoài kế hoạch).
 *
 * ## Vì sao file này tồn tại, dù kế hoạch không có mục nào cho nó
 *
 * `contract.ts` §7 khai `CicdView`, `StageNodeView`, `DagEdgeView` và viết rõ:
 * *"Engine KHÔNG biết gì về toạ độ. `core/layout/` tính vị trí TỪ VIEW NÀY. Hai
 * renderer nhận cùng `CicdView` và phải ra cùng TẬP node và cạnh."*
 *
 * Đo 2026-09-17: `grep -rn "CicdView"` trên `packages/games/src` + `apps/web/src`
 * trả về đúng **một** dòng khai báo và **không producer nào**. Hợp đồng đã được
 * thiết kế rồi bỏ đó, và `phase-19-d-exec.md` §3 không có mục nào dựng nó — nên
 * việc này nằm vô hình giữa engine và cả hai renderer.
 *
 * Kế hoạch §2.1 đề nghị `placeWorkflow(workflow, record, chapter)` đọc THẲNG
 * `WorkflowSpec` + `RunRecord`. Đi đường đó thì tầng đặt chỗ phải tự suy lại
 * `state`, `kind`, `statusToken`, `ariaLabel` — đúng những thứ `StageNodeView`
 * đã định nghĩa — và thành nguồn sự thật thứ hai cho chúng. Chủ dự án chốt
 * 2026-09-17: đi qua view.
 *
 * ## Khoá theo `InstanceKey`, KHÔNG theo `StageId`
 *
 * Kế hoạch §2.1 khoá node theo `stageId`. Đó là một lỗi đo được: C12 và C13 có
 * `fanOut`, nên `test#node20/ubuntu`, `test#node22/ubuntu`, `test#node24/ubuntu`
 * sẽ gộp thành MỘT node — mất hai node, im lặng, đúng ở hai level dạy ma trận.
 * Và ô AC-D1 viết là *"số node vẽ ra bằng số stage"*, tức nó XANH ngay trên
 * chính con bug đó. Engine khoá thực thể bằng `InstanceKey` (`contract.ts` §1)
 * và view khoá theo đúng thứ ấy.
 *
 * ## Vì sao là `CicdGraphView` chứ chưa phải `CicdView` đầy đủ
 *
 * `CicdView` còn hai trường nữa: `runners` (`RunnerLaneView`) và `events`
 * (`CicdEventView`). **Không trường nào dựng được từ đầu ra hiện tại của
 * engine**: `evaluate()`/`simulatePass()` trả bản ghi, không trả ảnh chụp số máy
 * bận theo từng tick, và không có nhật ký sự kiện nào ở đâu cả.
 *
 * Nên file này dựng đúng phần dựng được, và `CicdGraphView` lấy bằng `Pick<>` từ
 * `CicdView` để hai thứ KHÔNG THỂ trôi khỏi nhau. Trả về `runners: []` và
 * `events: []` cho đủ hình dạng là một lời nói dối im lặng: tầng HUD sẽ vẽ "0
 * máy bận" và không gì đỏ. Hai trường đó cần engine mở thêm — việc của 19.D.4,
 * và nó chưa được tính vào ước lượng nào.
 */

import type {
  AttemptRecord,
  CicdView,
  DagEdgeView,
  EnvironmentId,
  InstanceKey,
  RunRecord,
  StageId,
  StageInstanceRecord,
  StageNodeView,
  StageRunState,
  StageSpec,
  WorkflowSpec,
} from './contract.ts';
import { criticalPath } from './critical-path.ts';
import { expandStage } from './engine.ts';
import { idDict, ownValue } from './id-dict.ts';
import { encodingOf } from './scene-encoding.ts';
import { compareKeys } from '../git/deterministic.ts';

/**
 * Phần đồ thị của `CicdView` — đủ cho tầng đặt chỗ và cho CẢ HAI renderer.
 *
 * Lấy bằng `Pick<CicdView, …>` chứ không khai lại: đổi `StageNodeView` một
 * trường là kiểu ở đây đổi theo, nên không có cách nào để hai bên lệch nhau.
 */
export type CicdGraphView = Pick<CicdView, 'nodes' | 'edges' | 'yAxis'>;

export interface GraphViewInput {
  readonly workflow: WorkflowSpec;
  /**
   * Lượt chạy của MỘT commit. `null` = chưa chạy lần nào (người chơi vừa mở
   * level): mọi node ở `pending`, cạnh phụ thuộc vẽ đủ, không cạnh máy nào.
   */
  readonly run: RunRecord | null;
  /** `'ci'` = trục Y là thời gian chờ; `'cd'` = trục Y là môi trường. */
  readonly yAxis: CicdView['yAxis'];
  /**
   * Tick đang xem. Mặc định `run.finishedTick`, tức trạng thái CUỐI.
   *
   * Có mặt để tua lại được về sau (19.D.2.6) mà không phải đổi chữ ký. Với
   * `run === null` thì tham số này không có nghĩa và bị bỏ qua.
   */
  readonly atTick?: number;
}

/** Thực thể + spec của stage nó thuộc về, đã ghép sẵn. */
interface Joined {
  readonly instance: InstanceKey;
  readonly stageId: StageId;
  readonly stage: StageSpec;
  /** `null` khi chưa có lượt chạy nào. */
  readonly record: StageInstanceRecord | null;
}

/**
 * Lần thử đang chạy tại `tick`, hoặc `null` nếu không có lần nào đang chạy.
 *
 * Nửa mở `[startedTick, finishedTick)` là có chủ ý: tại đúng `finishedTick` lần
 * thử đó đã XONG, và nếu còn lần thử sau thì lần sau mới là lần đang sống. Lấy
 * nửa đóng ở đây sẽ làm hai lần thử liên tiếp cùng "đang chạy" tại một tick.
 */
function liveAttempt(attempts: readonly AttemptRecord[], tick: number): AttemptRecord | null {
  for (const a of attempts) {
    if (tick >= a.startedTick && tick < a.finishedTick) return a;
  }
  return null;
}

/**
 * Trạng thái của một thực thể tại `tick`.
 *
 * ⚠ `attempts` RỖNG nghĩa là thực thể được ghi nhưng không chạy lần nào — một
 * phụ thuộc `blocking` của nó đã đỏ. Đó là `skipped`, không phải `pending`: hai
 * cái nhìn giống nhau ở chỗ "chưa có kết quả" nhưng khác nhau ở chỗ `pending`
 * CÒN có thể chạy, còn `skipped` thì hết. Người chơi cần phân biệt để biết nên
 * đi sửa chỗ nào.
 */
function stateAt(record: StageInstanceRecord, tick: number): StageRunState {
  const last = record.attempts.at(-1);
  if (last === undefined) return 'skipped';

  if (tick < record.readyTick) return 'pending';
  if (tick < record.startedTick) return 'queued';

  const live = liveAttempt(record.attempts, tick);
  if (live !== null) return live.attempt > 0 ? 'retrying' : 'running';

  // Sau lần thử cuối: kết quả thật. Trước lần thử đầu đã bị hai nhánh trên bắt.
  const done = record.attempts.filter((a) => a.finishedTick <= tick).at(-1);
  if (done === undefined) return 'queued';
  return done.outcome;
}

/** Số hiệu lần thử đang/vừa diễn ra tại `tick`. Đếm từ 0. */
function attemptAt(record: StageInstanceRecord, tick: number): number {
  const live = liveAttempt(record.attempts, tick);
  if (live !== null) return live.attempt;
  const done = record.attempts.filter((a) => a.finishedTick <= tick).at(-1);
  return done?.attempt ?? 0;
}

/**
 * Cache của thực thể, gộp về một giá trị.
 *
 * `null` = không bước nào khai cache. Ngược lại **`true` chỉ khi MỌI bước có
 * khai cache đều trúng**.
 *
 * Chọn "mọi" chứ không "bất kỳ" vì đây là thứ hiện lên node: `true` phải đọc
 * được là "cache đã cứu stage này trọn vẹn". Lấy "bất kỳ" thì một stage trúng
 * 1/5 khoá vẫn hiện xanh cache, và người chơi sẽ không đi tìm bốn khoá còn lại.
 */
function cacheHitOf(record: StageInstanceRecord, tick: number): boolean | null {
  const live = liveAttempt(record.attempts, tick);
  const done = record.attempts.filter((a) => a.finishedTick <= tick).at(-1);
  const attempt = live ?? done;
  if (attempt === undefined) return null;

  const cached = attempt.steps.filter((s) => s.cacheHit !== null);
  if (cached.length === 0) return null;
  return cached.every((s) => s.cacheHit === true);
}

/**
 * Nhãn cho trình đọc màn hình. Tiếng Việt, một dòng, nói trạng thái bằng CHỮ.
 *
 * Phần trong ngoặc là giá trị các trục quạt ra, tách từ `InstanceKey` — dạng
 * `stageId#v1/v2` là một phần của hợp đồng (`contract.ts` §1). Thiếu nó thì ba
 * thực thể của một ma trận đọc lên giống hệt nhau.
 */
function ariaLabelOf(stage: StageSpec, instance: InstanceKey, state: StageRunState, attempt: number): string {
  const enc = encodingOf(state);
  const axes = instance.startsWith(`${stage.id}#`) ? instance.slice(stage.id.length + 1) : null;
  const ten = axes === null ? stage.name : `${stage.name} (${axes})`;
  const lanThu = attempt > 0 ? `, lần thử ${String(attempt + 1)}` : '';
  return `${ten} — ${enc.label}${lanThu}`;
}

function nodeOf(joined: Joined, tick: number): StageNodeView {
  const { stage, record } = joined;
  const state: StageRunState = record === null ? 'pending' : stateAt(record, tick);
  const attempt = record === null ? 0 : attemptAt(record, tick);
  const enc = encodingOf(state);

  const started = record !== null && tick >= record.startedTick ? record.startedTick : null;
  const finished = record !== null && tick >= record.finishedTick ? record.finishedTick : null;
  const environment: EnvironmentId | null = stage.environment ?? null;

  return {
    instance: joined.instance,
    stageId: joined.stageId,
    kind: stage.kind,
    name: stage.name,
    state,
    attempt,
    readyTick: record?.readyTick ?? null,
    startedTick: started,
    finishedTick: finished,
    cacheHit: record === null ? null : cacheHitOf(record, tick),
    environment,
    statusToken: enc.statusToken,
    ariaLabel: ariaLabelOf(stage, joined.instance, state, attempt),
  };
}

/**
 * Dựng phần đồ thị của view.
 *
 * Tất định: cùng đầu vào ra cùng kết quả từng byte. Node sắp theo `InstanceKey`,
 * cạnh sắp theo `(from, to)`, tất cả bằng `compareKeys` (mã đơn vị) chứ KHÔNG
 * `localeCompare` — cùng quy tắc so sánh với hàng đợi của engine.
 */
export function buildGraphView(input: GraphViewInput): CicdGraphView {
  const { workflow, run, yAxis } = input;
  const tick = run === null ? 0 : (input.atTick ?? run.finishedTick);

  const stageById = idDict<StageSpec>();
  for (const stage of workflow.stages) stageById[stage.id] = stage;

  // ── Thực thể: từ bản ghi nếu có lượt chạy, ngược lại quạt ra từ spec ───────
  //
  // `expandStage` là SSOT của phép quạt (engine.ts §1) — thứ tự tổ hợp đi thẳng
  // vào `InstanceKey`, tức vào khoá rút ngẫu nhiên. Tự nhân tích Descartes ở đây
  // sẽ đúng về TẬP mà sai về THỨ TỰ.
  const joined: Joined[] = [];
  if (run === null) {
    for (const stage of workflow.stages) {
      for (const ex of expandStage(stage)) {
        joined.push({ instance: ex.instance, stageId: ex.stageId, stage, record: null });
      }
    }
  } else {
    for (const record of run.instances) {
      const stage = ownValue(stageById, record.stageId);
      // Bản ghi trỏ tới một stage không còn trong workflow: bỏ, không ném. Người
      // chơi có thể vừa xoá stage đó khỏi YAML trong khi màn hình còn giữ lượt
      // chạy cũ — ném ở đây là làm sập phiên chơi vì một thứ hoàn toàn bình thường.
      if (stage === undefined) continue;
      joined.push({ instance: record.instance, stageId: record.stageId, stage, record });
    }
  }

  const nodes = joined
    .map((j) => nodeOf(j, tick))
    .sort((a, b) => compareKeys(a.instance, b.instance));

  const present = new Set(nodes.map((n) => n.instance));

  // ── Cạnh phụ thuộc: TÍCH ĐỀ-CÁC giữa hai tập thực thể ─────────────────────
  //
  // Stage B `dependsOn: [A]` khi CẢ HAI quạt ra: mỗi thực thể của B chờ MỌI thực
  // thể của A xong — đúng ngữ nghĩa `needs` của ma trận ngoài đời. Ghép theo cặp
  // trục (B#node20 chỉ chờ A#node20) là một luật KHÁC và không phải luật của
  // engine này; `expandStage` cũng không ghép trục giữa hai stage.
  const byStage = idDict<InstanceKey[]>();
  for (const j of joined) {
    const list = ownValue(byStage, j.stageId);
    if (list === undefined) byStage[j.stageId] = [j.instance];
    else list.push(j.instance);
  }

  interface Draft {
    readonly from: InstanceKey;
    readonly to: InstanceKey;
    readonly resourceEdge: boolean;
  }
  const drafts: Draft[] = [];

  for (const stage of workflow.stages) {
    const tos = ownValue(byStage, stage.id) ?? [];
    for (const depId of stage.dependsOn) {
      const froms = ownValue(byStage, depId) ?? [];
      for (const from of froms) {
        for (const to of tos) drafts.push({ from, to, resourceEdge: false });
      }
    }
  }

  // ── Cạnh MÁY: vẽ thêm, không có trong `dependsOn` ─────────────────────────
  //
  // Đường găng đi qua cả hai loại (`BlockedBy`), và tô một đoạn chờ-máy như thể
  // nó là phụ thuộc sẽ dạy sai: người chơi đi sửa đồ thị trong khi thứ phải sửa
  // là số máy.
  if (run !== null) {
    for (const record of run.instances) {
      const blocked = record.blockedBy;
      if (blocked.kind !== 'runner') continue;
      // ⚠ `InstanceKey` không mang `commitId` (hợp đồng §1), nên trong một
      // `PassRecord` nhiều commit, kẻ giữ máy có thể thuộc commit TRƯỚC và nằm
      // ngoài `run.instances` của chính lượt này. Bỏ cạnh đó — giữ lại là một
      // cạnh trỏ vào hư không mà renderer không có node nào để nối.
      if (!present.has(blocked.instance) || !present.has(record.instance)) continue;
      drafts.push({ from: blocked.instance, to: record.instance, resourceEdge: true });
    }
  }

  // ── Đường găng ────────────────────────────────────────────────────────────
  const critical = new Set<string>();
  if (run !== null) {
    const path = criticalPath(run.instances);
    for (const e of path?.edges ?? []) critical.add(`${e.from} ${e.to}`);
  }

  // Trùng cạnh: một cặp (from,to) có thể sinh ra hai lần khi nó vừa là phụ thuộc
  // vừa là chỗ chờ máy. Gộp, và ưu tiên `resourceEdge: false` — cạnh phụ thuộc
  // là sự thật mạnh hơn, vì nó có trong đồ thị người chơi gõ.
  const merged = idDict<DagEdgeView>();
  for (const d of drafts) {
    const key = `${d.from} ${d.to}`;
    const prev = ownValue(merged, key);
    const resourceEdge = prev === undefined ? d.resourceEdge : prev.resourceEdge && d.resourceEdge;
    merged[key] = { from: d.from, to: d.to, critical: critical.has(key), resourceEdge };
  }

  const edges = Object.values(merged).sort(
    (a, b) => compareKeys(a.from, b.from) || compareKeys(a.to, b.to),
  );

  return { nodes, edges, yAxis };
}
