/**
 * Hiện thực 19 vị từ mà `CicdObjective.check` gọi tên.
 *
 * ## Vì sao file này tồn tại
 *
 * `contract.ts` khai `CICD_PREDICATE_NAMES` và mọi level trỏ tới chúng bằng
 * TÊN, nhưng cho tới đợt này chưa ai hiện thực bảng tra. Hệ quả đo được: hai
 * lane viết level (`levels/ci-som.test.ts` và `levels/ci-muon.test.ts`) mỗi lane
 * tự vá một bộ kiểm cục bộ trong file test của mình. Hai bản đọc hiểu độc lập
 * cùng một hợp đồng là hai bản sẽ trôi khỏi nhau — và cả hai vẫn biên dịch,
 * vẫn xanh ở test của chính nó. Đây là bản CHÍNH TẮC; hai bộ kiểm kia phải
 * chuyển sang gọi file này rồi xoá đi.
 *
 * ## Bốn luật chi phối cả file
 *
 * 1. **THUẦN và CHỈ ĐỌC.** Không vị từ nào sinh state, không vị từ nào chạy lại
 *    engine. Chúng đọc một `EvaluationRecord` đã có và một `WorkflowSpec`. Một
 *    vị từ tự gọi `evaluate()` là một vị từ cho ra kết quả khác giữa lúc chấm và
 *    lúc phát lại nếu ai đó đổi hạt giống.
 *
 * 2. **Vị từ CHƯA hiện thực thì NÉM.** Trả `true` biến một mục tiêu chưa viết
 *    thành mục tiêu luôn đạt; trả `false` biến nó thành một level không giải
 *    được. Cả hai sai trong im lặng, và cả hai chỉ lộ ra khi có người chơi tới
 *    đúng level đó. Hôm nay nhánh này RỖNG — 19.B đã hiện thực nốt các vị từ
 *    chương CD; xem `UNIMPLEMENTED_CICD_PREDICATES`.
 *
 * 3. **Tham số thiếu hoặc sai kiểu thì trả `false`, KHÔNG ném.** Khác luật 2, và
 *    khác có chủ ý: một vị từ chưa viết là lỗi của KHO MÃ, một tham số sai là
 *    lỗi của MỘT LEVEL. Lỗi của một level chỉ được phép làm hỏng một mục tiêu,
 *    không được làm sập phiên chơi của người dùng (cùng luật với
 *    `k8s/predicates.ts`).
 *
 *    ⚠ Chiều `false` này giấu lỗi của tác giả level, nên nó đi kèm
 *    `validateObjectiveArgs()`: tầng test của level gọi hàm đó và đỏ TO ở chỗ
 *    rẻ, thay vì để một mục tiêu vĩnh viễn không đạt nằm im trong danh mục.
 *
 * 4. **Không mục tiêu nào được thoả bằng cách XOÁ bằng chứng.** Luật đắt nhất,
 *    và nó quyết định nhiều lựa chọn dưới đây: `stageNotDependsOn`,
 *    `stageOffCriticalPath`, `retriesAtMost`, `cacheNeverHits` đều ĐÒI đối
 *    tượng chúng nói về phải tồn tại. Một vị từ đúng theo nghĩa đen mà thoả được
 *    bằng cách xoá stage đi là một bài học bị xoá — `stageOffCriticalPath` là ví
 *    dụ rõ nhất: xoá hẳn `lint` thì nó đương nhiên không nằm trên đường găng.
 *
 * ## Vì sao mọi phép tính đi qua module có sẵn
 *
 * Ba trục lấy từ `score.ts` (`scoreAxes`), đường găng lấy từ `critical-path.ts`
 * (`criticalPath`), chu trình lấy từ `graph.ts` (`findCycle`). Tính lại ở đây là
 * cách hai chỗ trong cùng một engine trả lời khác nhau cho cùng một câu hỏi —
 * và chỗ lệch sẽ không đỏ ở đâu cả, vì mỗi bên tự nhất quán.
 */

import type {
  CacheId,
  CicdObjective,
  CicdPredicateName,
  EvaluationRecord,
  FailureCause,
  StageId,
  StageSpec,
  StepId,
  WorkflowSpec,
} from './contract.ts';
import { deploymentsOf } from './artifacts.ts';
import type {
  GitOpsRecord,
  GitOpsScenario,
  MaskingRecord,
  ReleaseRecord,
  ReleaseScenario,
} from './cd-contract.ts';
import { longestDriftSeconds, selfHealFights } from './gitops.ts';
import { leakCount } from './masking.ts';
import {
  badReleasePromotedCount,
  dataIncidentCount,
  goodReleaseAbortedCount,
  rollbackSeconds,
} from './release.ts';
import { criticalPath } from './critical-path.ts';
import { findCycle } from './graph.ts';
import { idDict } from './id-dict.ts';
import { scoreAxes } from './score.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. RANH GIỚI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Thứ một vị từ được nhìn thấy.
 *
 * Hai trường, không hơn: một số vị từ chỉ đọc hình dạng đồ thị
 * (`stageCountAtMost`), một số chỉ đọc bản ghi (`cacheHitsAtLeast`), và ba trục
 * cần cả hai vì `summarizeEvaluation` phải biết stage nào chặn mới tính được
 * `greenRate`.
 *
 * ⛔ KHÔNG mang `CicdLevel` vào đây. Vị từ chấm một workflow người chơi gõ trên
 * một bản ghi engine trả; ngưỡng của level là chuyện của tầng trên, và trộn vào
 * sẽ làm vị từ không chấm nổi một workflow ở sandbox (19.H) — nơi không có level
 * nào.
 */
