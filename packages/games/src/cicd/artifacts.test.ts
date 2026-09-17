/**
 * Ghim 19.B.1–B.3 ở tầng ENGINE: kẻ cấp sản phẩm, danh tính artifact, cổng phê
 * duyệt. AC-B vế 1 ở đây: dựng lại rồi phát hành ⇒ danh tính khác.
 *
 * Mỗi khối nói ra thứ nó BẮT ĐƯỢC nếu hỏng.
 */
import { describe, expect, it } from 'vitest';

import { artifactIdOf, deploymentsOf } from './artifacts.ts';
import type { EvaluationRecord, RunRecord, StageSpec, StepSpec, WorkflowSpec, WorkloadSpec } from './contract.ts';
import { evaluate } from './engine.ts';

const MAY = 'may';

function buoc(id: string, durationTicks: number, them: Partial<StepSpec> = {}): StepSpec {
  return { id, name: id, durationTicks, blocking: true, ...them };
}

function st(id: string, dependsOn: readonly string[], steps: readonly StepSpec[], them: Partial<StageSpec> = {}): StageSpec {
  return { id, kind: 'build', name: id, dependsOn, steps, blocking: true, retries: 0, runnerClass: MAY, ...them };
}

const WORKLOAD: WorkloadSpec = {
  runners: [{ id: MAY, label: 'Máy', count: 2 }],
  inputs: [{ id: 'nguon', label: 'Mã nguồn', changesEvery: 1 }],
  commits: [
    { id: 'c1', tick: 0 },
    { id: 'c2', tick: 100 },
  ],
};

const DUNG = st('dung', [], [buoc('dong-goi', 10, { produces: ['image'] })]);
const STAGING = st('staging', ['dung'], [buoc('len', 2, { requires: ['image'] })], { environment: 'staging' });

const THANG_HANG: WorkflowSpec = {
  name: 'thăng hạng',
  stages: [DUNG, STAGING, st('prod', ['staging'], [buoc('len', 2, { requires: ['image'] })], { environment: 'prod' })],
};

const DUNG_LAI: WorkflowSpec = {
  name: 'dựng lại',
  stages: [
    DUNG,
    STAGING,
    st('dung-lai', ['staging'], [buoc('dong-goi', 10, { produces: ['image'] })]),
    st('prod', ['dung-lai'], [buoc('len', 2, { requires: ['image'] })], { environment: 'prod' }),
  ],
};

function chay(wf: WorkflowSpec, workload: WorkloadSpec = WORKLOAD): EvaluationRecord {
  const record = evaluate(wf, workload, { baseSeed: 7, passes: 2 });
  if (record.error !== null) throw new Error(`workflow hỏng: ${record.error.kind}`);
  return record;
}

function banO(run: RunRecord, wf: WorkflowSpec, env: string): string | undefined {
  return deploymentsOf(run, wf).filter((d) => d.environment === env).at(-1)?.artifacts[0]?.artifact;
}

describe('AC-B vế 1 — dựng lại ⇒ danh tính khác; thăng hạng ⇒ giữ nguyên', () => {
  it('thăng hạng: staging và prod chạy CÙNG một artifact ở mọi commit', () => {
    for (const run of chay(THANG_HANG).passes.flatMap((p) => p.runs)) {
      const a = banO(run, THANG_HANG, 'staging');
      expect(a).toBeDefined();
      expect(banO(run, THANG_HANG, 'prod')).toBe(a);
    }
  });

  it('dựng lại trước prod: prod nhận bản dựng lại, danh tính KHÁC staging', () => {
    for (const run of chay(DUNG_LAI).passes.flatMap((p) => p.runs)) {
      const a = banO(run, DUNG_LAI, 'staging');
      const b = banO(run, DUNG_LAI, 'prod');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(b).not.toBe(a);
      // Và KẺ CẤP của prod đúng là stage dựng lại, không phải một chuỗi tình cờ khác.
      expect(b).toBe(artifactIdOf(run.commitId, 'image', 'dung-lai'));
    }
  });

  it('hai commit dựng cùng một stage ⇒ hai danh tính khác nhau (danh tính mang commit)', () => {
    const runs = chay(THANG_HANG).passes[0]?.runs ?? [];
    expect(banO(runs[0]!, THANG_HANG, 'prod')).not.toBe(banO(runs[1]!, THANG_HANG, 'prod'));
  });

  it('danh tính không đổi giữa các lượt mô phỏng — nó là của nội dung, không của hạt giống', () => {
    const [p0, p1] = chay(THANG_HANG).passes;
    expect(banO(p0!.runs[0]!, THANG_HANG, 'prod')).toBe(banO(p1!.runs[0]!, THANG_HANG, 'prod'));
  });
});

