import { describe, expect, it } from 'vitest';
import type { ClusterSpec, ResourceSpec } from './contract.ts';
import { createCluster, findObject, replaceObject } from './model.ts';
import type { ClusterState } from './model.ts';
import { advance } from './tick.ts';
import { PREDICATE_NAMES } from './predicate-names.ts';
import { IMPLEMENTED_PREDICATE_NAMES, PREDICATES } from './predicates.ts';

function cluster(resources: readonly ResourceSpec[], namespaces = ['san-pham']): ClusterState {
  const spec: ClusterSpec = {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true, labels: { vung: 'hn' } },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true, labels: { vung: 'sg' } },
    ],
    namespaces,
    resources,
  };
  return createCluster(spec, 11);
}

function pod(name: string, extra: Record<string, unknown> = {}): ResourceSpec {
  return {
    kind: 'Pod',
    name,
    namespace: 'san-pham',
    spec: {
      labels: { app: 'web' },
      containers: [
        {
          name: 'web',
          image: 'nginx:1.27-alpine',
          ports: [{ containerPort: 80 }],
          resources: {
            requests: { cpu: '100m', memory: '64Mi' },
            limits: { cpu: '200m', memory: '128Mi' },
          },
        },
      ],
      ...extra,
    },
  };
}

const check = (state: ClusterState, name: string, args: Record<string, unknown>): boolean =>
  PREDICATES[name as keyof typeof PREDICATES](state, args);

/**
 * Test HAI CHIỀU. Một chiều thôi thì một vị từ chết sống mãi: tên bị xoá khỏi từ
 * vựng nhưng hiện thực vẫn nằm đó, không ai gọi và không ai biết để dọn.
 */
describe('bảng vị từ phủ đúng từ vựng', () => {
  it('mọi tên trong PREDICATE_NAMES đều có hiện thực', () => {
    const missing = PREDICATE_NAMES.filter((name) => !(name in PREDICATES));
    expect(missing).toEqual([]);
  });

  it('mọi hiện thực đều có tên trong PREDICATE_NAMES', () => {
    const known = new Set<string>(PREDICATE_NAMES);
    const orphan = IMPLEMENTED_PREDICATE_NAMES.filter((name) => !known.has(name));
    expect(orphan).toEqual([]);
  });

  it('không tên nào trùng, và số lượng hai bên bằng nhau', () => {
    expect(new Set(PREDICATE_NAMES).size).toBe(PREDICATE_NAMES.length);
    expect(IMPLEMENTED_PREDICATE_NAMES).toHaveLength(PREDICATE_NAMES.length);
  });

  /**
   * Đối chứng ÂM cho luật "thiếu tham số thì trả `false`, không ném". Một level
   * viết sai chỉ được phép làm hỏng một mục tiêu, không được làm sập phiên chơi.
   */
  it('không vị từ nào ném khi args rỗng hoặc rác', () => {
    const state = cluster([pod('web')]);
    const rubbish: readonly Record<string, unknown>[] = [
      {},
      { name: 123, namespace: null, kind: [] },
      { namespace: '', labelSelector: '' },
      { kind: 'KhongCoLoaiNay', name: 'x', namespace: 'y' },
      { min: Number.NaN, replicas: 'ba', n: {} },
    ];
    for (const name of PREDICATE_NAMES) {
      for (const args of rubbish) {
        expect(() => PREDICATES[name](state, args), `${name} ${JSON.stringify(args)}`).not.toThrow();
        expect(typeof PREDICATES[name](state, args), name).toBe('boolean');
      }
    }
  });

  it('vị từ không đổi trạng thái — gọi hai lần cho cùng kết quả', () => {
    const state = advance(cluster([pod('web')]), 20);
    const args = { namespace: 'san-pham', name: 'web' };
    expect(check(state, 'pod-running', args)).toBe(check(state, 'pod-running', args));
    expect(state.objects).toBe(state.objects);
  });
});