export interface CicdScoringContext {
  readonly workflow: WorkflowSpec;
  readonly record: EvaluationRecord;
  /**
   * 19.B — bản ghi của ba bộ mô phỏng chương CD, mỗi cái kèm kịch bản nó chạy
   * trên (phép chiếu cần kịch bản: "bản ứng viên có xấu không" là sự thật của
   * kịch bản, không nằm trong bản ghi). Vắng ⇒ vị từ đọc nó trả `false`.
   */
  readonly cd?: CicdCdRecords;
}

export interface CicdCdRecords {
  /**
   * MẢNG, một mục mỗi kịch bản (`cd-contract.ts` §5.2): cùng một chính sách chạy
   * trên bản tốt lẫn bản xấu. Vị từ cộng dồn qua mọi mục. Mảng rỗng đọc như vắng.
   */
  readonly release?: readonly { readonly record: ReleaseRecord; readonly scenario: ReleaseScenario }[];
  readonly gitops?: { readonly record: GitOpsRecord; readonly scenario: GitOpsScenario };
  readonly masking?: { readonly record: MaskingRecord };
}

export type CicdPredicateArgs = Readonly<Record<string, unknown>>;

export type CicdPredicate = (ctx: CicdScoringContext, args: CicdPredicateArgs) => boolean;

export type CicdPredicateTable = Readonly<Record<CicdPredicateName, CicdPredicate>>;

/**
 * Vị từ chưa có engine đỡ. RỖNG từ 19.B (2026-09-17).
 *
 * Giữ lại chứ không xoá: plugin OJ và hai file test đọc nó để trừ tên ra khỏi
 * tập khai được. Thêm một tên vào hợp đồng mà chưa viết hiện thực thì ghi nó
 * vào đây VÀ viết một nhánh ném (luật 2) — không có nhánh ném sẵn nào để dùng
 * lại, vì một hàm không ai gọi là thứ `eslint` gỡ.
 */
export const UNIMPLEMENTED_CICD_PREDICATES: readonly CicdPredicateName[] = [];

/**
 * Vị từ đọc `CicdScoringContext.cd` — CẦN một kịch bản phát hành / GitOps / log.
 *
 * Tách khỏi `UNIMPLEMENTED_CICD_PREDICATES` vì lý do khác hẳn: chúng CHẤM ĐƯỢC,
 * chỉ là chúng không tự đứng một mình — thiếu bản ghi tương ứng thì chúng trả
 * `false` ở MỌI lượt nộp, im lặng.
 *
 * ⛔ ĐÍNH CHÍNH 19.J (2026-09-17). Câu cũ ở đây nói *"bài OJ không chở kịch bản
 * nào… ngày bài OJ chở kịch bản, bỏ tên khỏi đây"*. Bài OJ nay CHỞ
 * (`CicdProblemSpec.cd`), nhưng **danh sách này không bị bỏ đi** — nó chỉ đổi
 * vai. Trước: "tám tên cấm khai". Nay: "tám tên chỉ khai được khi bài có đúng
 * khối `cd` mà chúng đọc", và phép gác đó là `CD_PREDICATE_NEEDS` ngay dưới.
 *
 * Xoá danh sách này và mở toang sẽ đưa ta về đúng cái bẫy nó sinh ra để chặn,
 * chỉ hẹp hơn: một bài khai `secretLeaksAtMost` mà chỉ có khối `release` sẽ là
 * một bài không ai giải được, và không có gì đỏ.
 */
export const CD_SIMULATION_PREDICATES: readonly CicdPredicateName[] = [
  'rollbackUnder',
  'badReleasePromotedAtMost',
  'goodReleaseAbortedAtMost',
  'noDataIncident',
  'peakInstancesAtMost',
  'driftLongestUnder',
  'selfHealFightsAtMost',
  'secretLeaksAtMost',
];

/** Ba bộ mô phỏng chương CD. Khoá của `CicdCdRecords` và của `CicdCdPolicies`. */
export type CdSimulatorKind = 'release' | 'gitops' | 'masking';

/**
 * Vị từ CD ⇒ khối `cd` nó ĐỌC. Bảng gác của 19.J.1.4.
 *
 * Bài OJ khai một vị từ ở đây mà thiếu khối tương ứng thì đó là **lỗi bài soạn**
 * (`CE`), không phải một bài khó: vị từ sẽ trả `false` ở mọi lượt nộp, kể cả lượt
 * nộp đúng, và người làm không có cách nào đọc ra vì sao.
 *
 * ⛔ Bảng phải phủ ĐÚNG `CD_SIMULATION_PREDICATES`, hai chiều — `predicates.test.ts`
 * ghim cả hai. Thiếu một tên thì vị từ đó đi qua cổng mà không ai hỏi nó cần gì;
 * thừa một tên thì cổng đòi một khối cho một vị từ không đọc khối nào.
 *
 * Nguồn của từng dòng là chính thân vị từ ở §5 — `ctx.cd?.release`,
 * `ctx.cd?.gitops`, `ctx.cd?.masking`. Đổi thân thì đổi luôn dòng ở đây.
 */