describe('kẻ cấp — ghi lúc xếp lịch, luật "xong muộn nhất"', () => {
  it('chỉ ghi sản phẩm các bước của stage THẬT SỰ đòi', () => {
    const run = chay(DUNG_LAI).passes[0]!.runs[0]!;
    expect(run.instances.find((i) => i.stageId === 'prod')?.suppliers).toEqual([
      { output: 'image', instance: 'dung-lai' },
    ]);
    // `dung-lai` không đòi gì ⇒ rỗng, dù `image` có sẵn phía trên nó.
    expect(run.instances.find((i) => i.stageId === 'dung-lai')?.suppliers).toEqual([]);
  });

  it('hai kẻ cấp XONG CÙNG LÚC ⇒ hoà gỡ bằng InstanceKey nhỏ nhất, không theo thứ tự mảng', () => {
    const song: WorkflowSpec = {
      name: 'hai bản cùng lúc',
      stages: [
        st('z-dung', [], [buoc('dong-goi', 10, { produces: ['image'] })]),
        st('a-dung', [], [buoc('dong-goi', 10, { produces: ['image'] })]),
        st('prod', ['z-dung', 'a-dung'], [buoc('len', 2, { requires: ['image'] })], { environment: 'prod' }),
      ],
    };
    const run = chay(song).passes[0]!.runs[0]!;
    expect(run.instances.find((i) => i.stageId === 'prod')?.suppliers).toEqual([{ output: 'image', instance: 'a-dung' }]);
  });

  it('stage phát hành bị chặn vì phía trên đỏ ⇒ không có kẻ cấp, không có lần phát hành', () => {
    const hong: WorkflowSpec = {
      name: 'staging đỏ',
      stages: [DUNG, st('staging', ['dung'], [buoc('len', 2, { requires: ['khong-co'] })], { environment: 'staging' }), THANG_HANG.stages[2]!],
    };
    const run = chay(hong).passes[0]!.runs[0]!;
    expect(run.instances.find((i) => i.stageId === 'prod')?.suppliers).toEqual([]);
    expect(deploymentsOf(run, hong)).toEqual([]);
  });
});

describe('19.B.3 — cổng phê duyệt', () => {
  const CO_DUYET: WorkflowSpec = {
    name: 'có duyệt',
    stages: [
      DUNG,
      STAGING,
      st('duyet', ['staging'], [buoc('cho', 6)], { kind: 'approval', runnerSlots: 0, approval: { reviewers: 1 }, retries: 2 }),
      st('prod', ['duyet'], [buoc('len', 2, { requires: ['image'] })], { environment: 'prod' }),
    ],
  };
  const TU_CHOI: WorkloadSpec = {
    ...WORKLOAD,
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 100, approvalRejected: true },
    ],
  };

  it('commit bị từ chối ⇒ cổng đỏ `approval-rejected`, prod không nhận bản nào', () => {
    const [duocDuyet, biTuChoi] = chay(CO_DUYET, TU_CHOI).passes[0]!.runs;
    expect(banO(duocDuyet!, CO_DUYET, 'prod')).toBeDefined();
    const cong = biTuChoi!.instances.find((i) => i.stageId === 'duyet');
    expect(cong?.attempts.at(-1)?.cause).toEqual({ kind: 'approval-rejected' });
    expect(banO(biTuChoi!, CO_DUYET, 'prod')).toBeUndefined();
  });

  it('thử lại KHÔNG cứu một lần từ chối — ba lần thử đều đỏ, và mỗi lần đều tốn thời gian chờ', () => {
    const cong = chay(CO_DUYET, TU_CHOI).passes[0]!.runs[1]!.instances.find((i) => i.stageId === 'duyet');
    expect(cong?.attempts.map((a) => a.cause?.kind)).toEqual(['approval-rejected', 'approval-rejected', 'approval-rejected']);
    expect(cong?.attempts.every((a) => a.finishedTick - a.startedTick === 6)).toBe(true);
    // runnerSlots 0 ⇒ chờ người mà không giữ máy nào.
    expect(cong?.runnerTicks).toBe(0);
  });

  it('đối chứng: cờ từ chối KHÔNG đụng tới stage không có `approval`', () => {
    const run = chay(THANG_HANG, TU_CHOI).passes[0]!.runs[1]!;
    expect(banO(run, THANG_HANG, 'prod')).toBeDefined();
  });
});
