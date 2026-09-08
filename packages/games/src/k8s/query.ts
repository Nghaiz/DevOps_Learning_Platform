/**
 * Truy vấn dẫn xuất trên `ClusterState`. Không hàm nào ở đây sửa trạng thái.
 *
 * ⛔ Mọi thứ tính được từ trạng thái đều tính TẠI ĐÂY, không lưu sẵn trong
 * `model.ts`. `readyReplicas` của một Deployment là số pod con đang Ready — lưu
 * nó là một field suy ra được, và nó sẽ nói dối đúng vào lúc một pod chết giữa
 * hai lần cập nhật. Quy ước "No Derived Fields" của repo áp cho trạng thái trong
 * bộ nhớ y như cho một bảng Postgres.
 */

import type { ClusterState, K8sObject, NodeState } from './model.ts';
import { findByUid, isDoomed, podRuntime } from './model.ts';
import type { ResourceKind } from './contract.ts';
import { asRecord, asStringMap, readContainers, readSelector } from './resources.ts';

// ── Label selector ──────────────────────────────────────────────────────────

/**
 * Phép khớp label của Kubernetes: MỌI cặp trong `selector` phải có mặt và bằng
 * nhau trong `labels`. Label thừa trong `labels` không sao.
 *
 * ⚠ Selector RỖNG khớp MỌI THỨ ở hàm này, và đó là đúng luật K8s — nhưng hai chỗ
 * dùng lại cần hai nghĩa trái ngược, nên bên gọi PHẢI tự xử lý trường hợp rỗng:
 *
 * - `NetworkPolicy.podSelector: {}` ⇒ áp cho **mọi pod** trong namespace. Đây là
 *   cách viết một policy default-deny, và là bẫy kinh điển nhất của K8s.
 * - `Service.selector` vắng/rỗng ⇒ Service **không chọn pod nào**; endpoint được
 *   quản lý tay. Dùng `matchLabels` trần ở đây sẽ cho một Service không selector
 *   hút hết pod trong namespace — sai hoàn toàn, và tệ hơn là nó làm level dạy
 *   "endpoint rỗng" trông như đã sửa xong.
 *
 * `serviceEndpoints` bên dưới đã xử lý đúng vế thứ hai.
 */
export function matchLabels(
  labels: Readonly<Record<string, string>>,
  selector: Readonly<Record<string, string>>,
): boolean {
  for (const [key, value] of Object.entries(selector)) {
    if (labels[key] !== value) {
      return false;
    }
  }
  return true;
}

// ── Lọc object ──────────────────────────────────────────────────────────────

export function objectsOfKind(
  state: ClusterState,
  kind: ResourceKind,
  namespace?: string,
): readonly K8sObject[] {
  return state.objects.filter(
    (object) => object.kind === kind && (namespace === undefined || object.namespace === namespace),
  );
}

/** Pod trong namespace, đã BỎ pod đang chờ hết grace — chúng không còn phục vụ ai. */
export function livePods(state: ClusterState, namespace?: string): readonly K8sObject[] {
  return objectsOfKind(state, 'Pod', namespace).filter((object) => {
    const pod = podRuntime(object);
    return pod !== null && !isDoomed(pod);
  });
}

export function podsMatching(
  state: ClusterState,
  namespace: string,
  selector: Readonly<Record<string, string>>,
): readonly K8sObject[] {
  return livePods(state, namespace).filter((pod) => matchLabels(pod.labels, selector));
}

export function childrenOf(state: ClusterState, ownerUid: string): readonly K8sObject[] {
  return state.objects.filter((object) => object.ownerUid === ownerUid);
}

/**
 * Pod thuộc một workload — kể cả qua MỘT tầng trung gian.
 *
 * Deployment không sở hữu Pod trực tiếp: Deployment → ReplicaSet → Pod. Đi thẳng
 * `childrenOf(deployment)` sẽ trả về ReplicaSet và đếm ra 0 pod, nên
 * `deployment-ready` sẽ không bao giờ đạt. Đây đúng là cấu trúc mà level 06–11
 * dạy, nên mô phỏng phải giữ nó thay vì cho Deployment đẻ pod thẳng.
 */
export function podsOwnedBy(state: ClusterState, ownerUid: string): readonly K8sObject[] {
  const direct = childrenOf(state, ownerUid);
  const pods = direct.filter((object) => object.kind === 'Pod');
  for (const child of direct) {
    if (child.kind !== 'Pod') {
      pods.push(...childrenOf(state, child.uid).filter((object) => object.kind === 'Pod'));
    }
  }
  return pods.filter((pod) => {
    const runtime = podRuntime(pod);
    return runtime !== null && !isDoomed(runtime);
  });
}

/** Pod đang Running VÀ đã Ready. Hai điều kiện, không phải một — xem `model.ts`. */
export function readyPods(pods: readonly K8sObject[]): readonly K8sObject[] {
  return pods.filter((object) => {
    const pod = podRuntime(object);
    return pod !== null && pod.phase === 'Running' && pod.ready;
  });
}

// ── Endpoint của Service ────────────────────────────────────────────────────