export const CD_PREDICATE_NEEDS: Readonly<Partial<Record<CicdPredicateName, CdSimulatorKind>>> = {
  rollbackUnder: 'release',
  badReleasePromotedAtMost: 'release',
  goodReleaseAbortedAtMost: 'release',
  noDataIncident: 'release',
  peakInstancesAtMost: 'release',
  driftLongestUnder: 'gitops',
  selfHealFightsAtMost: 'gitops',
  secretLeaksAtMost: 'masking',
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. ĐỌC THAM SỐ
// ═══════════════════════════════════════════════════════════════════════════

function argString(args: CicdPredicateArgs, key: string): string | null {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function argNumber(args: CicdPredicateArgs, key: string): number | null {
  const value = args[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Các `kind` hợp lệ của `FailureCause`, ở dạng tra được lúc chạy.
 *
 * Viết thành `Record<FailureCause['kind'], true>` chứ không thành mảng, vì kiểu
 * này ép HAI CHIỀU: thiếu một nhánh của union ⇒ lỗi biên dịch ngay tại đây, thừa
 * một khoá cũng vậy. Một mảng `as const satisfies …` chỉ ép được chiều thứ nhất,
 * nên thêm một `kind` mới vào hợp đồng sẽ lọt qua trong im lặng và
 * `noFailureCause` sẽ không bao giờ thấy nguyên nhân mới đó.
 */
const FAILURE_CAUSE_KINDS: Readonly<Record<FailureCause['kind'], true>> = {
  flake: true,
  'missing-output': true,
  'stale-cache': true,
  'upstream-failed': true,
  'approval-rejected': true,
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. PHÉP ĐỌC DÙNG CHUNG
// ═══════════════════════════════════════════════════════════════════════════

function stageById(workflow: WorkflowSpec, id: StageId): StageSpec | undefined {
  return workflow.stages.find((stage) => stage.id === id);
}

/**
 * `from` có phụ thuộc **BẮC CẦU** vào `target` không.
 *
 * ⛔ Bắc cầu, không phải trực tiếp — hợp đồng ghi rõ kèm lý do: mục tiêu của
 * level phát biểu một RÀNG BUỘC THỨ TỰ, không phát biểu một hình dạng đồ thị.
 * Đọc thành trực tiếp sẽ loại đúng những lời giải hợp lệ mà AC-F đòi phải có ≥2.
 *
 * Chỉ đi qua stage CÓ THẬT: một cạnh trỏ vào hư không không dẫn đi đâu được, và
 * `validateGraph` mới là chỗ báo cạnh treo.
 */
function dependsOnTransitively(workflow: WorkflowSpec, from: StageId, target: StageId): boolean {
  const seen: Record<StageId, true> = idDict();
  const stack: StageId[] = [from];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || Object.hasOwn(seen, current)) continue;
    seen[current] = true;
    const stage = stageById(workflow, current);
    if (stage === undefined) continue;
    for (const dep of stage.dependsOn) {
      if (dep === target) return true;
      stack.push(dep);
    }
  }
  return false;
}

/** Mọi `AttemptRecord` của mọi thực thể, mọi commit, mọi lượt mô phỏng. */
function everyAttempt(record: EvaluationRecord) {
  return record.passes.flatMap((pass) =>
    pass.runs.flatMap((run) => run.instances.flatMap((instance) => instance.attempts)),
  );
}

/** Mọi `StepRecord`, KÈM `stageId` của thực thể chứa nó. */
function everyStepWithStage(
  record: EvaluationRecord,
): readonly { readonly stageId: StageId; readonly stepId: StepId; readonly cacheHit: boolean | null }[] {
  const out: { stageId: StageId; stepId: StepId; cacheHit: boolean | null }[] = [];
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const instance of run.instances) {
        for (const attempt of instance.attempts) {
          for (const step of attempt.steps) {
            out.push({ stageId: instance.stageId, stepId: step.id, cacheHit: step.cacheHit });
          }
        }
      }
    }
  }
  return out;
}

/**
 * Cặp `(stageId, stepId)` của mọi bước khai cache `cache`.
 *
 * Khoá theo CẶP chứ không theo `stepId` một mình: `StepId` chỉ duy nhất trong
 * phạm vi một stage, nên hai stage đều có bước tên `khoi-phuc` với hai cache
 * khác nhau là chuyện bình thường — và tra theo `stepId` trần sẽ cho cache này
 * ăn lần trúng của cache kia, im lặng.
 */
function stepsDeclaringCache(
  workflow: WorkflowSpec,
  cache: CacheId,
): Readonly<Record<StageId, Readonly<Record<StepId, true>>>> {
  const out: Record<StageId, Record<StepId, true>> = idDict();
  for (const stage of workflow.stages) {
    for (const step of stage.steps) {
      if (step.cache?.id === cache) {
        out[stage.id] ??= idDict<true>();
        (out[stage.id] as Record<StepId, true>)[step.id] = true;
      }
    }
  }
  return out;
}

/**
 * Bao nhiêu lượt chạy CHẮC CHẮN có `stage` trên đường găng, bao nhiêu lượt chắc
 * chắn không, bao nhiêu lượt không biết.
 *
 * ## Vì sao có ô thứ ba, và vì sao nó không phải sự cầu toàn
 *
 * `criticalPath()` trả `truncated: true` khi chuỗi `blockedBy` đứt giữa chừng —
 * và một trong hai nguyên nhân là **lỗ đã biết của hợp đồng**: `InstanceKey`
 * không mang `commitId`, nên một thực thể chờ máy do commit KHÁC giữ sẽ trỏ ra
 * ngoài `RunRecord.instances` của chính nó. Level dạy thông lượng (≥3 commit,
 * máy chạy chật) là chỗ nó xảy ra thường nhất.
 *
 * Đường trả về khi đứt là một **đoạn ĐUÔI** của đường thật. Từ đó suy ra đúng
 * ba tình huống, và chỉ ba:
 *
 * | Thấy stage trong đoạn đuôi? | `truncated` | Kết luận |
 * |---|---|---|
 * | Có | bất kỳ | CHẮC CHẮN nằm trên đường găng — đoạn đuôi là một phần đường thật |
 * | Không | `false` | CHẮC CHẮN không nằm — đường đã đầy đủ |
 * | Không | `true` | KHÔNG BIẾT — nó có thể nằm ở phần đã mất |
 *
 * Hai bộ kiểm cục bộ đang gộp ô thứ ba vào một trong hai ô kia, theo hai hướng
 * ngược nhau, nên cùng một bản ghi cho hai câu trả lời (xem báo cáo lane).
 *
 * Lượt "không biết" bị **loại khỏi mẫu số**, không tính là trượt. Tính là trượt
 * thì một ô nghiệm thu `rate: 1` trở thành bất khả thi vì một lỗ của hợp đồng
 * mà người chơi không chạm tới được — và họ không có cách nào đọc ra ý định đó.
 * Loại khỏi mẫu số thì câu trả lời đọc là *"trong những lượt phân định được,
 * tỷ lệ là X"*, và đó đúng là thứ ta biết.
 */
