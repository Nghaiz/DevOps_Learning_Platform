/**
 * Bộ mô phỏng GitOps của chương CD — 19.B.7 vòng đối soát · 19.B.8 tự sửa và
 * danh sách loại trừ.
 *
 * Luật là `cd-contract.ts` §2 (G1–G5), chép nguyên nghĩa, không diễn lại. File
 * này chỉ ghi những chỗ hợp đồng KHÔNG nói và lý do chọn cách đọc ở đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BÀI HỌC MÀ CON SỐ PHẢI NÓI RA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đối soát chạy theo CHU KỲ, không chạy theo sự kiện. Một lệnh sửa tay ở giây t
 * sống tới nhịp đối soát kế tiếp, tức đúng `ceil(t / P) × P - t` giây — và
 * người chơi phải thấy khoảng đó (C24). Một bộ mô phỏng "sửa ngay khi lệch" cho
 * ra số 0 ở mọi nơi và dạy đúng điều ngược lại.
 *
 * Tự sửa bật mà KHÔNG loại trừ trường mà một bộ điều khiển trong cụm cũng sửa
 * thì hai bên giành nhau mãi (C25). `selfHealFights` đếm số lần đó; thêm trường
 * vào `ignoreFields` đưa nó về 0, nhưng đoạn lệch vẫn được GHI (G3) — loại trừ
 * là chọn không nhìn, không phải làm cho lệch biến mất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MÔ HÌNH TRẠNG THÁI — một trường, bốn giá trị
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   declared — trạng thái khai trong git, đổi bởi `'git'`.
 *   live     — trạng thái sống, đổi bởi `'human'`, `'controller'`, và đối soát.
 *   synced   — trạng thái khai tại lần đồng bộ trước ("khai đổi từ lần đồng bộ
 *              trước" ở G2 so theo GIÁ TRỊ: commit đổi rồi hoàn tác trước nhịp
 *              đối soát là khai KHÔNG đổi).
 *   open     — đoạn lệch đang mở. Bất biến: `open !== null` ⇔ `live !== declared`.
 *
 * ⚠ Cách đọc đã chọn ở chỗ hợp đồng im lặng — ghim trong `gitops.test.ts`:
 *
 * 1. Một đoạn lệch là một khoảng TỐI ĐẠI `live !== declared`. Một thay đổi giữ
 *    nguyên tình trạng lệch (người sửa tay 3 → 5 rồi 5 → 7) KHÔNG cắt đoạn, và
 *    `cause` là tác nhân MỞ đoạn. Lý do: `endedBy` chỉ có `'reconcile'` (đối
 *    soát làm sống khớp khai) và `'overwritten'` (một thay đổi làm sống khớp
 *    khai) — cắt đoạn ở chỗ sống vẫn khác khai là một kiểu kết thúc hợp đồng
 *    không có tên.
 * 2. Đối soát có đồng bộ commit (G2 ý 1) đóng đoạn đang mở BẤT KỂ `cause`, và
 *    đặt `detectedAtSecond` nếu còn `null`. Chú thích của trường đó liệt kê đúng
 *    hai lý do để còn `null` — bị bỏ qua, hoặc hết giờ — và một đoạn vừa bị đồng
 *    bộ không thuộc lý do nào.
 * 3. "Bị đè" ở G4 = trạng thái sống rời khỏi giá trị của bộ điều khiển, bởi bất
 *    kỳ ai (đối soát, người, đồng bộ commit). MỖI lần bị đè ở giây s hẹn một lần
 *    đặt lại ở `s + reassertEverySeconds`; đặt lại khi sống đã mang sẵn giá trị
 *    đó thì không đổi gì.
 * 4. Mỗi trường có TỐI ĐA MỘT thay đổi `'controller'` trong kịch bản. Hai bộ
 *    điều khiển trên một trường (hay một bộ đổi ý) là thứ hợp đồng không định
 *    nghĩa, nên ném thay vì bịa luật giành nhau thứ hai.
 *
 * ⛔ Không có kênh lỗi trong `GitOpsRecord` (khác `ReleaseRecord.error`), nên dữ
 * liệu sai là NÉM, không phải một bản ghi rỗng trông như "không lệch gì".
 */

