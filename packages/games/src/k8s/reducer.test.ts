import { describe, expect, it } from 'vitest';
import type { K8sGameAction, Level } from './contract.ts';
import { countHints, countMoves, initialState, reduce, replay } from './reducer.ts';
import { advance } from './tick.ts';
import { podRuntime } from './model.ts';
import { toView } from './view.ts';

/**
 * Level dựng tại chỗ, KHÔNG import `levels/` của lane C.
 *
 * Test của máy mô phỏng phải đỏ khi máy mô phỏng hỏng, chứ không đỏ khi một
 * level bị sửa. Dùng dữ liệu thật của lane C ở đây sẽ trộn hai tín hiệu đó, và
 * một ô đỏ sẽ không nói được là lỗi nằm ở đâu.
 */
function level(overrides: Partial<Level> = {}): Level {
  return {
    id: 'test-01',
    chapter: 1,
    title: 'Test',
    mission: 'Việc cần làm của level thử.',
    brief: '',
    difficulty: 'basic',
    initialState: {
      nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
      namespaces: ['hoc-tap'],
      resources: [],
    },
    allowedResources: ['Pod'],
    objectives: [{ id: 'o1', label: 'x', check: 'pod-running', required: true }],
    hints: [],
    parMoves: 1,
    teaches: [],
    teaching: {
      primer: 'Fixture của test máy mô phỏng, không phải nội dung dạy học thật.',
      cheatsheet: [],
      takeaways: [],
    },
    ...overrides,
  };
}

const POD_YAML = `apiVersion: v1
kind: Pod
metadata:
  name: web
  namespace: hoc-tap
  labels:
    app: web
spec:
  containers:
    - name: web
      image: nginx:1.27-alpine
      ports:
        - containerPort: 80
`;

