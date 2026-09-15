import { describe, expect, it } from 'vitest';

import type {
  CommitArrival,
  EvaluationRecord,
  StageSpec,
  StepSpec,
  WorkflowSpec,
  WorkloadSpec,
} from './contract.ts';
import { criticalPath } from './critical-path.ts';
import { evaluate, expandStage, simulatePass, validateWorkflow } from './engine.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Bộ dựng — giữ fixture ngắn để cái ĐANG ĐO nổi lên trong từng test
// ═══════════════════════════════════════════════════════════════════════════

function buoc(id: string, durationTicks: number, them: Partial<StepSpec> = {}): StepSpec {
  return { id, name: `Bước ${id}`, durationTicks, blocking: true, ...them };
}

function chang(id: string, steps: readonly StepSpec[], them: Partial<StageSpec> = {}): StageSpec {
  return {
    id,
    kind: 'build',
    name: `Chặng ${id}`,
    dependsOn: [],
    steps,
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
    ...them,
  };
}

function quyTrinh(stages: readonly StageSpec[]): WorkflowSpec {
  return { name: 'Quy trình thử', stages };
}

function danMay(count: number, commits: readonly CommitArrival[], them: Partial<WorkloadSpec> = {}): WorkloadSpec {
  return {
    runners: [{ id: 'linux', label: 'Máy Linux', count }],
    inputs: [],
    commits,
    ...them,
  };
}

/** Ba chặng nối tiếp, mỗi chặng một bước 10 tick. Dùng cho nhân chứng A. */
const NOI_TIEP = quyTrinh([
  chang('a', [buoc('a1', 10)]),
  chang('b', [buoc('b1', 10)], { dependsOn: ['a'] }),
  chang('c', [buoc('c1', 10)], { dependsOn: ['b'] }),
]);

function leadTimes(record: EvaluationRecord, pass = 0): readonly number[] {
  return (record.passes[pass]?.runs ?? []).map((run) => run.finishedTick - run.arrivalTick);
}

// ═══════════════════════════════════════════════════════════════════════════
// Quạt stage ra thực thể
// ═══════════════════════════════════════════════════════════════════════════