interface CriticalPathTally {
  readonly on: number;
  readonly off: number;
  readonly unknown: number;
}

function tallyCriticalPath(record: EvaluationRecord, stage: StageId): CriticalPathTally {
  let on = 0;
  let off = 0;
  let unknown = 0;
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      const path = criticalPath(run.instances);
      if (path === null) {
        unknown += 1;
        continue;
      }
      if (path.nodes.some((node) => node.stageId === stage)) {
        on += 1;
      } else if (path.truncated) {
        unknown += 1;
      } else {
        off += 1;
      }
    }
  }
  return { on, off, unknown };
}

/**
 * Khiếm khuyết LỌT XUỐNG: một lần đỏ `latent-defect` mà một lần thử lại sau đó
 * đã che đi.
 *
 * Bám đúng chữ của hợp đồng — *"đỏ `latent-defect` bị retry che"* — nên điều
 * kiện là: thực thể có ≥1 lần thử đỏ vì `latent-defect`, VÀ lần thử cuối của nó
 * xanh. Một thực thể đỏ tới cùng thì lỗi đã hiện ra, không lọt xuống đâu cả.
 *
 * ⚠ Cách đọc này KHÔNG bắt lối tránh bằng `blocking: false`: một stage không
 * chặn vẫn ghi `outcome: 'failed'` nên không tính là bị che, dù khiếm khuyết vẫn
 * đi thẳng xuống bản phát hành. C11 đóng lối đó bằng CẤU TRÚC — `'blocking'`
 * không nằm trong `editable` của nó — chứ không bằng một vị từ rộng hơn. Nới
 * định nghĩa ở đây sẽ làm bộ chấm lệch khỏi ngưỡng mà C11 đã cân bằng.
 */
function escapedDefects(record: EvaluationRecord): number {
  let total = 0;
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const instance of run.instances) {
        const last = instance.attempts.at(-1);
        if (last === undefined || last.outcome !== 'passed') continue;
        total += instance.attempts.filter(
          (attempt) => attempt.cause?.kind === 'flake' && attempt.cause.nature === 'latent-defect',
        ).length;
      }
    }
  }
  return total;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. BẢNG THAM SỐ
// ═══════════════════════════════════════════════════════════════════════════

export interface CicdPredicateArgSpec {
  readonly key: string;
  readonly kind: 'string' | 'number';
  /** Tập giá trị hợp lệ, cho tham số là enum. Vắng ⇒ nhận mọi giá trị đúng kiểu. */
  readonly oneOf?: readonly string[];
}

/**
 * Tham số mỗi vị từ ĐÒI. Dữ liệu, không phải văn xuôi: `validateObjectiveArgs()`
 * đọc thẳng bảng này, nên một mục tiêu gõ thiếu `stage` đỏ ở tầng test của level
 * thay vì lặng lẽ trả `false` suốt đời.
 *
 * ⚠ Bảng này và thân các vị từ đọc tham số ở HAI chỗ. Ràng chúng lại bằng một ô
 * nghiệm thu hành vi, không bằng lời hứa: `predicates.test.ts` bỏ từng tham số
 * khai ở đây rồi khẳng định vị từ trả `false`. Đổi tên một tham số ở một bên là
 * đỏ ngay.
 */
export const CICD_PREDICATE_ARGS: Readonly<
  Record<CicdPredicateName, readonly CicdPredicateArgSpec[]>
> = {
  graphAcyclic: [],
  stageExists: [{ key: 'stage', kind: 'string' }],
  stageDependsOn: [
    { key: 'stage', kind: 'string' },
    { key: 'on', kind: 'string' },
  ],
  stageNotDependsOn: [
    { key: 'stage', kind: 'string' },
    { key: 'on', kind: 'string' },
  ],
  stageCountAtMost: [{ key: 'max', kind: 'number' }],
  leadTimeUnder: [{ key: 'seconds', kind: 'number' }],
  throughputAtLeast: [{ key: 'perHour', kind: 'number' }],
  runnerMinutesUnder: [{ key: 'minutes', kind: 'number' }],
  greenRateAtLeast: [{ key: 'rate', kind: 'number' }],
  cacheHitsAtLeast: [{ key: 'count', kind: 'number' }],
  cacheNeverHits: [{ key: 'cache', kind: 'string' }],
  noFailureCause: [
    { key: 'cause', kind: 'string', oneOf: Object.keys(FAILURE_CAUSE_KINDS) },
  ],
  retriesAtMost: [
    { key: 'stage', kind: 'string' },
    { key: 'max', kind: 'number' },
  ],
  stageOnCriticalPath: [
    { key: 'stage', kind: 'string' },
    { key: 'rate', kind: 'number' },
  ],
  stageOffCriticalPath: [
    { key: 'stage', kind: 'string' },
    { key: 'rate', kind: 'number' },
  ],
  escapedDefectsAtMost: [{ key: 'max', kind: 'number' }],
  stageNonBlocking: [{ key: 'stage', kind: 'string' }],
  promotedArtifactUnchanged: [
    { key: 'output', kind: 'string' },
    { key: 'from', kind: 'string' },
    { key: 'to', kind: 'string' },
  ],
  environmentGuardedByApproval: [
    { key: 'environment', kind: 'string' },
    { key: 'reviewers', kind: 'number' },
  ],
  rollbackUnder: [{ key: 'seconds', kind: 'number' }],
  badReleasePromotedAtMost: [{ key: 'max', kind: 'number' }],
  goodReleaseAbortedAtMost: [{ key: 'max', kind: 'number' }],
  noDataIncident: [],
  peakInstancesAtMost: [{ key: 'max', kind: 'number' }],
  driftLongestUnder: [
    { key: 'field', kind: 'string' },
    { key: 'seconds', kind: 'number' },
  ],
  selfHealFightsAtMost: [{ key: 'max', kind: 'number' }],
  secretLeaksAtMost: [{ key: 'max', kind: 'number' }],
};

