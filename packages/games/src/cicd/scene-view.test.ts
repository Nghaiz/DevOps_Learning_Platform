/**
 * Ghim bộ dựng view — ranh giới engine ↔ renderer (19.D.1).
 *
 * Ô quan trọng nhất ở đây là `quạt ra: ba thực thể ra ba node`. Kế hoạch §2.1
 * khoá node theo `stageId`, và ô nghiệm thu AC-D1 viết là "số node vẽ ra bằng số
 * stage" — tức là nếu đi theo đúng chữ của kế hoạch thì C12/C13 mất hai node MỖI
 * ma trận và **ô nghiệm thu vẫn XANH**. Ô dưới đây đỏ trên cách khoá đó.
 */
import { describe, expect, it } from 'vitest';

import type {
  AttemptRecord,
  RunRecord,
  StageInstanceRecord,
  StageSpec,
  StepSpec,
  WorkflowSpec,
} from './contract.ts';
import { buildGraphView } from './scene-view.ts';

function step(id: string, durationTicks = 1): StepSpec {
  return { id, name: id, durationTicks, blocking: true };
}

function st(id: string, dependsOn: readonly string[], them: Partial<StageSpec> = {}): StageSpec {
  return {
    id,
    kind: 'build',
    name: id,
    dependsOn,
    steps: [step(`${id}-b1`)],
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
    ...them,
  };
}

function wf(stages: readonly StageSpec[]): WorkflowSpec {
  return { name: 'thu', stages };
}

function attempt(them: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    attempt: 0,
    startedTick: 0,
    finishedTick: 10,
    outcome: 'passed',
    cause: null,
    failedStep: null,
    steps: [],
    ...them,
  };
}

/**
 * ⚠ `attempts` mặc định bám theo `startedTick`/`finishedTick` của chính thực
 * thể, KHÔNG phải một cặp tick cố định.
 *
 * Bản đầu để mặc định `attempt()` (0→10) trong khi bên gọi truyền
 * `finishedTick: 9`, nên bản ghi tự mâu thuẫn: thực thể xong ở tick 9 mà lần thử
 * của nó còn chạy tới 10. Ô trạng thái đỏ và đọc ra như một lỗi của
 * `buildGraphView` — trong khi lỗi nằm ở fixture. Suy từ chính `them` thì cả một
 * lớp fixture mâu thuẫn không dựng lên được nữa.
 */
function inst(
  instance: string,
  stageId: string,
  them: Partial<StageInstanceRecord> = {},
): StageInstanceRecord {
  const startedTick = them.startedTick ?? 0;
  const finishedTick = them.finishedTick ?? 10;
  return {
    instance,
    stageId,
    fanOutIndex: null,
    readyTick: 0,
    attempts: [attempt({ startedTick, finishedTick })],
    blockedBy: { kind: 'none' },
    runnerTicks: 10,
    suppliers: [],
    ...them,
    startedTick,
    finishedTick,
  };
}

function run(instances: readonly StageInstanceRecord[], them: Partial<RunRecord> = {}): RunRecord {
  return {
    commitId: 'c1',
    arrivalTick: 0,
    finishedTick: Math.max(0, ...instances.map((i) => i.finishedTick)),
    instances,
    changedInputs: [],
    ...them,
  };
}

