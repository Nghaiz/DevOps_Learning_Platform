/**
 * AC-9 — **ba trục điểm là ba số độc lập**, cộng phần tổng hợp phân bố của A.8.
 *
 * ## Vì sao bản ghi ở đây dựng bằng tay
 *
 * Bộ sinh `EvaluationRecord` là việc của lane engine (A.2). Dựng tay có hai cái
 * lợi không đánh đổi được: (1) ba nhân chứng dưới đây cần những CON SỐ KIỂM
 * ĐƯỢC BẰNG ĐẦU, và một bản ghi do engine sinh ra thì phải tin engine trước khi
 * đọc được kết quả; (2) một lỗi của lane engine sẽ làm ô AC-9 đỏ vì lý do không
 * liên quan, và người đọc ô đỏ đó sẽ đi sửa nhầm chỗ.
 *
 * Bản ghi dựng tay KHÔNG phải bằng chứng engine tính đúng — nó là bằng chứng
 * TẦNG CHẤM tính đúng trên một bản ghi hợp lệ. Hai việc khác nhau, và việc kia
 * thuộc về test của A.2.
 *
 * ## Vì sao nhân chứng chỉ có MỘT lượt
 *
 * Fixture ở đây không có đỏ ngẫu nhiên, nên 20 lượt sẽ giống hệt nhau và con số
 * không đổi một chữ số nào — chỉ làm bảng khó đọc. Hành vi nhiều lượt được đo ở
 * ô "p50 chứ không trung bình", nơi nó thật sự thay đổi kết quả.
 *
 * ## Đơn vị, để đọc số dưới đây không phải mở file khác
 *
 * `SECONDS_PER_TICK = 10`, nên: 30 tick = 300 giây · 3 commit trong 30 tick =
 * 36 commit/giờ · 90 runner-tick = 15 runner-phút.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_EVALUATION_PASSES } from './contract.ts';
import type {
  AttemptOutcome,
  CommitId,
  EvaluationRecord,
  PassRecord,
  RunRecord,
  StageId,
  StageInstanceRecord,
  StageSpec,
  WorkflowSpec,
} from './contract.ts';
import {
  MIN_COMMITS_FOR_INDEPENDENT_THROUGHPUT,
  hasIndependentThroughput,
  percentile,
  scoreAxes,
  summarizeEvaluation,
} from './score.ts';

// ─────────────────────────────────────────────────────────── bộ dựng bản ghi

/** Một thực thể chạy MỘT lần thử. `slots` = số máy nó giữ suốt thời gian chạy. */
function instance(
  stageId: StageId,
  startedTick: number,
  durationTicks: number,
  outcome: AttemptOutcome = 'passed',
): StageInstanceRecord {
  const finishedTick = startedTick + durationTicks;
  return {
    instance: stageId,
    stageId,
    fanOutIndex: null,
    readyTick: startedTick,
    startedTick,
    finishedTick,
    attempts: [
      {
        attempt: 0,
        startedTick,
        finishedTick,
        outcome,
        cause: outcome === 'failed' ? { kind: 'flake', nature: 'infra' } : null,
        failedStep: null,
        steps: [],
      },
    ],
    blockedBy: { kind: 'none' },
    runnerTicks: durationTicks,
  };
}

/**
 * Đỏ ở lần thử đầu rồi xanh ở lần thử lại. Kết quả của thực thể là lần thử
 * CUỐI, và `runnerTicks` cộng dồn CẢ HAI lần — đó là cái giá của retry.
 */
function retried(stageId: StageId, startedTick: number, durationTicks: number): StageInstanceRecord {
  const firstEnd = startedTick + durationTicks;
  const finishedTick = firstEnd + durationTicks;
  return {
    instance: stageId,
    stageId,
    fanOutIndex: null,
    readyTick: startedTick,
    startedTick,
    finishedTick,
    attempts: [
      {
        attempt: 0,
        startedTick,
        finishedTick: firstEnd,
        outcome: 'failed',
        cause: { kind: 'flake', nature: 'infra' },
        failedStep: null,
        steps: [],
      },
      {
        attempt: 1,
        startedTick: firstEnd,
        finishedTick,
        outcome: 'passed',
        cause: null,
        failedStep: null,
        steps: [],
      },
    ],
    blockedBy: { kind: 'none' },
    runnerTicks: durationTicks * 2,
  };
}

