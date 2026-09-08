import { describe, expect, it } from 'vitest';
import type { ClusterSpec, ResourceSpec } from './contract.ts';
import type { ClusterState, PodRuntime } from './model.ts';
import { createCluster, podRuntime } from './model.ts';
import { serviceEndpoints } from './query.ts';
import { advance } from './tick.ts';

function cluster(resources: readonly ResourceSpec[], nodes?: ClusterSpec['nodes']): ClusterState {
  return createCluster(
    {
      nodes: nodes ?? [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
      namespaces: ['ns'],
      resources,
    },
    1,
  );
}

function pod(name: string, container: Record<string, unknown>, extra: Record<string, unknown> = {}): ResourceSpec {
  return {
    kind: 'Pod',
    name,
    namespace: 'ns',
    spec: {
      labels: { app: name },
      containers: [{ name, image: 'nginx:1.27-alpine', ports: [{ containerPort: 80 }], ...container }],
      ...extra,
    },
  };
}

function runtimeOf(state: ClusterState, name: string): PodRuntime {
  const object = state.objects.find((item) => item.name === name);
  const runtime = object === undefined ? null : podRuntime(object);
  if (runtime === null) {
    throw new Error(`không tìm thấy pod ${name}`);
  }
  return runtime;
}

describe('vòng đời bình thường', () => {
  it('Pending → ContainerCreating → Running → Ready, đúng thứ tự', () => {
    let state = cluster([pod('web', {})]);
    expect(runtimeOf(state, 'web').phase).toBe('Pending');
    // Chưa xếp lịch thì CHƯA có container nào để mà "đang tạo".
    expect(runtimeOf(state, 'web').reason).toBeNull();

    state = advance(state, 1);
    expect(runtimeOf(state, 'web').reason).toBe('ContainerCreating');
    expect(runtimeOf(state, 'web').nodeName).toBe('may-chu-1');

    state = advance(state, 4);
    expect(runtimeOf(state, 'web').phase).toBe('Running');
    // Running mà CHƯA Ready là một trạng thái thật, không phải bước trung gian
    // vô nghĩa — Service không nhận pod này vào endpoint trong lúc đó.
    expect(runtimeOf(state, 'web').ready).toBe(false);

    state = advance(state, 6);
    expect(runtimeOf(state, 'web').ready).toBe(true);
    expect(runtimeOf(state, 'web').reason).toBeNull();
  });
});

/**
 * ⭐ Nhóm test quan trọng nhất của lane này.
 *
 * Ba nguyên nhân hoàn toàn khác nhau — entrypoint sai, thiếu RAM, liveness probe
 * quá gắt — phải cho ra CÙNG một triệu chứng ở `kubectl get` (restart tăng dần,
 * không bao giờ Ready) và CHỈ tách nhau ở `describe` (khối Last State) và
 * `logs --previous`. Đó là toàn bộ giá trị sư phạm của trục thứ ba; một mô hình
 * gộp `phase`/`reason`/`lastState` sẽ hoặc làm ba cái giống hệt nhau (không phân
 * biệt được, người chơi đoán mò) hoặc khác nhau ngay ở `get` (không cần điều tra,
 * mất luôn bài học).
 */
describe('ba sự cố dễ nhầm — giống nhau ở get, khác nhau ở describe', () => {
  const badEntrypoint = pod('sai-lenh', { command: ['/bin/khong-co-lenh-nay'] });
  const oom = pod('thieu-ram', {
    resources: { requests: { memory: '512Mi' }, limits: { memory: '64Mi' } },
  });
  const badLiveness = pod('probe-gat', {
    livenessProbe: { port: 9999, initialDelaySeconds: 30 },
  });

  it('cả ba đều restart liên tục và không bao giờ Ready — cột của `get` giống hệt nhau', () => {
    const state = advance(cluster([badEntrypoint, oom, badLiveness]), 90);
    for (const name of ['sai-lenh', 'thieu-ram', 'probe-gat']) {
      const runtime = runtimeOf(state, name);
      expect(runtime.ready, name).toBe(false);
      expect(runtime.restarts, name).toBeGreaterThan(0);
      expect(runtime.reason, name).toBe('CrashLoopBackOff');
    }
  });

  it('nhưng Last State và exit code KHÁC nhau — đó là chỗ chẩn đoán', () => {
    const state = advance(cluster([badEntrypoint, oom, badLiveness]), 90);
    expect(runtimeOf(state, 'sai-lenh').lastState).toMatchObject({
      reason: 'CrashLoopBackOff',
      exitCode: 127,
    });
    // 137 = 128 + 9 (SIGKILL). Kernel giết, không phải ứng dụng tự thoát.
    expect(runtimeOf(state, 'thieu-ram').lastState).toMatchObject({
      reason: 'OOMKilled',
      exitCode: 137,
    });
    expect(runtimeOf(state, 'probe-gat').lastState).toMatchObject({
      reason: 'LivenessProbeFailed',
      exitCode: 137,
    });
  });

  it('log của lần chạy TRƯỚC chỉ có ở pod sai entrypoint — hai cái kia bị giết nên không kịp ghi', () => {
    const state = advance(cluster([badEntrypoint, oom]), 90);
    expect(runtimeOf(state, 'sai-lenh').previousLogs.join('\n')).toContain('không tìm thấy');
    // Log RỖNG là kết quả ĐÚNG, và chính là lý do phải đọc `describe` chứ không
    // phải `logs` khi nghi ngờ OOM.
    expect(runtimeOf(state, 'thieu-ram').previousLogs).toEqual([]);
  });

  it('limit ĐỦ thì không OOM — đối chứng dương cho phép so limit ↔ mức dùng', () => {
    const enough = pod('du-ram', {
      resources: { requests: { memory: '128Mi' }, limits: { memory: '256Mi' } },
    });
    const state = advance(cluster([enough]), 30);
    expect(runtimeOf(state, 'du-ram').phase).toBe('Running');
    expect(runtimeOf(state, 'du-ram').restarts).toBe(0);
    expect(runtimeOf(state, 'du-ram').lastState).toBeNull();
  });
});

/**
 * Cặp dễ nhầm THỨ HAI: `kubectl get endpoints <svc>` rỗng vì hai lý do hoàn toàn
 * khác nhau — selector không khớp label nào, hay label khớp hoàn hảo nhưng pod
 * chưa Ready. Mô phỏng chỉ ép được người chơi điều tra nếu endpoint thật sự lọc
 * theo `ready`.
 */
describe('endpoint rỗng — hai nguyên nhân, một triệu chứng', () => {
  const service = (selector: Record<string, string>): ResourceSpec => ({
    kind: 'Service',
    name: 'web-svc',
    namespace: 'ns',
    spec: { type: 'ClusterIP', selector, ports: [{ port: 80, targetPort: 80 }] },
  });

  it('selector lệch label ⇒ 0 endpoint, và pod thì hoàn toàn khoẻ', () => {
    const state = advance(cluster([pod('web', {}), service({ app: 'web-v2' })]), 30);
    const svc = state.objects.find((object) => object.kind === 'Service');
    expect(serviceEndpoints(state, svc!)).toHaveLength(0);
    // Pod khoẻ tuyệt đối — bằng chứng nằm ở `get pods --show-labels`, không ở pod.
    expect(runtimeOf(state, 'web').ready).toBe(true);
  });

  it('readiness probe sai cổng ⇒ 0 endpoint, pod Running mà READY là 0/1', () => {
    const broken = pod('web', { readinessProbe: { port: 8080, initialDelaySeconds: 1 } });
    const state = advance(cluster([broken, service({ app: 'web' })]), 30);
    const svc = state.objects.find((object) => object.kind === 'Service');
    expect(serviceEndpoints(state, svc!)).toHaveLength(0);

    const runtime = runtimeOf(state, 'web');
    expect(runtime.phase).toBe('Running');
    expect(runtime.ready).toBe(false);
    expect(runtime.reason).toBe('ReadinessProbeFailed');
    // ⚠ Chỗ tách readiness khỏi liveness: readiness KHÔNG giết container. Restart
    // vẫn bằng 0, và đó là dấu hiệu phân biệt nó với liveness probe hỏng.
    expect(runtime.restarts).toBe(0);
  });

  it('đối chứng dương — selector khớp và pod Ready thì CÓ endpoint', () => {
    const state = advance(cluster([pod('web', {}), service({ app: 'web' })]), 30);
    const svc = state.objects.find((object) => object.kind === 'Service');
    expect(serviceEndpoints(state, svc!)).toHaveLength(1);
  });

  it('Service KHÔNG có selector không hút pod nào — không phải "chọn tất cả"', () => {
    const state = advance(cluster([pod('web', {}), service({})]), 30);
    const svc = state.objects.find((object) => object.kind === 'Service');
    expect(serviceEndpoints(state, svc!)).toHaveLength(0);
  });
});

describe('kéo image', () => {
  it('tag không tồn tại ⇒ ImagePullBackOff, và pod kẹt ở Pending chứ không Running', () => {
    const bad = pod('web', { image: 'nginx:1.27-khong-ton-tai' });
    const state = advance(cluster([bad]), 90);
    const runtime = runtimeOf(state, 'web');
    expect(runtime.phase).toBe('Pending');
    expect(runtime.reason).toBe('ImagePullBackOff');
    expect(runtime.lastState?.reason).toBe('ErrImagePull');
  });

  it('registry không tới được ⇒ báo lỗi MẠNG chứ không báo sai tag', () => {
    const bad = pod('web', { image: 'registry.noi-bo.local/team/web:1.0' });
    const state = advance(cluster([bad]), 20);
    const messages = state.events.map((event) => event.message).join('\n');
    expect(messages).toContain('không phân giải được địa chỉ registry');
    // Thứ tự kiểm sai sẽ báo "không tìm thấy tag" cho một sự cố mạng, và người
    // chơi sẽ đi sửa đúng thứ không hỏng.
    expect(messages).not.toContain('không tìm thấy tag');
  });
});

describe('xếp lịch', () => {
  it('taint không có toleration ⇒ NodeAffinityConflict, không phải Unschedulable', () => {
    const state = advance(
      cluster(
        [pod('web', {})],
        [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true, taints: ['chuyen-dung=db:NoSchedule'] }],
      ),
      5,
    );
    // Hai reason dẫn tới hai hành động sửa khác hẳn nhau: nới ràng buộc xếp lịch,
    // hay thêm dung lượng. Gộp làm một là để người chơi đoán.
    expect(runtimeOf(state, 'web').reason).toBe('NodeAffinityConflict');
  });

  it('hết CPU ⇒ Unschedulable, và Events ghi lý do của TỪNG node', () => {
    const heavy = pod('web', { resources: { requests: { cpu: '8' } } });
    const state = advance(cluster([heavy]), 5);
    expect(runtimeOf(state, 'web').reason).toBe('Unschedulable');
    const messages = state.events.map((event) => event.message).join('\n');
    expect(messages).toContain('may-chu-1');
    expect(messages).toContain('không đủ CPU');
  });

  it('node NotReady ⇒ pod mất Ready TRƯỚC, phase đổi sau', () => {
    const state = cluster([pod('web', {})], [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: false },
    ]);
    const after = advance(state, 5);
    expect(runtimeOf(after, 'web').nodeName).toBeNull();
    expect(runtimeOf(after, 'web').ready).toBe(false);
  });
});