describe('buildGraphView — quạt ra', () => {
  it('ba thực thể của một ma trận ra BA node, không gộp thành một', () => {
    const workflow = wf([
      st('kiem-tra', [], {
        fanOut: { axes: [{ name: 'node', values: ['20', '22', '24'] }] },
      }),
    ]);

    const view = buildGraphView({ workflow, run: null, yAxis: 'ci' });

    expect(view.nodes).toHaveLength(3);
    expect(view.nodes.map((n) => n.instance)).toEqual([
      'kiem-tra#20',
      'kiem-tra#22',
      'kiem-tra#24',
    ]);
    // Cả ba cùng `stageId` — đây chính là chỗ cách khoá theo stage làm mất node.
    expect(new Set(view.nodes.map((n) => n.stageId))).toEqual(new Set(['kiem-tra']));
  });

  it('nhãn a11y tách được ba thực thể của cùng một stage', () => {
    const workflow = wf([
      st('kiem-tra', [], {
        name: 'kiểm tra',
        fanOut: { axes: [{ name: 'node', values: ['20', '22'] }] },
      }),
    ]);

    const nhan = buildGraphView({ workflow, run: null, yAxis: 'ci' }).nodes.map((n) => n.ariaLabel);

    expect(nhan).toEqual(['kiểm tra (20) — chưa chạy', 'kiểm tra (22) — chưa chạy']);
    expect(new Set(nhan).size).toBe(2);
  });

  it('cạnh phụ thuộc giữa hai stage cùng quạt ra là TÍCH ĐỀ-CÁC', () => {
    const workflow = wf([
      st('dung', [], { fanOut: { axes: [{ name: 'os', values: ['linux', 'mac'] }] } }),
      st('gom', ['dung']),
    ]);

    const view = buildGraphView({ workflow, run: null, yAxis: 'ci' });

    // `gom` chờ CẢ HAI thực thể của `dung` — ngữ nghĩa `needs` của ma trận.
    expect(view.edges.map((e) => `${e.from}->${e.to}`)).toEqual([
      'dung#linux->gom',
      'dung#mac->gom',
    ]);
  });
});

describe('buildGraphView — trạng thái', () => {
  it('chưa có lượt chạy thì mọi node `pending` và không có mốc tick nào', () => {
    const view = buildGraphView({ workflow: wf([st('a', []), st('b', ['a'])]), run: null, yAxis: 'ci' });

    expect(view.nodes.map((n) => n.state)).toEqual(['pending', 'pending']);
    expect(view.nodes.every((n) => n.readyTick === null)).toBe(true);
    expect(view.nodes.every((n) => n.startedTick === null)).toBe(true);
    expect(view.nodes.every((n) => n.statusToken === 'status-locked')).toBe(true);
  });

  it('đọc đúng bốn trạng thái theo tick đang xem', () => {
    const record = inst('a', 'a', { readyTick: 2, startedTick: 5, finishedTick: 9 });
    const r = run([record], { finishedTick: 9 });
    const at = (tick: number) =>
      buildGraphView({ workflow: wf([st('a', [])]), run: r, yAxis: 'ci', atTick: tick }).nodes[0]
        ?.state;

    expect(at(1)).toBe('pending'); // chưa tới `readyTick`
    expect(at(3)).toBe('queued'); // sẵn sàng nhưng chưa có máy
    expect(at(6)).toBe('running');
    expect(at(9)).toBe('passed');
  });

  it('lần thử thứ hai đọc ra `retrying`, không phải `running`', () => {
    const record = inst('a', 'a', {
      readyTick: 0,
      startedTick: 0,
      finishedTick: 20,
      attempts: [
        attempt({ attempt: 0, startedTick: 0, finishedTick: 10, outcome: 'failed' }),
        attempt({ attempt: 1, startedTick: 10, finishedTick: 20, outcome: 'passed' }),
      ],
    });
    const r = run([record], { finishedTick: 20 });
    const at = (tick: number) =>
      buildGraphView({ workflow: wf([st('a', [])]), run: r, yAxis: 'ci', atTick: tick }).nodes[0];

    expect(at(5)?.state).toBe('running');
    expect(at(15)?.state).toBe('retrying');
    expect(at(15)?.attempt).toBe(1);
    expect(at(15)?.ariaLabel).toContain('lần thử 2');
    expect(at(20)?.state).toBe('passed');
  });

  it('thực thể KHÔNG chạy lần nào là `skipped`, không phải `pending`', () => {
    const record = inst('b', 'b', { attempts: [] });
    const view = buildGraphView({
      workflow: wf([st('a', []), st('b', ['a'])]),
      run: run([inst('a', 'a'), record]),
      yAxis: 'ci',
    });

    expect(view.nodes.find((n) => n.instance === 'b')?.state).toBe('skipped');
  });

  it('`pending` và `skipped` dùng CHUNG màu nên phải khác nhau ở kênh khác', async () => {
    // Đây là điều kiện sống của mã hoá ba kênh: hai trạng thái trùng token màu
    // vẫn phải phân biệt được khi in thang xám và tắt chuyển động.
    const { encodingOf } = await import('./scene-encoding.ts');

    expect(encodingOf('pending').statusToken).toBe(encodingOf('skipped').statusToken);
    expect(encodingOf('pending').geometry).not.toBe(encodingOf('skipped').geometry);
    expect(encodingOf('pending').icon).not.toBe(encodingOf('skipped').icon);
  });
});