function run(
  commitId: CommitId,
  arrivalTick: number,
  instances: readonly StageInstanceRecord[],
): RunRecord {
  const finishedTick = instances.reduce((max, item) => Math.max(max, item.finishedTick), 0);
  return { commitId, arrivalTick, finishedTick, instances, changedInputs: [] };
}

function passOf(index: number, runs: readonly RunRecord[]): PassRecord {
  const finishedTick = runs.reduce((max, item) => Math.max(max, item.finishedTick), 0);
  return { pass: index, runs, finishedTick };
}

function evaluationOf(passes: readonly PassRecord[]): EvaluationRecord {
  return { baseSeed: 1, error: null, passes };
}

/** Một lượt duy nhất — fixture không có đỏ ngẫu nhiên nên lượt nào cũng như lượt nào. */
function onePass(runs: readonly RunRecord[]): EvaluationRecord {
  return evaluationOf([passOf(0, runs)]);
}

function stageOf(id: StageId, blocking: boolean): StageSpec {
  return {
    id,
    kind: 'build',
    name: `Chặng ${id}`,
    dependsOn: [],
    steps: [],
    blocking,
    retries: 0,
    runnerClass: 'linux-nho',
  };
}

function workflowOf(ids: readonly StageId[], nonBlocking: readonly StageId[] = []): WorkflowSpec {
  return {
    name: 'Workflow dựng tay',
    stages: ids.map((id) => stageOf(id, !nonBlocking.includes(id))),
  };
}

const THREE_COMMITS: readonly CommitId[] = ['c1', 'c2', 'c3'];

/** Ba chặng nối tiếp, mỗi chặng 10 tick, bắt đầu từ `startTick`. */
function serialAbc(startTick: number): readonly StageInstanceRecord[] {
  return [
    instance('a', startTick, 10),
    instance('b', startTick + 10, 10),
    instance('c', startTick + 20, 10),
  ];
}

/** Bốn chặng nối tiếp, mỗi chặng 10 tick — tổng công việc 40 tick. */
function serialFour(startTick: number): readonly StageInstanceRecord[] {
  return [
    instance('s1', startTick, 10),
    instance('s2', startTick + 10, 10),
    instance('s3', startTick + 20, 10),
    instance('s4', startTick + 30, 10),
  ];
}

/** Bốn chặng SONG SONG, mỗi chặng 10 tick — cùng 40 tick công việc, xong sau 10. */
function parallelFour(startTick: number): readonly StageInstanceRecord[] {
  return [
    instance('s1', startTick, 10),
    instance('s2', startTick, 10),
    instance('s3', startTick, 10),
    instance('s4', startTick, 10),
  ];
}

const WF_ABC = workflowOf(['a', 'b', 'c']);
const WF_ABC_LINT = workflowOf(['a', 'b', 'c', 'lint'], ['lint']);
const WF_FOUR = workflowOf(['s1', 's2', 's3', 's4']);
const WF_BUILD = workflowOf(['build']);

/** Đọc ba trục, và đỏ NGAY tại chỗ nếu bản ghi không chấm được. */
function axesOf(record: EvaluationRecord, workflow: WorkflowSpec) {
  const axes = scoreAxes(record, workflow);
  if (axes === null) {
    throw new Error('fixture phải chấm được — bản ghi này trả null');
  }
  return axes;
}

// ═════════════════════════════════════════════════════════════════════════
// Phân vị — nền của cả hai trục p50
// ═════════════════════════════════════════════════════════════════════════