import { compareKeys } from '../git/deterministic.ts';
import { GITOPS_ACTORS } from './cd-contract.ts';
import type {
  DriftRecord,
  GitOpsActor,
  GitOpsPolicy,
  GitOpsRecord,
  GitOpsScenario,
} from './cd-contract.ts';

/**
 * Thứ tự tác nhân trong cùng một giây, đúng G1: git < human < controller.
 *
 * Viết thành bảng thay vì `GITOPS_ACTORS.indexOf`: thứ tự của mảng hằng kia là
 * thứ tự LIỆT KÊ, và một lần sắp lại vì lý do trình bày sẽ đổi luật G1 trong im
 * lặng. Kiểu `Record<GitOpsActor, number>` bắt thiếu tác nhân ở typecheck.
 */
const ACTOR_RANK: Readonly<Record<GitOpsActor, number>> = { git: 0, human: 1, controller: 2 };

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface FieldState {
  declared: string;
  live: string;
  synced: string;
  open: Mutable<DriftRecord> | null;
  controller: { readonly value: string; readonly reassertEverySeconds: number } | null;
}

/** Một thao tác trong giây: thay đổi của kịch bản, hoặc lần đặt lại của bộ điều khiển. */
interface Step {
  readonly actor: GitOpsActor;
  readonly field: string;
  /** Vị trí trong `scenario.changes`; lần đặt lại mang `changes.length` (xem `simulateGitOps`). */
  readonly index: number;
  readonly value: string;
  readonly reassertEverySeconds: number | null;
}

function compareSteps(a: Step, b: Step): number {
  const byActor = ACTOR_RANK[a.actor] - ACTOR_RANK[b.actor];
  if (byActor !== 0) return byActor;
  const byField = compareKeys(a.field, b.field);
  if (byField !== 0) return byField;
  return a.index - b.index;
}

function assertSecondCount(value: number, min: number, what: string): void {
  if (!Number.isInteger(value) || value < min) {
    throw new RangeError(`${what} phải là số nguyên ≥ ${min}, nhận ${value}`);
  }
}

function assertInputs(policy: GitOpsPolicy, scenario: GitOpsScenario): void {
  assertSecondCount(policy.reconcileEverySeconds, 1, 'reconcileEverySeconds');
  assertSecondCount(scenario.horizonSeconds, 1, 'horizonSeconds');

  const known: string[] = [];
  for (const entry of scenario.initial) {
    if (known.includes(entry.field)) {
      throw new Error(`initial khai trường "${entry.field}" hai lần`);
    }
    known.push(entry.field);
  }

  const controlled: string[] = [];
  for (const change of scenario.changes) {
    const where = `thay đổi ${change.actor}/${change.field} ở giây ${change.atSecond}`;
    if (!(GITOPS_ACTORS as readonly string[]).includes(change.actor)) {
      throw new Error(`${where}: tác nhân không tồn tại`);
    }
    assertSecondCount(change.atSecond, 0, `${where}: atSecond`);
    if (change.atSecond > scenario.horizonSeconds) {
      throw new RangeError(`${where}: nằm sau horizonSeconds ${scenario.horizonSeconds}`);
    }
    if (!known.includes(change.field)) {
      throw new Error(`${where}: trường không có trong initial`);
    }
    if (change.actor !== 'controller') {
      if (change.reassertEverySeconds !== undefined) {
        throw new Error(`${where}: reassertEverySeconds chỉ dành cho 'controller'`);
      }
      continue;
    }
    if (change.reassertEverySeconds === undefined) {
      throw new Error(`${where}: 'controller' bắt buộc có reassertEverySeconds`);
    }
    assertSecondCount(change.reassertEverySeconds, 1, `${where}: reassertEverySeconds`);
    if (controlled.includes(change.field)) {
      throw new Error(`${where}: trường đã có một bộ điều khiển — hợp đồng không định nghĩa hai`);
    }
    controlled.push(change.field);
  }
}