/**
 * Endpoint của một Service = pod khớp selector **VÀ đang Ready**.
 *
 * ⚠ Điều kiện "Ready" mới là chỗ dạy được. Hai sự cố cho ra CÙNG một triệu chứng
 * `kubectl get endpoints <svc>` rỗng:
 *
 * - `service-selector-lech-label` — selector không khớp label nào. `get pods
 *   --show-labels` phơi ra ngay.
 * - `readiness-probe-sai-cong` — label khớp hoàn hảo, pod `Running`, nhưng cột
 *   READY là `0/1` nên kubelet gỡ nó khỏi endpoint.
 *
 * Người chơi phải phân biệt hai cái đó bằng điều tra, và mô phỏng chỉ ép được
 * điều đó nếu endpoint thật sự lọc theo `ready`. Bỏ điều kiện `ready` là xoá luôn
 * một cặp bài học.
 */
export function serviceEndpoints(state: ClusterState, service: K8sObject): readonly K8sObject[] {
  const selector = readSelector(service.spec);
  // Service KHÔNG có selector không chọn pod nào — nó không phải "chọn tất cả".
  if (Object.keys(selector).length === 0) {
    return [];
  }
  return readyPods(podsMatching(state, service.namespace, selector));
}

/** Cổng đích thật sự của Service. `targetPort` vắng thì bằng `port`, đúng luật K8s. */
export function serviceTargetPorts(service: K8sObject): readonly number[] {
  const ports: number[] = [];
  const raw = service.spec['ports'];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const record = asRecord(entry);
    if (record === null) {
      continue;
    }
    const port = typeof record['port'] === 'number' ? record['port'] : null;
    const target = typeof record['targetPort'] === 'number' ? record['targetPort'] : port;
    if (target !== null) {
      ports.push(target);
    }
  }
  return ports;
}

/** Cổng mà container của pod thật sự mở. */
export function podContainerPorts(pod: K8sObject, tickMs: number): readonly number[] {
  return readContainers(pod.spec, tickMs).flatMap((container) => container.ports);
}

// ── Kế toán tài nguyên ──────────────────────────────────────────────────────

export interface ResourceUsage {
  /** milli-core. */
  readonly cpu: number;
  /** MiB. */
  readonly memory: number;
}

/**
 * Tổng `requests` của pod. `null` (không đặt) tính là 0 cho việc xếp lịch — đúng
 * như Kubernetes: pod BestEffort xếp được vào bất cứ đâu.
 *
 * ⚠ Nhưng "0 để xếp lịch" KHÔNG có nghĩa "0 cho HPA". HPA đọc `requests` để tính
 * phần trăm CPU, và không có requests thì nó mù — đó là sự cố
 * `hpa-khong-co-metrics`, và nó cần phân biệt được `null` với `0`. Vì thế
 * `readContainers` giữ `null`, và chỉ hàm này mới quy về 0.
 */
export function podRequests(pod: K8sObject, tickMs: number): ResourceUsage {
  let cpu = 0;
  let memory = 0;
  for (const container of readContainers(pod.spec, tickMs)) {
    cpu += container.requestsCpu ?? 0;
    memory += container.requestsMemory ?? 0;
  }
  return { cpu, memory };
}

export function nodeUsage(state: ClusterState, nodeName: string, tickMs: number): ResourceUsage {
  let cpu = 0;
  let memory = 0;
  for (const object of livePods(state)) {
    const pod = podRuntime(object);
    if (pod === null || pod.nodeName !== nodeName) {
      continue;
    }
    if (pod.phase === 'Succeeded' || pod.phase === 'Failed') {
      // Pod đã kết thúc vẫn có bản ghi nhưng KHÔNG còn giữ tài nguyên. Tính nó
      // vào là lý do một cụm "hết chỗ" trong khi `kubectl top node` nói còn dư.
      continue;
    }
    const requests = podRequests(object, tickMs);
    cpu += requests.cpu;
    memory += requests.memory;
  }
  return { cpu, memory };
}

export function nodeFree(state: ClusterState, node: NodeState, tickMs: number): ResourceUsage {
  const used = nodeUsage(state, node.name, tickMs);
  return { cpu: node.cpu - used.cpu, memory: node.memory - used.memory };
}

/** Đếm dùng cho ResourceQuota. `pods` đếm cả pod Pending — quota chặn ở API server. */
export function namespaceUsage(
  state: ClusterState,
  namespace: string,
  tickMs: number,
): ResourceUsage & { readonly pods: number } {
  let cpu = 0;
  let memory = 0;
  let pods = 0;
  for (const object of livePods(state, namespace)) {
    const pod = podRuntime(object);
    if (pod === null || pod.phase === 'Succeeded' || pod.phase === 'Failed') {
      continue;
    }
    pods += 1;
    const requests = podRequests(object, tickMs);
    cpu += requests.cpu;
    memory += requests.memory;
  }
  return { cpu, memory, pods };
}

/** Chủ sở hữu trực tiếp — `null` khi pod là pod trần do người chơi tạo. */
export function ownerOf(state: ClusterState, object: K8sObject): K8sObject | null {
  return object.ownerUid === null ? null : findByUid(state, object.ownerUid);
}

/** Template pod của một workload — dạng PHẲNG theo quy ước lane C, không lồng `metadata`. */
export function workloadTemplate(object: K8sObject): Readonly<Record<string, unknown>> | null {
  return asRecord(object.spec['template']);
}

export function templateLabels(object: K8sObject): Readonly<Record<string, string>> {
  const template = workloadTemplate(object);
  return template === null ? {} : asStringMap(template['labels']);
}
