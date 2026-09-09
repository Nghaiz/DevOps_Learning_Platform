/**
 * Dữ liệu giả cho test của các module thuần trong `shared/`.
 *
 * ⚠ CHỈ test import file này. Nó không nằm trong đường đi của bất kỳ component
 * nào, nên nó không vào bundle — nhưng đặt tên rõ để lần sau không ai tưởng đây
 * là một nguồn dữ liệu thật rồi import vào mã chạy.
 *
 * Dựng thủ công thay vì gọi engine: các module ở đây phải test được ĐỘC LẬP với
 * engine, và một fixture bám vào engine sẽ đổi kết quả test mỗi lần cân bằng
 * game đổi.
 *
 * ⚠ Fixture này phải theo kịp `ObjectView` / `EventView` / `ClusterView` /
 * `Level` trong `contract.ts`. Khi engine thêm trường BẮT BUỘC, chỗ này đỏ —
 * và đỏ ở đây là tín hiệu đúng, không phải phiền toái: nó buộc người thêm
 * trường phải quyết định giá trị nào là hợp lý cho một vật liệu test, thay vì
 * để `undefined` lọt vào rồi một test khác nhận giá trị sai mà vẫn xanh.
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
    labels: {},
    /*
     * `null` chứ không phải `{ cpu: '0m', memory: '0Mi' }`, và khác biệt đó có
     * nghĩa: `null` = chưa khai tài nguyên, `0m` = đã khai và khai bằng không.
     * Trộn hai thứ làm mất đúng phân biệt mà sự cố "hpa không có metrics" dựa
     * vào để phát hiện.
     */
    requests: null,
    limits: null,
    createdTick: 0,
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
    labels: {},
    requests: null,
    limits: null,
    createdTick: 0,
    ...over,
  };
}

export function eventView(tick: number, message: string, over: Partial<EventView> = {}): EventView {
  /* `involvedUid: null` = sự kiện ở phạm vi cụm, không thuộc object nào. */
  return { tick, level: 'info', message, involvedUid: null, ...over };
}

export function clusterView(over: Partial<ClusterView> = {}): ClusterView {
  return {
    tick: 0,
    nodes: [nodeView('node-a'), nodeView('node-b')],
    objects: [podView('u-1', 'web-1'), podView('u-2', 'web-2', { nodeName: 'node-b' })],
    edges: [],
    events: [],
    incidents: [],
    ...over,
  };
}

export function levelFixture(over: Partial<Level> = {}): Level {
  return {
    id: 'k8s-01-pod-dau-tien',
    chapter: 1,
    title: 'Pod đầu tiên',
    mission: 'Tạo một pod chạy nginx.',
    brief: 'Tạo một pod chạy nginx trong namespace `default`.',
    difficulty: 'basic',
    initialState: { nodes: [], namespaces: ['default'], resources: [] },
    allowedResources: ['Pod'],
    objectives: [
      {
        id: 'obj-pod',
        label: 'Có một pod tên web đang chạy',
        check: 'pod-running',
        required: true,
      },
      { id: 'obj-bonus', label: 'Không dùng gợi ý nào', check: 'no-hints', required: false },
    ],
    hints: ['Dùng `kubectl run`.', 'Cú pháp: `kubectl run web --image=nginx`.'],
    parMoves: 2,
    teaches: ['pod'],
    teaching: {
      primer:
        'Pod là đơn vị chạy nhỏ nhất của Kubernetes: một hoặc vài container dùng chung mạng và ổ đĩa.',
      cheatsheet: [
        { command: 'kubectl run web --image=nginx', explain: 'Tạo nhanh một pod đơn lẻ để thử.' },
      ],
      takeaways: ['Pod là đơn vị lịch trình, không phải container.'],
    },
    ...over,
  };
}