describe('pod-running', () => {
  it('xanh khi pod đã Running và không mang reason', () => {
    const state = advance(cluster([pod('web')]), 20);
    expect(check(state, 'pod-running', { namespace: 'san-pham', name: 'web' })).toBe(true);
  });

  /**
   * Cái bẫy đắt nhất của cả file: một pod `CrashLoopBackOff` có `phase` là
   * `Running` ở Kubernetes thật. Vị từ chỉ đọc `phase` sẽ tích xanh cho ĐÚNG cái
   * pod mà level đang bảo người chơi đi sửa.
   */
  it('ĐỎ với pod đang CrashLoopBackOff, dù phase của nó là Running', () => {
    const state = advance(
      cluster([
        pod('web', {
          containers: [
            {
              name: 'web',
              image: 'nginx:1.27-alpine',
              command: ['/usr/local/bin/khong-co-lenh'],
              ports: [{ containerPort: 80 }],
            },
          ],
        }),
      ]),
      40,
    );
    const object = findObject(state, { kind: 'Pod', namespace: 'san-pham', name: 'web' });
    const runtime = object?.runtime.kind === 'pod' ? object.runtime.pod : null;
    expect(runtime?.phase).toBe('Running');
    expect(runtime?.reason).toBe('CrashLoopBackOff');
    expect(check(state, 'pod-running', { namespace: 'san-pham', name: 'web' })).toBe(false);
  });

  it('đỏ khi pod không tồn tại', () => {
    expect(check(cluster([]), 'pod-running', { namespace: 'san-pham', name: 'web' })).toBe(false);
  });
});

/**
 * Luật số 3 của file: không mục tiêu nào được thoả bằng cách XOÁ bằng chứng.
 * Đây là nhóm test đắt nhất, vì mỗi ô ở đây là một đường lách bị bịt.
 */
describe('không thoả được bằng cách xoá bằng chứng', () => {
  it('pod-not-on-node đỏ khi pod bị xoá hẳn', () => {
    const args = { namespace: 'san-pham', name: 'web', nodeName: 'may-chu-1' };
    const withPod = advance(cluster([pod('web', { nodeName: 'may-chu-2' })]), 20);
    expect(check(withPod, 'pod-not-on-node', args)).toBe(true);
    expect(check(cluster([]), 'pod-not-on-node', args)).toBe(false);
  });

  it('pod-no-reason đỏ khi không còn pod nào khớp', () => {
    expect(
      check(cluster([]), 'pod-no-reason', { namespace: 'san-pham', labelSelector: 'app=web' }),
    ).toBe(false);
  });

  it('all-pods-healthy đỏ trong một namespace rỗng', () => {
    expect(check(cluster([]), 'all-pods-healthy', { namespace: 'san-pham' })).toBe(false);
  });

  it('resource-absent đỏ khi tham số không đọc được, không phải xanh', () => {
    expect(check(cluster([]), 'resource-absent', { name: 'x' })).toBe(false);
    expect(check(cluster([]), 'resource-absent', {})).toBe(false);
  });
});

describe('resource-exists / resource-absent', () => {
  const configMap: ResourceSpec = {
    kind: 'ConfigMap',
    name: 'so-sach-bi-mat',
    namespace: 'san-pham',
    spec: { data: { MAT_KHAU: '123' } },
  };

  /** l20 chứng minh "đã dọn thông tin lộ" bằng chính hai vị từ này trên ConfigMap. */
  it('đúng với ConfigMap, không chỉ với Pod', () => {
    const args = { kind: 'ConfigMap', name: 'so-sach-bi-mat', namespace: 'san-pham' };
    expect(check(cluster([configMap]), 'resource-exists', args)).toBe(true);
    expect(check(cluster([configMap]), 'resource-absent', args)).toBe(false);
    expect(check(cluster([]), 'resource-absent', args)).toBe(true);
  });

  it('nhận cả tên tắt lẫn số nhiều cho `kind`', () => {
    const state = cluster([configMap]);
    for (const kind of ['ConfigMap', 'configmap', 'configmaps', 'cm']) {
      expect(check(state, 'resource-exists', { kind, name: 'so-sach-bi-mat', namespace: 'san-pham' }), kind).toBe(true);
    }
  });
});

