/**
 * Engine của game **Đường ống CI/CD** — vòng tick, hàng đợi, máy chạy, cache,
 * đỏ giả, thử lại.
 *
 * Hợp đồng: `cicd/contract.ts`. File này KHÔNG được sửa hợp đồng; chỗ nào hợp
 * đồng chưa nói tới, quyết định được ghi tại chỗ kèm lý do để lane khác đọc
 * được mà không phải đoán.
 *
 * ## Mô hình, một đoạn
 *
 * Một *lượt mô phỏng* (`PassRecord`) chạy MỌI commit của level trên MỘT dàn máy
 * chạy dùng chung. Đó là điểm dễ hiểu sai nhất: commit không chạy lần lượt hết
 * cái này tới cái kia, chúng CHỒNG LÊN NHAU theo kiểu dây chuyền và giành nhau
 * máy. Không có chỗ chồng lấn đó thì thông lượng bằng đúng `1 / leadTime`, trục
 * ② tụt xuống thành một phép chia của trục ①, và AC-9 không còn đo được gì
 * (`contract.ts` §6, nhân chứng A).
 *
 * Thời gian là tick nguyên. Vòng lặp nhảy theo **sự kiện** (một thực thể xong,
 * một commit tới) chứ không nhích từng tick: một level có `durationTicks` hàng
 * trăm sẽ chạy 20 lượt × 28 level ở mỗi lần chạy test, và nhích từng tick biến
 * bộ test thành thứ không ai chạy.
 *
 * ## Bốn thứ engine này GHI chứ không SUY
 *
 * 1. `blockedBy` — ghi lúc xếp lịch. Đường găng của một đường ống có máy hữu hạn
 *    không phải đường dài nhất trong DAG: một stage xong muộn vì chờ MÁY thì
 *    `readyTick`/`startedTick` nói *có* phải chờ, không nói *chờ ai*.
 * 2. `runnerTicks` — cộng dồn MỌI lần thử. Đây là thứ làm "thử lại cho chắc"
 *    thành một chiến lược thua điểm đo được, chứ không phải một lời khuyên.
 * 3. `cacheHit` — trúng KHOÁ. Khác "đúng nội dung", và cả hai cùng được ghi.
 * 4. `flakeNature` — bản chất đỏ giả, chỉ đọc được SAU khi lượt chấm kết thúc.
 *
 * ## Những gì KHÔNG ở đây
 *
 * Đường găng (A.7) và ba trục điểm (A.9) là phép chiếu ĐỌC `EvaluationRecord`,
 * nên chúng ở `critical-path.ts` và `score.ts` chứ không ở đây. Engine không
 * biết gì về toạ độ, về YAML, và về tên riêng của bất kỳ nhà cung cấp CI nào
 * (ràng buộc 1 của hợp đồng; 19.C.6 gác bằng grep).
 */

import type {
  AttemptOutcome,
  AttemptRecord,
  BlockedBy,
  CacheSpec,
  CommitId,
  EvaluationError,
  EvaluationRecord,
  EvaluationSpec,
  FailureCause,
  InputId,
  InstanceKey,
  OutputId,
  PassRecord,
  RunRecord,
  RunnerClassId,
  StageId,
  StageInstanceRecord,
  StageSpec,
  StepRecord,
  WorkflowSpec,
  WorkloadSpec,
} from './contract.ts';
import { rollsForKey } from './rng-keys.ts';
import { validateGraph } from './graph.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. QUẠT STAGE RA THỰC THỂ
// ═══════════════════════════════════════════════════════════════════════════

/** Một thực thể stage như engine nhìn thấy TRƯỚC khi chạy. */
export interface ExpandedInstance {
  readonly instance: InstanceKey;
  readonly stageId: StageId;
  /** `null` khi stage không quạt ra. */
  readonly fanOutIndex: number | null;
}

/**
 * Sinh các thực thể của một stage.
 *
 * Thứ tự tổ hợp: **trục đầu chạy chậm nhất**, như đếm số (`contract.ts`
 * §`FanOutSpec`). Đó là lý do vòng lặp dưới đây nhân dồn theo chiều ngược của
 * mảng trục thay vì gọi một hàm tích Descartes chung — một hàm chung sẽ đúng về
 * TẬP mà sai về THỨ TỰ, và thứ tự đi thẳng vào `InstanceKey`, tức vào khoá rút
 * ngẫu nhiên.
 *
 * Loại hết tổ hợp (`exclude` phủ toàn bộ) là hợp lệ và trả mảng rỗng: stage đó
 * không đóng góp gì, và stage phụ thuộc nó coi như không phải chờ ai.
 */
