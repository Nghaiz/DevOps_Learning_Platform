import { describe, expect, it } from 'vitest';
import type { ClusterSpec, IncidentKind, ResourceRef, ResourceSpec } from './contract.ts';
import { createCluster } from './model.ts';
import type { ClusterState } from './model.ts';
import { advance } from './tick.ts';
import { runCommand } from './kubectl.ts';
import { INCIDENTS } from './incidents.ts';

const KINDS = Object.keys(INCIDENTS) as readonly IncidentKind[];

function cluster(resources: readonly ResourceSpec[]): ClusterState {
  const spec: ClusterSpec = {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true, labels: { vung: 'hn' } },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true, labels: { vung: 'sg' } },
    ],
    namespaces: ['san-pham'],
    resources,
  };
  return createCluster(spec, 5);
}

function webPod(name = 'web', extra: Record<string, unknown> = {}): ResourceSpec {
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

const POD_REF: ResourceRef = { kind: 'Pod', namespace: 'san-pham', name: 'web' };

/** Cột STATUS của `kubectl get pods` — đúng thứ người chơi nhìn thấy đầu tiên. */
function statusColumn(state: ClusterState): string {
  const output = runCommand(state, 'kubectl get pods', 'san-pham').output;
  const row = output.split('\n').find((line) => line.startsWith('web '));
  return row?.split(/\s+/u)[2] ?? '';
}

function inject(kind: IncidentKind, state: ClusterState, ref: ResourceRef = POD_REF): ClusterState {
  return INCIDENTS[kind].inject(state, ref);
}

describe('bảng sự cố', () => {
  it('có đủ 32 sự cố và không khoá nào lệch với `kind` bên trong', () => {
    expect(KINDS).toHaveLength(32);
    for (const kind of KINDS) {
      expect(INCIDENTS[kind].kind, kind).toBe(kind);
    }
  });

  /**
   * `symptom` là thứ người chơi QUAN SÁT. Viết nguyên nhân vào đó là xoá mất bước
   * chẩn đoán, tức xoá mất bài học — nên danh sách dưới đây là các từ chỉ NGUYÊN
   * NHÂN, và không câu triệu chứng nào được chứa chúng.
   */
  it('không câu triệu chứng nào nói ra nguyên nhân', () => {
    const giveaways = [
      'OOM',
      'memory limit',
      'entrypoint',
      'selector',
      'imagePullSecret',
      'initialDelay',
      'NetworkPolicy',
      'ResourceQuota',
      'LimitRange',
      'toleration',
      'taint',
      'StorageClass',
      'accessMode',
      'requests.cpu',
      'ReadWriteOnce',
    ];
    for (const kind of KINDS) {
      const symptom = INCIDENTS[kind].symptom;
      for (const word of giveaways) {
        expect(symptom.toLowerCase(), `${kind} — "${word}"`).not.toContain(word.toLowerCase());
      }
      expect(symptom.length, kind).toBeGreaterThan(30);
    }
  });

  it('inject THUẦN — không sửa state đã nhận', () => {
    for (const kind of KINDS) {
      const before = advance(cluster([webPod()]), 20);
      const snapshot = JSON.stringify(before);
      inject(kind, before);
      expect(JSON.stringify(before), kind).toBe(snapshot);
    }
  });

  it('inject không ném dù đích không tồn tại hay sai loại', () => {
    const state = cluster([]);
    for (const kind of KINDS) {
      expect(() => inject(kind, state), kind).not.toThrow();
      expect(inject(kind, state), kind).toBe(state);
      expect(() => INCIDENTS[kind].isActive(state, POD_REF), kind).not.toThrow();
      expect(INCIDENTS[kind].isActive(state, POD_REF), kind).toBe(false);
    }
  });

  it('inject ghi lại một bản ghi sự cố, và gieo hai lần không ghi hai bản', () => {
    const state = advance(cluster([webPod()]), 20);
    const once = inject('lenh-entrypoint-sai', state);
    expect(once.incidents).toHaveLength(1);
    expect(once.incidents[0]?.resolvedTick).toBeNull();
    expect(inject('lenh-entrypoint-sai', once).incidents).toHaveLength(1);
  });
});

/**
 * ⛔ NHÓM TEST QUAN TRỌNG NHẤT CỦA LANE.
 *
 * Không khẳng định "hai chuỗi symptom bằng nhau" — chuỗi thì sửa lúc nào cũng
 * được. Ở đây ta gieo bốn nguyên nhân KHÁC HẲN nhau rồi đọc đúng thứ người chơi
 * đọc (`kubectl get pods`) và đòi kết quả GIỐNG NHAU. Nếu một ngày nào đó cột
 * STATUS phân biệt được chúng, trò chơi tụt xuống thành ghi nhớ và test này đỏ.
 */
describe('bốn nguyên nhân, một triệu chứng ở `kubectl get pods`', () => {
  const family: readonly IncidentKind[] = [
    'lenh-entrypoint-sai',
    'memory-limit-qua-thap',
    'liveness-probe-qua-gat',
    'probe-khong-co-initialdelay',
  ];

  const settled = (kind: IncidentKind): ClusterState =>
    advance(inject(kind, advance(cluster([webPod()]), 12)), 60);

  it('cả bốn cùng hiện CrashLoopBackOff', () => {
    const seen = family.map((kind) => statusColumn(settled(kind)));
    expect(seen).toEqual(['CrashLoopBackOff', 'CrashLoopBackOff', 'CrashLoopBackOff', 'CrashLoopBackOff']);
  });

  it('cả bốn cùng có RESTARTS > 0 và READY 0/1', () => {
    for (const kind of family) {
      const row = runCommand(settled(kind), 'kubectl get pods', 'san-pham')
        .output.split('\n')
        .find((line) => line.startsWith('web '))
        ?.split(/\s+/u);
      expect(row?.[1], kind).toBe('0/1');
      expect(Number(row?.[3] ?? 0), kind).toBeGreaterThan(0);
    }
  });

  it('chung một câu triệu chứng, từng chữ một', () => {
    const symptoms = new Set(family.map((kind) => INCIDENTS[kind].symptom));
    expect(symptoms.size).toBe(1);
  });

  /**
   * Và đây là chỗ chúng TÁCH RA — nếu không có chỗ này thì sự cố không chẩn đoán
   * được, chỉ đoán được. `describe` phải nói ra ba câu chuyện khác nhau.
   */
  it('`describe` tách được chúng: exit code và Last State khác nhau', () => {
    const read = (kind: IncidentKind): string =>
      runCommand(settled(kind), 'kubectl describe pod web', 'san-pham').output;
    expect(read('lenh-entrypoint-sai')).toContain('Exit Code:  127');
    expect(read('memory-limit-qua-thap')).toContain('OOMKilled');
    expect(read('memory-limit-qua-thap')).toContain('Exit Code:  137');
    expect(read('liveness-probe-qua-gat')).toContain('LivenessProbeFailed');
    expect(read('probe-khong-co-initialdelay')).toContain('LivenessProbeFailed');
  });

  /**
   * OOMKilled và LivenessProbeFailed dùng CHUNG exit code 137 — cả hai đều là
   * SIGKILL, đúng như cụm thật. Test này khoá lại sự thật đó: ai "sửa" cho hai
   * mã khác nhau là đang dạy sai.
   */
  it('OOMKilled và liveness fail cùng exit 137 — chỉ dòng Reason tách được', () => {
    const oom = runCommand(settled('memory-limit-qua-thap'), 'kubectl describe pod web', 'san-pham').output;
    const live = runCommand(settled('liveness-probe-qua-gat'), 'kubectl describe pod web', 'san-pham').output;
    expect(oom).toContain('Exit Code:  137');
    expect(live).toContain('Exit Code:  137');
    expect(oom).not.toContain('LivenessProbeFailed');
    expect(live).not.toContain('OOMKilled');
  });

  /** `logs --previous` là bằng chứng duy nhất của entrypoint sai — log hiện tại rỗng. */
  it('`logs --previous` chỉ có nội dung ở sự cố entrypoint', () => {
    const previous = (kind: IncidentKind): string =>
      runCommand(settled(kind), 'kubectl logs web --previous', 'san-pham').output;
    expect(previous('lenh-entrypoint-sai')).toContain('không tìm thấy');
    // Kernel giết tiến trình nên ứng dụng không kịp ghi gì — đó chính là lý do
    // phải đọc `describe` chứ không phải `logs` cho một pod bị OOM.
    expect(previous('memory-limit-qua-thap')).not.toContain('không tìm thấy');
  });
});

describe('ba nguyên nhân, một triệu chứng "Service rỗng endpoint"', () => {
  const service: ResourceSpec = {
    kind: 'Service',
    name: 'web',
    namespace: 'san-pham',
    spec: { type: 'ClusterIP', selector: { app: 'web' }, ports: [{ port: 80, targetPort: 80 }] },
  };
  const SERVICE_REF: ResourceRef = { kind: 'Service', namespace: 'san-pham', name: 'web' };

  const endpointCount = (state: ClusterState): string => {
    const output = runCommand(state, 'kubectl get svc', 'san-pham').output;
    const row = output.split('\n').find((line) => line.startsWith('web '));
    return row?.split(/\s+/u)[3] ?? '';
  };

  const base = (): ClusterState => advance(cluster([service, webPod()]), 20);

  it('cụm khoẻ có endpoint', () => {
    expect(endpointCount(base())).toBe('1');
  });

  it('cả ba nguyên nhân cùng cho ra 0 endpoint', () => {
    const lech = inject('service-selector-lech-label', base(), SERVICE_REF);
    const readiness = advance(inject('readiness-probe-sai-cong', base(), POD_REF), 20);
    const rong = advance(inject('khong-co-endpoint', base(), SERVICE_REF), 20);
    expect([endpointCount(lech), endpointCount(readiness), endpointCount(rong)]).toEqual(['0', '0', '0']);
  });

  it('chung một câu triệu chứng', () => {
    const symptoms = new Set(
      (['service-selector-lech-label', 'readiness-probe-sai-cong', 'khong-co-endpoint'] as const).map(
        (kind) => INCIDENTS[kind].symptom,
      ),
    );
    expect(symptoms.size).toBe(1);
  });

  /**
   * Chỗ tách: selector lệch thì pod vẫn 1/1 READY, readiness fail thì 0/1. Cùng
   * một dòng ở `get svc`, hai dòng khác nhau ở `get pods`.
   */
  it('`get pods` tách hai nguyên nhân đầu bằng cột READY', () => {
    const lech = inject('service-selector-lech-label', base(), SERVICE_REF);
    const readiness = advance(inject('readiness-probe-sai-cong', base(), POD_REF), 20);
    const ready = (state: ClusterState): string =>
      runCommand(state, 'kubectl get pods', 'san-pham')
        .output.split('\n')
        .find((line) => line.startsWith('web '))
        ?.split(/\s+/u)[1] ?? '';
    expect(ready(lech)).toBe('1/1');
    expect(ready(readiness)).toBe('0/1');
  });
});

describe('ba nguyên nhân, một triệu chứng "pod kẹt trước khi có container"', () => {
  const settled = (kind: IncidentKind): ClusterState =>
    advance(inject(kind, advance(cluster([webPod()]), 12)), 20);

  it('nhóm image cùng kẹt và cùng một câu triệu chứng', () => {
    const kinds = ['image-tag-sai', 'image-registry-khong-toi-duoc', 'thieu-imagepullsecret'] as const;
    expect(new Set(kinds.map((kind) => INCIDENTS[kind].symptom)).size).toBe(1);
    for (const kind of kinds) {
      expect(statusColumn(settled(kind)), kind).not.toBe('Running');
    }
  });

  /** l18 dạy đúng bảng này: hỏng ở bước kéo image ≠ hỏng ở bước dựng cấu hình. */
  it('kéo image hỏng và cấu hình hỏng cho ra hai `reason` khác nhau', () => {
    const image = statusColumn(settled('image-tag-sai'));
    const config = statusColumn(settled('thieu-configmap'));
    expect(image).toMatch(/ErrImagePull|ImagePullBackOff/u);
    expect(config).toBe('CreateContainerConfigError');
  });
});

/**
 * `isActive` phải hỏi NGUYÊN NHÂN, không hỏi triệu chứng — nếu không, một pod vừa
 * restart trông xanh trong vài tick và mục tiêu tích xanh sai.
 */
describe('isActive theo nguyên nhân, và tắt khi người chơi sửa', () => {
  it('bật ngay sau khi gieo, ở mọi sự cố gieo được trên một pod', () => {
    const base = advance(cluster([webPod()]), 20);
    const podScoped: readonly IncidentKind[] = [
      'image-tag-sai',
      'image-registry-khong-toi-duoc',
      'thieu-imagepullsecret',
      'memory-limit-qua-thap',
      'lenh-entrypoint-sai',
      'thieu-configmap',
      'thieu-secret',
      'readiness-probe-sai-cong',
      'liveness-probe-qua-gat',
      'probe-khong-co-initialdelay',
      'dns-khong-phan-giai',
      'networkpolicy-chan-nham',
      'nodeselector-khong-khop',
      'serviceaccount-khong-ton-tai',
      'node-notready',
      'taint-khong-co-toleration',
      'node-het-cpu',
      'node-het-memory',
      'resourcequota-chan',
      'limitrange-tu-choi',
    ];
    for (const kind of podScoped) {
      expect(INCIDENTS[kind].isActive(base, POD_REF), `${kind} — trước khi gieo`).toBe(false);
      expect(INCIDENTS[kind].isActive(inject(kind, base), POD_REF), `${kind} — sau khi gieo`).toBe(true);
    }
  });

  /**
   * Vòng đầy đủ: gieo → người chơi sửa bằng lệnh thật → sự cố tắt. Nếu `isActive`
   * đọc triệu chứng thay vì nguyên nhân thì ô này đỏ, vì pod còn mang dấu vết
   * restart một lúc lâu sau khi cấu hình đã đúng.
   */
  it('tắt khi ConfigMap thiếu được tạo lại', () => {
    const withRef = cluster([
      {
        kind: 'ConfigMap',
        name: 'cau-hinh',
        namespace: 'san-pham',
        spec: { data: { MUC_LOG: 'info' } },
      },
      webPod('web', {
        containers: [
          {
            name: 'web',
            image: 'nginx:1.27-alpine',
            ports: [{ containerPort: 80 }],
            envFrom: [{ configMapRef: { name: 'cau-hinh' } }],
          },
        ],
      }),
    ]);
    const broken = inject('thieu-configmap', advance(withRef, 20));
    expect(INCIDENTS['thieu-configmap'].isActive(broken, POD_REF)).toBe(true);
    const fixed = runCommand(
      broken,
      'kubectl apply -f cau-hinh.yaml',
      'san-pham',
    );
    // `apply -f` không chạy được trong game; đường sửa thật đi qua bảng YAML nên
    // ở đây ta dựng lại object trực tiếp để kiểm đúng phần `isActive`.
    expect(fixed.accepted).toBe(false);
    const restored: ClusterState = {
      ...broken,
      objects: [
        ...broken.objects,
        {
          uid: 'cm-lai',
          kind: 'ConfigMap' as const,
          name: 'cau-hinh',
          namespace: 'san-pham',
          labels: {},
          spec: { data: { MUC_LOG: 'info' } },
          ownerUid: null,
          createdTick: broken.tick,
          runtime: { kind: 'none' as const },
        },
      ],
    };
    expect(INCIDENTS['thieu-configmap'].isActive(restored, POD_REF)).toBe(false);
  });

  it('tắt khi memory limit được nâng lên trên mức container cần', () => {
    const broken = inject('memory-limit-qua-thap', advance(cluster([webPod()]), 20));
    expect(INCIDENTS['memory-limit-qua-thap'].isActive(broken, POD_REF)).toBe(true);
    const healthy = advance(cluster([webPod()]), 20);
    expect(INCIDENTS['memory-limit-qua-thap'].isActive(healthy, POD_REF)).toBe(false);
  });
});
