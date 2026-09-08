/**
 * Dữ liệu giả cho test của lane E.
 *
 * ⚠ CHỈ test import file này. Nó không nằm trong đường đi của bất kỳ component
 * nào, nên nó không vào bundle — nhưng đặt tên rõ để lần sau không ai tưởng đây
 * là một nguồn dữ liệu thật rồi import vào mã chạy.
 *
 * Dựng thủ công thay vì gọi engine của lane B: lane E phải test được ĐỘC LẬP với
 * tiến độ lane B, và một fixture bám vào engine sẽ đổi kết quả test mỗi lần lane
 * B đổi cân bằng game.
 */

import type { ClusterView, EventView, Level, NodeView, ObjectView } from '@devops-platform/games';

export function nodeView(name: string, over: Partial<NodeView> = {}): NodeView {
  return { name, ready: true, cpuUsed: 0.3, memoryUsed: 0.4, ...over };
}

export function podView(uid: string, name: string, over: Partial<ObjectView> = {}): ObjectView {
  return {
    uid,
    kind: 'Pod',
    name,
    namespace: 'default',
    phase: 'Running',
    nodeName: 'node-a',
    ownerUid: null,
    statusToken: 'success',
    ariaLabel: `pod ${name} đang chạy`,
    ...over,
  };
}

export function serviceView(uid: string, name: string, over: Partial<ObjectView> = {}): ObjectView {
  return {
    uid,
    kind: 'Service',
    name,
    namespace: 'default',
    nodeName: null,
    ownerUid: null,
    statusToken: 'status-progress',
    ariaLabel: `service ${name}`,
    ...over,
  };
}

export function eventView(tick: number, message: string, over: Partial<EventView> = {}): EventView {
  return { tick, level: 'info', message, ...over };
}

export function clusterView(over: Partial<ClusterView> = {}): ClusterView {
  return {
    tick: 0,
    nodes: [nodeView('node-a'), nodeView('node-b')],
    objects: [podView('u-1', 'web-1'), podView('u-2', 'web-2', { nodeName: 'node-b' })],
    edges: [],
    events: [],
    ...over,
  };
}

export function levelFixture(over: Partial<Level> = {}): Level {
  return {
    id: 'k8s-01-pod-dau-tien',
    chapter: 1,
    title: 'Pod đầu tiên',
    brief: 'Tạo một pod chạy nginx trong namespace `default`.',
    difficulty: 'basic',
    initialState: { nodes: [], namespaces: ['default'], resources: [] },
    allowedResources: ['Pod'],
    objectives: [
      { id: 'obj-pod', label: 'Có một pod tên web đang chạy', check: 'pod-running', required: true },
      { id: 'obj-bonus', label: 'Không dùng gợi ý nào', check: 'no-hints', required: false },
    ],
    hints: ['Dùng `kubectl run`.', 'Cú pháp: `kubectl run web --image=nginx`.'],
    parMoves: 2,
    teaches: ['pod'],
    teaching: {
      primer: 'Pod là đơn vị chạy nhỏ nhất của Kubernetes: một hoặc vài container dùng chung mạng và ổ đĩa.',
      cheatsheet: [{ command: 'kubectl run web --image=nginx', explain: 'Tạo nhanh một pod đơn lẻ để thử.' }],
      takeaways: ['Pod là đơn vị lịch trình, không phải container.'],
    },
    ...over,
  };
}