const DEPLOY_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: hoc-tap
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
`;

describe('tất định — điều kiện sống còn của xác minh chống gian lận', () => {
  const actions: readonly K8sGameAction[] = [
    { gameId: 'k8s', tick: 0, kind: 'apply', yaml: DEPLOY_YAML },
    { gameId: 'k8s', tick: 4, kind: 'wait', ticks: 20 },
    { gameId: 'k8s', tick: 30, kind: 'scale', target: { kind: 'Deployment', namespace: 'hoc-tap', name: 'web' }, replicas: 4 },
    { gameId: 'k8s', tick: 40, kind: 'wait', ticks: 30 },
  ];

  it('cùng seed + cùng chuỗi action ⇒ CÙNG ClusterView, chạy hai lần', () => {
    const first = toView(replay(level(), 12345, actions));
    const second = toView(replay(level(), 12345, actions));
    expect(second).toEqual(first);
  });

  /**
   * Đối chứng ÂM. Không có ô này thì một `toView` trả về hằng số cũng qua được
   * ô trên — và ta sẽ tin là mô phỏng tất định trong khi thật ra nó bất động.
   */
  it('seed KHÁC cho tên pod khác — phép so ở trên không rỗng nghĩa', () => {
    const a = toView(replay(level(), 1, actions)).objects.map((object) => object.name);
    const b = toView(replay(level(), 999, actions)).objects.map((object) => object.name);
    expect(a).not.toEqual(b);
  });

  it('chỉ tua tới, không tua lùi — action có tick nhỏ hơn không đảo ngược mô phỏng', () => {
    const forward = advance(initialState(level(), 7), 50);
    const result = reduce(forward, { gameId: 'k8s', tick: 3, kind: 'wait', ticks: 0 }, 'hoc-tap');
    expect(result.state.tick).toBe(50);
  });
});

describe('apply', () => {
  it('tạo pod rồi đưa được nó tới Running', () => {
    let state = initialState(level(), 1);
    state = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: POD_YAML }, 'hoc-tap').state;
    const created = state.objects.find((object) => object.name === 'web');
    expect(created?.kind).toBe('Pod');
    expect(created?.namespace).toBe('hoc-tap');
    expect(created?.labels).toEqual({ app: 'web' });

    state = advance(state, 12);
    const pod = podRuntime(state.objects.find((object) => object.name === 'web') ?? created!);
    expect(pod?.phase).toBe('Running');
    expect(pod?.ready).toBe(true);
    expect(pod?.nodeName).toBe('may-chu-1');
  });

  /**
   * `apply` là UPSERT. Áp lại phải SỬA tại chỗ, giữ nguyên `uid` — xoá-rồi-tạo
   * sẽ huỷ hết pod của một Deployment ở mỗi lần sửa một nhãn.
   */
  it('áp lại giữ nguyên uid và createdTick', () => {
    let state = initialState(level(), 1);
    state = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: POD_YAML }, 'hoc-tap').state;
    const before = state.objects.find((object) => object.name === 'web');
    state = advance(state, 10);
    state = reduce(state, { gameId: 'k8s', tick: 10, kind: 'apply', yaml: POD_YAML }, 'hoc-tap').state;
    const after = state.objects.find((object) => object.name === 'web');
    expect(after?.uid).toBe(before?.uid);
    expect(after?.createdTick).toBe(before?.createdTick);
  });

  it('YAML hỏng KHÔNG được nhận và không đổi trạng thái', () => {
    const state = initialState(level(), 1);
    const result = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: 'khong: [phai' }, 'hoc-tap');
    expect(result.accepted).toBe(false);
    expect(result.state).toBe(state);
    expect(result.output).toContain('Không áp được manifest');
  });

  it('Deployment sinh ReplicaSet rồi ReplicaSet mới sinh Pod — đủ ba tầng', () => {
    let state = initialState(level(), 5);
    state = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: DEPLOY_YAML }, 'hoc-tap').state;
    state = advance(state, 40);
    const kinds = state.objects.map((object) => object.kind);
    expect(kinds).toContain('Deployment');
    expect(kinds).toContain('ReplicaSet');
    expect(state.objects.filter((object) => object.kind === 'Pod')).toHaveLength(2);
  });
});

describe('delete', () => {
  /**
   * Pod đi qua `Terminating` trước khi biến mất. Repo đã trả giá cho đúng cửa sổ
   * grace này một lần: một cổng chỉ đọc `phase` coi pod `Terminating` là còn sống.
   */
  it('pod vào Terminating trước, biến mất sau grace period', () => {
    let state = initialState(level(), 1);
    state = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: POD_YAML }, 'hoc-tap').state;
    state = advance(state, 12);
    state = reduce(
      state,
      { gameId: 'k8s', tick: state.tick, kind: 'delete', target: { kind: 'Pod', namespace: 'hoc-tap', name: 'web' } },
      'hoc-tap',
    ).state;
    const terminating = state.objects.find((object) => object.name === 'web');
    expect(podRuntime(terminating!)?.phase).toBe('Terminating');
    expect(podRuntime(terminating!)?.ready).toBe(false);

    state = advance(state, 61);
    expect(state.objects.find((object) => object.name === 'web')).toBeUndefined();
  });

  it('xoá Deployment kéo theo ReplicaSet và Pod của nó', () => {
    let state = initialState(level(), 5);
    state = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: DEPLOY_YAML }, 'hoc-tap').state;
    state = advance(state, 40);
    state = reduce(
      state,
      {
        gameId: 'k8s',
        tick: state.tick,
        kind: 'delete',
        target: { kind: 'Deployment', namespace: 'hoc-tap', name: 'web' },
      },
      'hoc-tap',
    ).state;
    expect(state.objects.filter((object) => object.kind !== 'Node')).toHaveLength(0);
  });

  it('xoá thứ không tồn tại KHÔNG được nhận và không ném', () => {
    const state = initialState(level(), 1);
    const result = reduce(
      state,
      { gameId: 'k8s', tick: 0, kind: 'delete', target: { kind: 'Pod', namespace: 'hoc-tap', name: 'ma' } },
      'hoc-tap',
    );
    expect(result.accepted).toBe(false);
    expect(result.state).toBe(state);
  });
});

describe('scale', () => {
  it('đặt số mong muốn, controller mới là thứ tạo pod', () => {
    let state = initialState(level(), 5);
    state = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: DEPLOY_YAML }, 'hoc-tap').state;
    const target = { kind: 'Deployment', namespace: 'hoc-tap', name: 'web' } as const;
    const scaled = reduce(state, { gameId: 'k8s', tick: 0, kind: 'scale', target, replicas: 5 }, 'hoc-tap');
    // Ngay sau `scale` CHƯA có pod nào — đó là mô hình mà Kubernetes dạy: lệnh
    // ghi một con số, vòng điều hoà mới làm thế giới khớp con số đó.
    expect(scaled.state.objects.filter((object) => object.kind === 'Pod')).toHaveLength(0);
    expect(advance(scaled.state, 60).objects.filter((object) => object.kind === 'Pod')).toHaveLength(5);
  });

  it('không scale được Pod — Pod không có replicas', () => {
    let state = initialState(level(), 1);
    state = reduce(state, { gameId: 'k8s', tick: 0, kind: 'apply', yaml: POD_YAML }, 'hoc-tap').state;
    const result = reduce(
      state,
      {
        gameId: 'k8s',
        tick: 0,
        kind: 'scale',
        target: { kind: 'Pod', namespace: 'hoc-tap', name: 'web' },
        replicas: 3,
      },
      'hoc-tap',
    );
    expect(result.accepted).toBe(false);
    expect(result.output).toContain('replicas');
  });
});

describe('phép đếm nước đi — phải khớp verify.ts của lane G', () => {
  const log: readonly K8sGameAction[] = [
    { gameId: 'k8s', tick: 0, kind: 'apply', yaml: POD_YAML },
    { gameId: 'k8s', tick: 1, kind: 'hint', index: 0 },
    { gameId: 'k8s', tick: 2, kind: 'hint', index: 0 },
    { gameId: 'k8s', tick: 3, kind: 'hint', index: 1 },
    { gameId: 'k8s', tick: 4, kind: 'wait', ticks: 10 },
    { gameId: 'k8s', tick: 14, kind: 'kubectl', command: 'kubectl get pods' },
    { gameId: 'k8s', tick: 15, kind: 'delete', target: { kind: 'Pod', namespace: 'hoc-tap', name: 'web' } },
  ];

  it('đếm đúng năm loại, bỏ wait và hint', () => {
    expect(countMoves(log)).toBe(3);
  });

  it('gợi ý đếm theo CHỈ SỐ khác nhau, không đếm số lần bấm', () => {
    expect(countHints(log)).toBe(2);
  });
});