describe('deployment-ready và replicas-at-least', () => {
  const deployment: ResourceSpec = {
    kind: 'Deployment',
    name: 'web',
    namespace: 'san-pham',
    spec: {
      replicas: 3,
      labels: { app: 'web' },
      selector: { matchLabels: { app: 'web' } },
      template: {
        labels: { app: 'web' },
        containers: [
          {
            name: 'web',
            image: 'nginx:1.27-alpine',
            ports: [{ containerPort: 80 }],
            resources: { requests: { cpu: '100m', memory: '64Mi' } },
          },
        ],
      },
    },
  };

  /**
   * `deployment-ready` phải đếm pod THẬT SỰ Ready qua tầng ReplicaSet. Nếu nó đọc
   * `spec.replicas` thì mục tiêu xanh ngay lúc người chơi gõ `--replicas=3`, tức
   * là trước khi có một pod nào lên — xoá đúng khác biệt mà chương 2 dạy.
   */
  it('đỏ ngay sau khi khai báo, xanh sau khi pod thật sự Ready', () => {
    const state = cluster([deployment]);
    const args = { name: 'web', namespace: 'san-pham', replicas: 3 };
    expect(check(state, 'deployment-ready', args)).toBe(false);
    expect(check(advance(state, 60), 'deployment-ready', args)).toBe(true);
  });

  /**
   * `replicas-at-least` đọc con số KHAI BÁO — nó canh vế còn lại: người chơi
   * không được "sửa" pod kẹt bằng cách hạ số replica xuống.
   */
  it('đỏ khi bị hạ số replica xuống dưới mức yêu cầu', () => {
    const state = cluster([deployment]);
    const args = { kind: 'Deployment', name: 'web', namespace: 'san-pham', n: 3 };
    expect(check(state, 'replicas-at-least', args)).toBe(true);
    const object = findObject(state, { kind: 'Deployment', namespace: 'san-pham', name: 'web' });
    const shrunk = replaceObject(state, { ...object!, spec: { ...object!.spec, replicas: 1 } });
    expect(check(shrunk, 'replicas-at-least', args)).toBe(false);
  });
});

describe('service-has-endpoints tách được hai nguyên nhân cùng triệu chứng', () => {
  const service: ResourceSpec = {
    kind: 'Service',
    name: 'web',
    namespace: 'san-pham',
    spec: { type: 'ClusterIP', selector: { app: 'web' }, ports: [{ port: 80, targetPort: 80 }] },
  };

  it('xanh khi pod khớp label VÀ đã Ready', () => {
    const state = advance(cluster([service, pod('web')]), 20);
    expect(check(state, 'service-has-endpoints', { name: 'web', namespace: 'san-pham', min: 1 })).toBe(true);
  });

  it('đỏ khi selector lệch label — pod vẫn Running bình thường', () => {
    const lech: ResourceSpec = { ...service, spec: { ...service.spec, selector: { app: 'web-cu' } } };
    const state = advance(cluster([lech, pod('web')]), 20);
    expect(check(state, 'pod-running', { namespace: 'san-pham', name: 'web' })).toBe(true);
    expect(check(state, 'service-has-endpoints', { name: 'web', namespace: 'san-pham', min: 1 })).toBe(false);
  });

  /** Nửa kia của cặp: label khớp hoàn hảo, pod Running, nhưng READY là 0/1. */
  it('đỏ khi readiness probe gõ sai cổng — label khớp hoàn hảo', () => {
    const state = advance(
      cluster([
        service,
        pod('web', {
          containers: [
            {
              name: 'web',
              image: 'nginx:1.27-alpine',
              ports: [{ containerPort: 80 }],
              readinessProbe: { httpGet: { path: '/san-sang', port: 8081 }, initialDelaySeconds: 2 },
            },
          ],
        }),
      ]),
      20,
    );
    expect(check(state, 'service-has-endpoints', { name: 'web', namespace: 'san-pham', min: 1 })).toBe(false);
  });
});

