/**
 * Bộ mô phỏng **phát hành** của game Đường ống CI/CD — 19.B.4 chiến lược · B.5
 * mét-ric canary · B.6 lùi hay tiến.
 *
 * Đặc tả là `cd-contract.ts` §1 (luật R1–R6) và §4 (chữ ký). File này KHÔNG đọc
 * `engine.ts`, không đọc `gitops.ts` hay `masking.ts`: ba bộ mô phỏng CD là ba hàm
 * thuần độc lập, tầng chấm mới là chỗ gom chúng lại.
 *
 * ## Mọi thời gian là GIÂY NGUYÊN
 *
 * Tick 10 giây của chương CI không viết được "đổi bộ chọn mất 3 giây" — nó thành
 * 0, và thứ tự blue-green < canary của AC-B biến mất vì làm tròn chứ không vì cơ
 * chế. Nên mọi phép tính ở đây là giây, và dữ liệu vào bị buộc là số nguyên.
 *
 * ## Bốn chỗ hợp đồng không viết thành chữ, và vì sao đọc như dưới đây
 *
 * **1. Canary thăng hạng: "số máy cũ còn lại" = `instances − số máy canary`.**
 *    Đội máy cuối lượt phải đúng `instances` máy. Máy canary là máy bản MỚI và ở
 *    lại, nên chúng chính là đợt đầu của một lượt rolling có `batchSize = số máy
 *    canary`. Đọc "còn lại" thành cả `instances` máy thì cuối lượt đội máy dư ra
 *    đúng bằng số máy canary — một đội máy không ai khai. Đây cũng là cách duy
 *    nhất để "`peakInstances = instances + số máy canary` suốt cả lượt" đúng.
 *    Hợp đồng không nhắc một bước đổi trọng số lên 100% khi thăng hạng, nên không
 *    có bước đó: lưu lượng theo máy như ở rolling.
 *
 * **2. Một nhóm KHÔNG có request nào trên cả cửa sổ ⇒ thăng hạng.** Lưu lượng
 *    nhỏ và trọng số nhỏ làm `round(rps × intervalSeconds × weight)` ra 0. Khi đó
 *    không có tỷ lệ lỗi nào để lấy hiệu, nên câu "hiệu vượt ngưỡng" không khẳng
 *    định được, và R3 nói "ngược lại ⇒ thăng hạng". Viết thành một nhánh tường
 *    minh chứ không để `0 / 0 = NaN` tự trượt qua phép so: kết cục giống nhau,
 *    nhưng một `NaN` im lặng là thứ người sau không đọc ra được. Đó là ca cực đoan
 *    của bài C21 — không có mẫu thì không có tín hiệu, bản tệ đến mấy cũng lọt.
 *
 * **3. `z` là tổng Irwin–Hall của 12 lần rút, trừ 6 — KHÔNG phải Box–Muller.**
 *    Bản đầu dùng Box–Muller (`sqrt(−2·ln(1 − u₁))·cos(2π·u₂)`), đúng chữ hợp đồng
 *    lúc đó. Lead đổi 2026-09-17 vì `Math.log`/`Math.cos` nằm trong danh sách hàm
 *    ECMAScript cho phép "xấp xỉ theo hiện thực": V8 (Node, nơi máy chủ chấm lại
 *    bài OJ) và JavaScriptCore (Safari, nơi người chơi chơi) được phép lệch nhau
 *    một ulp. Lệch đó rơi đúng mốc `.5` của `round` là đủ để hai nơi ra hai số lỗi
 *    khác nhau, tức hai verdict khác nhau cho cùng một bài — đúng thứ ràng buộc 2
 *    của `contract.ts` cấm.
 *
 *    Irwin–Hall chỉ CỘNG: mỗi `u` là `uint32 / 2³²` (số nhị phân hữu hạn), tổng 12
 *    số như vậy nhỏ hơn 12 nên biểu diễn CHÍNH XÁC trong số thực 64-bit, ở mọi
 *    engine. Phương sai của một `u` là 1/12, nên tổng 12 cái có phương sai đúng 1
 *    — một xấp xỉ chuẩn đủ tốt cho mục đích dạy (miền kẹp `[−6, 6]`, không có đuôi
 *    dài, và R4 đằng nào cũng kẹp số lỗi về `[0, n]`). `Math.sqrt` ở công thức R4
 *    thì KHÔNG nằm trong danh sách xấp xỉ: nó là phép cơ bản của IEEE 754, làm
 *    tròn đúng ở mọi nơi.
 *
 * **4. Rút bản ứng viên ⇒ `finishedAtSecond = recoveredAtSecond`.** Trường đó khai
 *    "thay xong, hoặc phục hồi xong", và "phục hồi xong" chính là mốc
 *    `recoveredAtSecond` — kể cả với `'rollback-blocked'`, nơi lùi xong mà dữ liệu
 *    hỏng thì chưa phục hồi gì cả.
 *
 * ## Dữ liệu ngoài miền thì NÉM, không kẹp
 *
 * `ReleaseRecord.error` chỉ có một loại: thiếu tham số của chiến lược. Một
 * `batchSize` bằng 0 hay một `weightPercent` bằng 80 không có chỗ trong union đó,
 * và kẹp về miền hợp lệ là chấm một bài bằng tham số người chơi chưa từng chọn —
 * đúng lý do hợp đồng coi thiếu tham số là lỗi cứng. Nên ở đây ném `RangeError`
 * kèm tên trường. Tham số của chiến lược KHÔNG được chọn thì bị bỏ qua, nên cũng
 * không bị kiểm.
 *
 * ## Nhân trước, chia sau
 *
 * `50 × 0.29 = 14.499999999999998` trong số thực nhị phân, còn `(50 × 29) / 100 =
 * 14.5`. Qua `round`, cái trước ra 14 request, cái sau ra 15. Số request là số
 * đếm, nên phép quy đổi phần trăm nhân tử số trước rồi mới chia — cùng quy ước
 * với `score.ts`.
 */