describe('percentile — hạng gần nhất, không nội suy', () => {
  it('p50 của dãy chẵn là giá trị CÓ THẬT, không phải trung bình hai giá trị giữa', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
  });

  it('với phân bố hai đỉnh, quy ước nội suy sẽ trả một số không lượt nào đạt được', () => {
    const bimodal = [10, 10, 90, 90];
    expect(percentile(bimodal, 0.5)).toBe(10);
    // Quy ước nội suy cho ra (10 + 90) / 2 = 50 — nằm đúng thung lũng giữa hai
    // đỉnh, và không lượt nào trong dãy bằng nó. Đây là lý do file score.ts
    // chọn hạng gần nhất, và ô này đỏ nếu ai đó đổi quy ước.
    expect(bimodal).not.toContain(50);
  });

  it('q = 0 là nhỏ nhất, q = 1 là lớn nhất, dãy một phần tử trả chính nó', () => {
    expect(percentile([3, 1, 2], 0)).toBe(1);
    expect(percentile([3, 1, 2], 1)).toBe(3);
    expect(percentile([5], 0.5)).toBe(5);
  });

  it('ném khi dãy rỗng hoặc q ngoài [0, 1] — không trả một số mặc định', () => {
    // Một giá trị mặc định ở đây đi thẳng vào điểm của người chơi và trông hợp lệ.
    expect(() => percentile([], 0.5)).toThrow(/rỗng/);
    expect(() => percentile([1], 1.5)).toThrow(/\[0, 1\]/);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// AC-9 — ba nhân chứng. Mỗi ô đổi ĐÚNG MỘT trục, hai trục kia đứng yên.
// ═════════════════════════════════════════════════════════════════════════

describe('AC-9 nhân chứng A — thông lượng KHÔNG suy ra được từ lead time', () => {
  // X: một máy, ba commit tới cách nhau đúng 30 tick (hàng không bao giờ dồn).
  const workloadX = onePass([
    run('c1', 0, serialAbc(0)),
    run('c2', 30, serialAbc(30)),
    run('c3', 60, serialAbc(60)),
  ]);
  // Y: ba máy, ba commit tới cùng lúc (hàng dồn, và hệ nuốt được).
  const workloadY = onePass(THREE_COMMITS.map((id) => run(id, 0, serialAbc(0))));

  it('điều kiện tiên quyết: cả hai ca đều ≥ 3 commit mỗi lượt', () => {
    // ⛔ Ô này KHÔNG phải thủ tục. Với một commit thì thông lượng = 3600 / lead
    // time theo ĐỊNH NGHĨA (xem ô "một commit" bên dưới), và cả nhân chứng A
    // sụp thành một phép chia. Hạ số commit xuống là ô này đỏ — chứ không phải
    // AC-9 im lặng rỗng nghĩa.
    expect(MIN_COMMITS_FOR_INDEPENDENT_THROUGHPUT).toBe(3);
    expect(hasIndependentThroughput(workloadX)).toBe(true);
    expect(hasIndependentThroughput(workloadY)).toBe(true);
  });

  it('cùng lead time 300 giây, thông lượng 12 so với 36 commit/giờ', () => {
    const x = axesOf(workloadX, WF_ABC);
    const y = axesOf(workloadY, WF_ABC);

    // ① đứng yên: đường găng của MỘT commit là 30 tick ở cả hai ca.
    expect(x.leadTimeSeconds).toBe(300);
    expect(y.leadTimeSeconds).toBe(300);
    // ③ cũng đứng yên: 9 thực thể × 10 tick = 90 runner-tick ở cả hai ca.
    expect(x.runnerMinutes).toBe(15);
    expect(y.runnerMinutes).toBe(15);
    // ② là thứ DUY NHẤT đổi, và đổi gấp ba.
    expect(x.throughputPerHour).toBe(12);
    expect(y.throughputPerHour).toBe(36);
    expect(y.throughputPerHour).toBe(x.throughputPerHour * 3);
  });

  it('fixture xanh hoàn toàn nên greenRate không làm nhiễu phép so', () => {
    expect(axesOf(workloadX, WF_ABC).greenRate).toBe(1);
    expect(axesOf(workloadY, WF_ABC).greenRate).toBe(1);
  });
});

describe('AC-9 nhân chứng B — runner-phút KHÔNG suy ra được từ hai trục kia', () => {
  const withoutLint = onePass(THREE_COMMITS.map((id) => run(id, 0, serialAbc(0))));
  // Thêm một chặng `lint` 5 tick NGOÀI đường găng: chạy từ tick 0, xong ở tick
  // 5, không giành máy với ai, không ai chờ nó.
  const withLint = onePass(
    THREE_COMMITS.map((id) => run(id, 0, [...serialAbc(0), instance('lint', 0, 5)])),
  );

  it('lead time và thông lượng đứng yên, runner-phút tăng 15 tick = 2,5 phút', () => {
    const before = axesOf(withoutLint, WF_ABC);
    const after = axesOf(withLint, WF_ABC_LINT);

    expect(before.leadTimeSeconds).toBe(300);
    expect(after.leadTimeSeconds).toBe(300);
    expect(before.throughputPerHour).toBe(36);
    expect(after.throughputPerHour).toBe(36);

    // 5 tick × 1 máy × 3 commit = 15 tick = 2,5 phút — đúng số §6 hợp đồng nêu.
    expect(before.runnerMinutes).toBe(15);
    expect(after.runnerMinutes).toBe(17.5);
  });

  it('lint đỏ mà không chặn thì lượt vẫn xanh — ③ tăng, độ tin cậy không đổi', () => {
    const lintRed = onePass(
      THREE_COMMITS.map((id) => run(id, 0, [...serialAbc(0), instance('lint', 0, 5, 'failed')])),
    );
    expect(axesOf(lintRed, WF_ABC_LINT).greenRate).toBe(1);
  });
});

describe('AC-9 nhân chứng C — lead time KHÔNG suy ra được từ runner-phút', () => {
  const serial = onePass(THREE_COMMITS.map((id) => run(id, 0, serialFour(0))));
  const parallel = onePass(THREE_COMMITS.map((id) => run(id, 0, parallelFour(0))));

  it('cùng 40 tick công việc mỗi commit, lead time 400 so với 100 giây', () => {
    const a = axesOf(serial, WF_FOUR);
    const b = axesOf(parallel, WF_FOUR);

    // ③ đứng yên: 4 chặng × 10 tick × 3 commit = 120 runner-tick = 20 phút.
    expect(a.runnerMinutes).toBe(20);
    expect(b.runnerMinutes).toBe(20);
    // ① đổi gấp bốn.
    expect(a.leadTimeSeconds).toBe(400);
    expect(b.leadTimeSeconds).toBe(100);
  });

  it('bản mở rộng: cố định CẢ ② lẫn ③, lead time vẫn đổi', () => {
    // ⚠ Nhân chứng C của hợp đồng chỉ cố định ③ — ② đổi theo (27 so với 108).
    // Nên nó chứng minh ① ∉ f(③), chưa chứng minh ① ∉ f(②, ③). Ca này đóng
    // nốt: ba commit tới lệch nhau 15 tick, mỗi commit chạy song song 10 tick,
    // nên lượt vẫn kết thúc ở tick 40 y như ca nối tiếp — cùng ②, cùng ③.
    //
    // Đây cũng là một bài học CI/CD thật, không phải một fixture bịa: gom lô và
    // chảy dòng cho ra CÙNG thông lượng và CÙNG chi phí máy, nhưng người đẩy
    // commit ở ca gom lô chờ gấp bốn lần.
    const staggered = onePass([
      run('c1', 0, parallelFour(0)),
      run('c2', 15, parallelFour(15)),
      run('c3', 30, parallelFour(30)),
    ]);
    const batched = axesOf(serial, WF_FOUR);
    const streamed = axesOf(staggered, WF_FOUR);

    expect(batched.throughputPerHour).toBe(27);
    expect(streamed.throughputPerHour).toBe(27);
    expect(batched.runnerMinutes).toBe(20);
    expect(streamed.runnerMinutes).toBe(20);
    expect(batched.leadTimeSeconds).toBe(400);
    expect(streamed.leadTimeSeconds).toBe(100);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Ô GÁC: ở ca một commit, hai trục ĐÚNG LÀ suy ra được nhau
// ═════════════════════════════════════════════════════════════════════════

describe('một commit — ② là một hàm của ①, nên AC-9 không đo được gì ở đó', () => {
  const singleStage = onePass([run('c1', 0, [instance('build', 0, 30)])]);
  const fourStages = onePass([run('c1', 0, serialFour(0))]);

  it('hai workflow khác hẳn nhau vẫn cho cùng một tích 3600', () => {
    // Với đúng một commit tới ở tick 0, `finishedTick` của lượt bằng
    // `finishedTick` của commit, nên:
    //     throughputPerHour = 3600 / leadTimeSeconds
    // Tích của hai trục bị GHIM ở 3600 bất kể workflow có hình dạng gì. Hai ca
    // dưới đây khác nhau cả số chặng lẫn thời lượng và vẫn ra cùng một tích —
    // đó là bằng chứng hai trục mang CÙNG một lượng thông tin.
    const one = axesOf(singleStage, WF_BUILD);
    const four = axesOf(fourStages, WF_FOUR);

    expect(one.leadTimeSeconds).toBe(300);
    expect(one.throughputPerHour).toBe(12);
    expect(one.leadTimeSeconds * one.throughputPerHour).toBe(3600);

    expect(four.leadTimeSeconds).toBe(400);
    expect(four.throughputPerHour).toBe(9);
    expect(four.leadTimeSeconds * four.throughputPerHour).toBe(3600);

    expect(hasIndependentThroughput(singleStage)).toBe(false);
    expect(hasIndependentThroughput(fourStages)).toBe(false);
  });

  it('với ba commit thì tích KHÔNG bị ghim — hai lượt cùng ① cho hai tích khác nhau', () => {
    // Đây là chỗ ô này bảo vệ AC-9. Nếu ai đó rút nhân chứng A xuống một commit
    // "cho gọn", ô tiên quyết của A đỏ, và ô này đứng sẵn giải thích vì sao.
    //
    // ⚠ Một tích bằng 3600 tự nó KHÔNG chứng minh suy biến: ca X của nhân chứng
    // A cũng ra 3600, vì ba commit của nó tới cách nhau đúng một lead time nên
    // hàng chưa bao giờ dồn. Thứ chứng minh suy biến là tích bị GHIM — cùng ①
    // thì buộc cùng ②. Ca Y phá điều đó.
    const x = axesOf(
      onePass([
        run('c1', 0, serialAbc(0)),
        run('c2', 30, serialAbc(30)),
        run('c3', 60, serialAbc(60)),
      ]),
      WF_ABC,
    );
    const y = axesOf(onePass(THREE_COMMITS.map((id) => run(id, 0, serialAbc(0)))), WF_ABC);

    expect(x.leadTimeSeconds).toBe(y.leadTimeSeconds);
    expect(x.leadTimeSeconds * x.throughputPerHour).toBe(3600);
    expect(y.leadTimeSeconds * y.throughputPerHour).toBe(10_800);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// A.8 — tổng hợp phân bố qua nhiều lượt
// ═════════════════════════════════════════════════════════════════════════

describe('A.8 — p50 chứ không trung bình, đo trên một bản ghi có lượt flaky', () => {
  // 20 lượt (đúng `DEFAULT_EVALUATION_PASSES`), mỗi lượt 3 commit.
  // 17 lượt trơn: mỗi commit 30 tick. 3 lượt dính đỏ giả rồi thử lại tới xanh:
  // mỗi commit 150 tick. Đường ống VẪN xanh ở cả 20 lượt — đây thuần là chuyện
  // đuôi phân bố, không phải chuyện độ tin cậy.
  const smoothRuns = THREE_COMMITS.map((id) => run(id, 0, [instance('build', 0, 30)]));
  const slowRuns = THREE_COMMITS.map((id) => run(id, 0, [instance('build', 0, 150)]));
  const record = evaluationOf([
    ...Array.from({ length: 17 }, (_, i) => passOf(i, smoothRuns)),
    ...Array.from({ length: 3 }, (_, i) => passOf(17 + i, slowRuns)),
  ]);

  it('bản ghi đúng 20 lượt như hằng sư phạm của hợp đồng', () => {
    expect(record.passes.length).toBe(DEFAULT_EVALUATION_PASSES);
  });

  it('p50 = 300 giây, trung bình = 480 giây, và 480 không phải lượt nào cả', () => {
    const summary = summarizeEvaluation(record, WF_BUILD);
    expect(summary).not.toBeNull();
    if (summary === null) return;

    const lead = summary.leadTimeSeconds;
    expect(lead.count).toBe(60); // 20 lượt × 3 commit
    expect(lead.p50).toBe(300);
    expect(lead.mean).toBe(480);
    // Con số trung bình mô tả một lượt chạy CHƯA TỪNG XẢY RA.
    expect([...new Set(lead.samples)]).toEqual([300, 1500]);
    expect(lead.samples).not.toContain(480);
    // Đuôi không bị giấu — nó nằm ở p90 và max, chỗ 19.E.4 vẽ được.
    expect(lead.p90).toBe(1500);
    expect(lead.max).toBe(1500);
    expect(lead.min).toBe(300);
  });

  it('với ngân sách 400 giây, trung bình sẽ đánh trượt một đường ống 17/20 lượt dưới ngân sách', () => {
    const budgetLeadSeconds = 400;
    const lead = summarizeEvaluation(record, WF_BUILD)?.leadTimeSeconds;
    expect(lead).toBeDefined();
    if (lead === undefined) return;

    expect(lead.p50).toBeLessThanOrEqual(budgetLeadSeconds); // đạt
    expect(lead.mean).toBeGreaterThan(budgetLeadSeconds); // sẽ trượt
    expect(lead.samples.filter((value) => value <= budgetLeadSeconds).length).toBe(51);
  });

  it('thông lượng cũng lấy p50, còn runner-phút lấy TRUNG BÌNH', () => {
    const summary = summarizeEvaluation(record, WF_BUILD);
    expect(summary).not.toBeNull();
    if (summary === null) return;

    // ② — một mẫu mỗi lượt: 17 lượt 36/giờ, 3 lượt 7,2/giờ.
    expect(summary.throughputPerHour.count).toBe(DEFAULT_EVALUATION_PASSES);
    expect(summary.throughputPerHour.p50).toBe(36);
    expect(summary.throughputPerHour.min).toBeCloseTo(7.2, 10);
    expect(summary.axes.throughputPerHour).toBe(summary.throughputPerHour.p50);

    // ③ — tài nguyên cộng dồn, nên phần đốt thêm của 3 lượt chậm PHẢI được tính:
    // (17 × 15 + 3 × 75) / 20 = 24 phút. Lấy p50 ở đây sẽ báo 15 và giấu mất
    // đúng cái giá của việc thử lại.
    expect(summary.runnerMinutes.p50).toBe(15);
    expect(summary.runnerMinutes.mean).toBe(24);
    expect(summary.axes.runnerMinutes).toBe(24);

    // Đường ống xanh ở cả 20 lượt: vấn đề là đuôi, không phải độ tin cậy.
    expect(summary.greenPasses).toBe(DEFAULT_EVALUATION_PASSES);
    expect(summary.axes.greenRate).toBe(1);
  });

  it('mẫu trả về đã sắp tăng dần để 19.E.4 vẽ được thẳng', () => {
    const summary = summarizeEvaluation(record, WF_BUILD);
    expect(summary).not.toBeNull();
    if (summary === null) return;
    for (const dist of [summary.leadTimeSeconds, summary.throughputPerHour, summary.runnerMinutes]) {
      expect([...dist.samples].sort((a, b) => a - b)).toEqual([...dist.samples]);
      expect(dist.samples.length).toBe(dist.count);
    }
  });
});

describe('A.8 — retry đốt runner-phút thật, và bản ghi đếm được', () => {
  it('một lần thử lại nhân đôi runner-tick của thực thể, lead time cũng dài ra', () => {
    const clean = onePass(THREE_COMMITS.map((id) => run(id, 0, [instance('build', 0, 30)])));
    const withRetry = onePass(THREE_COMMITS.map((id) => run(id, 0, [retried('build', 0, 30)])));

    expect(axesOf(clean, WF_BUILD).runnerMinutes).toBe(15);
    expect(axesOf(withRetry, WF_BUILD).runnerMinutes).toBe(30);
    expect(axesOf(withRetry, WF_BUILD).leadTimeSeconds).toBe(600);
    // Thử lại xong thì xanh — và đó chính là chỗ bài C11 đau: xanh, nhưng đắt.
    expect(axesOf(withRetry, WF_BUILD).greenRate).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// greenRate — ngưỡng đạt/trượt, KHÔNG phải trục thứ tư
// ═════════════════════════════════════════════════════════════════════════

describe('greenRate — đọc theo `blocking` của workflow, không đoán từ bản ghi', () => {
  const workflow = workflowOf(['build', 'lint'], ['lint']);
  const record = evaluationOf([
    // 0 — lint đỏ nhưng không chặn ⇒ xanh.
    passOf(0, [run('c1', 0, [instance('build', 0, 10), instance('lint', 0, 5, 'failed')])]),
    // 1 — sạch ⇒ xanh.
    passOf(1, [run('c1', 0, [instance('build', 0, 10), instance('lint', 0, 5)])]),
    // 2 — chặng chặn đỏ ⇒ đỏ.
    passOf(2, [run('c1', 0, [instance('build', 0, 10, 'failed'), instance('lint', 0, 5)])]),
    // 3 — chặng chặn VẮNG MẶT ⇒ đỏ, không phải "xanh một cách rỗng".
    passOf(3, [run('c1', 0, [instance('lint', 0, 5)])]),
  ]);

  it('2 trên 4 lượt xanh', () => {
    const summary = summarizeEvaluation(record, workflow);
    expect(summary).not.toBeNull();
    if (summary === null) return;
    expect(summary.greenPasses).toBe(2);
    expect(summary.totalPasses).toBe(4);
    expect(summary.axes.greenRate).toBe(0.5);
  });

  it('cùng bản ghi, khai `build` là không-chặn thì tỷ lệ xanh đổi — nên nó KHÔNG suy ra được từ bản ghi', () => {
    // Ô này là bằng chứng cho quyết định "hàm nhận thêm WorkflowSpec": cùng một
    // `EvaluationRecord`, hai workflow, hai tỷ lệ xanh. Một hiện thực đoán
    // `blocking` từ bản ghi sẽ sai ở đúng chỗ này và sai trong im lặng.
    const allNonBlockingButLint = workflowOf(['build', 'lint'], ['build']);
    const summary = summarizeEvaluation(record, allNonBlockingButLint);
    expect(summary).not.toBeNull();
    if (summary === null) return;
    // Giờ `lint` là chặng chặn: lượt 0 đỏ (lint đỏ), lượt 1 xanh, lượt 2 xanh
    // (build đỏ nhưng không chặn), lượt 3 xanh.
    expect(summary.greenPasses).toBe(3);
  });

  it('kết quả của một thực thể là lần thử CUỐI, không phải lần đầu', () => {
    const record2 = evaluationOf([passOf(0, [run('c1', 0, [retried('build', 0, 10)])])]);
    expect(axesOf(record2, WF_BUILD).greenRate).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// Không chấm được ⇒ null, KHÔNG phải ba số 0
// ═════════════════════════════════════════════════════════════════════════

describe('bản ghi không chấm được', () => {
  it('workflow có chu trình trả null — ba số 0 sẽ chấm nó thành đường ống hoàn hảo', () => {
    // Nếu hàm trả `{ leadTimeSeconds: 0, runnerMinutes: 0, ... }` thì hai vị từ
    // `leadTimeUnder` và `runnerMinutesUnder` ĐẠT với mọi ngưỡng dương — một
    // workflow không chạy được sẽ ăn điểm cao nhất ở hai trên ba trục.
    const cycle: EvaluationRecord = {
      baseSeed: 7,
      error: { kind: 'cycle', stages: ['a', 'b'] },
      passes: [],
    };
    expect(scoreAxes(cycle, WF_ABC)).toBeNull();
    expect(summarizeEvaluation(cycle, WF_ABC)).toBeNull();
  });

  it('không lượt nào, hoặc lượt không có commit nào, đều trả null', () => {
    expect(scoreAxes(evaluationOf([]), WF_ABC)).toBeNull();
    expect(scoreAxes(evaluationOf([passOf(0, [])]), WF_ABC)).toBeNull();
  });

  it('lượt kết thúc ở tick 0 không cho thông lượng nào đọc được', () => {
    // "Bao nhiêu commit mỗi giờ" không phát biểu được trên một khoảng rỗng —
    // quy về 0 hay vô cực đều là nói dối, nên bản ghi này không chấm được.
    const instant = evaluationOf([passOf(0, [run('c1', 0, [instance('build', 0, 0)])])]);
    expect(instant.passes[0]?.finishedTick).toBe(0);
    expect(scoreAxes(instant, WF_BUILD)).toBeNull();
  });
});