describe('netpol-allows / netpol-denies nhận label MAP', () => {
  const denyAll: ResourceSpec = {
    kind: 'NetworkPolicy',
    name: 'chi-cho-frontend',
    namespace: 'san-pham',
    spec: {
      podSelector: { matchLabels: { app: 'kho' } },
      policyTypes: ['Ingress'],
      ingress: [{ from: [{ podSelector: { matchLabels: { tang: 'frontend' } } }], ports: [{ port: 8080 }] }],
    },
  };

  const args = (from: Record<string, string>) => ({
    namespace: 'san-pham',
    fromLabels: from,
    toLabels: { app: 'kho' },
    port: 8080,
  });

  it('cho phép nguồn được liệt kê, chặn nguồn không được liệt kê', () => {
    const state = cluster([denyAll]);
    expect(check(state, 'netpol-allows', args({ tang: 'frontend' }))).toBe(true);
    expect(check(state, 'netpol-denies', args({ tang: 'frontend' }))).toBe(false);
    expect(check(state, 'netpol-allows', args({ tang: 'backend' }))).toBe(false);
    expect(check(state, 'netpol-denies', args({ tang: 'backend' }))).toBe(true);
  });

  /** Không policy nào chọn pod đích ⇒ Kubernetes mở hết. Đây là mặc định thật. */
  it('cho phép hết khi không có policy nào chọn pod đích', () => {
    expect(check(cluster([]), 'netpol-allows', args({ tang: 'backend' }))).toBe(true);
  });
});

describe('vị từ theo cấu hình', () => {
  it('configmap-key-set đỏ khi khoá tồn tại nhưng rỗng', () => {
    const withEmpty = cluster([
      { kind: 'ConfigMap', name: 'cau-hinh', namespace: 'san-pham', spec: { data: { KHO_URL: '' } } },
    ]);
    const withValue = cluster([
      {
        kind: 'ConfigMap',
        name: 'cau-hinh',
        namespace: 'san-pham',
        spec: { data: { KHO_URL: 'http://kho:8080' } },
      },
    ]);
    const args = { name: 'cau-hinh', namespace: 'san-pham', key: 'KHO_URL' };
    expect(check(withEmpty, 'configmap-key-set', args)).toBe(false);
    expect(check(withValue, 'configmap-key-set', args)).toBe(true);
  });

  it('resource-limits-set đòi đủ cả bốn giá trị', () => {
    const args = { kind: 'Pod', name: 'web', namespace: 'san-pham' };
    expect(check(cluster([pod('web')]), 'resource-limits-set', args)).toBe(true);
    const thieu = pod('web', {
      containers: [
        {
          name: 'web',
          image: 'nginx:1.27-alpine',
          resources: { requests: { cpu: '100m', memory: '64Mi' } },
        },
      ],
    });
    expect(check(cluster([thieu]), 'resource-limits-set', args)).toBe(false);
  });

  it('cronjob-schedule-is bỏ qua khoảng trắng thừa nhưng bắt lịch sai', () => {
    const state = cluster([
      {
        kind: 'CronJob',
        name: 'don-log',
        namespace: 'san-pham',
        spec: { schedule: '0  2 * * *', everyTicks: 120, jobTemplate: {} },
      },
    ]);
    const args = { name: 'don-log', namespace: 'san-pham' };
    expect(check(state, 'cronjob-schedule-is', { ...args, schedule: '0 2 * * *' })).toBe(true);
    expect(check(state, 'cronjob-schedule-is', { ...args, schedule: '0 3 * * *' })).toBe(false);
  });

  it('node-ready đọc Ready, KHÔNG đọc cordon', () => {
    const state = cluster([]);
    expect(check(state, 'node-ready', { nodeName: 'may-chu-1' })).toBe(true);
    const cordoned: ClusterState = {
      ...state,
      nodes: state.nodes.map((node) =>
        node.name === 'may-chu-1' ? { ...node, unschedulable: true } : node,
      ),
    };
    // Cordon ⇒ không nhận pod MỚI, nhưng node vẫn Ready và vẫn chạy pod đang có.
    expect(check(cordoned, 'node-ready', { nodeName: 'may-chu-1' })).toBe(true);
    const down: ClusterState = {
      ...state,
      nodes: state.nodes.map((node) => (node.name === 'may-chu-1' ? { ...node, ready: false } : node)),
    };
    expect(check(down, 'node-ready', { nodeName: 'may-chu-1' })).toBe(false);
  });
});