describe('expandStage', () => {
  it('stage không quạt ⇒ một thực thể, khoá là chính id, fanOutIndex null', () => {
    expect(expandStage(chang('build', [buoc('s', 1)]))).toEqual([
      { instance: 'build', stageId: 'build', fanOutIndex: null },
    ]);
  });

  it('sinh tổ hợp theo thứ tự trục đầu chạy CHẬM NHẤT', () => {
    const stage = chang('test', [buoc('s', 1)], {
      fanOut: {
        axes: [
          { name: 'node', values: ['20', '22'] },
          { name: 'os', values: ['ubuntu', 'mac'] },
        ],
      },
    });
    expect(expandStage(stage).map((one) => one.instance)).toEqual([
      'test#20/ubuntu',
      'test#20/mac',
      'test#22/ubuntu',
      'test#22/mac',
    ]);
  });

  it('exclude loại đúng tổ hợp được gọi tên', () => {
    const stage = chang('test', [buoc('s', 1)], {
      fanOut: {
        axes: [
          { name: 'node', values: ['20', '22'] },
          { name: 'os', values: ['ubuntu', 'mac'] },
        ],
        exclude: ['test#22/mac'],
      },
    });
    expect(expandStage(stage).map((one) => one.instance)).toEqual([
      'test#20/ubuntu',
      'test#20/mac',
      'test#22/ubuntu',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kiểm tra workflow
// ═══════════════════════════════════════════════════════════════════════════

describe('validateWorkflow', () => {
  it('cạnh treo ⇒ unknown-dependency, kèm đúng tên stage thiếu', () => {
    const wf = quyTrinh([chang('a', [buoc('s', 1)], { dependsOn: ['khong-co'] })]);
    expect(validateWorkflow(wf, danMay(1, [{ id: 'c1', tick: 0 }]))).toEqual({
      kind: 'unknown-dependency',
      stage: 'a',
      missing: 'khong-co',
    });
  });

  it('chu trình ⇒ cycle kèm ĐÚNG các stage trong vòng', () => {
    const wf = quyTrinh([
      chang('a', [buoc('s', 1)], { dependsOn: ['c'] }),
      chang('b', [buoc('s', 1)], { dependsOn: ['a'] }),
      chang('c', [buoc('s', 1)], { dependsOn: ['b'] }),
      chang('ngoai', [buoc('s', 1)]),
    ]);
    const loi = validateWorkflow(wf, danMay(1, [{ id: 'c1', tick: 0 }]));
    expect(loi?.kind).toBe('cycle');
    const trongVong = loi?.kind === 'cycle' ? [...loi.stages].sort() : [];
    expect(trongVong).toEqual(['a', 'b', 'c']);
  });

  it('runnerSlots lớn hơn cả hạng máy ⇒ unschedulable, KHÔNG treo', () => {
    const wf = quyTrinh([chang('a', [buoc('s', 1)], { runnerSlots: 4 })]);
    expect(validateWorkflow(wf, danMay(2, [{ id: 'c1', tick: 0 }]))).toEqual({
      kind: 'unschedulable',
      stage: 'a',
      runnerClass: 'linux',
    });
  });

  it('hạng máy không tồn tại ⇒ unschedulable', () => {
    const wf = quyTrinh([chang('a', [buoc('s', 1)], { runnerClass: 'macos' })]);
    expect(validateWorkflow(wf, danMay(2, [{ id: 'c1', tick: 0 }]))?.kind).toBe('unschedulable');
  });

  it('runnerSlots: 0 hợp lệ — cổng phê duyệt tốn thời gian mà không giữ máy', () => {
    const wf = quyTrinh([chang('duyet', [buoc('s', 5)], { kind: 'approval', runnerSlots: 0 })]);
    expect(validateWorkflow(wf, danMay(1, [{ id: 'c1', tick: 0 }]))).toBeNull();
  });

  it('workflow hỏng ⇒ passes RỖNG, không có điểm từng phần', () => {
    const wf = quyTrinh([chang('a', [buoc('s', 1)], { dependsOn: ['b'] })]);
    const record = evaluate(wf, danMay(1, [{ id: 'c1', tick: 0 }]), { baseSeed: 1, passes: 5 });
    expect(record.error?.kind).toBe('unknown-dependency');
    expect(record.passes).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Hàng đợi và máy chạy
// ═══════════════════════════════════════════════════════════════════════════

describe('hàng đợi khoá theo stageId, không theo vị trí mảng', () => {
  it('sắp lại thứ tự stage trong mảng KHÔNG đổi kết quả chấm', () => {
    // Đây là điều kiện để 19.C.2 ghi ngược YAML an toàn. Nếu vị trí mảng đi vào
    // luật xếp lịch thì một vòng đọc-ghi sẽ âm thầm đổi điểm người chơi.
    const xuoi = quyTrinh([
      chang('a', [buoc('a1', 7)]),
      chang('b', [buoc('b1', 3)]),
      chang('c', [buoc('c1', 5)]),
    ]);
    const nguoc = quyTrinh([...xuoi.stages].reverse());
    const workload = danMay(1, [{ id: 'c1', tick: 0 }]);
    const spec = { baseSeed: 3, passes: 2 } as const;
    expect(JSON.stringify(evaluate(nguoc, workload, spec))).toBe(
      JSON.stringify(evaluate(xuoi, workload, spec)),
    );
  });

  it('không đủ máy ⇒ chạy theo thứ tự stageId tăng dần', () => {
    const wf = quyTrinh([
      chang('zeta', [buoc('z', 10)]),
      chang('alpha', [buoc('a', 10)]),
      chang('mike', [buoc('m', 10)]),
    ]);
    const pass = simulatePass(wf, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0);
    const moc = (pass.runs[0]?.instances ?? []).map((one) => [one.stageId, one.startedTick]);
    expect(moc).toEqual([
      ['alpha', 0],
      ['mike', 10],
      ['zeta', 20],
    ]);
  });
});

describe('nhân chứng A — thông lượng KHÔNG suy ra được từ lead time', () => {
  const spec = { baseSeed: 1, passes: 1 } as const;
  const chatMay = danMay(1, [
    { id: 'c1', tick: 0 },
    { id: 'c2', tick: 30 },
    { id: 'c3', tick: 60 },
  ]);
  const rongMay = danMay(3, [
    { id: 'c1', tick: 0 },
    { id: 'c2', tick: 0 },
    { id: 'c3', tick: 0 },
  ]);

  it('lead time của MỘT commit giống nhau ở cả hai dàn máy', () => {
    expect(leadTimes(evaluate(NOI_TIEP, chatMay, spec))).toEqual([30, 30, 30]);
    expect(leadTimes(evaluate(NOI_TIEP, rongMay, spec))).toEqual([30, 30, 30]);
  });

  it('thông lượng thì khác hẳn — commit CHỒNG LÊN NHAU khi có đủ máy', () => {
    expect(evaluate(NOI_TIEP, chatMay, spec).passes[0]?.finishedTick).toBe(90);
    expect(evaluate(NOI_TIEP, rongMay, spec).passes[0]?.finishedTick).toBe(30);
  });
});

describe('blockedBy được GHI lúc xếp lịch', () => {
  it('chờ MÁY ⇒ kind runner, kèm thực thể vừa nhả chỗ', () => {
    const wf = quyTrinh([chang('a', [buoc('a1', 10)]), chang('b', [buoc('b1', 10)])]);
    const pass = simulatePass(wf, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0);
    const [a, b] = pass.runs[0]?.instances ?? [];
    expect(a?.blockedBy).toEqual({ kind: 'none' });
    expect(b?.readyTick).toBe(0);
    expect(b?.startedTick).toBe(10);
    expect(b?.blockedBy).toEqual({
      kind: 'runner',
      instance: 'a',
      runnerClass: 'linux',
      commitId: 'c1',
    });
  });

  it('kẻ giữ máy thuộc commit KHÁC ⇒ commitId phải trỏ đúng commit đó', () => {
    // `InstanceKey` không mang `commitId`, nên hai commit dùng y hệt chuỗi khoá
    // cho cùng một stage. Thiếu `commitId` thì khoá trỏ ra ngoài
    // `RunRecord.instances` của chính thực thể đang chờ, và đường găng cụt đúng
    // ở những level dạy thông lượng (≥ 3 commit) — tức đúng chỗ nó cần chạy.
    const wf = quyTrinh([chang('a', [buoc('a1', 10)])]);
    const pass = simulatePass(
      wf,
      danMay(1, [
        { id: 'c1', tick: 0 },
        { id: 'c2', tick: 0 },
      ]),
      1,
      0,
    );
    const cho = pass.runs[1]?.instances[0];
    expect(cho?.startedTick).toBe(10);
    expect(cho?.blockedBy).toEqual({
      kind: 'runner',
      instance: 'a',
      runnerClass: 'linux',
      // Commit của kẻ GIỮ máy, không phải của kẻ đang chờ.
      commitId: 'c1',
    });
  });

  it('chờ PHỤ THUỘC ⇒ kind dependency, kèm phụ thuộc xong muộn nhất', () => {
    const wf = quyTrinh([
      chang('a', [buoc('a1', 4)]),
      chang('b', [buoc('b1', 9)]),
      chang('c', [buoc('c1', 2)], { dependsOn: ['a', 'b'] }),
    ]);
    const pass = simulatePass(wf, danMay(3, [{ id: 'c1', tick: 0 }]), 1, 0);
    const c = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'c');
    expect(c?.readyTick).toBe(9);
    expect(c?.startedTick).toBe(9);
    expect(c?.blockedBy).toEqual({ kind: 'dependency', instance: 'b' });
  });

  it('phụ thuộc 0 tick xong ĐÚNG lúc commit tới vẫn ghi dependency, không phải none', () => {
    // Nếu điều kiện là `readyTick > arrivalTick` thì ca này ghi `none` và chuỗi
    // đi ngược của đường găng ĐỨT ngay tại đây — mà không test nào của lane đồ
    // thị bắt được, vì test bên đó dựng `StageInstanceRecord` bằng tay.
    const wf = quyTrinh([
      chang('cong', [buoc('c1', 0)]),
      chang('sau', [buoc('s1', 5)], { dependsOn: ['cong'] }),
    ]);
    const pass = simulatePass(wf, danMay(2, [{ id: 'c1', tick: 0 }]), 1, 0);
    const sau = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'sau');
    expect(sau?.readyTick).toBe(0);
    expect(sau?.startedTick).toBe(0);
    expect(sau?.blockedBy).toEqual({ kind: 'dependency', instance: 'cong' });
  });

  it('fan-in: phụ thuộc một stage đã quạt là chờ TẤT CẢ thực thể của nó', () => {
    const wf = quyTrinh([
      chang('test', [buoc('t', 6)], {
        fanOut: { axes: [{ name: 'node', values: ['20', '22', '24'] }] },
      }),
      chang('gop', [buoc('g', 1)], { dependsOn: ['test'] }),
    ]);
    // Chỉ hai máy cho ba thực thể ⇒ thực thể thứ ba xong ở tick 12, không phải 6.
    const pass = simulatePass(wf, danMay(2, [{ id: 'c1', tick: 0 }]), 1, 0);
    const gop = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'gop');
    expect(gop?.readyTick).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Cache — TRÚNG khoá khác ĐÚNG nội dung
// ═══════════════════════════════════════════════════════════════════════════

const BA_COMMIT: readonly CommitArrival[] = [
  { id: 'c1', tick: 0 },
  { id: 'c2', tick: 50 },
  { id: 'c3', tick: 100 },
];

/** `src` đổi mọi commit; `lock` chu kỳ 5 nên KHÔNG đổi trong ba commit đầu. */
function khoTrongBaCommit(them: Partial<WorkloadSpec> = {}): WorkloadSpec {
  return danMay(1, BA_COMMIT, {
    inputs: [
      { id: 'src', label: 'Mã nguồn', changesEvery: 1 },
      { id: 'lock', label: 'Khoá phụ thuộc', changesEvery: 5 },
    ],
    ...them,
  });
}

function cacBuoc(record: EvaluationRecord): readonly {
  readonly commitId: string;
  readonly cacheHit: boolean | null;
  readonly durationTicks: number;
  readonly outcome: string;
}[] {
  const out: {
    commitId: string;
    cacheHit: boolean | null;
    durationTicks: number;
    outcome: string;
  }[] = [];
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const instance of run.instances) {
        for (const attempt of instance.attempts) {
          for (const step of attempt.steps) {
            out.push({
              commitId: run.commitId,
              cacheHit: step.cacheHit,
              durationTicks: step.durationTicks,
              outcome: step.outcome,
            });
          }
        }
      }
    }
  }
  return out;
}

describe('cache', () => {
  it('khoá ổn định ⇒ trượt lần đầu rồi trúng, và trúng thì BỚT đúng savesTicks', () => {
    const wf = quyTrinh([
      chang('build', [
        buoc('b1', 10, {
          cache: { id: 'deps', keyParts: ['lock'], invalidatedBy: ['lock'], savesTicks: 6 },
        }),
      ]),
    ]);
    const buocs = cacBuoc(evaluate(wf, khoTrongBaCommit(), { baseSeed: 1, passes: 1 }));
    expect(buocs.map((one) => one.cacheHit)).toEqual([false, true, true]);
    expect(buocs.map((one) => one.durationTicks)).toEqual([10, 4, 4]);
  });

  it('savesTicks lớn hơn thời lượng bị KẸP — không có thời lượng âm', () => {
    const wf = quyTrinh([
      chang('build', [
        buoc('b1', 10, {
          cache: { id: 'deps', keyParts: ['lock'], invalidatedBy: ['lock'], savesTicks: 999 },
        }),
      ]),
    ]);
    const buocs = cacBuoc(evaluate(wf, khoTrongBaCommit(), { baseSeed: 1, passes: 1 }));
    expect(buocs.map((one) => one.durationTicks)).toEqual([10, 0, 0]);
  });

  it('C07 khoá quá RỘNG ⇒ không bao giờ trúng, tốn thời gian mà chẳng tiết kiệm gì', () => {
    const wf = quyTrinh([
      chang('build', [
        buoc('b1', 10, {
          // `src` đổi ở mọi commit, nên khoá không bao giờ trùng lượt trước.
          cache: { id: 'deps', keyParts: ['src'], invalidatedBy: ['lock'], savesTicks: 6 },
        }),
      ]),
    ]);
    const buocs = cacBuoc(evaluate(wf, khoTrongBaCommit(), { baseSeed: 1, passes: 1 }));
    expect(buocs.map((one) => one.cacheHit)).toEqual([false, false, false]);
    expect(buocs.map((one) => one.durationTicks)).toEqual([10, 10, 10]);
  });

  it('C08 khoá quá HẸP ⇒ trúng một cache ĐÃ ÔI: cacheHit true VÀ đỏ stale-cache', () => {
    // Đây là ca mà một hiện thực "tự động" đặt `invalidatedBy = keyParts` sẽ
    // KHÔNG BAO GIỜ kích hoạt, và triệu chứng của nó là một level vĩnh viễn dễ
    // chứ không phải một lỗi đỏ ở đâu cả. Test này là cái bẫy đó.
    const wf = quyTrinh([
      chang('build', [
        buoc('b1', 10, {
          cache: {
            id: 'deps',
            keyParts: ['lock'],
            invalidatedBy: ['lock', 'src'],
            savesTicks: 6,
          },
        }),
      ]),
    ]);
    const record = evaluate(wf, khoTrongBaCommit(), { baseSeed: 1, passes: 1 });
    const buocs = cacBuoc(record);
    expect(buocs.map((one) => one.cacheHit)).toEqual([false, true, true]);
    expect(buocs.map((one) => one.outcome)).toEqual(['passed', 'failed', 'failed']);

    const lan2 = record.passes[0]?.runs[1]?.instances[0]?.attempts[0];
    expect(lan2?.outcome).toBe('failed');
    expect(lan2?.cause).toEqual({ kind: 'stale-cache', cache: 'deps', step: 'b1' });
    // Hai sự thật khác nhau, và người chơi phải thấy CẢ HAI: trúng khoá, sai nội dung.
    expect(lan2?.steps[0]?.cacheHit).toBe(true);
  });

  it('cacheRetentionRuns đuổi mục cache đã quá tuổi', () => {
    const wf = quyTrinh([
      chang('build', [
        buoc('b1', 10, {
          cache: { id: 'deps', keyParts: ['lock'], invalidatedBy: ['lock'], savesTicks: 6 },
        }),
      ]),
    ]);
    const buocs = cacBuoc(
      evaluate(wf, khoTrongBaCommit({ cacheRetentionRuns: 0 }), { baseSeed: 1, passes: 1 }),
    );
    // Retention 0 ⇒ mục lưu ở commit trước đã chết trước khi commit sau hỏi tới.
    expect(buocs.map((one) => one.cacheHit)).toEqual([false, false, false]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Đỏ giả, thử lại, và đỏ THẬT
// ═══════════════════════════════════════════════════════════════════════════

describe('flake và thử lại', () => {
  it('rate 0 ⇒ một lần thử, xanh; flakeNature vẫn null vì bước không đỏ vì ngẫu nhiên', () => {
    const wf = quyTrinh([
      chang('t', [buoc('t1', 10, { flake: { rate: 0, nature: 'infra' } })], { retries: 2 }),
    ]);
    const pass = simulatePass(wf, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0);
    const one = pass.runs[0]?.instances[0];
    expect(one?.attempts).toHaveLength(1);
    expect(one?.attempts[0]?.outcome).toBe('passed');
    expect(one?.attempts[0]?.steps[0]?.flakeNature).toBeNull();
    expect(one?.runnerTicks).toBe(10);
  });

  it('rate 1 + retries 2 ⇒ ĐÚNG ba lần thử, và runnerTicks cộng dồn cả ba', () => {
    const wf = quyTrinh([
      chang('t', [buoc('t1', 10, { flake: { rate: 1, nature: 'latent-defect' } })], { retries: 2 }),
    ]);
    const pass = simulatePass(wf, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0);
    const one = pass.runs[0]?.instances[0];
    expect(one?.attempts).toHaveLength(3);
    expect(one?.attempts.map((a) => a.attempt)).toEqual([0, 1, 2]);
    expect(one?.attempts.every((a) => a.cause?.kind === 'flake')).toBe(true);
    expect(one?.attempts[0]?.steps[0]?.flakeNature).toBe('latent-defect');
    expect(one?.runnerTicks).toBe(30);
    expect(one?.finishedTick).toBe(30);
  });

  it('thử lại CỨU được đỏ giả: có hạt giống cho lần 0 đỏ và lần 1 xanh', () => {
    const wf = quyTrinh([
      chang('t', [buoc('t1', 10, { flake: { rate: 0.5, nature: 'infra' } })], { retries: 1 }),
    ]);
    const workload = danMay(1, [{ id: 'c1', tick: 0 }]);
    const cuuDuoc: number[] = [];
    for (let seed = 0; seed < 200; seed += 1) {
      const one = simulatePass(wf, workload, seed, 0).runs[0]?.instances[0];
      if (one?.attempts.length === 2 && one.attempts[1]?.outcome === 'passed') {
        cuuDuoc.push(seed);
      }
    }
    expect(cuuDuoc.length).toBeGreaterThan(0);
  });

  it('C10 — thử lại KHÔNG cứu được đỏ thật, chỉ đốt runner-phút', () => {
    // `pack` cần `dist` mà nó KHÔNG phụ thuộc (bắc cầu) vào nơi tạo `dist`.
    // Cạnh thiếu là một lỗi ĐỎ THẬT, và ba lần thử đốt đúng ba lần thời lượng.
    const wf = quyTrinh([
      chang('build', [buoc('b1', 5, { produces: ['dist'] })]),
      chang('pack', [buoc('p1', 8, { requires: ['dist'] })], { retries: 2 }),
    ]);
    const pass = simulatePass(wf, danMay(2, [{ id: 'c1', tick: 0 }]), 1, 0);
    const pack = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'pack');
    expect(pack?.attempts).toHaveLength(3);
    expect(pack?.attempts.map((a) => a.cause?.kind)).toEqual([
      'missing-output',
      'missing-output',
      'missing-output',
    ]);
    expect(pack?.runnerTicks).toBe(24);
  });

  it('thêm đúng một cạnh là hết đỏ — cùng workflow, chỉ khác dependsOn', () => {
    const wf = quyTrinh([
      chang('build', [buoc('b1', 5, { produces: ['dist'] })]),
      chang('pack', [buoc('p1', 8, { requires: ['dist'] })], { dependsOn: ['build'] }),
    ]);
    const pass = simulatePass(wf, danMay(2, [{ id: 'c1', tick: 0 }]), 1, 0);
    const pack = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'pack');
    expect(pack?.attempts[0]?.outcome).toBe('passed');
  });

  it('hai stage chạy SONG SONG không thấy sản phẩm của nhau, kể cả khi một cái xong trước', () => {
    const wf = quyTrinh([
      chang('build', [buoc('b1', 2, { produces: ['dist'] })]),
      chang('pack', [buoc('p1', 8, { requires: ['dist'] })]),
    ]);
    // `build` xong ở tick 2, `pack` bắt đầu ở tick 2 — vẫn đỏ, vì thiếu CẠNH
    // chứ không thiếu thời gian. Đó là điều làm bài C10 dạy được.
    const pass = simulatePass(wf, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0);
    const pack = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'pack');
    expect(pack?.startedTick).toBe(2);
    expect(pack?.attempts[0]?.cause?.kind).toBe('missing-output');
  });
});

describe('blocking', () => {
  it('bước blocking đỏ ⇒ các bước sau KHÔNG chạy và KHÔNG có mặt trong steps', () => {
    const wf = quyTrinh([
      chang('t', [
        buoc('t1', 3),
        buoc('t2', 4, { flake: { rate: 1, nature: 'infra' } }),
        buoc('t3', 5),
      ]),
    ]);
    const pass = simulatePass(wf, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0);
    const attempt = pass.runs[0]?.instances[0]?.attempts[0];
    expect(attempt?.steps.map((s) => s.id)).toEqual(['t1', 't2']);
    expect(attempt?.failedStep).toBe('t2');
    expect(pass.runs[0]?.instances[0]?.runnerTicks).toBe(7);
  });

  it('bước blocking: false đỏ ⇒ stage vẫn đi tiếp, nhưng failedStep vẫn ghi lại', () => {
    const wf = quyTrinh([
      chang('t', [
        buoc('t1', 3, { blocking: false, flake: { rate: 1, nature: 'infra' } }),
        buoc('t2', 4),
      ]),
    ]);
    const attempt = simulatePass(wf, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0).runs[0]?.instances[0]
      ?.attempts[0];
    expect(attempt?.outcome).toBe('passed');
    expect(attempt?.cause).toBeNull();
    expect(attempt?.failedStep).toBe('t1');
    expect(attempt?.steps.map((s) => s.id)).toEqual(['t1', 't2']);
  });

  it('stage blocking đỏ ⇒ stage sau nó đỏ vì upstream-failed và KHÔNG đốt máy', () => {
    const wf = quyTrinh([
      chang('a', [buoc('a1', 5, { flake: { rate: 1, nature: 'infra' } })]),
      chang('b', [buoc('b1', 9)], { dependsOn: ['a'], retries: 3 }),
    ]);
    const pass = simulatePass(wf, danMay(2, [{ id: 'c1', tick: 0 }]), 1, 0);
    const b = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'b');
    expect(b?.attempts).toHaveLength(1);
    expect(b?.attempts[0]?.cause).toEqual({ kind: 'upstream-failed', stage: 'a' });
    expect(b?.runnerTicks).toBe(0);
  });

  it('stage blocking: false đỏ ⇒ stage sau VẪN chạy (bài C05)', () => {
    const wf = quyTrinh([
      chang('lint', [buoc('l1', 5, { flake: { rate: 1, nature: 'infra' } })], { blocking: false }),
      chang('b', [buoc('b1', 9)], { dependsOn: ['lint'] }),
    ]);
    const pass = simulatePass(wf, danMay(2, [{ id: 'c1', tick: 0 }]), 1, 0);
    const b = (pass.runs[0]?.instances ?? []).find((one) => one.stageId === 'b');
    expect(b?.attempts[0]?.outcome).toBe('passed');
    expect(b?.startedTick).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AC-3 / AC-A — tất định tuyệt đối, cộng HAI đối chứng
// ═══════════════════════════════════════════════════════════════════════════

/** Workflow có đủ bốn nguồn ngẫu nhiên và trạng thái: flake, biên động, cache, quạt, thử lại. */
const DU_THU = quyTrinh([
  chang('build', [
    buoc('b1', 12, {
      durationSpreadTicks: 3,
      cache: { id: 'deps', keyParts: ['lock'], invalidatedBy: ['lock'], savesTicks: 5 },
      produces: ['dist'],
    }),
  ]),
  chang('test', [buoc('t1', 8, { flake: { rate: 0.35, nature: 'infra' }, durationSpreadTicks: 2 })], {
    dependsOn: ['build'],
    retries: 1,
    fanOut: { axes: [{ name: 'node', values: ['20', '22'] }] },
  }),
  chang('pack', [buoc('p1', 6, { requires: ['dist'] })], { dependsOn: ['build'] }),
  chang('lint', [buoc('l1', 4, { flake: { rate: 0.2, nature: 'latent-defect' } })], {
    blocking: false,
  }),
]);

const DU_THU_WORKLOAD = khoTrongBaCommit();

describe('AC-3 — cùng (workflow, workload, seed) ⇒ cùng bản ghi', () => {
  const spec = { baseSeed: 20260919, passes: 3 } as const;

  it('ĐỐI CHỨNG 0 — bản ghi đem so KHÔNG rỗng', () => {
    // Một bản ghi lỗi có `passes: []`, và một chuỗi rỗng thì so 1000 lần vẫn
    // bằng chính nó. Không có ô này thì test dưới có thể xanh mà chẳng đo gì.
    const record = evaluate(DU_THU, DU_THU_WORKLOAD, spec);
    expect(record.error).toBeNull();
    expect(record.passes).toHaveLength(3);
    const buocs = chuKyXucXac(record);
    expect(buocs.length).toBeGreaterThan(20);
    expect(buocs.some((one) => one.endsWith('|failed|infra'))).toBe(true);
    expect(buocs.some((one) => one.includes('|passed|'))).toBe(true);
  });

  it('1000 lượt chạy lại cho ra ĐÚNG một kết quả', () => {
    const chuan = JSON.stringify(evaluate(DU_THU, DU_THU_WORKLOAD, spec));
    for (let i = 0; i < 1000; i += 1) {
      expect(JSON.stringify(evaluate(DU_THU, DU_THU_WORKLOAD, spec))).toBe(chuan);
    }
  });

  it('ĐỐI CHỨNG 1 — đổi hạt giống PHẢI đổi kết quả (nếu không, ta đang đo một hàm hằng)', () => {
    const ketQua = new Set<string>();
    for (let seed = 0; seed < 8; seed += 1) {
      ketQua.add(JSON.stringify(evaluate(DU_THU, DU_THU_WORKLOAD, { baseSeed: seed, passes: 3 })));
    }
    expect(ketQua.size).toBeGreaterThan(1);
  });
});

/** Chữ ký xúc xắc của một thực thể: thời lượng + kết quả + bản chất đỏ giả từng bước. */
function chuKyXucXac(record: EvaluationRecord): readonly string[] {
  const out: string[] = [];
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const instance of run.instances) {
        for (const attempt of instance.attempts) {
          for (const step of attempt.steps) {
            out.push(
              [
                pass.pass,
                run.commitId,
                instance.instance,
                attempt.attempt,
                step.id,
                step.durationTicks,
                step.outcome,
                step.flakeNature ?? '-',
              ].join('|'),
            );
          }
        }
      }
    }
  }
  return out;
}

function mocThoiGian(record: EvaluationRecord): readonly string[] {
  const out: string[] = [];
  for (const pass of record.passes) {
    for (const run of pass.runs) {
      for (const instance of run.instances) {
        out.push(`${run.commitId}|${instance.instance}|${instance.startedTick}`);
      }
    }
  }
  return out;
}

describe('ĐỐI CHỨNG 2 — thêm máy chạy đổi LỊCH, không đổi XÚC XẮC', () => {
  // Đây là thứ LUẬT 1 mua được, và là thứ một bộ sinh chạy dọc sẽ làm hỏng mà
  // KHÔNG test tất định nào bắt được: với bộ sinh chạy dọc, thứ tự rút = thứ tự
  // xếp lịch, nên thêm một máy là phát lại mọi con xúc xắc.
  //
  // ⚠ Workflow ở đây cố ý KHÔNG có cache. Cache là trạng thái dùng chung giữa
  // các commit chạy chồng nhau, nên nó PHỤ THUỘC lịch một cách chính đáng — y
  // như đời thật. Trộn nó vào đây sẽ làm đối chứng đo hai thứ cùng lúc và hỏng
  // vì lý do không liên quan tới ngẫu nhiên.
  const khongCache = quyTrinh([
    chang('build', [buoc('b1', 9, { durationSpreadTicks: 3, produces: ['dist'] })]),
    chang('test', [buoc('t1', 7, { flake: { rate: 0.3, nature: 'infra' }, durationSpreadTicks: 2 })], {
      dependsOn: ['build'],
      retries: 2,
      fanOut: { axes: [{ name: 'node', values: ['20', '22', '24'] }] },
    }),
    chang('lint', [buoc('l1', 5, { flake: { rate: 0.25, nature: 'latent-defect' } })], {
      blocking: false,
    }),
  ]);
  const spec = { baseSeed: 4242, passes: 4 } as const;
  const commits: readonly CommitArrival[] = [
    { id: 'c1', tick: 0 },
    { id: 'c2', tick: 3 },
    { id: 'c3', tick: 6 },
  ];
  const motMay = evaluate(khongCache, danMay(1, commits), spec);
  const namMay = evaluate(khongCache, danMay(5, commits), spec);

  it('ĐỐI CHỨNG 0 — chữ ký xúc xắc có nội dung thật, gồm cả đỏ giả và thử lại', () => {
    // So hai mảng RỖNG thì luôn bằng nhau. Ô này khẳng định thứ đem so có
    // đủ biến thiên để một bộ sinh chạy dọc sẽ làm lệch.
    const chuKy = chuKyXucXac(motMay);
    expect(chuKy.length).toBeGreaterThan(50);
    expect(chuKy.some((one) => one.includes('|failed|infra'))).toBe(true);
    expect(chuKy.some((one) => one.includes('|failed|latent-defect'))).toBe(true);
    // `attempt` > 0 tồn tại ⇒ có thử lại thật, tức có rút xúc xắc ở lần thử sau.
    expect(chuKy.some((one) => one.split('|')[3] !== '0')).toBe(true);
    // Biên động thời lượng thật sự có tác dụng: cùng một bước ra nhiều thời lượng.
    const thoiLuongB1 = new Set(
      chuKy.filter((one) => one.includes('|b1|')).map((one) => one.split('|')[5]),
    );
    expect(thoiLuongB1.size).toBeGreaterThan(1);
  });

  it('chuỗi xúc xắc của TỪNG thực thể giữ nguyên', () => {
    expect(chuKyXucXac(namMay)).toEqual(chuKyXucXac(motMay));
  });

  it('nhưng mốc thời gian PHẢI khác — nếu không thì đối chứng trên rỗng nghĩa', () => {
    expect(mocThoiGian(namMay)).not.toEqual(mocThoiGian(motMay));
    expect(namMay.passes[0]?.finishedTick).toBeLessThan(motMay.passes[0]?.finishedTick ?? 0);
  });

  it('và bản ghi tổng thể KHÁC nhau — thêm máy có tác dụng thật', () => {
    expect(JSON.stringify(namMay)).not.toBe(JSON.stringify(motMay));
  });

  it('RANH GIỚI ĐÃ ĐO — cache thì CÓ phụ thuộc lịch, và đó không phải lỗi', () => {
    // Luật 1 nói về XÚC XẮC, không nói về mọi thứ trong bản ghi. Cache là trạng
    // thái dùng chung giữa các commit chạy chồng nhau: thêm máy làm commit sau
    // bắt đầu TRƯỚC khi commit trước kịp lưu cache, nên nó trượt ở chỗ lẽ ra
    // trúng. Đời thật đúng như vậy.
    //
    // Ô này ghim ranh giới đó thành số đo thay vì một câu trong chú thích. Nó
    // cũng là lý do đối chứng ở trên cố ý dùng workflow KHÔNG cache: trộn vào
    // thì đối chứng đo hai thứ cùng lúc và đỏ vì lý do không liên quan tới ngẫu
    // nhiên.
    const coCache = quyTrinh([
      chang('build', [
        buoc('b1', 10, {
          cache: { id: 'deps', keyParts: ['lock'], invalidatedBy: ['lock'], savesTicks: 6 },
        }),
      ]),
    ]);
    const cungLuc: readonly CommitArrival[] = [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 0 },
      { id: 'c3', tick: 0 },
    ];
    const kho = (count: number): WorkloadSpec =>
      danMay(count, cungLuc, {
        inputs: [
          { id: 'src', label: 'Mã nguồn', changesEvery: 1 },
          { id: 'lock', label: 'Khoá phụ thuộc', changesEvery: 5 },
        ],
      });
    const trung = (count: number): readonly (boolean | null)[] =>
      cacBuoc(evaluate(coCache, kho(count), { baseSeed: 5, passes: 1 })).map((one) => one.cacheHit);

    // Một máy ⇒ ba commit nối đuôi, commit sau hưởng cache của commit trước.
    expect(trung(1)).toEqual([false, true, true]);
    // Ba máy ⇒ cả ba chạy cùng lúc, chưa ai kịp lưu, nên cả ba đều trượt.
    expect(trung(3)).toEqual([false, false, false]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TÍCH HỢP — engine THẬT nuôi đường găng THẬT
// ═══════════════════════════════════════════════════════════════════════════
//
// Test của lane đồ thị dựng `StageInstanceRecord` bằng tay, nên nó xanh bất kể
// engine ghi `blockedBy` thế nào. Test của lane engine thì không gọi
// `criticalPath`. Hai lane khớp nhau trên giấy mà chưa từng chạy cùng nhau, và
// chỗ hở đó chỉ bịt được từ phía này.

describe('tích hợp: blockedBy do engine ghi phải đi ngược được', () => {
  /** Một máy, hai stage cùng sẵn sàng ⇒ đường găng BẮT BUỘC đi qua cạnh chờ-máy. */
  const CHAT_MAY = quyTrinh([
    chang('alpha', [buoc('a1', 10)]),
    chang('mike', [buoc('m1', 10)]),
    chang('omega', [buoc('o1', 5)], { dependsOn: ['mike'] }),
  ]);

  const run = simulatePass(CHAT_MAY, danMay(1, [{ id: 'c1', tick: 0 }]), 1, 0).runs[0];

  it('ĐỐI CHỨNG 0 — lịch đúng như thiết kế, nếu không thì ô dưới đo nhầm thứ', () => {
    const moc = (run?.instances ?? []).map((one) => [one.stageId, one.startedTick, one.finishedTick]);
    expect(moc).toEqual([
      ['alpha', 0, 10],
      ['mike', 10, 20],
      ['omega', 20, 25],
    ]);
  });

  it('đường găng KHÔNG cụt — chuỗi đi ngược tới tận thực thể đầu tiên', () => {
    const duong = criticalPath(run?.instances ?? []);
    expect(duong).not.toBeNull();
    expect(duong?.truncated).toBe(false);
    expect(duong?.finishedTick).toBe(25);
  });

  it('và nó đi qua ít nhất một cạnh CHỜ-MÁY, không chỉ cạnh phụ thuộc', () => {
    // Đây là điều 2D khó dạy: `omega` xong muộn không phải vì DAG dài, mà vì
    // `mike` phải đợi `alpha` nhả máy. Tô sáng đoạn đó như một phụ thuộc sẽ đẩy
    // người chơi đi sửa đồ thị trong khi thứ phải sửa là số máy.
    const duong = criticalPath(run?.instances ?? []);
    expect(duong?.edges.some((canh) => canh.resourceEdge)).toBe(true);
    expect(duong?.nodes.map((node) => node.instance)).toEqual(['alpha', 'mike', 'omega']);
  });
});