// ═══════════════════════════════════════════════════════════════════════════
// 5. VỊ TỪ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ Đọc chu trình từ ĐỒ THỊ, không từ `EvaluationRecord.error`.
 *
 * `validateGraph` báo cạnh treo TRƯỚC chu trình, nên một workflow vừa có cạnh
 * treo vừa có vòng sẽ mang `error.kind === 'unknown-dependency'` — và một hiện
 * thực đọc `error?.kind !== 'cycle'` sẽ trả lời "đồ thị không có chu trình"
 * trong khi nó có. `findCycle` trả lời đúng câu đang hỏi.
 */
const graphAcyclic: CicdPredicate = (ctx) => findCycle(ctx.workflow) === null;

const stageExists: CicdPredicate = (ctx, args) => {
  const id = argString(args, 'stage');
  return id !== null && stageById(ctx.workflow, id) !== undefined;
};

const stageDependsOn: CicdPredicate = (ctx, args) => {
  const from = argString(args, 'stage');
  const target = argString(args, 'on');
  if (from === null || target === null) return false;
  /* Cả hai đầu phải có thật: "phụ thuộc vào một stage không tồn tại" là một cạnh
   * treo, và một cạnh treo làm cả lượt chấm hỏng chứ không thoả mục tiêu nào. */
  if (stageById(ctx.workflow, from) === undefined) return false;
  if (stageById(ctx.workflow, target) === undefined) return false;
  return dependsOnTransitively(ctx.workflow, from, target);
};

/**
 * Phủ định CHÍNH XÁC của `stageDependsOn`, nên cũng BẮC CẦU — hợp đồng nói rõ.
 * Hai vế đọc theo hai nghĩa là một cặp vị từ vừa đúng vừa sai trên cùng đồ thị.
 *
 * ⛔ ĐÒI cả hai stage tồn tại (luật 4). Không có ràng buộc đó thì xoá `dong-goi`
 * đi là thoả ngay *"`dong-goi` không phụ thuộc `kiem-tra`"* — mục tiêu dạy tách
 * song song biến thành mục tiêu dạy xoá việc.
 */
const stageNotDependsOn: CicdPredicate = (ctx, args) => {
  const from = argString(args, 'stage');
  const target = argString(args, 'on');
  if (from === null || target === null) return false;
  if (stageById(ctx.workflow, from) === undefined) return false;
  if (stageById(ctx.workflow, target) === undefined) return false;
  return !dependsOnTransitively(ctx.workflow, from, target);
};

const stageCountAtMost: CicdPredicate = (ctx, args) => {
  const max = argNumber(args, 'max');
  return max !== null && ctx.workflow.stages.length <= max;
};

const leadTimeUnder: CicdPredicate = (ctx, args) => {
  const seconds = argNumber(args, 'seconds');
  const axes = scoreAxes(ctx.record, ctx.workflow);
  return seconds !== null && axes !== null && axes.leadTimeSeconds < seconds;
};

const throughputAtLeast: CicdPredicate = (ctx, args) => {
  const perHour = argNumber(args, 'perHour');
  const axes = scoreAxes(ctx.record, ctx.workflow);
  return perHour !== null && axes !== null && axes.throughputPerHour >= perHour;
};

const runnerMinutesUnder: CicdPredicate = (ctx, args) => {
  const minutes = argNumber(args, 'minutes');
  const axes = scoreAxes(ctx.record, ctx.workflow);
  return minutes !== null && axes !== null && axes.runnerMinutes < minutes;
};

const greenRateAtLeast: CicdPredicate = (ctx, args) => {
  const rate = argNumber(args, 'rate');
  const axes = scoreAxes(ctx.record, ctx.workflow);
  return rate !== null && axes !== null && axes.greenRate >= rate;
};

/**
 * Số lần trúng cache trong cả lượt chấm, dạng SỐ THÔ.
 *
 * ⚠ Đây là một PHÉP ĐO, không phải một vị từ: nó không trả lời đạt/không đạt.
 * Nó tồn tại vì có những câu chỉ nói được bằng cách SO HAI BẢN GHI với nhau, mà
 * một ngưỡng thì không nói nổi. Câu đắt nhất trong số đó là bài học của C08:
 *
 *   bản HỎNG trúng cache NHIỀU HƠN bản đã sửa
 *
 * Khoá hẹp thì lặp lại nhiều hơn, nên nó trúng thường xuyên hơn — chỉ là trúng
 * một bản đã ôi. `cacheHitsAtLeast { count }` không phát biểu được điều đó dù
 * đặt ngưỡng nào, vì cả hai bản đều vượt mọi ngưỡng hợp lý. Đó cũng chính là lý
 * do `cacheHitsAtLeast` ở C08 là mục THƯỞNG chứ không bắt buộc: một ô bắt buộc
 * dựng trên số lần trúng sẽ được thoả mãn bởi chính workflow level đang bảo
 * người chơi sửa.
 *
 * Export ra thay vì để mỗi file test tự đếm: `levels/ci-muon.test.ts` từng giữ
 * một bản đếm riêng, và một phép đếm viết hai nơi là một phép đếm sẽ lệch ở lần
 * đầu ai đó đổi nghĩa `cacheHit`. `cacheHitsAtLeast` dưới đây gọi chính hàm
 * này, nên ngưỡng và số thô không bao giờ đọc ra hai con số khác nhau.
 */
export function countCacheHits(record: EvaluationRecord): number {
  return everyStepWithStage(record).filter((step) => step.cacheHit === true).length;
}

const cacheHitsAtLeast: CicdPredicate = (ctx, args) => {
  const count = argNumber(args, 'count');
  if (count === null) return false;
  return countCacheHits(ctx.record) >= count;
};

