/**
 * `ClusterState` (lúc chạy) → `ClusterView` (phẳng, sẵn sàng vẽ).
 *
 * Đây là CỬA SỔ DUY NHẤT của lane D/E vào trạng thái. Lý do có nó thay vì cho
 * renderer đọc thẳng: trạng thái lúc chạy mang con trỏ RNG, hàng đợi sự kiện,
 * bộ đếm backoff — renderer không cần và không được biết, và lane B đổi cấu trúc
 * bên trong tuỳ ý mà lane E không phải sửa một dòng.
 *
 * ## `statusToken` là TÊN NGỮ NGHĨA, không phải mã màu
 *
 * Renderer tra token sang `THREE.Color` bằng `getComputedStyle` (§4.5). Trả về
 * `0xff0000` ở đây sẽ ghim màu vào logic game, phá SSOT màu ở `globals.css`, và
 * làm khung 3D không đổi theo theme sáng/tối.
 */

import type {
  ClusterView,
  EdgeView,
  EventView,
  NodeView,
  ObjectView,
  PodReason,
} from './contract.ts';
import type { ClusterState, K8sObject } from './model.ts';
import { podRuntime } from './model.ts';
import {
  livePods,
  matchLabels,
  nodeUsage,
  objectsOfKind,
  podsOwnedBy,
  readyPods,
  serviceEndpoints,
} from './query.ts';
import { KINDS, asNumber, asRecord, asString, readSelector } from './resources.ts';
import { TICK_MS } from './tick.ts';

/** Lý do khiến người chơi phải SỬA gì đó, không phải chỉ chờ. */
const FATAL_REASONS: ReadonlySet<PodReason> = new Set<PodReason>([
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'OOMKilled',
  'CreateContainerConfigError',
  'Evicted',
]);

/** Lý do "đang chờ một điều kiện bên ngoài" — vàng chứ không đỏ. */
const WAITING_REASONS: ReadonlySet<PodReason> = new Set<PodReason>([
  'Unschedulable',
  'NodeAffinityConflict',
  'PVCPending',
  'ReadinessProbeFailed',
  'LivenessProbeFailed',
]);

function podToken(object: K8sObject): ObjectView['statusToken'] {
  const pod = podRuntime(object);
  if (pod === null) {
    return 'status-locked';
  }
  if (pod.phase === 'Terminating') {
    return 'warning';
  }
  if (pod.phase === 'Succeeded') {
    return 'success';
  }
  if (pod.phase === 'Failed') {
    return 'destructive';
  }
  if (pod.reason !== null && FATAL_REASONS.has(pod.reason)) {
    return 'destructive';
  }
  if (pod.reason !== null && WAITING_REASONS.has(pod.reason)) {
    return 'warning';
  }
  // ⚠ Running-nhưng-chưa-Ready KHÔNG phải `success`. Đây là chỗ cả cặp bài học
  // "Service rỗng endpoint" nằm: pod trông khoẻ ở mọi cột trừ READY, và nó không
  // nhận traffic. Tô xanh nó là xoá đúng manh mối đó khỏi màn hình.
  if (pod.phase === 'Running') {
    return pod.ready ? 'success' : 'status-progress';
  }
  return 'status-progress';
}

function workloadToken(state: ClusterState, object: K8sObject): ObjectView['statusToken'] {
  const desired = asNumber(object.spec['replicas']) ?? 1;
  const ready = readyPods(podsOwnedBy(state, object.uid)).length;
  if (desired === 0) {
    return 'status-locked';
  }
  if (ready >= desired) {
    return 'success';
  }
  return ready === 0 ? 'destructive' : 'warning';
}

function statusToken(state: ClusterState, object: K8sObject): ObjectView['statusToken'] {
  switch (object.kind) {
    case 'Pod':
      return podToken(object);
    case 'Deployment':
    case 'ReplicaSet':
    case 'StatefulSet':
    case 'DaemonSet':
      return workloadToken(state, object);
    case 'Service':
      return serviceEndpoints(state, object).length > 0 ? 'success' : 'warning';
    case 'PersistentVolumeClaim':
      return object.runtime.kind === 'pvc' && object.runtime.boundVolume !== null
        ? 'success'
        : 'warning';
    case 'Job':
      return object.runtime.kind === 'job' && object.runtime.succeeded > 0 ? 'success' : 'status-progress';
    default:
      return 'success';
  }
}