import { RELEASE_STRATEGIES } from './contract.ts';
import { BAD_RELEASE_RESPONSES, MIGRATION_KINDS } from './cd-contract.ts';
import type {
  BadReleaseResponse,
  CanaryIntervalRecord,
  CanaryPolicy,
  MigrationKind,
  ReleaseEvaluationSpec,
  ReleaseOutcome,
  ReleasePassRecord,
  ReleasePolicy,
  ReleaseRecord,
  ReleaseScenario,
  RollingPolicy,
} from './cd-contract.ts';
import { hashDrawKey } from './rng-keys.ts';
import { nextFloat, seedRng } from '../core/rng.ts';

const PERCENT = 100;
/** Miền của `CanaryPolicy.weightPercent`, chép từ lời khai ở `cd-contract.ts`. */
const MIN_CANARY_WEIGHT_PERCENT = 1;
const MAX_CANARY_WEIGHT_PERCENT = 50;

// ═══════════════════════════════════════════════════════════════════ kiểm miền

function rejectValue(field: string, expected: string, value: unknown): never {
  throw new RangeError(`simulateRelease: ${field} phải là ${expected}, nhận ${String(value)}`);
}

function requireInteger(field: string, value: number, min: number, max?: number): void {
  const inRange = Number.isInteger(value) && value >= min && (max === undefined || value <= max);
  if (!inRange) {
    rejectValue(
      field,
      max === undefined ? `số nguyên ≥ ${min}` : `số nguyên trong [${min}, ${max}]`,
      value,
    );
  }
}

function requireFraction(field: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    rejectValue(field, 'phân số trong [0, 1]', value);
  }
}

function requireMember(field: string, value: string, allowed: readonly string[]): void {
  if (!allowed.includes(value)) {
    rejectValue(field, `một trong ${allowed.join(' | ')}`, value);
  }
}