/**
 * Cache này KHÔNG bao giờ trúng — đối chứng cho C07 ("khoá quá rộng").
 *
 * ⛔ ĐÒI cache phải được ít nhất một bước khai (luật 4). Bỏ hẳn cache đi thì nó
 * cũng "không bao giờ trúng", và mục tiêu dạy *đọc ra một khoá vô dụng* biến
 * thành mục tiêu dạy *xoá cache*. Hai chuyện khác nhau, và chỉ một cái đúng.
 */
const cacheNeverHits: CicdPredicate = (ctx, args) => {
  const cache = argString(args, 'cache');
  if (cache === null) return false;
  const declared = stepsDeclaringCache(ctx.workflow, cache);
  if (Object.keys(declared).length === 0) return false;
  return !everyStepWithStage(ctx.record).some(
    (step) => step.cacheHit === true && declared[step.stageId]?.[step.stepId] === true,
  );
};

/**
 * Không lần đỏ nào mang nguyên nhân này.
 *
 * ⚠ Một `cause` không thuộc union trả `false`, không trả `true`. Gõ nhầm
 * `'stale_cache'` mà trả `true` là một ô nghiệm thu luôn xanh vì nó tìm một thứ
 * không tồn tại được — đúng hình dạng "a green that proves nothing".
 */
const noFailureCause: CicdPredicate = (ctx, args) => {
  const cause = argString(args, 'cause');
  if (cause === null || !Object.hasOwn(FAILURE_CAUSE_KINDS, cause)) return false;
  return !everyAttempt(ctx.record).some((attempt) => attempt.cause?.kind === cause);
};

/**
 * Stage có nhiều nhất `max` lần thử lại.
 *
 * ⛔ ĐÒI stage tồn tại (luật 4): xoá `dong-goi` đi thì nó cũng "không có lần thử
 * lại nào", và C10 — bài dạy *retry không cứu được đỏ thật* — mất sạch nghĩa.
 */
const retriesAtMost: CicdPredicate = (ctx, args) => {
  const id = argString(args, 'stage');
  const max = argNumber(args, 'max');
  if (id === null || max === null) return false;
  const stage = stageById(ctx.workflow, id);
  return stage !== undefined && stage.retries <= max;
};

const stageOnCriticalPath: CicdPredicate = (ctx, args) => {
  const id = argString(args, 'stage');
  const rate = argNumber(args, 'rate');
  if (id === null || rate === null) return false;
  if (stageById(ctx.workflow, id) === undefined) return false;
  const tally = tallyCriticalPath(ctx.record, id);
  const decided = tally.on + tally.off;
  return decided > 0 && tally.on / decided >= rate;
};

/**
 * ⛔ ĐÒI stage tồn tại (luật 4), và đây là chỗ luật đó đắt nhất: xoá hẳn `lint`
 * thì nó đương nhiên không nằm trên đường găng, nên mục tiêu *"đặt lint ở chỗ nó
 * không cản ai"* thoả được bằng cách bỏ lint đi — tức bằng cách không làm việc.
 */
const stageOffCriticalPath: CicdPredicate = (ctx, args) => {
  const id = argString(args, 'stage');
  const rate = argNumber(args, 'rate');
  if (id === null || rate === null) return false;
  if (stageById(ctx.workflow, id) === undefined) return false;
  const tally = tallyCriticalPath(ctx.record, id);
  const decided = tally.on + tally.off;
  return decided > 0 && tally.off / decided >= rate;
};

const escapedDefectsAtMost: CicdPredicate = (ctx, args) => {
  const max = argNumber(args, 'max');
  return max !== null && escapedDefects(ctx.record) <= max;
};

const stageNonBlocking: CicdPredicate = (ctx, args) => {
  const id = argString(args, 'stage');
  if (id === null) return false;
  const stage = stageById(ctx.workflow, id);
  return stage !== undefined && !stage.blocking;
};

/**
 * 19.B.2 — thăng hạng, đừng dựng lại.
 *
 * Mỗi commit của mỗi lượt có phát hành `output` vào `to`: lần phát hành CUỐI vào
 * `to` phải có một lần phát hành vào `from` XONG TRƯỚC hoặc cùng lúc nó, stage
 * phát hành `to` phải phụ thuộc (bắc cầu) vào stage phát hành `from` đó, và hai
 * bên cùng danh tính.
 *
 * ⚠ Bản đầu chỉ so danh tính khi CẢ HAI cùng có mặt, và bỏ qua mọi commit còn lại.
 * Review PR #141 đo ra hai đường lọt: staging và prod chạy SONG SONG (prod xong ở
 * tick 6, staging ở tick 35) vẫn đạt, và một commit lên prod mà staging đỏ bị lặng
 * lẽ bỏ qua. "Thăng hạng" nghĩa là bản ở `to` ĐÃ đi qua `from`; lên `to` mà chưa
 * qua `from` là trượt, không phải "không có gì để so".
 *
 * Luật 4: phải có ÍT NHẤT một commit phát hành vào `to` — không thì xoá hẳn stage
 * prod cũng thoả.
 */
const promotedArtifactUnchanged: CicdPredicate = (ctx, args) => {
  const output = argString(args, 'output');
  const from = argString(args, 'from');
  const to = argString(args, 'to');
  if (output === null || from === null || to === null || from === to) return false;
  let soSanh = 0;
  for (const pass of ctx.record.passes) {
    for (const run of pass.runs) {
      const phatHanh = deploymentsOf(run, ctx.workflow).filter((d) => d.artifacts.some((a) => a.output === output));
      const banTo = phatHanh.filter((d) => d.environment === to).at(-1);
      if (banTo === undefined) continue;
      const banFrom = phatHanh
        .filter((d) => d.environment === from && d.finishedTick <= banTo.finishedTick)
        .at(-1);
      if (banFrom === undefined) return false;
      if (!dependsOnTransitively(ctx.workflow, banTo.stageId, banFrom.stageId)) return false;
      const artifactOf = (d: typeof banTo) => d.artifacts.find((a) => a.output === output)?.artifact;
      if (artifactOf(banFrom) !== artifactOf(banTo)) return false;
      soSanh += 1;
    }
  }
  return soSanh > 0;
};