/**
 * Nhãn cho trình đọc màn hình. Tiếng Việt, một dòng, đọc lên nghe được thành câu.
 *
 * Thuật ngữ hạ tầng giữ tiếng Anh (pod, node, namespace, Running,
 * CrashLoopBackOff) — dịch chúng ra sẽ dạy một từ vựng không tồn tại ở bất kỳ
 * cụm nào, và người học sẽ không tra cứu được khi gặp lại ngoài đời.
 *
 * ⚠ Nhãn này là giao diện DUY NHẤT của người dùng trình đọc màn hình với khung
 * 3D — `<canvas>` mang `aria-hidden` và không nói được gì. Nên nó phải chứa mọi
 * thứ cần để chơi: trạng thái, số lần restart, node đang chạy.
 */
function ariaLabelFor(state: ClusterState, object: K8sObject): string {
  const where = object.namespace === '' ? 'phạm vi cluster' : `namespace ${object.namespace}`;
  const pod = podRuntime(object);
  if (pod !== null) {
    const parts = [`pod ${object.name} trong ${where}`];
    parts.push(pod.phase === 'Terminating' ? 'đang bị xoá' : `trạng thái ${pod.reason ?? pod.phase}`);
    if (pod.phase === 'Running') {
      parts.push(pod.ready ? 'đã sẵn sàng nhận traffic' : 'chưa sẵn sàng nhận traffic');
    }
    if (pod.restarts > 0) {
      parts.push(`đã khởi động lại ${pod.restarts} lần`);
    }
    parts.push(pod.nodeName === null ? 'chưa được xếp lên node nào' : `trên node ${pod.nodeName}`);
    return `${parts.join(', ')}.`;
  }
  if (object.kind === 'Service') {
    const count = serviceEndpoints(state, object).length;
    return `service ${object.name} trong ${where}, ${
      count === 0 ? 'không có endpoint nào' : `có ${count} endpoint`
    }.`;
  }
  const desired = asNumber(object.spec['replicas']);
  if (desired !== null) {
    const ready = readyPods(podsOwnedBy(state, object.uid)).length;
    return `${object.kind} ${object.name} trong ${where}, ${ready} trên ${desired} pod đã sẵn sàng.`;
  }
  if (object.kind === 'PersistentVolumeClaim') {
    const bound = object.runtime.kind === 'pvc' ? object.runtime.boundVolume : null;
    return `persistent volume claim ${object.name} trong ${where}, ${
      bound === null ? 'chưa bind được vào volume nào' : `đã bind vào ${bound}`
    }.`;
  }
  return `${object.kind} ${object.name} trong ${where}.`;
}

function toObjectView(state: ClusterState, object: K8sObject): ObjectView {
  const pod = podRuntime(object);
  return {
    uid: object.uid,
    kind: object.kind,
    name: object.name,
    namespace: object.namespace,
    // Spread có điều kiện chứ không gán `undefined`: `exactOptionalPropertyTypes`
    // của repo phân biệt "field vắng" với "field bằng undefined", và bốn field
    // dưới đây CHỈ có nghĩa với Pod.
    ...(pod === null ? {} : { phase: pod.phase, ready: pod.ready, restartCount: pod.restarts }),
    ...(pod?.reason == null ? {} : { reason: pod.reason }),
    nodeName: pod?.nodeName ?? null,
    ownerUid: object.ownerUid,
    statusToken: statusToken(state, object),
    ariaLabel: ariaLabelFor(state, object),
  };
}

function toNodeViews(state: ClusterState): readonly NodeView[] {
  return state.nodes.map((node) => {
    const used = nodeUsage(state, node.name, TICK_MS);
    return {
      name: node.name,
      ready: node.ready,
      // Kẹp về [0,1]: một node bị đặt quá tải (level gieo sẵn `node-het-cpu`) sẽ
      // cho tỉ lệ > 1, và một thanh tiến độ vẽ 130% trông như lỗi giao diện.
      cpuUsed: node.cpu <= 0 ? 0 : Math.min(1, used.cpu / node.cpu),
      memoryUsed: node.memory <= 0 ? 0 : Math.min(1, used.memory / node.memory),
    };
  });
}

/**
 * Cạnh vẽ được.
 *
 * ⚠ Giới hạn CÓ Ý THỨC: khi selector của một Service không khớp pod nào, KHÔNG
 * có cạnh nào được vẽ — vì không có đầu kia để nối tới. Người chơi nhận biết
 * tình huống đó qua `statusToken: 'warning'` trên chính Service và qua
 * `kubectl get endpoints`, chứ không qua một nét đứt. Vẽ một cạnh đứt tới "pod
 * đáng lẽ phải khớp" đòi đoán xem người chơi ĐỊNH nhắm tới pod nào — và đoán sai
 * sẽ chỉ sai hướng người chơi.
 *
 * Cạnh `healthy: false` vì thế chỉ xuất hiện ở đúng một tình huống, và đó là
 * tình huống đáng vẽ nhất: pod KHỚP selector nhưng chưa Ready nên bị gỡ khỏi
 * endpoint. Nét đứt ở đó nói đúng thứ đang xảy ra.
 */