function validateScenario(scenario: ReleaseScenario): void {
  requireInteger('scenario.instances', scenario.instances, 1);
  if (!Number.isFinite(scenario.requestsPerSecond) || scenario.requestsPerSecond < 1) {
    rejectValue('scenario.requestsPerSecond', 'số hữu hạn ≥ 1', scenario.requestsPerSecond);
  }
  requireFraction('scenario.baselineErrorRate', scenario.baselineErrorRate);
  requireFraction('scenario.candidateErrorRate', scenario.candidateErrorRate);
  requireInteger('scenario.replaceSeconds', scenario.replaceSeconds, 1);
  requireInteger('scenario.switchSeconds', scenario.switchSeconds, 1);
  requireInteger('scenario.routeSeconds', scenario.routeSeconds, 1);
  requireInteger('scenario.alertSeconds', scenario.alertSeconds, 1);
  requireMember('scenario.migration', scenario.migration, MIGRATION_KINDS);
  requireInteger('scenario.fixForwardSeconds', scenario.fixForwardSeconds, 1);
}

// ═══════════════════════════════════════════════════ tham số theo chiến lược

type StrategyParams =
  | { readonly strategy: 'rolling'; readonly rolling: RollingPolicy }
  | { readonly strategy: 'blue-green' }
  | { readonly strategy: 'canary'; readonly canary: CanaryPolicy };

/** `null` = chính sách thiếu phần của chiến lược nó chọn. Phần của chiến lược khác bị bỏ qua. */
function resolveStrategyParams(policy: ReleasePolicy): StrategyParams | null {
  switch (policy.strategy) {
    case 'rolling':
      return policy.rolling === undefined ? null : { strategy: 'rolling', rolling: policy.rolling };
    case 'blue-green':
      return { strategy: 'blue-green' };
    case 'canary':
      return policy.canary === undefined ? null : { strategy: 'canary', canary: policy.canary };
  }
}

function validateStrategyParams(params: StrategyParams, scenario: ReleaseScenario): void {
  switch (params.strategy) {
    case 'rolling':
      requireInteger('policy.rolling.batchSize', params.rolling.batchSize, 1, scenario.instances);
      return;
    case 'blue-green':
      return;
    case 'canary':
      requireInteger(
        'policy.canary.weightPercent',
        params.canary.weightPercent,
        MIN_CANARY_WEIGHT_PERCENT,
        MAX_CANARY_WEIGHT_PERCENT,
      );
      requireInteger('policy.canary.intervalSeconds', params.canary.intervalSeconds, 1);
      requireInteger('policy.canary.intervals', params.canary.intervals, 1);
      requireFraction('policy.canary.maxErrorRateDelta', params.canary.maxErrorRateDelta);
      return;
  }
}

// ═══════════════════════════════════════════════════════════ một lượt thay

/** Bản xấu ⇔ tỷ lệ lỗi thật của ứng viên CAO HƠN bản đang chạy. Không vùng xám. */
export function isBadCandidate(scenario: ReleaseScenario): boolean {
  return scenario.candidateErrorRate > scenario.baselineErrorRate;
}

/**
 * Chiến lược quyết gì, TRƯỚC khi áp lựa chọn lùi/tiến của người chơi (R5).
 * `rollbackSeconds` là độ dài thao tác lùi của RIÊNG chiến lược — R5 mới quyết nó
 * có được dùng hay không.
 */
type Decision =
  | { readonly kind: 'promote'; readonly finishedAtSecond: number }
  | {
      readonly kind: 'withdraw';
      readonly backoutAtSecond: number;
      readonly rollbackSeconds: number;
    };

interface Rollout {
  readonly intervals: readonly CanaryIntervalRecord[];
  readonly exposedAtSecond: number;
  readonly peakInstances: number;
  readonly decision: Decision;
}

/**
 * R1. Lùi tỷ lệ với số đợt ĐÃ BẮT ĐẦU — đó là phần "cơ chế" của AC-B: thêm máy
 * thì lùi rolling dài ra, còn một thao tác định tuyến thì không.
 */
