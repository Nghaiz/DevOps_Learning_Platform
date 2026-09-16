/**
 * 19.B.4–B.6 — bộ mô phỏng phát hành, ghim từng luật R1–R6 của `cd-contract.ts`
 * §1 và ô AC-B.
 *
 * ## Vì sao phần lớn kịch bản dùng tỷ lệ lỗi 0 và 1
 *
 * R4 rút số lỗi bằng `round(n·p + z·sqrt(n·p·(1−p)))`. Với `p = 0` hoặc `p = 1`
 * thì căn bằng 0, `z` rơi khỏi phép tính, và số lỗi là `0` hoặc `n` ĐÚNG. Nhờ vậy
 * mốc thời gian, số request và quyết định của canary tính được bằng đầu, và một ô
 * đỏ ở đó là lỗi của luật chứ không phải của nhiễu. Nhiễu được đo riêng ở khối R4
 * và khối "cỡ mẫu", nơi nó là thứ đang được kiểm.
 *
 * ## Vì sao có một bản sao Box–Muller trong file test
 *
 * `referenceErrors` dưới đây chép lại khoá rút và công thức. Nó không phải một
 * phép kiểm "hàm bằng chính nó": khoá `${baseSeed}|release|${pass}|${index}|${nhóm}`
 * và biến thể Box–Muller là HỢP ĐỒNG HÀNH VI — đổi một dấu phân tách là đổi mọi
 * con số của mọi level đã cân bằng, trong im lặng. Bản sao ở đây làm thay đổi đó
 * đỏ, và có đối chứng cho thấy nó ĐỎ ĐƯỢC.
 */
import { describe, expect, it } from 'vitest';

import type {
  BadReleaseResponse,
  CanaryPolicy,
  MigrationKind,
  ReleaseOutcome,
  ReleasePassRecord,
  ReleasePolicy,
  ReleaseRecord,
  ReleaseScenario,
} from './cd-contract.ts';
import { hashDrawKey } from './rng-keys.ts';
import { nextFloat, seedRng } from '../core/rng.ts';
import {
  badReleasePromotedCount,
  dataIncidentCount,
  goodReleaseAbortedCount,
  rollbackSeconds,
  simulateRelease,
} from './release.ts';

// ─────────────────────────────────────────────────────────────── bộ dựng

/** Mặc định là bản XẤU không nhiễu: ứng viên lỗi 100%, bản đang chạy 0%. */
function scenario(overrides: Partial<ReleaseScenario> = {}): ReleaseScenario {
  return {
    instances: 6,
    requestsPerSecond: 100,
    baselineErrorRate: 0,
    candidateErrorRate: 1,
    replaceSeconds: 30,
    switchSeconds: 3,
    routeSeconds: 20,
    alertSeconds: 60,
    migration: 'none',
    fixForwardSeconds: 600,
    ...overrides,
  };
}

function rolling(batchSize: number, onBadRelease: BadReleaseResponse = 'rollback'): ReleasePolicy {
  return { strategy: 'rolling', rolling: { batchSize }, onBadRelease };
}

function blueGreen(onBadRelease: BadReleaseResponse = 'rollback'): ReleasePolicy {
  return { strategy: 'blue-green', onBadRelease };
}

const DEFAULT_CANARY: CanaryPolicy = {
  weightPercent: 10,
  intervalSeconds: 60,
  intervals: 3,
  maxErrorRateDelta: 0.02,
};

function canary(
  overrides: Partial<CanaryPolicy> = {},
  onBadRelease: BadReleaseResponse = 'rollback',
): ReleasePolicy {
  return { strategy: 'canary', canary: { ...DEFAULT_CANARY, ...overrides }, onBadRelease };
}

function run(
  policy: ReleasePolicy,
  scen: ReleaseScenario,
  passes = 1,
  baseSeed = 7,
): ReleaseRecord {
  return simulateRelease(policy, scen, { baseSeed, passes });
}

function onlyPass(record: ReleaseRecord): ReleasePassRecord {
  expect(record.error).toBeNull();
  expect(record.passes).toHaveLength(1);
  const [first] = record.passes;
  if (first === undefined) {
    throw new Error('bản ghi không có lượt nào');
  }
  return first;
}

function passAt(record: ReleaseRecord, index: number): ReleasePassRecord {
  const pass = record.passes[index];
  if (pass === undefined) {
    throw new Error(`bản ghi không có lượt ${index}`);
  }
  return pass;
}

/** Số lỗi CHƯA kẹp, tính lại độc lập từ khoá — xem đầu file vì sao có bản sao này. */
function referenceErrors(key: string, n: number, p: number): number {
  const first = nextFloat(seedRng(hashDrawKey(key)));
  const second = nextFloat(first.state);
  const z = Math.sqrt(-2 * Math.log(1 - first.value)) * Math.cos(2 * Math.PI * second.value);
  return Math.round(n * p + z * Math.sqrt(n * p * (1 - p)));
}

function canaryErrorsOf(record: ReleaseRecord): readonly number[] {
  return record.passes.flatMap((pass) => pass.intervals.map((interval) => interval.canaryErrors));
}