/**
 * Chạy vòng đối soát trên `scenario` từ giây 0 tới hết `horizonSeconds`.
 *
 * Mỗi giây có việc: áp mọi thay đổi của giây đó theo G1, rồi — nếu là nhịp
 * `k × reconcileEverySeconds`, k ≥ 1 — đối soát (G2/G3). Vòng lặp nhảy thẳng tới
 * giây có việc kế tiếp thay vì đi từng giây, nên `horizonSeconds` lớn không tốn gì.
 */
export function simulateGitOps(policy: GitOpsPolicy, scenario: GitOpsScenario): GitOpsRecord {
  assertInputs(policy, scenario);
  const period = policy.reconcileEverySeconds;
  const horizon = scenario.horizonSeconds;

  /*
   * `Map` cục bộ, không lọt ra bản ghi, và chỉ dùng để TRA — mọi phép lặp đi qua
   * `fields` đã sắp. Không dùng object thường làm bảng tra: tên trường là dữ
   * liệu level, và một trường tên `constructor` sẽ trả về hàm của prototype.
   */
  const states = new Map<string, FieldState>();
  for (const { field, value } of scenario.initial) {
    states.set(field, {
      declared: value,
      live: value,
      synced: value,
      open: null,
      controller: null,
    });
  }
  const fields = [...states.keys()].sort(compareKeys);

  const drifts: Mutable<DriftRecord>[] = [];
  const reconcileSeconds: number[] = [];
  const reasserts: { readonly second: number; readonly field: string }[] = [];

  const stateOf = (field: string): FieldState => {
    const state = states.get(field);
    // `assertInputs` đã khẳng định mọi trường có trong `initial`.
    if (state === undefined) throw new Error(`trường "${field}" không có trạng thái`);
    return state;
  };

  /** Đổi trạng thái sống; nếu nó rời giá trị của bộ điều khiển thì hẹn đặt lại (G4). */
  const setLive = (field: string, state: FieldState, value: string, second: number): void => {
    const previous = state.live;
    state.live = value;
    const controller = state.controller;
    if (controller === null || previous !== controller.value || value === controller.value) return;
    const at = second + controller.reassertEverySeconds;
    if (at > horizon) return;
    if (reasserts.some((r) => r.second === at && r.field === field)) return;
    reasserts.push({ second: at, field });
  };

  const closeByReconcile = (state: FieldState, second: number): void => {
    const open = state.open;
    if (open === null) return;
    if (open.detectedAtSecond === null) open.detectedAtSecond = second;
    open.endedAtSecond = second;
    open.endedBy = 'reconcile';
    state.open = null;
  };

  const applyStep = (step: Step, second: number): void => {
    const state = stateOf(step.field);
    if (step.actor === 'git') {
      state.declared = step.value;
    } else {
      if (step.actor === 'controller' && step.reassertEverySeconds !== null) {
        state.controller = { value: step.value, reassertEverySeconds: step.reassertEverySeconds };
      }
      setLive(step.field, state, step.value, second);
    }

    const differs = state.live !== state.declared;
    if (state.open !== null && !differs) {
      state.open.endedAtSecond = second;
      state.open.endedBy = 'overwritten';
      state.open = null;
    } else if (state.open === null && differs) {
      const drift: Mutable<DriftRecord> = {
        field: step.field,
        cause: step.actor,
        startedAtSecond: second,
        detectedAtSecond: null,
        endedAtSecond: null,
        endedBy: null,
      };
      drifts.push(drift);
      state.open = drift;
    }
  };

  const reconcile = (second: number): void => {
    for (const field of fields) {
      if (policy.ignoreFields.includes(field)) continue;
      const state = stateOf(field);
      if (state.declared !== state.synced) {
        state.synced = state.declared;
        setLive(field, state, state.declared, second);
        closeByReconcile(state, second);
        continue;
      }
      if (state.open === null) continue;
      if (state.open.detectedAtSecond === null) state.open.detectedAtSecond = second;
      if (!policy.selfHeal) continue;
      setLive(field, state, state.declared, second);
      closeByReconcile(state, second);
    }
  };

  const ordered = scenario.changes
    .map((change, index) => ({ change, index }))
    .sort((a, b) => a.change.atSecond - b.change.atSecond);
  let cursor = 0;
  let nextBeat = period;

  for (;;) {
    let second = Number.POSITIVE_INFINITY;
    const nextChange = ordered[cursor];
    if (nextChange !== undefined) second = nextChange.change.atSecond;
    if (nextBeat <= horizon) second = Math.min(second, nextBeat);
    for (const r of reasserts) second = Math.min(second, r.second);
    if (second > horizon) break;

    const batch: Step[] = [];
    for (;;) {
      const entry = ordered[cursor];
      if (entry === undefined || entry.change.atSecond !== second) break;
      const { change, index } = entry;
      batch.push({
        actor: change.actor,
        field: change.field,
        index,
        value: change.value,
        reassertEverySeconds: change.reassertEverySeconds ?? null,
      });
      cursor += 1;
    }
    for (let i = reasserts.length - 1; i >= 0; i -= 1) {
      const r = reasserts[i];
      if (r === undefined || r.second !== second) continue;
      reasserts.splice(i, 1);
      const controller = stateOf(r.field).controller;
      if (controller === null) continue;
      /*
       * `index = changes.length` không bao giờ hoà với một thay đổi thật của
       * CÙNG (controller, trường): trường chỉ có một thay đổi `'controller'`
       * (`assertInputs`) và lần đặt lại luôn đến sau nó ít nhất một giây.
       */
      batch.push({
        actor: 'controller',
        field: r.field,
        index: scenario.changes.length,
        value: controller.value,
        reassertEverySeconds: null,
      });
    }

    batch.sort(compareSteps);
    for (const step of batch) applyStep(step, second);

    if (second === nextBeat) {
      reconcile(second);
      reconcileSeconds.push(second);
      nextBeat += period;
    }
  }

  /*
   * Sắp (startedAtSecond, field, cause theo G1). Trong cùng giây và cùng trường,
   * đoạn lệch được mở đúng theo thứ tự tác nhân G1, nên sắp ổn định ở đây trùng
   * thứ tự sinh — hai đoạn trùng cả ba khoá giữ thứ tự chúng xảy ra.
   */
  const sorted = [...drifts].sort((a, b) => {
    if (a.startedAtSecond !== b.startedAtSecond) return a.startedAtSecond - b.startedAtSecond;
    const byField = compareKeys(a.field, b.field);
    if (byField !== 0) return byField;
    return ACTOR_RANK[a.cause] - ACTOR_RANK[b.cause];
  });

  return {
    drifts: sorted.map((d) => ({ ...d })),
    reconcileSeconds,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHÉP CHIẾU — không lưu trong bản ghi (`cd-contract.ts`: không trường suy ra)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Độ dài một đoạn lệch, giây. Đoạn còn mở tính tới `horizonSeconds`.
 *
 * Cần `scenario` chính vì bản ghi KHÔNG chép `horizonSeconds`: đoạn mở là
 * `endedAtSecond: null`, và mốc cuối là dữ liệu của kịch bản.
 */
export function driftSeconds(drift: DriftRecord, scenario: GitOpsScenario): number {
  return (drift.endedAtSecond ?? scenario.horizonSeconds) - drift.startedAtSecond;
}

/**
 * Đoạn lệch dài nhất (lọc theo `field` nếu có), giây. Không có đoạn nào ⇒ `0`:
 * không có lệch thì không có giây lệch nào, và đó là câu trả lời đúng, không
 * phải "không biết".
 */
export function longestDriftSeconds(
  record: GitOpsRecord,
  scenario: GitOpsScenario,
  field?: string,
): number {
  let longest = 0;
  for (const drift of record.drifts) {
    if (field !== undefined && drift.field !== field) continue;
    longest = Math.max(longest, driftSeconds(drift, scenario));
  }
  return longest;
}

/** Số lần tự sửa giành trường với bộ điều khiển (G4): đoạn `'controller'` bị đối soát đóng. */
export function selfHealFights(record: GitOpsRecord): number {
  return record.drifts.filter((d) => d.cause === 'controller' && d.endedBy === 'reconcile').length;
}

/** Số đoạn lệch không lần đối soát nào thấy: bị loại trừ, tự khép trước nhịp, hoặc hết giờ. */
export function undetectedDriftCount(record: GitOpsRecord): number {
  return record.drifts.filter((d) => d.detectedAtSecond === null).length;
}