function rollingRollout(scenario: ReleaseScenario, rolling: RollingPolicy): Rollout {
  const { instances, replaceSeconds } = scenario;
  const batches = Math.ceil(instances / rolling.batchSize);
  const exposedAtSecond = replaceSeconds;
  const peakInstances = instances + rolling.batchSize;
  if (!isBadCandidate(scenario)) {
    return {
      intervals: [],
      exposedAtSecond,
      peakInstances,
      decision: { kind: 'promote', finishedAtSecond: batches * replaceSeconds },
    };
  }
  const backoutAtSecond = exposedAtSecond + scenario.alertSeconds;
  // Đợt k bắt đầu ở giây `k × replaceSeconds`, nên cảnh báo rơi đúng giây đó thì
  // đợt k ĐÃ bắt đầu — `floor + 1`, không phải `ceil`.
  const batchesStarted = Math.min(batches, Math.floor(backoutAtSecond / replaceSeconds) + 1);
  return {
    intervals: [],
    exposedAtSecond,
    peakInstances,
    decision: {
      kind: 'withdraw',
      backoutAtSecond,
      rollbackSeconds: batchesStarted * replaceSeconds,
    },
  };
}

/** R2. Môi trường cũ còn nguyên, nên lùi chỉ là đổi bộ chọn về. */
function blueGreenRollout(scenario: ReleaseScenario): Rollout {
  const exposedAtSecond = scenario.replaceSeconds + scenario.switchSeconds;
  const peakInstances = 2 * scenario.instances;
  if (!isBadCandidate(scenario)) {
    return {
      intervals: [],
      exposedAtSecond,
      peakInstances,
      decision: { kind: 'promote', finishedAtSecond: exposedAtSecond },
    };
  }
  return {
    intervals: [],
    exposedAtSecond,
    peakInstances,
    decision: {
      kind: 'withdraw',
      backoutAtSecond: exposedAtSecond + scenario.alertSeconds,
      rollbackSeconds: scenario.switchSeconds,
    },
  };
}

type TrafficGroup = 'canary' | 'baseline';

/** Khoá rút của R4 — một phần của hợp đồng hành vi, đổi dấu phân tách là đổi mọi kết quả. */
function releaseDrawKey(
  baseSeed: number,
  pass: number,
  index: number,
  group: TrafficGroup,
): string {
  return `${baseSeed}|release|${pass}|${index}|${group}`;
}

/** Số lần rút của tổng Irwin–Hall. 12 ⇒ phương sai đúng 1. Đổi số này là đổi mọi kết quả. */
const IRWIN_HALL_DRAWS = 12;

/** Tổng Irwin–Hall ở đầu file (điểm 3). Mười hai lần rút liên tiếp từ dòng của đúng một khoá. */
function standardNormalForKey(key: string): number {
  let state = seedRng(hashDrawKey(key));
  let sum = 0;
  for (let i = 0; i < IRWIN_HALL_DRAWS; i += 1) {
    const draw = nextFloat(state);
    sum += draw.value;
    state = draw.state;
  }
  return sum - IRWIN_HALL_DRAWS / 2;
}

/**
 * R4. Xấp xỉ chuẩn của nhị thức `(n, p)`, kẹp về `[0, n]`.
 *
 * `Math.max(0, …)` đứng TRONG `Math.min`: `round(−0.3)` là `−0`, và `Math.max(0,
 * −0)` trả `+0`. Để lọt một `−0` vào bản ghi thì phép so bằng sâu của hai bản ghi
 * "giống hệt" có thể đỏ.
 */
function drawErrors(key: string, requests: number, rate: number): number {
  const z = standardNormalForKey(key);
  const approximate = Math.round(requests * rate + z * Math.sqrt(requests * rate * (1 - rate)));
  return Math.min(requests, Math.max(0, approximate));
}

