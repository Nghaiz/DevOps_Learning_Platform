import { describe, expect, it } from 'vitest';

import type { ClusterSpec, Level } from './contract.ts';
import { createCluster } from './model.ts';
import { describeObject, formatCpuMilli, formatMemoryMi } from './describe.ts';
import { runCommand } from './kubectl.ts';
import { createSession } from './session.ts';

const SPEC: ClusterSpec = {
  nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
  namespaces: ['hoc-tap'],
  resources: [
    {
      kind: 'Pod',
      name: 'web',
      namespace: 'hoc-tap',
      spec: {
        phase: 'Running',
        labels: { app: 'web' },
        containers: [
          {
            name: 'chinh',
            image: 'nginx:1.27',
            resources: { requests: { cpu: '250m', memory: '128Mi' } },
          },
        ],
      },
    },
    { kind: 'Service', name: 'web', namespace: 'hoc-tap', spec: { selector: { app: 'web' } } },
    { kind: 'ConfigMap', name: 'cau-hinh', namespace: 'hoc-tap', spec: { data: { a: 'b' } } },
  ],
};

const LEVEL: Level = {
  id: 'test-describe',
  chapter: 1,
  title: 'Test',
  mission: 'Đọc mô tả của một pod.',
  brief: '',
  difficulty: 'basic',
  initialState: SPEC,
  allowedResources: ['Pod'],
  objectives: [{ id: 'o1', label: 'x', check: 'pod-running', required: true }],
  hints: [],
  parMoves: 1,
  teaches: [],
  teaching: { primer: '', cheatsheet: [], takeaways: [] },
};

describe('định dạng đơn vị', () => {
  it('giữ hậu tố m kể cả khi chia hết cho 1000', () => {
    // Engine đã phân tích chuỗi gốc thành số nên KHÔNG biết người chơi viết `1`
    // hay `1000m`. `1` là một chuỗi họ có thể chưa từng gõ; `1000m` luôn trung
    // thực về con số engine đọc được.
    expect(formatCpuMilli(250)).toBe('250m');
    expect(formatCpuMilli(1000)).toBe('1000m');
    expect(formatMemoryMi(128)).toBe('128Mi');
  });
});

describe('describeObject — phân nhánh theo kind', () => {
  const state = createCluster(SPEC, 1);
  const pod = state.objects.find((item) => item.kind === 'Pod')!;
  const service = state.objects.find((item) => item.kind === 'Service')!;
  const configMap = state.objects.find((item) => item.kind === 'ConfigMap')!;

  it('pod ra khối chẩn đoán, không phải JSON thô của spec', () => {
    const text = describeObject(state, pod);
    expect(text).toContain('Restart Count:');
    expect(text).toContain('Requests:     cpu: 250m, memory: 128Mi');
    expect(text).toContain('Events:');
    // Đối chứng âm: rơi nhầm về khối generic thì spec bị in ra dạng JSON.
    expect(text).not.toContain('"containers"');
  });

  it('service ra selector và endpoint', () => {
    const text = describeObject(state, service);
    expect(text).toContain('Selector:     app=web');
    expect(text).toContain('Endpoints:');
  });

  it('loại chưa có khối riêng rơi về generic — và nói rõ đó là generic', () => {
    expect(describeObject(state, configMap)).toContain('Kind:         ConfigMap');
  });
});

/**
 * Đây là phép đo TRUNG TÂM của việc gộp bộ sinh mô tả về một chỗ.
 *
 * Trước khi gộp, `describePod` nằm private trong `kubectl.ts` và giao diện không
 * với tới được — nên đường sửa sai hiển nhiên là viết một bộ định dạng thứ hai
 * cho tab Mô tả. Hai bộ sẽ lệch nhau, và triệu chứng là người chơi gõ
 * `kubectl describe` trong terminal rồi mở tab Mô tả của CÙNG pod đó và thấy hai
 * nội dung khác nhau. Không có gì đỏ ở đâu cả.
 *
 * Phép so dưới đây là thứ duy nhất bắt được chuyện đó, và nó chỉ có nghĩa vì hai
 * đường đi thật sự khác nhau: một đường qua bộ phân tích lệnh, một đường tra
 * thẳng theo uid.
 */
describe('session.describe(uid) và thanh lệnh dùng CHUNG một bộ sinh', () => {
  it('hai đường vào, một nội dung', () => {
    const session = createSession({ level: LEVEL, seed: 1, autoTick: false });
    try {
      const pod = session.getView().objects.find((item) => item.kind === 'Pod');
      expect(pod).toBeDefined();

      const viaSession = session.describe(pod!.uid);
      const viaTerminal = runCommand(session.getState(), 'kubectl describe pod web', 'hoc-tap').output;

      expect(viaSession).not.toBeNull();
      expect(viaSession).toBe(viaTerminal);
    } finally {
      session.dispose();
    }
  });

  it('uid không có thật ⇒ null, để giao diện ẨN tab chứ không hiện tab rỗng', () => {
    const session = createSession({ level: LEVEL, seed: 1, autoTick: false });
    try {
      expect(session.describe('khong-ton-tai')).toBeNull();
    } finally {
      session.dispose();
    }
  });
});