describe('buildGraphView — các bước bên trong job (cấp 3 của drill-in)', () => {
  it('MỌI bước của spec đều xuất hiện, kể cả bước KHÔNG chạy vì bước trước gãy', () => {
    /*
     * Đây là ô quan trọng nhất của `steps`. `AttemptRecord.steps` NGẮN HƠN
     * `StageSpec.steps` khi một bước `blocking` gãy giữa chừng. Duyệt theo bản
     * ghi thay vì theo spec thì các bước không chạy biến mất, và người chơi
     * tưởng job của mình chỉ có bấy nhiêu bước — đúng lúc họ cần thấy bước nào
     * bị chặn.
     */
    const stage = st('dung', [], {
      steps: [step('lay-ma'), step('bien-dich'), step('dong-goi')],
    });
    const record = inst('dung', 'dung', {
      attempts: [
        attempt({
          outcome: 'failed',
          failedStep: 'bien-dich',
          // Chỉ HAI bước chạy: `dong-goi` không tới lượt.
          steps: [
            { id: 'lay-ma', durationTicks: 2, outcome: 'passed', cacheHit: null, flakeNature: null },
            { id: 'bien-dich', durationTicks: 4, outcome: 'failed', cacheHit: false, flakeNature: null },
          ],
        }),
      ],
    });

    const node = buildGraphView({ workflow: wf([stage]), run: run([record]), yAxis: 'ci' }).nodes[0];

    expect(node?.steps.map((s) => s.id)).toEqual(['lay-ma', 'bien-dich', 'dong-goi']);
    expect(node?.steps[0]).toMatchObject({ outcome: 'passed', durationTicks: 2 });
    expect(node?.steps[1]).toMatchObject({ outcome: 'failed', cacheHit: false });
    // Bước chưa chạy: có mặt, nhưng mọi dữ kiện của lần chạy đều `null`.
    expect(node?.steps[2]).toMatchObject({ id: 'dong-goi', outcome: null, durationTicks: null });
  });

  it('chưa có lượt chạy thì vẫn liệt kê đủ bước, tất cả chưa có kết quả', () => {
    const stage = st('dung', [], { steps: [step('a'), step('b')] });

    const node = buildGraphView({ workflow: wf([stage]), run: null, yAxis: 'ci' }).nodes[0];

    expect(node?.steps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(node?.steps.every((s) => s.outcome === null)).toBe(true);
  });

  it('KHÔNG lộ `flakeNature` ra view — đỏ giả phải trông giống đỏ thật', () => {
    // Điều kiện để bài C11 có nghĩa. Lộ nó ra tầng vẽ là cho người chơi đọc
    // được xúc xắc ngay trong lúc chạy.
    const stage = st('dung', [], { steps: [step('a')] });
    const record = inst('dung', 'dung', {
      attempts: [
        attempt({
          outcome: 'failed',
          steps: [{ id: 'a', durationTicks: 1, outcome: 'failed', cacheHit: null, flakeNature: 'infra' }],
        }),
      ],
    });

    const node = buildGraphView({ workflow: wf([stage]), run: run([record]), yAxis: 'ci' }).nodes[0];

    expect(JSON.stringify(node?.steps)).not.toContain('infra');
    expect(Object.keys(node?.steps[0] ?? {})).not.toContain('flakeNature');
  });
});

describe('buildGraphView — cạnh máy và đường găng', () => {
  it('chỗ chờ máy thành một cạnh RIÊNG, đánh dấu `resourceEdge`', () => {
    const a = inst('a', 'a', { finishedTick: 10 });
    const b = inst('b', 'b', {
      readyTick: 0,
      startedTick: 10,
      finishedTick: 20,
      blockedBy: { kind: 'runner', instance: 'a', runnerClass: 'linux', commitId: 'c1' },
      attempts: [attempt({ startedTick: 10, finishedTick: 20 })],
    });

    const view = buildGraphView({
      workflow: wf([st('a', []), st('b', [])]), // KHÔNG phụ thuộc nhau
      run: run([a, b], { finishedTick: 20 }),
      yAxis: 'ci',
    });

    const canh = view.edges.find((e) => e.from === 'a' && e.to === 'b');
    expect(canh?.resourceEdge).toBe(true);
  });

  it('kẻ giữ máy thuộc commit KHÁC thì bỏ cạnh, không để nó trỏ vào hư không', () => {
    // `InstanceKey` không mang `commitId`, nên `blockedBy.instance` có thể nằm
    // ngoài `run.instances` của chính lượt này (hợp đồng §`BlockedBy`).
    const b = inst('b', 'b', {
      startedTick: 10,
      blockedBy: { kind: 'runner', instance: 'khong-co-o-day', runnerClass: 'linux', commitId: 'c0' },
    });

    const view = buildGraphView({ workflow: wf([st('b', [])]), run: run([b]), yAxis: 'ci' });

    expect(view.edges).toHaveLength(0);
    // Và không node nào bị bịa thêm ra cho kẻ vắng mặt.
    expect(view.nodes.map((n) => n.instance)).toEqual(['b']);
  });

  it('cạnh trên đường găng mang `critical: true`, cạnh ngoài thì không', () => {
    // a → b là đường găng (b chờ a); c chạy song song và xong sớm.
    const a = inst('a', 'a', { readyTick: 0, startedTick: 0, finishedTick: 10 });
    const b = inst('b', 'b', {
      readyTick: 10,
      startedTick: 10,
      finishedTick: 30,
      blockedBy: { kind: 'dependency', instance: 'a' },
      attempts: [attempt({ startedTick: 10, finishedTick: 30 })],
    });
    const c = inst('c', 'c', { readyTick: 0, startedTick: 0, finishedTick: 2 });

    const view = buildGraphView({
      workflow: wf([st('a', []), st('b', ['a']), st('c', [])]),
      run: run([a, b, c], { finishedTick: 30 }),
      yAxis: 'ci',
    });

    expect(view.edges.find((e) => e.from === 'a' && e.to === 'b')?.critical).toBe(true);
  });
});

describe('buildGraphView — tất định', () => {
  it('đảo thứ tự stage và thứ tự thực thể không đổi kết quả', () => {
    const stages = [st('a', []), st('b', ['a']), st('c', ['a']), st('d', ['b', 'c'])];
    const records = [inst('a', 'a'), inst('b', 'b'), inst('c', 'c'), inst('d', 'd')];

    const xuoi = buildGraphView({ workflow: wf(stages), run: run(records), yAxis: 'ci' });
    const nguoc = buildGraphView({
      workflow: wf([...stages].reverse()),
      run: run([...records].reverse()),
      yAxis: 'ci',
    });

    expect(JSON.stringify(nguoc)).toBe(JSON.stringify(xuoi));
  });
});