// ═══════════════════════════════════════════════════════════════════════ R1

describe('R1 — rolling', () => {
  it('bản tốt: ceil(5/2) = 3 đợt × 30 giây ⇒ thay xong ở giây 90, đỉnh 5 + 2 = 7 máy', () => {
    const pass = onlyPass(
      run(rolling(2), scenario({ instances: 5, candidateErrorRate: 0, baselineErrorRate: 0 })),
    );
    expect(pass).toEqual({
      pass: 0,
      outcome: 'promoted',
      intervals: [],
      exposedAtSecond: 30,
      backoutAtSecond: null,
      recoveredAtSecond: null,
      finishedAtSecond: 90,
      peakInstances: 7,
    });
  });

  it('bản xấu, cảnh báo giữa đợt 1: rút ở 30 + 15 = 45, floor(45/30) + 1 = 2 đợt đã bắt đầu ⇒ lùi 60 giây', () => {
    const pass = onlyPass(run(rolling(2), scenario({ instances: 5, alertSeconds: 15 })));
    expect(pass).toEqual({
      pass: 0,
      outcome: 'rolled-back',
      intervals: [],
      exposedAtSecond: 30,
      backoutAtSecond: 45,
      recoveredAtSecond: 105,
      finishedAtSecond: 105,
      peakInstances: 7,
    });
    expect(rollbackSeconds(pass)).toBe(60);
  });

  it('cảnh báo rơi ĐÚNG giây đợt 2 bắt đầu (60) thì đợt đó tính là đã đổi; sớm một giây thì không', () => {
    // alert 30 ⇒ rút ở 60 ⇒ floor(60/30) + 1 = 3 đợt ⇒ lùi 90.
    expect(
      rollbackSeconds(onlyPass(run(rolling(2), scenario({ instances: 5, alertSeconds: 30 })))),
    ).toBe(90);
    // Đối chứng: alert 29 ⇒ rút ở 59 ⇒ floor(59/30) + 1 = 2 đợt ⇒ lùi 60.
    expect(
      rollbackSeconds(onlyPass(run(rolling(2), scenario({ instances: 5, alertSeconds: 29 })))),
    ).toBe(60);
  });

  it('cảnh báo kêu sau khi đã thay xong: số đợt kẹp ở tổng 3, không phải floor(330/30) + 1 = 12', () => {
    const pass = onlyPass(run(rolling(2), scenario({ instances: 5, alertSeconds: 300 })));
    expect(pass.backoutAtSecond).toBe(330);
    expect(rollbackSeconds(pass)).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════════════ R2

describe('R2 — blue-green', () => {
  it('bản tốt: dựng 30 + đổi bộ chọn 3 ⇒ nhận lưu lượng và thay xong ở giây 33, đỉnh 2 × 4 = 8 máy', () => {
    const pass = onlyPass(
      run(blueGreen(), scenario({ instances: 4, candidateErrorRate: 0, baselineErrorRate: 0 })),
    );
    expect(pass).toEqual({
      pass: 0,
      outcome: 'promoted',
      intervals: [],
      exposedAtSecond: 33,
      backoutAtSecond: null,
      recoveredAtSecond: null,
      finishedAtSecond: 33,
      peakInstances: 8,
    });
  });

  it('bản xấu: rút ở 33 + 60 = 93, lùi = đổi bộ chọn về 3 giây ⇒ phục hồi ở 96', () => {
    const pass = onlyPass(run(blueGreen(), scenario({ instances: 4 })));
    expect(pass).toEqual({
      pass: 0,
      outcome: 'rolled-back',
      intervals: [],
      exposedAtSecond: 33,
      backoutAtSecond: 93,
      recoveredAtSecond: 96,
      finishedAtSecond: 96,
      peakInstances: 8,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════ R3

describe('R3 — canary, trên kịch bản không nhiễu', () => {
  // 10 máy × 20% ⇒ ceil(2) = 2 máy canary. Dựng 30 + định tuyến 5 ⇒ nhận lưu lượng
  // ở 35. Ba khoảng 10 giây bắt đầu ở 35, 45, 55; cửa sổ hết ở 65. Mỗi khoảng
  // 50 rps × 10 giây = 500 request: canary round(500 × 20 / 100) = 100, đối chứng
  // 500 − 100 = 400.
  const base = { instances: 10, requestsPerSecond: 50, replaceSeconds: 30, routeSeconds: 5 };
  const policy = canary({
    weightPercent: 20,
    intervalSeconds: 10,
    intervals: 3,
    maxErrorRateDelta: 0.01,
  });

  it('bản tốt (0% vs 0%): hiệu 0 không vượt 0,01 ⇒ thăng hạng, thay nốt 8 máy trong ceil(8/2) = 4 đợt ⇒ xong ở 65 + 120 = 185', () => {
    const pass = onlyPass(
      run(policy, scenario({ ...base, candidateErrorRate: 0, baselineErrorRate: 0 })),
    );
    expect(pass).toEqual({
      pass: 0,
      outcome: 'promoted',
      intervals: [35, 45, 55].map((startSecond, index) => ({
        index,
        startSecond,
        canaryRequests: 100,
        canaryErrors: 0,
        baselineRequests: 400,
        baselineErrors: 0,
      })),
      exposedAtSecond: 35,
      backoutAtSecond: null,
      recoveredAtSecond: null,
      finishedAtSecond: 185,
      peakInstances: 12,
    });
  });

  it('bản xấu (100% vs 0%): hiệu 1 vượt 0,01 ⇒ rút ở cuối cửa sổ 65, lùi = định tuyến 5 giây ⇒ phục hồi ở 70', () => {
    const pass = onlyPass(run(policy, scenario(base)));
    expect(pass.intervals.map((i) => [i.canaryErrors, i.baselineErrors])).toEqual([
      [100, 0],
      [100, 0],
      [100, 0],
    ]);
    expect(pass.outcome).toBe('rolled-back');
    expect(pass.backoutAtSecond).toBe(65);
    expect(pass.recoveredAtSecond).toBe(70);
    expect(pass.finishedAtSecond).toBe(70);
    expect(pass.peakInstances).toBe(12);
  });

  it('ngưỡng so NGHIÊM NGẶT: hiệu bằng đúng ngưỡng là chưa vượt', () => {
    // Hiệu 1 − 0 = 1. Ngưỡng 1 ⇒ không vượt ⇒ bản xấu lọt (R3: kết cục hợp lệ).
    expect(
      onlyPass(run(canary({ ...policyCanary(), maxErrorRateDelta: 1 }), scenario(base))).outcome,
    ).toBe('promoted');
    // Đối chứng: ngưỡng 0,99 ⇒ vượt ⇒ rút.
    expect(
      onlyPass(run(canary({ ...policyCanary(), maxErrorRateDelta: 0.99 }), scenario(base))).outcome,
    ).toBe('rolled-back');
    // Hiệu 0 − 0 = 0 với ngưỡng 0 ⇒ không vượt.
    const same = scenario({ ...base, candidateErrorRate: 0, baselineErrorRate: 0 });
    expect(onlyPass(run(canary({ ...policyCanary(), maxErrorRateDelta: 0 }), same)).outcome).toBe(
      'promoted',
    );
  });

  it('số máy canary làm tròn LÊN, và đợt thăng hạng cuối được thiếu máy: 7 × 30% ⇒ 3 máy, còn 4 ⇒ 2 đợt', () => {
    // ceil(7 × 30 / 100) = ceil(2,1) = 3. Cửa sổ hết ở 65 như trên. ceil(4/3) = 2 đợt × 30 ⇒ xong ở 125.
    const pass = onlyPass(
      run(
        canary({ ...policyCanary(), weightPercent: 30 }),
        scenario({ ...base, instances: 7, candidateErrorRate: 0 }),
      ),
    );
    expect(pass.outcome).toBe('promoted');
    expect(pass.finishedAtSecond).toBe(125);
    expect(pass.peakInstances).toBe(10);
  });

  it('một máy × 50% ⇒ máy canary LÀ cả đội máy: 0 đợt thăng hạng, xong đúng cuối cửa sổ', () => {
    // ceil(1 × 50 / 100) = 1. Một khoảng 10 giây: cửa sổ 35 → 45. Còn 1 − 1 = 0 máy.
    const pass = onlyPass(
      run(
        canary({ ...policyCanary(), weightPercent: 50, intervals: 1 }),
        scenario({ ...base, instances: 1, candidateErrorRate: 0 }),
      ),
    );
    expect(pass.finishedAtSecond).toBe(45);
    expect(pass.peakInstances).toBe(2);
  });

  it('không có request canary nào thì không có tín hiệu: bản lỗi 100% vẫn thăng hạng', () => {
    // 1 rps × 1 giây × 10% = 0,1 ⇒ round = 0 request canary mỗi khoảng.
    const starved = run(
      canary({ weightPercent: 10, intervalSeconds: 1, intervals: 3 }),
      scenario({ requestsPerSecond: 1 }),
    );
    const pass = onlyPass(starved);
    expect(pass.intervals.every((i) => i.canaryRequests === 0 && i.baselineRequests === 1)).toBe(
      true,
    );
    expect(pass.outcome).toBe('promoted');
    expect(badReleasePromotedCount(starved, scenario())).toBe(1);

    // Đối chứng: khoảng 10 giây ⇒ round(1 × 10 × 10 / 100) = 1 request canary, lỗi 1/1,
    // đối chứng 0/9 ⇒ hiệu 1 ⇒ rút. Cùng bản, cùng ngưỡng; chỉ cỡ mẫu đổi.
    const fed = onlyPass(
      run(
        canary({ weightPercent: 10, intervalSeconds: 10, intervals: 3 }),
        scenario({ requestsPerSecond: 1 }),
      ),
    );
    expect(fed.intervals[0]?.canaryRequests).toBe(1);
    expect(fed.outcome).toBe('rolled-back');
  });

  it('chi phí: canary giữ instances + số máy canary, blue-green dựng đủ đội máy thứ hai', () => {
    const scen = scenario({ ...base, candidateErrorRate: 0 });
    expect(onlyPass(run(policy, scen)).peakInstances).toBe(12);
    expect(onlyPass(run(blueGreen(), scen)).peakInstances).toBe(20);
    expect(onlyPass(run(rolling(2), scen)).peakInstances).toBe(12);
  });

  function policyCanary(): CanaryPolicy {
    if (policy.canary === undefined) {
      throw new Error('fixture canary thiếu tham số');
    }
    return policy.canary;
  }
});

// ═══════════════════════════════════════════════════════════════════════ R4

describe('R4 — nhiễu theo số request', () => {
  it('request làm tròn nửa lên, và NHÂN TRƯỚC CHIA SAU: 50 × 29% là 15, không phải 14', () => {
    // 50 × 0.29 = 14.499999999999998 trong số thực nhị phân ⇒ round = 14. (50 × 29) / 100 = 14,5 ⇒ 15.
    const weighted = onlyPass(
      run(canary({ weightPercent: 29, intervalSeconds: 1 }), scenario({ requestsPerSecond: 50 })),
    );
    expect(weighted.intervals[0]?.canaryRequests).toBe(15);
    expect(weighted.intervals[0]?.baselineRequests).toBe(35);

    // 3 × 50% = 1,5 ⇒ 2; đối chứng 3 − 2 = 1.
    const half = onlyPass(
      run(canary({ weightPercent: 50, intervalSeconds: 1 }), scenario({ requestsPerSecond: 3 })),
    );
    expect(half.intervals[0]?.canaryRequests).toBe(2);
    expect(half.intervals[0]?.baselineRequests).toBe(1);
  });

  it('khoá rút đúng định dạng hợp đồng, cho từng lượt × khoảng × nhóm', () => {
    // 100 rps × 60 giây: canary 600 request (p = 0,3), đối chứng 5400 (p = 0,2).
    const scen = scenario({ candidateErrorRate: 0.3, baselineErrorRate: 0.2 });
    const record = run(canary({ maxErrorRateDelta: 1 }), scen, 2, 7);

    const expected = [0, 1].flatMap((pass) =>
      [0, 1, 2].map((index) => ({
        canaryErrors: referenceErrors(`7|release|${pass}|${index}|canary`, 600, 0.3),
        baselineErrors: referenceErrors(`7|release|${pass}|${index}|baseline`, 5400, 0.2),
      })),
    );
    const actual = record.passes.flatMap((pass) =>
      pass.intervals.map((i) => ({
        canaryErrors: i.canaryErrors,
        baselineErrors: i.baselineErrors,
      })),
    );
    expect(actual).toEqual(expected);

    // Đối chứng: phép so trên ĐỎ ĐƯỢC — bỏ đoạn `release` khỏi khoá là ra dãy khác.
    const withoutNamespace = [0, 1].flatMap((pass) =>
      [0, 1, 2].map((index) => referenceErrors(`7|${pass}|${index}|canary`, 600, 0.3)),
    );
    expect(canaryErrorsOf(record)).not.toEqual(withoutNamespace);
  });

  it('rút theo KHOÁ, không theo bộ sinh chạy dọc: thêm khoảng đo hay thêm lượt không dịch con số đã có', () => {
    const scen = scenario({ candidateErrorRate: 0.3, baselineErrorRate: 0.2 });
    const short = run(canary({ intervals: 3, maxErrorRateDelta: 1 }), scen, 1);
    const long = run(canary({ intervals: 6, maxErrorRateDelta: 1 }), scen, 4);
    expect(passAt(long, 0).intervals.slice(0, 3)).toEqual(passAt(short, 0).intervals);
    // Đối chứng: lượt 1 KHÔNG giống lượt 0 — khoá có mang số lượt.
    expect(passAt(long, 1).intervals.slice(0, 3)).not.toEqual(passAt(short, 0).intervals);
  });

  it('kẹp về 0: n = 10, p = 0,05 ⇒ xấp xỉ chuẩn ra số âm ở một phần các khoảng, bản ghi ra 0 và không bao giờ −0', () => {
    // 1 rps × 100 giây × 10% = 10 request canary. round(0,5 + 0,689·z) < 0 ⇔ z < −1,45 ≈ 7% số khoảng.
    const record = run(
      canary({ weightPercent: 10, intervalSeconds: 100, intervals: 400, maxErrorRateDelta: 1 }),
      scenario({ requestsPerSecond: 1, candidateErrorRate: 0.05, baselineErrorRate: 0.05 }),
    );
    const intervals = passAt(record, 0).intervals;
    const unclamped = intervals.map((i) =>
      referenceErrors(`7|release|0|${i.index}|canary`, 10, 0.05),
    );

    // Đối chứng dương: kịch bản này THẬT SỰ đi qua nhánh kẹp.
    expect(unclamped.some((value) => value < 0)).toBe(true);
    intervals.forEach((interval, index) => {
      expect(interval.canaryErrors).toBe(Math.min(10, Math.max(0, unclamped[index] ?? Number.NaN)));
      expect(Object.is(interval.canaryErrors, -0)).toBe(false);
    });
  });

  it('kẹp về n: n = 10, p = 0,95 ⇒ xấp xỉ chuẩn vượt 10 ở một phần các khoảng, bản ghi ra 10', () => {
    const record = run(
      canary({ weightPercent: 10, intervalSeconds: 100, intervals: 400, maxErrorRateDelta: 1 }),
      scenario({ requestsPerSecond: 1, candidateErrorRate: 0.95, baselineErrorRate: 0.05 }),
    );
    const intervals = passAt(record, 0).intervals;
    const unclamped = intervals.map((i) =>
      referenceErrors(`7|release|0|${i.index}|canary`, 10, 0.95),
    );

    expect(unclamped.some((value) => value > 10)).toBe(true);
    intervals.forEach((interval, index) => {
      expect(interval.canaryErrors).toBe(Math.min(10, Math.max(0, unclamped[index] ?? Number.NaN)));
    });
  });
});

describe('R4 — cỡ mẫu tách tín hiệu khỏi nhiễu (bài C21)', () => {
  // Cùng lưu lượng 100 rps, cùng cửa sổ 5 × 60 giây, cùng ngưỡng 0,5 điểm %.
  // Trọng số 25%: 7500 request canary cả cửa sổ; 2%: 600.
  // Ước tính theo lý thuyết, không phải thứ test khẳng định: hiệu thật 1 điểm %,
  // độ lệch chuẩn của hiệu ≈ 0,22 điểm % ở 25% và ≈ 0,70 điểm % ở 2% ⇒ bắt được
  // ≈ 99% so với ≈ 76%; bản tốt bị hủy nhầm ≈ 1% so với ≈ 24%.
  const window = { intervalSeconds: 60, intervals: 5, maxErrorRateDelta: 0.005 };
  const PASSES = 200;

  it('bản XẤU sát nút (3% vs 2%) bị bắt thường xuyên hơn ở trọng số 25% so với 2%', () => {
    const scen = scenario({ baselineErrorRate: 0.02, candidateErrorRate: 0.03 });
    const escapedWide = badReleasePromotedCount(
      run(canary({ ...window, weightPercent: 25 }), scen, PASSES),
      scen,
    );
    const escapedNarrow = badReleasePromotedCount(
      run(canary({ ...window, weightPercent: 2 }), scen, PASSES),
      scen,
    );
    if (escapedWide === null || escapedNarrow === null) {
      throw new Error('bản ghi không được mang lỗi');
    }
    const caughtWide = PASSES - escapedWide;
    const caughtNarrow = PASSES - escapedNarrow;
    expect(caughtWide).toBeGreaterThan(caughtNarrow);
    // Khoảng cách phải là một hiệu ứng, không phải vài lượt may rủi.
    expect(caughtWide - caughtNarrow).toBeGreaterThanOrEqual(20);
  });

  it('chiều ngược lại cũng đúng: bản TỐT (2% vs 2%) bị hủy nhầm thường xuyên hơn ở trọng số 2%', () => {
    const scen = scenario({ baselineErrorRate: 0.02, candidateErrorRate: 0.02 });
    const abortedWide = goodReleaseAbortedCount(
      run(canary({ ...window, weightPercent: 25 }), scen, PASSES),
      scen,
    );
    const abortedNarrow = goodReleaseAbortedCount(
      run(canary({ ...window, weightPercent: 2 }), scen, PASSES),
      scen,
    );
    if (abortedWide === null || abortedNarrow === null) {
      throw new Error('bản ghi không được mang lỗi');
    }
    expect(abortedNarrow).toBeGreaterThan(abortedWide);
    expect(abortedNarrow - abortedWide).toBeGreaterThanOrEqual(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════ R5

describe('R5 — lùi hay tiến, và migration không lùi được', () => {
  // Kịch bản mặc định (6 máy, dựng 30, đổi bộ chọn 3, định tuyến 20, cảnh báo 60, bản sửa 600):
  // - rolling(2): nhận lưu lượng 30, rút 90; 3 đợt, floor(90/30) + 1 = 4 ⇒ kẹp 3 ⇒ lùi 90.
  // - blue-green: nhận 33, rút 93, lùi 3.
  // - canary 10%: nhận 30 + 20 = 50, cửa sổ 3 × 60 ⇒ rút 230; 600 lỗi/600 vs 0/5400 ⇒ luôn rút; lùi 20.
  const CASES = [
    {
      name: 'rolling',
      policy: (r: BadReleaseResponse) => rolling(2, r),
      backout: 90,
      rollback: 90,
    },
    {
      name: 'blue-green',
      policy: (r: BadReleaseResponse) => blueGreen(r),
      backout: 93,
      rollback: 3,
    },
    {
      name: 'canary',
      policy: (r: BadReleaseResponse) => canary({}, r),
      backout: 230,
      rollback: 20,
    },
  ] as const;

  function outcomeOf(
    response: BadReleaseResponse,
    migration: MigrationKind,
    policy: (r: BadReleaseResponse) => ReleasePolicy,
  ) {
    const record = run(policy(response), scenario({ migration }));
    return { record, pass: onlyPass(record) };
  }

  for (const c of CASES) {
    it(`${c.name}: lùi trên migration 'none' hay 'reversible' ⇒ 'rolled-back', phục hồi = rút + ${c.rollback}`, () => {
      for (const migration of ['none', 'reversible'] as const) {
        const { pass } = outcomeOf('rollback', migration, c.policy);
        expect(pass.outcome).toBe('rolled-back');
        expect(pass.backoutAtSecond).toBe(c.backout);
        expect(pass.recoveredAtSecond).toBe(c.backout + c.rollback);
      }
    });

    it(`${c.name}: lùi trên migration 'irreversible' ⇒ 'rollback-blocked', phục hồi chỉ khi bản sửa lên (rút + 600)`, () => {
      const { record, pass } = outcomeOf('rollback', 'irreversible', c.policy);
      expect(pass.outcome).toBe('rollback-blocked');
      expect(pass.recoveredAtSecond).toBe(c.backout + 600);
      expect(pass.finishedAtSecond).toBe(c.backout + 600);
      expect(dataIncidentCount(record)).toBe(1);
    });

    it(`${c.name}: tiến ⇒ 'rolled-forward' ở rút + 600, migration không chặn đường tiến`, () => {
      for (const migration of ['none', 'irreversible'] as const) {
        const { record, pass } = outcomeOf('roll-forward', migration, c.policy);
        expect(pass.outcome).toBe('rolled-forward');
        expect(pass.recoveredAtSecond).toBe(c.backout + 600);
        expect(dataIncidentCount(record)).toBe(0);
      }
    });

    it(`${c.name}: bản tốt thì migration không lùi được cũng vô hại — không rút, không sự cố`, () => {
      const good = scenario({ migration: 'irreversible', candidateErrorRate: 0 });
      const record = run(c.policy('rollback'), good);
      expect(onlyPass(record).outcome).toBe('promoted');
      expect(dataIncidentCount(record)).toBe(0);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════ R6

describe('R6 — rolling và blue-green không có báo động giả', () => {
  it('bản tốt không bao giờ bị rút, kể cả khi cảnh báo nhạy 1 giây, qua 50 lượt', () => {
    const good = scenario({ baselineErrorRate: 0.01, candidateErrorRate: 0.01, alertSeconds: 1 });
    for (const policy of [rolling(2), blueGreen()]) {
      const record = run(policy, good, 50);
      expect(goodReleaseAbortedCount(record, good)).toBe(0);
      expect(record.passes.every((pass) => pass.outcome === 'promoted')).toBe(true);
    }
  });

  it('không có vùng xám: 1,01% vs 1% đã là bản xấu và bị rút', () => {
    const barelyBad = scenario({ baselineErrorRate: 0.01, candidateErrorRate: 0.0101 });
    for (const policy of [rolling(2), blueGreen()]) {
      expect(onlyPass(run(policy, barelyBad)).outcome).toBe('rolled-back');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════ AC-B

describe('AC-B — thời gian lùi: blue-green < canary < rolling', () => {
  // Bản xấu thật (30% vs 1%), lùi, migration 'none'. Canary 10%: 600 request canary
  // mỗi khoảng, ≈ 180 lỗi, so với ≈ 54/5400 ⇒ hiệu ≈ 29 điểm % ≫ ngưỡng 2 — ô dưới
  // khẳng định MỌI lượt đều rút, nên nếu nhiễu có lần nào lọt thì ô đỏ chứ không im.
  const acScenario = (overrides: Partial<ReleaseScenario> = {}): ReleaseScenario =>
    scenario({ baselineErrorRate: 0.01, candidateErrorRate: 0.3, migration: 'none', ...overrides });

  function rollbackTimes(policy: ReleasePolicy, scen: ReleaseScenario): readonly (number | null)[] {
    const record = run(policy, scen, 20);
    expect(record.passes.every((pass) => pass.outcome === 'rolled-back')).toBe(true);
    return [...new Set(record.passes.map(rollbackSeconds))];
  }

  it('6 máy: blue-green 3 giây < canary 20 giây < rolling 90 giây (3 đợt × 30)', () => {
    const scen = acScenario();
    const blueGreenSeconds = rollbackTimes(blueGreen(), scen);
    const canarySeconds = rollbackTimes(canary(), scen);
    const rollingSeconds = rollbackTimes(rolling(2), scen);
    expect([blueGreenSeconds, canarySeconds, rollingSeconds]).toEqual([[3], [20], [90]]);
  });

  it('CƠ CHẾ: nhân đôi instances ⇒ lùi rolling dài ra (90 → 120), hai chiến lược định tuyến đứng yên', () => {
    // 12 máy, batchSize giữ 2: 6 đợt; rút ở 90 ⇒ floor(90/30) + 1 = 4 đợt đã bắt đầu ⇒ lùi 120.
    // Canary 12 × 10% ⇒ 2 máy thay vì 1, nhưng lùi vẫn là một thao tác định tuyến.
    const doubled = acScenario({ instances: 12 });
    expect(rollbackTimes(rolling(2), doubled)).toEqual([120]);
    expect(rollbackTimes(blueGreen(), doubled)).toEqual([3]);
    expect(rollbackTimes(canary(), doubled)).toEqual([20]);
  });

  it('blue-green < canary là DỮ LIỆU của kịch bản (switchSeconds < routeSeconds), không phải định lý của engine', () => {
    // Thiết kế §4.3: đổi bộ chọn "dưới 5 giây", đổi trọng số "dưới 30 giây". Đảo hai số đó
    // thì thứ tự đảo theo — engine không ép thứ tự này, kịch bản mới ép.
    const swapped = acScenario({ switchSeconds: 25, routeSeconds: 20 });
    expect(rollbackTimes(blueGreen(), swapped)).toEqual([25]);
    expect(rollbackTimes(canary(), swapped)).toEqual([20]);
  });
});

// ═══════════════════════════════════════════════════════════════ tất định

describe('tất định', () => {
  const scen = scenario({ baselineErrorRate: 0.02, candidateErrorRate: 0.03 });
  const policy = canary({ intervals: 4, maxErrorRateDelta: 0.005 });

  it('cùng (chính sách, kịch bản, seed) ⇒ cùng bản ghi qua 1000 lượt gọi', () => {
    const reference = run(policy, scen, 3, 42);
    for (let i = 0; i < 1000; i += 1) {
      expect(run(canary({ intervals: 4, maxErrorRateDelta: 0.005 }), { ...scen }, 3, 42)).toEqual(
        reference,
      );
    }
  });

  it('khác seed ⇒ số lỗi canary của các khoảng đo khác nhau', () => {
    expect(canaryErrorsOf(run(policy, scen, 3, 42))).not.toEqual(
      canaryErrorsOf(run(policy, scen, 3, 43)),
    );
  });

  it('bản ghi là dữ liệu thuần: qua JSON rồi về vẫn bằng nghiêm ngặt (không Map, Set, undefined, −0)', () => {
    const record = run(policy, scen, 3, 42);
    expect(JSON.parse(JSON.stringify(record))).toStrictEqual(record);
    expect(record.baseSeed).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════════ lỗi và miền

describe('thiếu tham số là lỗi CỨNG trong bản ghi; dữ liệu ngoài miền thì ném', () => {
  it('canary thiếu `canary` ⇒ error, passes rỗng — `rolling` có mặt cũng không thay được', () => {
    const policy: ReleasePolicy = {
      strategy: 'canary',
      rolling: { batchSize: 2 },
      onBadRelease: 'rollback',
    };
    expect(run(policy, scenario(), 5)).toEqual({
      baseSeed: 7,
      error: { kind: 'missing-strategy-params', strategy: 'canary' },
      passes: [],
    });
  });

  it('rolling thiếu `rolling` ⇒ error, passes rỗng', () => {
    const policy: ReleasePolicy = { strategy: 'rolling', onBadRelease: 'rollback' };
    expect(run(policy, scenario())).toEqual({
      baseSeed: 7,
      error: { kind: 'missing-strategy-params', strategy: 'rolling' },
      passes: [],
    });
  });

  it('đối chứng: blue-green không cần tham số; tham số của chiến lược KHÔNG chọn bị bỏ qua, kể cả khi sai miền', () => {
    expect(run(blueGreen(), scenario()).error).toBeNull();
    const withStray: ReleasePolicy = {
      ...rolling(2),
      canary: { weightPercent: 0, intervalSeconds: 0, intervals: 0, maxErrorRateDelta: 5 },
    };
    expect(onlyPass(run(withStray, scenario())).intervals).toEqual([]);
  });

  it('phép chiếu trên bản ghi lỗi trả null, không trả 0 — "0 bản xấu lọt" sẽ chấm một chính sách hỏng là an toàn', () => {
    const errored = run({ strategy: 'canary', onBadRelease: 'rollback' }, scenario());
    expect(badReleasePromotedCount(errored, scenario())).toBeNull();
    expect(goodReleaseAbortedCount(errored, scenario({ candidateErrorRate: 0 }))).toBeNull();
    expect(dataIncidentCount(errored)).toBeNull();
  });

  const OUT_OF_RANGE: readonly {
    readonly label: string;
    readonly field: RegExp;
    readonly policy: ReleasePolicy;
    readonly scen: ReleaseScenario;
  }[] = [
    {
      label: 'batchSize 0',
      field: /policy\.rolling\.batchSize/,
      policy: rolling(0),
      scen: scenario(),
    },
    {
      label: 'batchSize lớn hơn số máy',
      field: /policy\.rolling\.batchSize/,
      policy: rolling(7),
      scen: scenario(),
    },
    {
      label: 'weightPercent 0',
      field: /policy\.canary\.weightPercent/,
      policy: canary({ weightPercent: 0 }),
      scen: scenario(),
    },
    {
      label: 'weightPercent 51',
      field: /policy\.canary\.weightPercent/,
      policy: canary({ weightPercent: 51 }),
      scen: scenario(),
    },
    {
      label: 'intervals 0',
      field: /policy\.canary\.intervals /,
      policy: canary({ intervals: 0 }),
      scen: scenario(),
    },
    {
      label: 'ngưỡng âm',
      field: /policy\.canary\.maxErrorRateDelta/,
      policy: canary({ maxErrorRateDelta: -0.01 }),
      scen: scenario(),
    },
    {
      label: 'giây không nguyên',
      field: /scenario\.replaceSeconds/,
      policy: blueGreen(),
      scen: scenario({ replaceSeconds: 1.5 }),
    },
    {
      label: 'tỷ lệ lỗi > 1',
      field: /scenario\.candidateErrorRate/,
      policy: blueGreen(),
      scen: scenario({ candidateErrorRate: 1.1 }),
    },
    {
      label: 'tỷ lệ lỗi NaN',
      field: /scenario\.baselineErrorRate/,
      policy: blueGreen(),
      scen: scenario({ baselineErrorRate: Number.NaN }),
    },
    {
      label: 'rps 0',
      field: /scenario\.requestsPerSecond/,
      policy: blueGreen(),
      scen: scenario({ requestsPerSecond: 0 }),
    },
    {
      label: 'migration lạ',
      field: /scenario\.migration/,
      policy: blueGreen(),
      scen: scenario({ migration: 'maybe' as MigrationKind }),
    },
    {
      label: 'chiến lược lạ',
      field: /policy\.strategy/,
      policy: { strategy: 'teleport', onBadRelease: 'rollback' } as unknown as ReleasePolicy,
      scen: scenario(),
    },
    {
      label: 'phản ứng lạ',
      field: /policy\.onBadRelease/,
      policy: { strategy: 'blue-green', onBadRelease: 'pray' } as unknown as ReleasePolicy,
      scen: scenario(),
    },
  ];

  for (const c of OUT_OF_RANGE) {
    it(`${c.label} ⇒ RangeError nêu đúng trường, không kẹp ngầm`, () => {
      expect(() => run(c.policy, c.scen)).toThrow(RangeError);
      expect(() => run(c.policy, c.scen)).toThrow(c.field);
    });
  }

  it('passes 0 ⇒ RangeError, không trả một bản ghi "chạy được" mà rỗng', () => {
    expect(() => simulateRelease(blueGreen(), scenario(), { baseSeed: 1, passes: 0 })).toThrow(
      /evaluation\.passes/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════ phép chiếu

describe('phép chiếu trên bản ghi dựng tay', () => {
  function passRecord(
    pass: number,
    outcome: ReleaseOutcome,
    backoutAtSecond: number | null,
    recoveredAtSecond: number | null,
  ): ReleasePassRecord {
    return {
      pass,
      outcome,
      intervals: [],
      exposedAtSecond: 10,
      backoutAtSecond,
      recoveredAtSecond,
      finishedAtSecond: recoveredAtSecond ?? 50,
      peakInstances: 4,
    };
  }

  const MIXED: ReleaseRecord = {
    baseSeed: 1,
    error: null,
    passes: [
      passRecord(0, 'promoted', null, null),
      passRecord(1, 'rolled-back', 40, 43),
      passRecord(2, 'promoted', null, null),
      passRecord(3, 'rollback-blocked', 40, 640),
      passRecord(4, 'rolled-forward', 40, 640),
    ],
  };
  const bad = scenario({ baselineErrorRate: 0.01, candidateErrorRate: 0.3 });
  const good = scenario({ baselineErrorRate: 0.01, candidateErrorRate: 0.01 });

  it('rollbackSeconds = recovered − backout, null khi thăng hạng', () => {
    expect(MIXED.passes.map(rollbackSeconds)).toEqual([null, 3, null, 600, 600]);
  });

  it('bản xấu: 2 lượt lọt lưới, 0 báo động giả; bản tốt: 0 lọt lưới, 3 báo động giả — cùng một bản ghi', () => {
    expect(badReleasePromotedCount(MIXED, bad)).toBe(2);
    expect(goodReleaseAbortedCount(MIXED, bad)).toBe(0);
    expect(badReleasePromotedCount(MIXED, good)).toBe(0);
    expect(goodReleaseAbortedCount(MIXED, good)).toBe(3);
  });

  it('sự cố dữ liệu đếm đúng outcome rollback-blocked', () => {
    expect(dataIncidentCount(MIXED)).toBe(1);
  });

  it('bản ghi mâu thuẫn (outcome nói một đằng, mốc nói một nẻo) ⇒ ném, không đoán', () => {
    expect(() => rollbackSeconds(passRecord(0, 'promoted', 40, null))).toThrow(
      /outcome 'promoted'/,
    );
    expect(() => rollbackSeconds(passRecord(0, 'rolled-back', 40, null))).toThrow(
      /outcome 'rolled-back'/,
    );
  });
});