export function expandStage(stage: StageSpec): readonly ExpandedInstance[] {
  const axes = stage.fanOut?.axes ?? [];
  if (axes.length === 0) {
    return [{ instance: stage.id, stageId: stage.id, fanOutIndex: null }];
  }

  let combos: readonly (readonly string[])[] = [[]];
  for (const axis of axes) {
    const next: (readonly string[])[] = [];
    for (const prefix of combos) {
      for (const value of axis.values) {
        next.push([...prefix, value]);
      }
    }
    combos = next;
  }

  const excluded = stage.fanOut?.exclude ?? [];
  const out: ExpandedInstance[] = [];
  for (const combo of combos) {
    const key: InstanceKey = `${stage.id}#${combo.join('/')}`;
    if (excluded.includes(key)) {
      continue;
    }
    // ⚠ `fanOutIndex` đếm theo thực thể CÒN LẠI, không theo vị trí trong tích
    // Descartes gốc. Nó là khoá cuối của thứ tự hàng đợi (§4 luật 2) và chỉ cần
    // phân biệt được các thực thể sống; đếm theo tích gốc sẽ để lại lỗ hổng số
    // khi `exclude` đục vào giữa, và một lỗ hổng như vậy không mang thông tin gì
    // mà lại mời người đọc tưởng nó mang.
    out.push({ instance: key, stageId: stage.id, fanOutIndex: out.length });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. KIỂM TRA WORKFLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠ **NỢ KỸ THUẬT CÓ CHỦ Ý, ĐÃ BÁO LEAD.** Hợp đồng giao kiểm chu trình cho
 * lane A.3 (`graph.ts`), nhưng file đó chưa tồn tại lúc lane này viết, và
 * `evaluate()` thì không phát ra được `EvaluationRecord.error` nếu thiếu nó.
 * Bản dưới đây là bản TỐI THIỂU để lane này chạy trọn vẹn và biên dịch một
 * mình. Khi `graph.ts` lên, engine nhập từ đó và hàm này bị xoá — đừng để hai
 * bản cùng sống, vì hai bản cùng hình dạng sẽ trôi khỏi nhau ở lần đầu ai đó
 * sửa một cái.
 *
 * Thứ tự kiểm: cạnh treo trước, rồi chu trình, rồi không xếp lịch được. Kiểm
 * chu trình trên một đồ thị còn cạnh treo là kiểm trên một đồ thị khác với đồ
 * thị người chơi nghĩ mình đang viết.
 *
 * Duyệt theo `stageId` đã SẮP, không theo thứ tự mảng: hợp đồng khẳng định thứ
 * tự mảng chỉ để trình bày, nên một vòng đọc-ghi YAML sắp lại stage mà đổi được
 * lỗi báo về thì lời khẳng định đó là giả.
 */
export function validateWorkflow(
  workflow: WorkflowSpec,
  workload: WorkloadSpec,
): EvaluationError | null {
  /*
   * ⚠ GỘP SSOT 2026-09-16 (lead). Bản đầu của file này tự mang một bộ dò
   * `unknown-dependency` và một `findCycle` riêng, vì lúc nó được viết thì
   * `graph.ts` (lane A.3) chưa tồn tại. Hai bộ dò chu trình trong cùng một
   * package là hai bộ sẽ trôi khỏi nhau, và chúng trôi trong im lặng: cả hai
   * vẫn trả về `EvaluationError` đúng kiểu, chỉ khác nhau ở vòng nào được báo
   * hay thứ tự ưu tiên giữa hai loại lỗi. `graph.ts` giữ bản chính tắc vì đó là
   * toán thuần trên `dependsOn`, không đụng máy, thời gian hay ngẫu nhiên.
   *
   * Phần còn lại ở đây là phần `graph.ts` KHÔNG làm được: `unschedulable` cần
   * `WorkloadSpec`, mà workload là dữ liệu của level chứ không của workflow.
   */
  const graphError = validateGraph(workflow);
  if (graphError !== null) {
    return graphError;
  }

  for (const stage of sortedStages(workflow)) {
    const pool = workload.runners.find((candidate) => candidate.id === stage.runnerClass);
    if (pool === undefined) {
      return { kind: 'unschedulable', stage: stage.id, runnerClass: stage.runnerClass };
    }
    // `runnerSlots: 0` hợp lệ và có đúng một chỗ dùng — cổng phê duyệt của con
    // người tốn thời gian mà không giữ máy nào. Chỉ chặn khi đòi NHIỀU hơn cả
    // hạng máy có: treo im lặng là kết cục tệ hơn nhiều so với một lỗi rõ ràng.
    if ((stage.runnerSlots ?? 1) > pool.count) {
      return { kind: 'unschedulable', stage: stage.id, runnerClass: stage.runnerClass };
    }
  }

  return null;
}

function sortedStages(workflow: WorkflowSpec): readonly StageSpec[] {
  return [...workflow.stages].sort((a, b) => compareAscii(a.id, b.id));
}

/**
 * So sánh mã đơn vị. **KHÔNG `localeCompare`** — nó phụ thuộc locale của môi
 * trường, nên cùng dữ liệu cho hai thứ tự trên hai máy, và triệu chứng là
 * "điểm hợp lệ bị báo gian lận" (`contract.ts` ràng buộc 2).
 */
function compareAscii(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/*
 * ⛔ `findCycle` riêng của engine ĐÃ XOÁ 2026-09-16 (lead). Bản chính tắc nằm ở
 * `graph.ts`, gọi qua `validateGraph`. Đừng dựng lại một bản thứ hai ở đây: hai
 * bộ dò chu trình trong cùng package trôi khỏi nhau mà không lệnh nào kêu, vì
 * cả hai vẫn trả về đúng kiểu `EvaluationError`.
 */

/**
 * Tập stage mà `stageId` phụ thuộc **bắc cầu**. Đã sắp, để mọi chỗ dùng đọc ra
 * cùng một thứ tự.
 *
 * Dùng cho `StepSpec.requires`: "có sẵn" nghĩa là do một stage trong tập này
 * sản xuất ra. Hai stage chạy song song không thấy sản phẩm của nhau kể cả khi
 * một cái xong trước — đó chính là điều biến "thiếu một cạnh" thành lỗi thật
 * thay vì một chuyện may rủi về thời điểm (bài C10).
 */
function transitiveDeps(stages: readonly StageSpec[], stageId: StageId): readonly StageId[] {
  const seen: StageId[] = [];
  const queue: StageId[] = [...(stages.find((s) => s.id === stageId)?.dependsOn ?? [])];
  while (queue.length > 0) {
    const next = queue.shift();
    if (next === undefined || seen.includes(next)) {
      continue;
    }
    seen.push(next);
    queue.push(...(stages.find((s) => s.id === next)?.dependsOn ?? []));
  }
  return seen.sort(compareAscii);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PHIÊN BẢN ĐẦU VÀO VÀ CACHE
// ═══════════════════════════════════════════════════════════════════════════

/** Phiên bản đầu vào = số lần nó đã đổi tính tới commit này (kể cả commit này). */
type InputVersions = Readonly<Record<InputId, number>>;

/**
 * Đầu vào mỗi commit đụng vào, và phiên bản đầu vào SAU commit đó.
 *
 * ⚠ Phiên bản là ảnh chụp theo **chỉ số commit**, không theo tick. Hai commit
 * chạy chồng nhau vẫn mỗi cái nhìn thấy đúng phiên bản workspace của mình —
 * nếu để phiên bản trôi theo đồng hồ mô phỏng thì một commit sẽ build bằng mã
 * của commit sau nó, thứ không xảy ra ở bất kỳ hệ thật nào.
 */
function resolveCommits(workload: WorkloadSpec): readonly {
  readonly changed: readonly InputId[];
  readonly versions: InputVersions;
}[] {
  const versions: Record<InputId, number> = {};
  for (const input of workload.inputs) {
    versions[input.id] = 0;
  }

  const out: { changed: readonly InputId[]; versions: InputVersions }[] = [];
  workload.commits.forEach((commit, index) => {
    // Vị trí đếm TỪ 1: `changesEvery: 1` phải đổi ở mọi commit, kể cả commit
    // đầu tiên. Đếm từ 0 thì `0 % n === 0` làm mọi đầu vào đổi ở commit đầu bất
    // kể chu kỳ, và bài C07 mất đối chứng.
    const position = index + 1;
    const changed =
      commit.changedInputs ??
      workload.inputs
        .filter((input) => input.changesEvery >= 1 && position % input.changesEvery === 0)
        .map((input) => input.id);
    for (const id of changed) {
      versions[id] = (versions[id] ?? 0) + 1;
    }
    out.push({ changed: [...changed], versions: { ...versions } });
  });
  return out;
}

/** Một mục cache đã lưu. */
interface CacheEntry {
  /** Chuỗi khoá, băm từ `keyParts` + phiên bản của chúng lúc lưu. */
  readonly key: string;
  /** Chỉ số commit đã lưu nó. Dùng cho `cacheRetentionRuns`. */
  readonly savedAtRun: number;
  /** Phiên bản của `invalidatedBy` lúc lưu. Đây là thứ phân biệt TRÚNG với ĐÚNG. */
  readonly contentVersions: readonly (readonly [InputId, number])[];
}

/**
 * Chuỗi khoá cache.
 *
 * `keyParts` là MẢNG chứ không phải tập hợp, và thứ tự khai đi thẳng vào chuỗi
 * này — hai thứ tự khác nhau là hai khoá khác nhau, đúng như mọi hệ cache thật.
 */
function cacheKeyString(cache: CacheSpec, versions: InputVersions): string {
  const parts = cache.keyParts.map((id) => `${id}@${versions[id] ?? 0}`);
  return `${cache.id}|${parts.join(',')}`;
}

interface CacheProbe {
  /** Trúng KHOÁ. Đây là thứ đi vào `StepRecord.cacheHit`. */
  readonly hit: boolean;
  /** Nội dung còn dùng được. `false` khi trúng một cache đã ôi (bài C08). */
  readonly fresh: boolean;
}

/**
 * Bốn dòng luật của hợp đồng, viết thành mã:
 *
 *   TRÚNG  ⇔ mọi `InputId` trong `keyParts` cùng phiên bản với lúc lưu
 *   ĐÚNG   ⇔ mọi `InputId` trong `invalidatedBy` cùng phiên bản với lúc lưu
 *
 * ⛔ `invalidatedBy` KHÔNG suy từ `keyParts` và không được phép suy ngược.
 * Chính khoảng cách giữa hai danh sách LÀ bài học: một hiện thực "tự động" đặt
 * chúng bằng nhau sẽ làm C08 không bao giờ kích hoạt, và triệu chứng là một
 * level vĩnh viễn dễ — không đỏ ở đâu cả.
 */
function probeCache(
  store: readonly CacheEntry[],
  cache: CacheSpec,
  versions: InputVersions,
  runIndex: number,
  retentionRuns: number | undefined,
): CacheProbe {
  const key = cacheKeyString(cache, versions);
  const entry = store.find(
    (candidate) =>
      candidate.key === key &&
      (retentionRuns === undefined || runIndex - candidate.savedAtRun <= retentionRuns),
  );
  if (entry === undefined) {
    return { hit: false, fresh: false };
  }
  const fresh = cache.invalidatedBy.every((id) => {
    const saved = entry.contentVersions.find((pair) => pair[0] === id);
    return (saved?.[1] ?? 0) === (versions[id] ?? 0);
  });
  return { hit: true, fresh };
}

function cacheEntryFor(cache: CacheSpec, versions: InputVersions, runIndex: number): CacheEntry {
  return {
    key: cacheKeyString(cache, versions),
    savedAtRun: runIndex,
    contentVersions: cache.invalidatedBy.map((id) => [id, versions[id] ?? 0] as const),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. MỘT LẦN THỬ MỘT THỰC THỂ
// ═══════════════════════════════════════════════════════════════════════════

interface AttemptResult {
  readonly record: AttemptRecord;
  readonly durationTicks: number;
  /** Sản phẩm các bước ĐÃ XANH tạo ra. Bước đỏ không tạo được gì. */
  readonly produced: readonly OutputId[];
  /** Mục cache cần ghi khi lần thử này kết thúc. */
  readonly cacheWrites: readonly CacheEntry[];
}

interface AttemptContext {
  readonly stage: StageSpec;
  readonly instance: InstanceKey;
  readonly commitId: CommitId;
  readonly pass: number;
  readonly attempt: number;
  readonly baseSeed: number;
  readonly startedTick: number;
  readonly availableOutputs: readonly OutputId[];
  readonly versions: InputVersions;
  readonly cacheStore: readonly CacheEntry[];
  readonly runIndex: number;
  readonly retentionRuns: number | undefined;
}

/**
 * Chạy MỘT lần thử của một thực thể stage.
 *
 * Mọi con xúc xắc được rút TRỌN MẢNG trước khi bước nào chạy — xem giải thích ở
 * `rng-keys.ts`. Rút dần theo bước đã chạy sẽ làm một lần đỏ sớm dịch xúc xắc
 * của mọi bước sau nó.
 *
 * Thứ tự ưu tiên nguyên nhân đỏ trong MỘT bước: `missing-output` → `stale-cache`
 * → `flake`. Hai cái đầu là đỏ THẬT và sẽ đỏ lại ở mọi lần thử; báo chúng trước
 * là điều làm bảng tổng kết nói đúng câu "bạn vừa đốt runner-phút để thử lại
 * một thứ không thử lại được" (bài C10). Ngược lại, một bước vừa hỏng cạnh phụ
 * thuộc vừa lỡ rơi vào đỏ giả mà bị báo là `flake` sẽ dạy đúng điều sai.
 */
function runAttempt(ctx: AttemptContext): AttemptResult {
  const steps = ctx.stage.steps;
  const drawBase = {
    pass: ctx.pass,
    commitId: ctx.commitId,
    instance: ctx.instance,
    attempt: ctx.attempt,
  } as const;
  const flakeRolls = rollsForKey(ctx.baseSeed, { ...drawBase, draw: 'flake' }, steps.length);
  const durationRolls = rollsForKey(ctx.baseSeed, { ...drawBase, draw: 'duration' }, steps.length);

  const records: StepRecord[] = [];
  const produced: OutputId[] = [];
  const cacheWrites: CacheEntry[] = [];
  let elapsed = 0;
  let failedStep: string | null = null;
  let cause: FailureCause | null = null;
  let outcome: AttemptOutcome = 'passed';

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) {
      continue;
    }

    const probe =
      step.cache === undefined
        ? null
        : probeCache(ctx.cacheStore, step.cache, ctx.versions, ctx.runIndex, ctx.retentionRuns);

    // Kẹp về `durationTicks`: một `savesTicks` lớn hơn cho ra thời lượng âm, và
    // thời lượng âm làm đường găng sai theo một cách không ai truy ra được.
    const saved =
      probe?.hit === true && probe.fresh
        ? Math.min(Math.max(0, step.cache?.savesTicks ?? 0), Math.max(0, step.durationTicks))
        : 0;
    const spread = Math.max(0, Math.trunc(step.durationSpreadTicks ?? 0));
    const roll = durationRolls[i] ?? 0;
    // Đều trên các số nguyên trong `[-spread, +spread]`. Dùng `Math.floor` trên
    // `2 * spread + 1` mốc chứ không `Math.round` một số thực: làm tròn cho hai
    // mốc biên nửa xác suất của các mốc giữa, và một phân bố lệch ở hai đầu là
    // thứ không ai để ý cho tới khi đi cân bằng level.
    const offset = spread === 0 ? 0 : Math.floor(roll * (2 * spread + 1)) - spread;
    const duration = Math.max(0, Math.max(0, step.durationTicks) - saved + offset);

    const missing = (step.requires ?? []).find((id) => !ctx.availableOutputs.includes(id));
    const flakeRoll = flakeRolls[i] ?? 1;
    const flaked = step.flake !== undefined && flakeRoll < step.flake.rate;

    let stepCause: FailureCause | null = null;
    if (missing !== undefined) {
      stepCause = { kind: 'missing-output', output: missing, step: step.id };
    } else if (probe?.hit === true && !probe.fresh && step.cache !== undefined) {
      stepCause = { kind: 'stale-cache', cache: step.cache.id, step: step.id };
    } else if (flaked && step.flake !== undefined) {
      stepCause = { kind: 'flake', nature: step.flake.nature };
    }

    const stepOutcome: AttemptOutcome = stepCause === null ? 'passed' : 'failed';
    records.push({
      id: step.id,
      durationTicks: duration,
      outcome: stepOutcome,
      cacheHit: probe === null ? null : probe.hit,
      // ⛔ CHỈ mang giá trị khi bước đỏ VÌ ngẫu nhiên. Một bước xanh sau khi rút
      // trượt ngưỡng flake vẫn là `null`: trường này trả lời "đỏ giả loại nào",
      // không phải "bước này có khai flake không".
      flakeNature: stepCause?.kind === 'flake' ? stepCause.nature : null,
    });
    elapsed += duration;

    if (stepOutcome === 'passed') {
      produced.push(...(step.produces ?? []));
      // Cache chỉ được lưu khi bước XANH. Lưu sau một bước đỏ là lưu một sản
      // phẩm dở dang rồi phát nó cho commit sau — một nguồn đỏ mà không bài học
      // nào trong 28 level muốn dạy.
      if (step.cache !== undefined && probe?.hit === false) {
        cacheWrites.push(cacheEntryFor(step.cache, ctx.versions, ctx.runIndex));
      }
      continue;
    }

    if (failedStep === null) {
      failedStep = step.id;
    }
    if (step.blocking) {
      outcome = 'failed';
      cause = stepCause;
      // Các bước sau KHÔNG chạy, nên chúng KHÔNG có mặt trong `steps`. Hợp đồng
      // nói rõ: đừng suy số bước đã chạy từ spec.
      break;
    }
    // `blocking: false` — bước đỏ nhưng stage đi tiếp (lint chỉ cảnh báo). Chú ý
    // nghĩa ĐẢO so với khoá quen thuộc của nhà cung cấp.
  }

  return {
    record: {
      attempt: ctx.attempt,
      startedTick: ctx.startedTick,
      finishedTick: ctx.startedTick + elapsed,
      outcome,
      cause,
      failedStep,
      steps: records,
    },
    durationTicks: elapsed,
    produced,
    cacheWrites,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. VÒNG XẾP LỊCH
// ═══════════════════════════════════════════════════════════════════════════

type LiveState = 'waiting' | 'ready' | 'running' | 'done';

interface LiveInstance {
  readonly runIndex: number;
  readonly commitId: CommitId;
  readonly arrivalTick: number;
  readonly stage: StageSpec;
  readonly instance: InstanceKey;
  readonly fanOutIndex: number | null;
  readonly slots: number;
  readonly deps: readonly StageId[];
  readonly transitive: readonly StageId[];
  state: LiveState;
  /**
   * Tick mọi phụ thuộc đã xong. Đây là giá trị đi vào bản ghi.
   */
  readyTick: number;
  /**
   * Khoá sắp xếp hàng đợi. Bằng `readyTick` ở lần thử đầu, và nhảy lên tick
   * hiện tại ở mỗi lần thử lại.
   *
   * ⚠ Tách khỏi `readyTick` có lý do: hợp đồng đặt tên khoá thứ nhất là
   * `readyTick`, nhưng nếu một lần thử lại giữ nguyên `readyTick` gốc thì nó
   * mang theo quyền ưu tiên của quá khứ và chen vĩnh viễn trước mọi thực thể
   * sẵn sàng sau nó — một stage `retries: 3` ở level chật máy sẽ bỏ đói cả
   * đường ống. Bản ghi vẫn ghi `readyTick` đúng nghĩa hợp đồng.
   */
  queueTick: number;
  startedTick: number;
  finishedTick: number;
  blockedBy: BlockedBy;
  runnerTicks: number;
  outcome: AttemptOutcome;
  attempts: AttemptRecord[];
  outputs: OutputId[];
  pending: { readonly finishAt: number; readonly result: AttemptResult } | null;
}

/** Vòng chặn. Một level hợp lệ không bao giờ chạm tới; chạm tức là có bug. */
const MAX_TICKS = 5_000_000;

/**
 * Một lượt mô phỏng: mọi commit, một hạt giống dẫn xuất từ `(baseSeed, pass)`.
 *
 * Giả định vào: `validateWorkflow` đã xanh. Gọi thẳng hàm này với một workflow
 * có chu trình sẽ không treo (vòng chặn `MAX_TICKS` đỡ), nhưng bản ghi trả về
 * vô nghĩa — dùng `evaluate()` nếu không chắc.
 */
export function simulatePass(
  workflow: WorkflowSpec,
  workload: WorkloadSpec,
  baseSeed: number,
  pass: number,
): PassRecord {
  const stages = sortedStages(workflow);
  const commits = resolveCommits(workload);
  const live: LiveInstance[] = [];

  workload.commits.forEach((commit, runIndex) => {
    for (const stage of stages) {
      for (const expanded of expandStage(stage)) {
        live.push({
          runIndex,
          commitId: commit.id,
          arrivalTick: Math.max(0, Math.trunc(commit.tick)),
          stage,
          instance: expanded.instance,
          fanOutIndex: expanded.fanOutIndex,
          slots: Math.max(0, Math.trunc(stage.runnerSlots ?? 1)),
          deps: [...stage.dependsOn].sort(compareAscii),
          transitive: transitiveDeps(stages, stage.id),
          state: 'waiting',
          readyTick: 0,
          queueTick: 0,
          startedTick: 0,
          finishedTick: 0,
          blockedBy: { kind: 'none' },
          runnerTicks: 0,
          outcome: 'passed',
          attempts: [],
          outputs: [],
          pending: null,
        });
      }
    }
  });

  const busy: Record<RunnerClassId, number> = {};
  for (const pool of workload.runners) {
    busy[pool.id] = 0;
  }
  let cacheStore: readonly CacheEntry[] = [];

  let tick = 0;
  let guard = 0;
  /**
   * Thực thể vừa NHẢ chỗ ở tick hiện tại, để nhánh `runner` của `blockedBy`
   * gọi đúng tên kẻ giữ máy.
   *
   * `commitId` được mang theo sẵn ở đây dù `BlockedBy.runner` của hợp đồng hôm
   * nay chưa có trường đó: trong một lượt mô phỏng nhiều commit, kẻ giữ máy
   * thường thuộc commit TRƯỚC, mà `InstanceKey` không mang `commitId` nên khoá
   * đó trỏ ra ngoài `RunRecord.instances` của chính thực thể đang chờ. Lead
   * đang thêm trường vào nhánh `runner`; khi nó lên, chỗ ghi ở
   * `resolveBlockedBy` chỉ thêm đúng một dòng.
   */
  let freedThisTick: {
    runnerClass: RunnerClassId;
    instance: InstanceKey;
    runIndex: number;
    commitId: CommitId;
  }[] = [];

  /**
   * Một vòng lắng ở tick hiện tại: hoàn tất → cập nhật sẵn sàng → cấp máy.
   * Trả `true` khi không còn gì đổi.
   *
   * ⚠ Phải lắng LẶP LẠI chứ không một vòng. Bước 0 tick là hợp lệ (một cổng
   * kiểm tra tức thời, hay cả stage chỉ toàn bước như vậy), nên một thực thể có
   * thể xong ở ĐÚNG tick nó bắt đầu, mở khoá thực thể sau, thực thể sau lại
   * xong ngay, và cứ thế. Lắng một vòng rồi nhảy tick sẽ treo cả chuỗi đó vĩnh
   * viễn: hàm nhảy tick chỉ nhìn `finishAt > tick`, mà chuỗi này không có cái
   * nào.
   */
  const settleTick = (): boolean => {
    let changed = false;

    // ── 1. Hoàn tất ─────────────────────────────────────────────────────────
    for (const item of sortedForScheduling(live.filter((x) => x.pending?.finishAt === tick))) {
      changed = true;
      const pending = item.pending;
      if (pending === null) {
        continue;
      }
      busy[item.stage.runnerClass] = Math.max(0, (busy[item.stage.runnerClass] ?? 0) - item.slots);
      freedThisTick.push({
        runnerClass: item.stage.runnerClass,
        instance: item.instance,
        runIndex: item.runIndex,
        commitId: item.commitId,
      });
      item.attempts.push(pending.result.record);
      item.outputs.push(...pending.result.produced);
      cacheStore = applyCacheWrites(cacheStore, pending.result.cacheWrites);
      item.pending = null;

      const failed = pending.result.record.outcome === 'failed';
      const canRetry = failed && item.attempts.length <= Math.max(0, item.stage.retries);
      if (canRetry) {
        // Thử lại ở tầng STAGE: nó nhả máy rồi xếp hàng lại từ đầu, và lần thử
        // mới đốt ĐÚNG `runnerTicks` của cả stage. Đó là điều làm "đặt retry
        // khắp nơi cho chắc" thành một chiến lược thua điểm đo được.
        item.state = 'ready';
        item.queueTick = Math.max(item.queueTick, tick);
        continue;
      }
      item.state = 'done';
      item.outcome = pending.result.record.outcome;
      item.finishedTick = tick;
    }

    // ── 2. Cập nhật sẵn sàng ────────────────────────────────────────────────
    for (const item of live) {
      if (item.state !== 'waiting') {
        continue;
      }
      const depInstances = live.filter(
        (other) => other.runIndex === item.runIndex && item.deps.includes(other.stage.id),
      );
      if (depInstances.some((dep) => dep.state !== 'done')) {
        continue;
      }
      const depFinished = depInstances.reduce((max, dep) => Math.max(max, dep.finishedTick), 0);
      const ready = Math.max(item.arrivalTick, depFinished);
      if (ready > tick) {
        continue;
      }
      changed = true;
      item.readyTick = ready;
      item.queueTick = ready;

      // Một stage phụ thuộc đã đỏ VÀ nó `blocking` ⇒ thực thể này không chạy.
      // Ghi thành một lần thử đỏ mang `upstream-failed` chứ không phải `skipped`:
      // hợp đồng bắt `cause` phải `null` khi `outcome !== 'failed'`, nên gọi nó
      // là `skipped` sẽ vứt mất đúng thông tin bảng tổng kết cần. Nó KHÔNG thử
      // lại — thử lại một thứ chưa từng chạy chỉ đốt máy.
      const blocker = depInstances
        .filter((dep) => dep.outcome === 'failed' && dep.stage.blocking)
        .sort((a, b) => compareAscii(a.instance, b.instance))[0];
      if (blocker !== undefined) {
        item.state = 'done';
        item.outcome = 'failed';
        item.startedTick = ready;
        item.finishedTick = ready;
        item.blockedBy = { kind: 'dependency', instance: blocker.instance };
        item.attempts.push({
          attempt: 0,
          startedTick: ready,
          finishedTick: ready,
          outcome: 'failed',
          cause: { kind: 'upstream-failed', stage: blocker.stage.id },
          failedStep: null,
          steps: [],
        });
        continue;
      }
      item.state = 'ready';
    }

    // ── 3. Cấp máy ──────────────────────────────────────────────────────────
    const blockedClasses: RunnerClassId[] = [];
    for (const item of sortedForScheduling(live.filter((x) => x.state === 'ready'))) {
      const cls = item.stage.runnerClass;
      if (blockedClasses.includes(cls)) {
        continue;
      }
      const pool = workload.runners.find((candidate) => candidate.id === cls);
      const free = (pool?.count ?? 0) - (busy[cls] ?? 0);
      if (item.slots > free) {
        // Chặn đầu hàng có chủ ý: một stage đòi nhiều slot sẽ KHÔNG bị các stage
        // nhỏ hơn chen mãi. Cho chen là mời một stage rộng đói vô hạn ở level có
        // dàn máy chật, và người chơi sẽ đọc ra "game bị treo" chứ không đọc ra
        // "dàn máy quá nhỏ".
        blockedClasses.push(cls);
        continue;
      }

      const attempt = item.attempts.length;
      const result = runAttempt({
        stage: item.stage,
        instance: item.instance,
        commitId: item.commitId,
        pass,
        attempt,
        baseSeed,
        startedTick: tick,
        availableOutputs: availableOutputsFor(live, item),
        versions: commits[item.runIndex]?.versions ?? {},
        cacheStore,
        runIndex: item.runIndex,
        retentionRuns: workload.cacheRetentionRuns,
      });

      if (attempt === 0) {
        item.startedTick = tick;
        item.blockedBy = resolveBlockedBy(item, tick, freedThisTick, live);
      }
      busy[cls] = (busy[cls] ?? 0) + item.slots;
      item.runnerTicks += item.slots * result.durationTicks;
      item.state = 'running';
      item.pending = { finishAt: tick + result.durationTicks, result };
      changed = true;
    }

    return !changed;
  };

  while (live.some((item) => item.state !== 'done') && guard < MAX_TICKS) {
    guard += 1;
    freedThisTick = [];
    let settled = false;
    while (!settled && guard < MAX_TICKS) {
      guard += 1;
      settled = settleTick();
    }

    // ── 4. Nhảy tới sự kiện kế ──────────────────────────────────────────────
    const next = nextEventTick(live, tick);
    if (next === null) {
      break;
    }
    tick = next;
  }

  return assemblePass(pass, workload, commits, live);
}

/** Thứ tự hàng đợi — LUẬT 2 của hợp đồng, đúng năm khoá `QUEUE_ORDER_KEYS`. */
function sortedForScheduling(items: readonly LiveInstance[]): readonly LiveInstance[] {
  return [...items].sort((a, b) => {
    // Khoá 1 của `QUEUE_ORDER_KEYS` là `readyTick`; ở đây là `queueTick`, bằng
    // `readyTick` ở lần thử đầu và nhảy lên hiện tại ở mỗi lần thử lại. Xem
    // giải thích tại `LiveInstance.queueTick`.
    if (a.queueTick !== b.queueTick) {
      return a.queueTick - b.queueTick;
    }
    if (a.arrivalTick !== b.arrivalTick) {
      return a.arrivalTick - b.arrivalTick;
    }
    const byCommit = compareAscii(a.commitId, b.commitId);
    if (byCommit !== 0) {
      return byCommit;
    }
    // ⚠ `stageId`, KHÔNG phải vị trí trong `WorkflowSpec.stages`. Nếu vị trí
    // mảng đi vào luật thì một vòng đọc-ghi YAML sắp lại stage sẽ đổi điểm của
    // người chơi mà không đổi một chữ nào trong ý nghĩa workflow.
    const byStage = compareAscii(a.stage.id, b.stage.id);
    if (byStage !== 0) {
      return byStage;
    }
    return (a.fanOutIndex ?? -1) - (b.fanOutIndex ?? -1);
  });
}

/**
 * Sản phẩm một thực thể nhìn thấy: do các stage nó phụ thuộc BẮC CẦU tạo ra,
 * trong CÙNG lượt chạy, ở những bước đã xanh.
 */
function availableOutputsFor(
  live: readonly LiveInstance[],
  item: LiveInstance,
): readonly OutputId[] {
  const out: OutputId[] = [];
  for (const other of live) {
    if (other.runIndex !== item.runIndex || !item.transitive.includes(other.stage.id)) {
      continue;
    }
    for (const output of other.outputs) {
      if (!out.includes(output)) {
        out.push(output);
      }
    }
  }
  return out.sort(compareAscii);
}

/**
 * Vì sao thực thể không chạy ngay lúc `readyTick`. GHI, không suy.
 *
 * `blockedBy` là ràng buộc **QUYẾT ĐỊNH `startedTick`**, không phải "lý do
 * không chạy ngay lúc `readyTick`" (quyết định của lead, 2026-09-16):
 *
 * - Bắt đầu muộn hơn `readyTick` ⇒ nó chờ MÁY, và kẻ giữ chỗ là thực thể vừa
 *   nhả slot đúng ở tick này (ưu tiên cùng lượt chạy, rồi mã đơn vị nhỏ hơn).
 * - Bắt đầu đúng `readyTick` mà CÓ phụ thuộc ⇒ nó chờ PHỤ THUỘC, và kẻ giữ nó
 *   là phụ thuộc XONG MUỘN NHẤT (không phải phần tử đầu trong `dependsOn` —
 *   thứ tự đó là thứ tự người chơi gõ, còn thứ quyết định `readyTick` là cái
 *   xong sau cùng). Hoà thì lấy `InstanceKey` nhỏ nhất theo mã đơn vị.
 * - Không phụ thuộc gì và có máy ngay ⇒ không chờ ai.
 *
 * ⚠ Đọc sát chữ chú thích CŨ của hợp đồng ("lý do nó không chạy ngay lúc
 * `readyTick`") thì một thực thể chạy đúng `readyTick` luôn là `none`, nên
 * nhánh `dependency` không bao giờ xuất hiện và chuỗi đi ngược của A.7 đứt ở
 * mọi thực thể không phải chờ máy. Điều kiện ở đây vì thế là "CÓ phụ thuộc",
 * không phải "`readyTick > arrivalTick`": một phụ thuộc 0 tick xong đúng lúc
 * commit tới vẫn là một cạnh thật của đường găng.
 *
 * Hai nhánh đầu là hai loại cạnh khác nhau trên đường găng (`DagEdgeView.
 * resourceEdge`). Tô sáng một đoạn chờ-máy như thể nó là phụ thuộc sẽ dạy sai:
 * người chơi đi sửa đồ thị trong khi thứ phải sửa là số máy.
 */
function resolveBlockedBy(
  item: LiveInstance,
  tick: number,
  freed: readonly {
    runnerClass: RunnerClassId;
    instance: InstanceKey;
    runIndex: number;
    commitId: CommitId;
  }[],
  live: readonly LiveInstance[],
): BlockedBy {
  if (tick > item.readyTick) {
    const candidates = freed
      .filter((entry) => entry.runnerClass === item.stage.runnerClass)
      .sort((a, b) => {
        if (a.runIndex !== b.runIndex) {
          return a.runIndex === item.runIndex ? -1 : b.runIndex === item.runIndex ? 1 : 0;
        }
        return compareAscii(a.instance, b.instance);
      });
    const holder = candidates[0];
    if (holder !== undefined) {
      // ⚠ `commitId` là commit của thực thể ĐANG GIỮ máy, KHÔNG phải của thực
      // thể đang chờ. Trong một lượt mô phỏng nhiều commit, kẻ giữ máy thường
      // thuộc commit TRƯỚC, mà `InstanceKey` không mang `commitId` — thiếu
      // trường này thì khoá trỏ ra ngoài `RunRecord.instances` của chính nó và
      // đường găng cụt đúng ở những level dạy thông lượng.
      return {
        kind: 'runner',
        instance: holder.instance,
        runnerClass: item.stage.runnerClass,
        commitId: holder.commitId,
      };
    }
  }

  if (item.deps.length > 0) {
    const deps = live
      .filter(
        (other) => other.runIndex === item.runIndex && item.deps.includes(other.stage.id),
      )
      .sort((a, b) => {
        if (a.finishedTick !== b.finishedTick) {
          return b.finishedTick - a.finishedTick;
        }
        return compareAscii(a.instance, b.instance);
      });
    const last = deps[0];
    if (last !== undefined) {
      return { kind: 'dependency', instance: last.instance };
    }
  }

  return { kind: 'none' };
}

function applyCacheWrites(
  store: readonly CacheEntry[],
  writes: readonly CacheEntry[],
): readonly CacheEntry[] {
  let out = store;
  for (const entry of writes) {
    out = [...out.filter((candidate) => candidate.key !== entry.key), entry];
  }
  return out;
}

/**
 * Tick sự kiện kế tiếp. `null` = không còn gì có thể tiến triển.
 *
 * Nhảy theo sự kiện chứ không nhích từng tick: một level có bước hàng trăm tick
 * nhân 20 lượt nhân 28 level thì nhích từng tick biến bộ test thành thứ không
 * ai chạy — và một bộ test không ai chạy là một cổng không gác gì.
 */
function nextEventTick(live: readonly LiveInstance[], tick: number): number | null {
  let next = Number.POSITIVE_INFINITY;
  for (const item of live) {
    if (item.pending !== null && item.pending.finishAt > tick) {
      next = Math.min(next, item.pending.finishAt);
    }
    if (item.state === 'waiting' && item.arrivalTick > tick) {
      next = Math.min(next, item.arrivalTick);
    }
  }
  return Number.isFinite(next) ? next : null;
}

function assemblePass(
  pass: number,
  workload: WorkloadSpec,
  commits: readonly { readonly changed: readonly InputId[] }[],
  live: readonly LiveInstance[],
): PassRecord {
  const runs: RunRecord[] = workload.commits.map((commit, runIndex) => {
    const instances: StageInstanceRecord[] = live
      .filter((item) => item.runIndex === runIndex)
      .sort((a, b) => {
        const byStage = compareAscii(a.stage.id, b.stage.id);
        return byStage !== 0 ? byStage : (a.fanOutIndex ?? -1) - (b.fanOutIndex ?? -1);
      })
      .map((item) => ({
        instance: item.instance,
        stageId: item.stage.id,
        fanOutIndex: item.fanOutIndex,
        readyTick: item.readyTick,
        startedTick: item.startedTick,
        finishedTick: item.finishedTick,
        attempts: item.attempts,
        blockedBy: item.blockedBy,
        runnerTicks: item.runnerTicks,
      }));
    const arrivalTick = Math.max(0, Math.trunc(commit.tick));
    return {
      commitId: commit.id,
      arrivalTick,
      finishedTick: instances.reduce((max, one) => Math.max(max, one.finishedTick), arrivalTick),
      instances,
      changedInputs: commits[runIndex]?.changed ?? [],
    };
  });

  return {
    pass,
    runs,
    finishedTick: runs.reduce((max, run) => Math.max(max, run.finishedTick), 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LẦN CHẤM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chạy `evaluation.passes` lượt mô phỏng và trả bản ghi đem đi chấm.
 *
 * Cùng `(WorkflowSpec, WorkloadSpec, baseSeed)` ⇒ cùng `EvaluationRecord`, qua
 * 1000 lượt, ở cả trình duyệt lẫn Node (AC-3). Bản ghi KHÔNG mang điểm: điểm là
 * một phép chiếu phụ thuộc ngưỡng của level, và một bản ghi mang sẵn điểm sẽ
 * nói dối ngay khi ngưỡng đổi — mà bản ghi thì được lưu còn ngưỡng thì được sửa.
 *
 * Workflow hỏng ⇒ `error` khác `null` và `passes` RỖNG. Không có điểm từng phần
 * cho một workflow không chạy được.
 */
export function evaluate(
  workflow: WorkflowSpec,
  workload: WorkloadSpec,
  evaluation: EvaluationSpec,
): EvaluationRecord {
  const error = validateWorkflow(workflow, workload);
  if (error !== null) {
    return { baseSeed: evaluation.baseSeed, error, passes: [] };
  }

  const total = Number.isFinite(evaluation.passes) ? Math.max(1, Math.trunc(evaluation.passes)) : 1;
  const passes: PassRecord[] = [];
  for (let pass = 0; pass < total; pass += 1) {
    passes.push(simulatePass(workflow, workload, evaluation.baseSeed, pass));
  }
  return { baseSeed: evaluation.baseSeed, error: null, passes };
}