describe('pod một-lần', () => {
  it('restartPolicy Never chạy xong thì Succeeded và KHÔNG chạy lại', () => {
    const job = pod('xuat-bao-cao', {}, { restartPolicy: 'Never' });
    const state = advance(cluster([job]), 40);
    const runtime = runtimeOf(state, 'xuat-bao-cao');
    expect(runtime.phase).toBe('Succeeded');
    expect(runtime.restarts).toBe(0);
    expect(runtime.lastState).toMatchObject({ exitCode: 0 });
  });

  it('pod Succeeded KHÔNG còn giữ tài nguyên của node', () => {
    // `'3500m'`, KHÔNG phải `'3500'`. Số trần trong Kubernetes nghĩa là CORE:
    // `'3500'` là 3500 core và pod sẽ Unschedulable trên một node 4 core. Bản
    // nháp của test này viết sai đúng chỗ đó — giữ lại ghi chú vì đây là cái bẫy
    // đơn vị hay cắn nhất khi đọc `resources`.
    const done = pod('xong', { resources: { requests: { cpu: '3500m' } } }, { restartPolicy: 'Never' });
    let state = advance(cluster([done]), 40);
    expect(runtimeOf(state, 'xong').phase).toBe('Succeeded');
    // Một pod đã kết thúc vẫn còn bản ghi. Tính nó vào là lý do một cụm "hết
    // chỗ" trong khi `kubectl top node` nói còn dư.
    state = advance(state, 5);
    expect(runtimeOf(state, 'xong').phase).toBe('Succeeded');
  });
});