/**
 * 19.B.3 — mọi đường vào `environment` phải đi qua một cổng đủ người duyệt, và
 * cổng đó phải THẬT SỰ chặn được.
 *
 * Ba điều kiện, cả ba đo được là cần ở review PR #141:
 *
 * 1. Cổng là stage CÓ `approval` với ít nhất `reviewers` người, và `reviewers ≥ 1`.
 *    Bản đầu đọc `(approval?.reviewers ?? 0) >= reviewers` nên `reviewers: 0` biến
 *    MỌI stage phía trên thành "cổng", kể cả khi không có cổng nào.
 * 2. Cổng và mọi stage NẰM GIỮA cổng và stage phát hành đều `blocking`. Engine cho
 *    stage phía sau chạy qua một phụ thuộc đỏ không chặn — nên một cổng
 *    `continue-on-error`, hay một stage không chặn đứng giữa, để bản bị từ chối
 *    lên thẳng prod (đo: 4 lần phát hành prod với mọi commit bị từ chối).
 * 3. Bản ghi không có lần phát hành nào vào `environment` trong một commit mà mọi
 *    cổng canh nó đều đỏ. Đồ thị nói "có chặn", bản ghi xác nhận "đã chặn".
 */
function gatesGuarding(workflow: WorkflowSpec, deployStage: StageId, reviewers: number): readonly StageSpec[] {
  return workflow.stages.filter((gate) => {
    if (gate.approval === undefined || gate.approval.reviewers < reviewers || !gate.blocking) return false;
    if (!dependsOnTransitively(workflow, deployStage, gate.id)) return false;
    return workflow.stages.every(
      (between) =>
        between.id === deployStage ||
        between.id === gate.id ||
        !dependsOnTransitively(workflow, deployStage, between.id) ||
        !dependsOnTransitively(workflow, between.id, gate.id) ||
        between.blocking,
    );
  });
}

const environmentGuardedByApproval: CicdPredicate = (ctx, args) => {
  const environment = argString(args, 'environment');
  const reviewers = argNumber(args, 'reviewers');
  if (environment === null || reviewers === null || reviewers < 1) return false;
  const phatHanh = ctx.workflow.stages.filter((stage) => stage.environment === environment);
  if (phatHanh.length === 0) return false;
  const congTheoStage = new Map(phatHanh.map((stage) => [stage.id, gatesGuarding(ctx.workflow, stage.id, reviewers)]));
  if ([...congTheoStage.values()].some((gates) => gates.length === 0)) return false;

  for (const pass of ctx.record.passes) {
    for (const run of pass.runs) {
      for (const d of deploymentsOf(run, ctx.workflow)) {
        if (d.environment !== environment) continue;
        const gates = congTheoStage.get(d.stageId) ?? [];
        const coCongQua = gates.some((gate) =>
          run.instances
            .filter((instance) => instance.stageId === gate.id)
            .every((instance) => instance.attempts.at(-1)?.outcome === 'passed'),
        );
        if (!coCongQua) return false;
      }
    }
  }
  return true;
};

// ── Chương CD: đọc bản ghi của ba bộ mô phỏng ─────────────────────────────
//
// Mọi phép đếm đi qua phép chiếu của CHÍNH bộ mô phỏng (`release.ts`,
// `gitops.ts`, `masking.ts`) — tính lại ở đây là hai câu trả lời cho một câu hỏi.
// Phép chiếu trả `null` khi bản ghi lỗi (chính sách thiếu tham số): `null` ⇒
// `false`, vì "không lọt bản xấu nào" không được đạt nhờ một chính sách không chạy.

type ReleaseRun = NonNullable<CicdCdRecords['release']>[number];

/**
 * `null` khi vắng, rỗng, hoặc BẤT KỲ kịch bản nào mang lỗi: một chính sách chạy
 * được trên bản tốt mà hỏng trên bản xấu không được chấm nửa vời trên phần còn lại.
 */
function releaseOf(ctx: CicdScoringContext): readonly ReleaseRun[] | null {
  const release = ctx.cd?.release;
  if (release === undefined || release.length === 0) return null;
  return release.some((run) => run.record.error !== null) ? null : release;
}

const rollbackUnder: CicdPredicate = (ctx, args) => {
  const seconds = argNumber(args, 'seconds');
  const release = releaseOf(ctx);
  if (seconds === null || release === null) return false;
  const lui = release
    .flatMap((run) => run.record.passes.map(rollbackSeconds))
    .filter((v): v is number => v !== null);
  // Luật 4: không lượt nào rút thì không có gì để đo — không thoả.
  return lui.length > 0 && lui.every((v) => v < seconds);
};

function countAtMost(count: number | null, args: CicdPredicateArgs): boolean {
  const max = argNumber(args, 'max');
  return max !== null && count !== null && count <= max;
}

/** Cộng một phép chiếu qua mọi kịch bản. Phép chiếu trả `null` ở đâu ⇒ `null`. */
function sumOver(
  release: readonly ReleaseRun[] | null,
  count: (run: ReleaseRun) => number | null,
): number | null {
  if (release === null) return null;
  let total = 0;
  for (const run of release) {
    const value = count(run);
    if (value === null) return null;
    total += value;
  }
  return total;
}

const badReleasePromotedAtMost: CicdPredicate = (ctx, args) =>
  countAtMost(
    sumOver(releaseOf(ctx), (run) => badReleasePromotedCount(run.record, run.scenario)),
    args,
  );