function measureIntervals(
  scenario: ReleaseScenario,
  canary: CanaryPolicy,
  exposedAtSecond: number,
  baseSeed: number,
  pass: number,
): readonly CanaryIntervalRecord[] {
  const { requestsPerSecond } = scenario;
  // Nhân trước, chia sau — xem đầu file.
  const canaryRequests = Math.round(
    (requestsPerSecond * canary.intervalSeconds * canary.weightPercent) / PERCENT,
  );
  const baselineRequests = Math.round(requestsPerSecond * canary.intervalSeconds) - canaryRequests;
  const out: CanaryIntervalRecord[] = [];
  for (let index = 0; index < canary.intervals; index += 1) {
    out.push({
      index,
      startSecond: exposedAtSecond + index * canary.intervalSeconds,
      canaryRequests,
      canaryErrors: drawErrors(
        releaseDrawKey(baseSeed, pass, index, 'canary'),
        canaryRequests,
        scenario.candidateErrorRate,
      ),
      baselineRequests,
      baselineErrors: drawErrors(
        releaseDrawKey(baseSeed, pass, index, 'baseline'),
        baselineRequests,
        scenario.baselineErrorRate,
      ),
    });
  }
  return out;
}

/** Ngưỡng hủy đọc ra phần triệu nguyên — đủ mịn cho mọi ngưỡng một người đặt tay. */
/* `BigInt(...)` chứ không literal `1_000_000n`: apps/web biên dịch gói này với target thấp hơn ES2020, nơi literal BigInt bị cấm. */
const THRESHOLD_SCALE = BigInt(1_000_000);

/**
 * R3. So hiệu tỷ lệ lỗi GỘP trên cả cửa sổ, nghiêm ngặt `>`: hiệu bằng đúng ngưỡng
 * là chưa vượt. Nhóm nào không có request thì không có tỷ lệ — điểm 2 đầu file.
 *
 * ⛔ So bằng SỐ NGUYÊN, không bằng phép chia số thực. Bản đầu viết
 * `ce/cr − be/br > max`, và "bằng đúng ngưỡng" thì không bao giờ bằng được: review
 * PR #141 đo 7/100 − 24/400 ra `> 0.01` nhưng 8/100 − 28/400 ra `≤ 0.01`, dù cả hai
 * hiệu đều ĐÚNG 0,01 — cùng một cửa sổ, hai hạt giống, một lùi một thăng. Bài C21
 * sống đúng ở cỡ mẫu nhỏ như vậy.
 *
 * Nhân chéo: `ce/cr − be/br > P/S` ⇔ `(ce·br − be·cr)·S > P·cr·br`, với `P` là
 * ngưỡng làm tròn về phần triệu. `BigInt` vì tích có thể vượt 2⁵³ ở đội máy lớn,
 * và `BigInt` tất định ở mọi engine.
 */
function pooledDeltaExceeds(
  intervals: readonly CanaryIntervalRecord[],
  maxErrorRateDelta: number,
): boolean {
  let canaryRequests = 0;
  let canaryErrors = 0;
  let baselineRequests = 0;
  let baselineErrors = 0;
  for (const interval of intervals) {
    canaryRequests += interval.canaryRequests;
    canaryErrors += interval.canaryErrors;
    baselineRequests += interval.baselineRequests;
    baselineErrors += interval.baselineErrors;
  }
  if (canaryRequests === 0 || baselineRequests === 0) {
    return false;
  }
  const ce = BigInt(canaryErrors);
  const cr = BigInt(canaryRequests);
  const be = BigInt(baselineErrors);
  const br = BigInt(baselineRequests);
  const nguong = BigInt(Math.round(maxErrorRateDelta * Number(THRESHOLD_SCALE)));
  return (ce * br - be * cr) * THRESHOLD_SCALE > nguong * cr * br;
}

/**
 * R3. Quyết TRÊN SỐ LIỆU, không nhìn `isBadCandidate` — hủy nhầm bản tốt và cho
 * lọt bản xấu đều là kết cục hợp lệ, và là thứ level đếm.
 */
