import { describe, expect, it } from 'vitest';
import type { ClusterSpec } from './contract.ts';
import { createCluster, findObject, podRuntime } from './model.ts';
import type { ClusterState } from './model.ts';
import { objectsOfKind } from './query.ts';
import { advance } from './tick.ts';
import { parseKubectl, runCommand } from './kubectl.ts';

/** Một cụm hai node, một Deployment 2 replica đã chạy sẵn vài tick. */
function cluster(extra: ClusterSpec['resources'] = []): ClusterState {
  const spec: ClusterSpec = {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['san-pham'],
    resources: [
      {
        kind: 'Deployment',
        name: 'web',
        namespace: 'san-pham',
        spec: {
          replicas: 2,
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
      },
      ...extra,
    ],
  };
  return advance(createCluster(spec, 7), 30);
}

function run(state: ClusterState, command: string) {
  return runCommand(state, command, 'san-pham');
}

describe('kubectl — phân tích lệnh', () => {
  it('từ chối lệnh không phải kubectl mà vẫn nói rõ vì sao', () => {
    const outcome = run(cluster(), 'docker ps');
    expect(outcome.accepted).toBe(false);
    expect(outcome.output).toContain('kubectl');
  });

  /**
   * Đối chứng ÂM cho "không bao giờ ném". Một người học gõ sai là chuyện thường,
   * và một ngoại lệ lọt ra đây sẽ làm sập cả phiên chơi chứ không chỉ một lệnh.
   */
  it('không ném với bất kỳ chuỗi rác nào', () => {
    const rubbish = [
      '',
      '   ',
      'kubectl',
      'kubectl get',
      'kubectl get khong-co-loai-nay',
      'kubectl delete',
      'kubectl scale deployment/web',
      'kubectl scale deployment/web --replicas=abc',
      'kubectl rollout',
      'kubectl rollout xoay deployment/web',
      'kubectl logs',
      'kubectl exec',
      'kubectl get pods --co-gi-do',
      'kubectl get pods -l',
      'kubectl get "chua-dong-nhay',
      'k get po -n',
    ];
    const state = cluster();
    for (const command of rubbish) {
      expect(() => run(state, command), command).not.toThrow();
      expect(run(state, command).state, command).toBe(state);
    }
  });

  it('nhận cả dạng `pod/web` lẫn `pod web`, và cả tên tắt', () => {
    const slash = parseKubectl('kubectl describe pod/web');
    const spaced = parseKubectl('kubectl describe po web');
    expect(slash.ok && spaced.ok).toBe(true);
    expect(slash.ok ? slash.command : null).toEqual(spaced.ok ? spaced.command : undefined);
  });
});

describe('kubectl — lệnh chỉ đọc', () => {
  /**
   * Lệnh đọc KHÔNG được sinh trạng thái mới. So bằng `toBe` (đồng nhất tham
   * chiếu) chứ không `toEqual`: `useSyncExternalStore` của lane E so snapshot
   * bằng `Object.is`, nên một bản sao "bằng nhau" vẫn làm React render lại vô ích.
   */
  it('trả về đúng tham chiếu state đã nhận', () => {
    const state = cluster();
    for (const command of ['kubectl get pods', 'kubectl describe deploy web', 'kubectl get rs']) {
      expect(run(state, command).state).toBe(state);
    }
  });

  it('`get pods` in ra bảng đúng hình dạng kubectl', () => {
    const output = run(cluster(), 'kubectl get pods').output;
    expect(output.split('\n')[0]).toMatch(/^NAME\s+READY\s+STATUS\s+RESTARTS\s+AGE\s+NODE$/);
    expect(output).toContain('Running');
  });

  it('`get pods` của một namespace rỗng nói rõ là rỗng, không phải lỗi', () => {
    expect(run(cluster(), 'kubectl get pods -n khong-co-gi').output).toContain('No resources found');
  });
});

describe('kubectl delete', () => {
  it('pod do controller quản lý: nói thẳng rằng nó sẽ mọc lại', () => {
    const state = cluster();
    const pod = objectsOfKind(state, 'Pod', 'san-pham')[0];
    expect(pod).toBeDefined();
    const outcome = run(state, `kubectl delete pod ${pod?.name ?? ''}`);
    expect(outcome.accepted).toBe(true);
    expect(outcome.output).toContain('deleted');
    expect(outcome.output).toContain('ReplicaSet');
    const after = findObject(outcome.state, {
      kind: 'Pod',
      namespace: 'san-pham',
      name: pod?.name ?? '',
    });
    expect(after === null ? null : podRuntime(after)?.phase).toBe('Terminating');
  });

  it('ReplicaSet dựng lại pod đã xoá — đúng lời cảnh báo của chính lệnh', () => {
    const state = cluster();
    const before = objectsOfKind(state, 'Pod', 'san-pham').length;
    const deleted = run(state, `kubectl delete pod ${objectsOfKind(state, 'Pod', 'san-pham')[0]?.name ?? ''}`);
    expect(objectsOfKind(advance(deleted.state, 80), 'Pod', 'san-pham').length).toBe(before);
  });

  it('`--force` bỏ qua grace period và nói rõ nó KHÔNG giết tiến trình', () => {
    const state = cluster();
    const name = objectsOfKind(state, 'Pod', 'san-pham')[0]?.name ?? '';
    const outcome = run(state, `kubectl delete pod ${name} --force`);
    expect(outcome.output).toContain('API server');
    expect(podRuntime(findObject(outcome.state, { kind: 'Pod', namespace: 'san-pham', name })!)?.deleteAtTick).toBe(
      outcome.state.tick,
    );
  });

  it('tên không tồn tại trả NotFound đúng chữ của API server', () => {
    const outcome = run(cluster(), 'kubectl delete pod khong-co');
    expect(outcome.accepted).toBe(false);
    expect(outcome.output).toContain('Error from server (NotFound)');
  });

  it('xoá Deployment kéo theo ReplicaSet và Pod con', () => {
    const outcome = run(cluster(), 'kubectl delete deploy web');
    expect(outcome.accepted).toBe(true);
    expect(objectsOfKind(outcome.state, 'ReplicaSet', 'san-pham')).toHaveLength(0);
    expect(objectsOfKind(outcome.state, 'Pod', 'san-pham')).toHaveLength(0);
  });
});

describe('kubectl scale', () => {
  it('đổi replicas của Deployment', () => {
    const outcome = run(cluster(), 'kubectl scale deployment/web --replicas=4');
    expect(outcome.accepted).toBe(true);
    expect(
      findObject(outcome.state, { kind: 'Deployment', namespace: 'san-pham', name: 'web' })?.spec[
        'replicas'
      ],
    ).toBe(4);
  });

  /**
   * Đây là chỗ dạy, không phải chỗ báo lỗi: người mới học rất hay thử scale một
   * pod. Thông báo phải nói vì sao KHÔNG được, và đường đi đúng là gì.
   */
  it('từ chối scale một Pod và chỉ đường sang Deployment', () => {
    const state = cluster();
    const name = objectsOfKind(state, 'Pod', 'san-pham')[0]?.name ?? '';
    const outcome = run(state, `kubectl scale pod ${name} --replicas=3`);
    expect(outcome.accepted).toBe(false);
    expect(outcome.output).toContain('cannot scale resource');
    expect(outcome.output).toContain('Deployment');
  });

  it('`--replicas=0` là hợp lệ', () => {
    expect(run(cluster(), 'kubectl scale deploy web --replicas=0').accepted).toBe(true);
  });

  it('số âm bị từ chối kèm giải thích', () => {
    const outcome = run(cluster(), 'kubectl scale deploy web --replicas=-2');
    expect(outcome.accepted).toBe(false);
    expect(outcome.output).toContain('không âm');
  });
});

describe('kubectl rollout', () => {
  it('`status` báo đã xong khi đủ replica Ready', () => {
    expect(run(cluster(), 'kubectl rollout status deploy web').output).toContain(
      'successfully rolled out',
    );
  });

  it('`undo` khi mới có một revision thì nói rõ là không có chỗ để quay về', () => {
    const outcome = run(cluster(), 'kubectl rollout undo deploy web');
    expect(outcome.accepted).toBe(false);
    expect(outcome.output).toContain('rollout history');
  });

  /**
   * `restart` phải sinh ra một ReplicaSet MỚI, không phải xoá pod. Đó là khác
   * biệt giữa hiểu đúng và hiểu sai cơ chế, nên test khẳng định đúng thứ đó.
   */
  it('`restart` tạo ReplicaSet mới chứ không giết pod tại chỗ', () => {
    const state = cluster();
    const before = objectsOfKind(state, 'ReplicaSet', 'san-pham').map((rs) => rs.name);
    const outcome = run(state, 'kubectl rollout restart deploy web');
    expect(outcome.accepted).toBe(true);
    const after = objectsOfKind(advance(outcome.state, 4), 'ReplicaSet', 'san-pham').map((rs) => rs.name);
    expect(after.length).toBeGreaterThan(before.length);
    expect(after).toEqual(expect.arrayContaining(before));
  });

  /**
   * Vòng đầy đủ: đổi image (qua `restart` rồi undo không đủ — cần hai template
   * khác nhau thật), rồi `undo` phải quay về ĐÚNG ReplicaSet cũ chứ không đẻ ra
   * một cái thứ ba. Đây là cái bẫy `pod-template-hash` ghi ở `rolloutUndo`.
   */
  it('`undo` quay lại RS cũ, KHÔNG tạo thêm RS thứ ba', () => {
    const restarted = advance(run(cluster(), 'kubectl rollout restart deploy web').state, 20);
    const names = objectsOfKind(restarted, 'ReplicaSet', 'san-pham').map((rs) => rs.name);
    expect(names).toHaveLength(2);
    const undone = advance(run(restarted, 'kubectl rollout undo deploy web').state, 20);
    expect(objectsOfKind(undone, 'ReplicaSet', 'san-pham').map((rs) => rs.name).sort()).toEqual(
      [...names].sort(),
    );
  });

  it('`history` liệt kê revision kèm image', () => {
    const output = run(cluster(), 'kubectl rollout history deploy web').output;
    expect(output).toContain('REVISION');
    expect(output).toContain('nginx:1.27-alpine');
  });

  it('rollout trên StatefulSet nói rõ là chưa mô phỏng, không im lặng', () => {
    const outcome = run(cluster(), 'kubectl rollout undo statefulset/db');
    expect(outcome.accepted).toBe(false);
    expect(outcome.output).toContain('Deployment');
  });
});

describe('kubectl apply / edit — đường đi tương đương trong game', () => {
  it('`apply -f` chỉ sang bảng YAML thay vì chỉ báo lỗi', () => {
    const outcome = run(cluster(), 'kubectl apply -f web.yaml');
    expect(outcome.accepted).toBe(false);
    expect(outcome.output).toContain('YAML');
  });

  it('`edit` chỉ sang bảng YAML, và vẫn kiểm tài nguyên có tồn tại không', () => {
    expect(run(cluster(), 'kubectl edit deploy web').output).toContain('YAML');
    expect(run(cluster(), 'kubectl edit deploy khong-co').output).toContain('NotFound');
  });
});

describe('kubectl logs', () => {
  it('pod chưa từng restart: `--previous` nói rõ là chưa có lần chạy trước', () => {
    const state = cluster();
    const name = objectsOfKind(state, 'Pod', 'san-pham')[0]?.name ?? '';
    expect(run(state, `kubectl logs ${name} --previous`).output).toContain('chưa từng khởi động lại');
  });
});