/**
 * l20 mount Secret vào một Deployment, nên pod mang tên `<tên>-<hash>-<hash>` và
 * `podName` không viết trước được. Thiếu nhánh `labelSelector` thì hai mục tiêu
 * của l20 KHÔNG BAO GIỜ xanh — level không thắng được, và không có gì trong log
 * chỉ về vị từ.
 */
describe('secret-mounted / volume-mounted chỉ pod bằng podName HOẶC labelSelector', () => {
  const secret: ResourceSpec = {
    kind: 'Secret',
    name: 'so-sach-db',
    namespace: 'san-pham',
    spec: { type: 'Opaque', data: { MAT_KHAU: 'x' } },
  };
  const mounted = pod('web', {
    volumes: [{ name: 'bi-mat', secret: { secretName: 'so-sach-db' } }],
    containers: [
      {
        name: 'web',
        image: 'nginx:1.27-alpine',
        ports: [{ containerPort: 80 }],
        volumeMounts: [{ name: 'bi-mat', mountPath: '/etc/bi-mat' }],
      },
    ],
  });

  it('xanh khi chỉ bằng labelSelector, không có podName', () => {
    const state = advance(cluster([secret, mounted]), 20);
    expect(
      check(state, 'secret-mounted', {
        namespace: 'san-pham',
        labelSelector: 'app=web',
        secretName: 'so-sach-db',
      }),
    ).toBe(true);
    expect(
      check(state, 'volume-mounted', {
        namespace: 'san-pham',
        labelSelector: 'app=web',
        mountPath: '/etc/bi-mat',
      }),
    ).toBe(true);
  });

  it('vẫn xanh với podName — đường cũ không gãy', () => {
    const state = advance(cluster([secret, mounted]), 20);
    expect(
      check(state, 'volume-mounted', {
        namespace: 'san-pham',
        podName: 'web',
        mountPath: '/etc/bi-mat',
      }),
    ).toBe(true);
  });

  /** Thiếu cả hai cách chỉ pod ⇒ `false`, chứ KHÔNG rơi về "mọi pod trong namespace". */
  it('đỏ khi thiếu cả podName lẫn labelSelector', () => {
    const state = advance(cluster([secret, mounted]), 20);
    expect(check(state, 'volume-mounted', { namespace: 'san-pham', mountPath: '/etc/bi-mat' })).toBe(
      false,
    );
    expect(
      check(state, 'secret-mounted', { namespace: 'san-pham', secretName: 'so-sach-db' }),
    ).toBe(false);
  });

  it('đỏ khi selector khớp pod nhưng pod chưa mount đúng chỗ', () => {
    const state = advance(cluster([secret, pod('web')]), 20);
    expect(
      check(state, 'volume-mounted', {
        namespace: 'san-pham',
        labelSelector: 'app=web',
        mountPath: '/etc/bi-mat',
      }),
    ).toBe(false);
  });
});