function toEdges(state: ClusterState): readonly EdgeView[] {
  const edges: EdgeView[] = [];
  const byName = new Map(
    state.objects.map((object) => [`${object.kind}/${object.namespace}/${object.name}`, object]),
  );

  for (const object of state.objects) {
    if (object.ownerUid !== null) {
      edges.push({ fromUid: object.ownerUid, toUid: object.uid, kind: 'owns', healthy: true });
    }
  }

  for (const service of objectsOfKind(state, 'Service')) {
    const selector = readSelector(service.spec);
    if (Object.keys(selector).length === 0) {
      continue;
    }
    const ready = new Set(serviceEndpoints(state, service).map((pod) => pod.uid));
    for (const pod of livePods(state, service.namespace)) {
      if (matchLabels(pod.labels, selector)) {
        edges.push({
          fromUid: service.uid,
          toUid: pod.uid,
          kind: 'selects',
          healthy: ready.has(pod.uid),
        });
      }
    }
  }

  for (const pod of livePods(state)) {
    for (const entry of Array.isArray(pod.spec['volumes']) ? pod.spec['volumes'] : []) {
      const volume = asRecord(entry);
      const claim = asString(asRecord(volume?.['persistentVolumeClaim'])?.['claimName']);
      const configMap = asString(asRecord(volume?.['configMap'])?.['name']);
      const secret = asString(asRecord(volume?.['secret'])?.['secretName']);
      const target =
        claim !== null
          ? byName.get(`PersistentVolumeClaim/${pod.namespace}/${claim}`)
          : configMap !== null
            ? byName.get(`ConfigMap/${pod.namespace}/${configMap}`)
            : secret !== null
              ? byName.get(`Secret/${pod.namespace}/${secret}`)
              : undefined;
      if (target !== undefined) {
        edges.push({
          fromUid: pod.uid,
          toUid: target.uid,
          kind: 'mounts',
          healthy:
            target.runtime.kind !== 'pvc' || target.runtime.boundVolume !== null,
        });
      }
    }
  }

  for (const ingress of objectsOfKind(state, 'Ingress')) {
    for (const rule of Array.isArray(ingress.spec['rules']) ? ingress.spec['rules'] : []) {
      const paths = asRecord(rule)?.['paths'];
      for (const path of Array.isArray(paths) ? paths : []) {
        const serviceName = asString(asRecord(path)?.['serviceName']);
        const service =
          serviceName === null ? undefined : byName.get(`Service/${ingress.namespace}/${serviceName}`);
        if (service !== undefined) {
          edges.push({
            fromUid: ingress.uid,
            toUid: service.uid,
            kind: 'routes',
            healthy: serviceEndpoints(state, service).length > 0,
          });
        }
      }
    }
  }
  return edges;
}

/** Số sự kiện gần nhất đẩy sang giao diện. Vùng `aria-live` không đọc nổi hơn thế. */
const VIEW_EVENT_LIMIT = 40;

function toEvents(state: ClusterState): readonly EventView[] {
  return state.events.slice(-VIEW_EVENT_LIMIT).map((event) => ({
    tick: event.tick,
    level: event.level,
    message: event.message,
  }));
}

/**
 * ⚠ Hàm này dựng một object MỚI mỗi lần gọi. `K8sSession.getView()` PHẢI nhớ kết
 * quả và chỉ gọi lại khi trạng thái thật sự đổi — `useSyncExternalStore` của
 * React so snapshot bằng `Object.is`, nên trả object mới mỗi lần sẽ render vô
 * hạn với một stack trace vô dụng. Việc nhớ nằm ở `session.ts`, không ở đây:
 * một hàm chiếu thuần thì test được, còn một hàm tự giữ cache thì không.
 */
export function toView(state: ClusterState): ClusterView {
  // Tài nguyên phạm vi cluster mà giao diện không vẽ như một "object" (Node đã
  // có mục riêng, Namespace là cái hộp chứ không phải thứ nằm trong hộp).
  const drawable = state.objects.filter(
    (object) => object.kind !== 'Node' && object.kind !== 'Namespace',
  );
  return {
    tick: state.tick,
    nodes: toNodeViews(state),
    objects: drawable.map((object) => toObjectView(state, object)),
    edges: toEdges(state),
    events: toEvents(state),
  };
}

/** Export để test khẳng định danh sách loại vẽ được khớp bảng `KINDS`. */
export const NON_DRAWABLE_KINDS: readonly string[] = ['Node', 'Namespace'].filter(
  (kind) => kind in KINDS,
);