function canaryRollout(
  scenario: ReleaseScenario,
  canary: CanaryPolicy,
  baseSeed: number,
  pass: number,
): Rollout {
  const canaryInstances = Math.ceil((scenario.instances * canary.weightPercent) / PERCENT);
  const exposedAtSecond = scenario.replaceSeconds + scenario.routeSeconds;
  const peakInstances = scenario.instances + canaryInstances;
  const intervals = measureIntervals(scenario, canary, exposedAtSecond, baseSeed, pass);
  const windowEndSecond = exposedAtSecond + canary.intervalSeconds * canary.intervals;
  if (pooledDeltaExceeds(intervals, canary.maxErrorRateDelta)) {
    return {
      intervals,
      exposedAtSecond,
      peakInstances,
      decision: {
        kind: 'withdraw',
        backoutAtSecond: windowEndSecond,
        rollbackSeconds: scenario.routeSeconds,
      },
    };
  }
  // Điểm 1 đầu file: máy canary là đợt đầu, còn lại `instances − canaryInstances` máy.
  const promotionBatches = Math.ceil((scenario.instances - canaryInstances) / canaryInstances);
  return {
    intervals,
    exposedAtSecond,
    peakInstances,
    decision: {
      kind: 'promote',
      finishedAtSecond: windowEndSecond + promotionBatches * scenario.replaceSeconds,
    },
  };
}

function rolloutFor(
  params: StrategyParams,
  scenario: ReleaseScenario,
  baseSeed: number,
  pass: number,
): Rollout {
  switch (params.strategy) {
    case 'rolling':
      return rollingRollout(scenario, params.rolling);
    case 'blue-green':
      return blueGreenRollout(scenario);
    case 'canary':
      return canaryRollout(scenario, params.canary, baseSeed, pass);
  }
}

/** R5. Migration chỉ chặn đường LÙI; đường tiến không đụng tới lược đồ cũ. */
function withdrawalOutcome(
  response: BadReleaseResponse,
  migration: MigrationKind,
): Exclude<ReleaseOutcome, 'promoted'> {
  if (response === 'roll-forward') {
    return 'rolled-forward';
  }
  return migration === 'irreversible' ? 'rollback-blocked' : 'rolled-back';
}

function toPassRecord(
  pass: number,
  rollout: Rollout,
  response: BadReleaseResponse,
  scenario: ReleaseScenario,
): ReleasePassRecord {
  const { intervals, exposedAtSecond, peakInstances, decision } = rollout;
  if (decision.kind === 'promote') {
    return {
      pass,
      outcome: 'promoted',
      intervals,
      exposedAtSecond,
      backoutAtSecond: null,
      recoveredAtSecond: null,
      finishedAtSecond: decision.finishedAtSecond,
      peakInstances,
    };
  }
  const outcome = withdrawalOutcome(response, scenario.migration);
  const recoveryDuration =
    outcome === 'rolled-back' ? decision.rollbackSeconds : scenario.fixForwardSeconds;
  const recoveredAtSecond = decision.backoutAtSecond + recoveryDuration;
  return {
    pass,
    outcome,
    intervals,
    exposedAtSecond,
    backoutAtSecond: decision.backoutAtSecond,
    recoveredAtSecond,
    // Điểm 4 đầu file.
    finishedAtSecond: recoveredAtSecond,
    peakInstances,
  };
}

// ═══════════════════════════════════════════════════════════════ cửa vào

/**
 * Chạy `evaluation.passes` lượt phát hành (`cd-contract.ts` §4).
 *
 * Rolling và blue-green không có ngẫu nhiên nên mọi lượt giống nhau; canary rút
 * nhiễu theo khoá `(baseSeed, pass, khoảng đo, nhóm)`, nên cùng đầu vào ⇒ cùng bản
 * ghi, và thêm khoảng đo hay thêm lượt không dịch con số của khoảng đo đã có.
 *
 * @throws RangeError khi kịch bản, số lượt, hay tham số của chiến lược ĐÃ CHỌN nằm
 *   ngoài miền đã khai — xem "Dữ liệu ngoài miền thì NÉM" đầu file.
 */