const goodReleaseAbortedAtMost: CicdPredicate = (ctx, args) =>
  countAtMost(
    sumOver(releaseOf(ctx), (run) => goodReleaseAbortedCount(run.record, run.scenario)),
    args,
  );

function everyPass(release: readonly ReleaseRun[]) {
  return release.flatMap((run) => run.record.passes);
}

const noDataIncident: CicdPredicate = (ctx) => {
  const release = releaseOf(ctx);
  return (
    release !== null &&
    everyPass(release).length > 0 &&
    sumOver(release, (run) => dataIncidentCount(run.record)) === 0
  );
};

const peakInstancesAtMost: CicdPredicate = (ctx, args) => {
  const max = argNumber(args, 'max');
  const release = releaseOf(ctx);
  if (max === null || release === null) return false;
  const passes = everyPass(release);
  return passes.length > 0 && passes.every((pass) => pass.peakInstances <= max);
};

/**
 * Theo MỘT trường, không gộp mọi trường: một trường cố ý loại trừ (G3) vẫn được
 * ghi lệch tới hết giờ, nên "dài nhất trên mọi trường" sẽ phạt đúng người chơi
 * vừa loại trừ đúng — ngược bài C25. Trường không có trong kịch bản ⇒ false,
 * không phải "lệch 0 giây" (luật 4).
 */
const driftLongestUnder: CicdPredicate = (ctx, args) => {
  const field = argString(args, 'field');
  const seconds = argNumber(args, 'seconds');
  const gitops = ctx.cd?.gitops;
  if (field === null || seconds === null || gitops === undefined) return false;
  if (!gitops.scenario.initial.some((entry) => entry.field === field)) return false;
  return longestDriftSeconds(gitops.record, gitops.scenario, field) < seconds;
};

const selfHealFightsAtMost: CicdPredicate = (ctx, args) => {
  const gitops = ctx.cd?.gitops;
  return gitops !== undefined && countAtMost(selfHealFights(gitops.record), args);
};

const secretLeaksAtMost: CicdPredicate = (ctx, args) => {
  const masking = ctx.cd?.masking;
  return masking !== undefined && countAtMost(leakCount(masking.record), args);
};

// ═══════════════════════════════════════════════════════════════════════════
// 6. BẢNG TRA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ Khoá của bảng này PHẢI phủ đúng `CICD_PREDICATE_NAMES` — kiểu
 * `CicdPredicateTable` là `Record<CicdPredicateName, CicdPredicate>`, nên thiếu
 * một tên là lỗi biên dịch. Chiều ngược lại (một hiện thực không có tên trong
 * hợp đồng) kiểu KHÔNG bắt được, và đó là việc của `predicates.test.ts`.
 */
export const CICD_PREDICATES: CicdPredicateTable = {
  graphAcyclic,
  stageExists,
  stageDependsOn,
  stageNotDependsOn,
  stageCountAtMost,
  leadTimeUnder,
  throughputAtLeast,
  runnerMinutesUnder,
  greenRateAtLeast,
  cacheHitsAtLeast,
  cacheNeverHits,
  noFailureCause,
  retriesAtMost,
  stageOnCriticalPath,
  stageOffCriticalPath,
  escapedDefectsAtMost,
  stageNonBlocking,
  promotedArtifactUnchanged,
  environmentGuardedByApproval,
  rollbackUnder,
  badReleasePromotedAtMost,
  goodReleaseAbortedAtMost,
  noDataIncident,
  peakInstancesAtMost,
  driftLongestUnder,
  selfHealFightsAtMost,
  secretLeaksAtMost,
};

// ═══════════════════════════════════════════════════════════════════════════
// 7. TẦNG GỌI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chấm MỘT mục tiêu. Ném khi mục tiêu trỏ tới một vị từ chưa hiện thực.
 */
export function checkObjective(objective: CicdObjective, ctx: CicdScoringContext): boolean {
  return CICD_PREDICATES[objective.check](ctx, objective.args ?? {});
}

/**
 * Id các mục tiêu TRƯỢT, lọc theo `required`.
 *
 * Có mặt vì hai lane viết level đã viết đúng hàm này hai lần, mỗi lane một bản —
 * đúng ngưỡng mà `code-conventions.md` bảo trích ra thay vì chép lần thứ ba.
 */
export function failingObjectiveIds(
  objectives: readonly CicdObjective[],
  ctx: CicdScoringContext,
  required: boolean,
): readonly string[] {
  return objectives
    .filter((objective) => objective.required === required && !checkObjective(objective, ctx))
    .map((objective) => objective.id);
}

/**
 * Tham số của mục tiêu có đủ và đúng kiểu không. `null` = hợp lệ.
 *
 * ⚠ Đây là **đối trọng của luật 3**. Vị từ trả `false` khi thiếu tham số để một
 * level viết sai không làm sập phiên chơi; hàm này là chỗ lỗi đó được nói to,
 * ở tầng test, nơi nó rẻ. Không gọi hàm này thì một mục tiêu gõ nhầm `stages`
 * thay vì `stage` sẽ vĩnh viễn không đạt và không có gì đỏ ở đâu cả.
 */
export function validateObjectiveArgs(objective: CicdObjective): string | null {
  const specs = CICD_PREDICATE_ARGS[objective.check];
  const args = objective.args ?? {};
  for (const spec of specs) {
    const value = args[spec.key];
    if (spec.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `mục tiêu "${objective.id}" (${objective.check}): thiếu tham số số học "${spec.key}"`;
      }
      continue;
    }
    if (typeof value !== 'string' || value.length === 0) {
      return `mục tiêu "${objective.id}" (${objective.check}): thiếu tham số chuỗi "${spec.key}"`;
    }
    if (spec.oneOf !== undefined && !spec.oneOf.includes(value)) {
      return `mục tiêu "${objective.id}" (${objective.check}): "${spec.key}" nhận giá trị lạ "${value}"`;
    }
  }
  return null;
}