export function simulateRelease(
  policy: ReleasePolicy,
  scenario: ReleaseScenario,
  evaluation: ReleaseEvaluationSpec,
): ReleaseRecord {
  validateScenario(scenario);
  requireInteger('evaluation.passes', evaluation.passes, 1);
  requireMember('policy.strategy', policy.strategy, RELEASE_STRATEGIES);
  requireMember('policy.onBadRelease', policy.onBadRelease, BAD_RELEASE_RESPONSES);

  const params = resolveStrategyParams(policy);
  if (params === null) {
    return {
      baseSeed: evaluation.baseSeed,
      error: { kind: 'missing-strategy-params', strategy: policy.strategy },
      passes: [],
    };
  }
  validateStrategyParams(params, scenario);

  const passes: ReleasePassRecord[] = [];
  for (let pass = 0; pass < evaluation.passes; pass += 1) {
    const rollout = rolloutFor(params, scenario, evaluation.baseSeed, pass);
    passes.push(toPassRecord(pass, rollout, policy.onBadRelease, scenario));
  }
  return { baseSeed: evaluation.baseSeed, error: null, passes };
}

// ═══════════════════════════════════════════════════════════════ phép chiếu
//
// Ba số đếm trả `null` chứ không trả 0 khi bản ghi mang lỗi — cùng lý do với
// `scoreAxes` ở `score.ts`: bản ghi lỗi có `passes` rỗng, và "0 bản xấu lọt lưới,
// 0 sự cố dữ liệu" sẽ làm một chính sách chạy không được chấm ra an toàn tuyệt đối.

/**
 * Giây từ lúc quyết rút tới lúc hết nhận lưu lượng lỗi: `recoveredAtSecond −
 * backoutAtSecond`. `null` khi bản ứng viên được thăng hạng.
 *
 * Với `'rolled-forward'` và `'rollback-blocked'` đây là thời gian dựng bản sửa —
 * đúng thứ người dùng chịu, dù tên gọi là "lùi".
 *
 * @throws Error khi `outcome` và hai mốc mâu thuẫn nhau — bản ghi hỏng, không đoán.
 */
export function rollbackSeconds(pass: ReleasePassRecord): number | null {
  const { backoutAtSecond, recoveredAtSecond } = pass;
  const isPromoted = pass.outcome === 'promoted';
  if (isPromoted !== (backoutAtSecond === null) || isPromoted !== (recoveredAtSecond === null)) {
    throw new Error(
      `rollbackSeconds: lượt ${pass.pass} có outcome '${pass.outcome}' nhưng backoutAtSecond=${String(backoutAtSecond)}, recoveredAtSecond=${String(recoveredAtSecond)}`,
    );
  }
  if (backoutAtSecond === null || recoveredAtSecond === null) {
    return null;
  }
  return recoveredAtSecond - backoutAtSecond;
}

function countPasses(record: ReleaseRecord, matches: (pass: ReleasePassRecord) => boolean): number {
  let count = 0;
  for (const pass of record.passes) {
    if (matches(pass)) {
      count += 1;
    }
  }
  return count;
}

/** Số lượt bản XẤU được thăng hạng — lọt lưới. Bản tốt thì luôn 0. */
export function badReleasePromotedCount(
  record: ReleaseRecord,
  scenario: ReleaseScenario,
): number | null {
  if (record.error !== null) {
    return null;
  }
  if (!isBadCandidate(scenario)) {
    return 0;
  }
  return countPasses(record, (pass) => pass.outcome === 'promoted');
}

/** Số lượt bản TỐT bị rút (lùi, tiến, hay lùi bị chặn) — báo động giả. Bản xấu thì luôn 0. */
export function goodReleaseAbortedCount(
  record: ReleaseRecord,
  scenario: ReleaseScenario,
): number | null {
  if (record.error !== null) {
    return null;
  }
  if (isBadCandidate(scenario)) {
    return 0;
  }
  return countPasses(record, (pass) => pass.outcome !== 'promoted');
}

/** Số lượt chọn lùi trên một migration không lùi được — bản cũ chạy trên lược đồ mới. */
export function dataIncidentCount(record: ReleaseRecord): number | null {
  if (record.error !== null) {
    return null;
  }
  return countPasses(record, (pass) => pass.outcome === 'rollback-blocked');
}
