/**
 * Xếp lịch pod lên node.
 *
 * ## Thứ tự kiểm là NỘI DUNG DẠY, không phải chi tiết hiện thực
 *
 * `kubectl describe pod` của một pod `Pending` in ra lý do TỪNG node từ chối —
 * và đó là thứ nhiều người dùng Kubernetes nhiều năm vẫn không biết là có. Mô
 * phỏng vì thế giữ lại lý do của từng node thay vì chỉ nói "không xếp được", và
 * kiểm theo đúng thứ tự scheduler thật:
 *
 * 1. `nodeSelector` / affinity — lọc thô trước
 * 2. taint ↔ toleration
 * 3. node có Ready và không bị cordon
 * 4. còn đủ CPU/RAM
 * 5. PVC ReadWriteOnce đã bị node khác giữ
 *
 * Đảo thứ tự này sẽ báo "hết tài nguyên" cho một node vốn đã bị loại từ bước
 * `nodeSelector` — và người chơi sẽ đi thêm node cho một cụm không thiếu node.
 */

import type { PodReason } from './contract.ts';
import type { ClusterState, K8sObject, NodeState } from './model.ts';
import { podRuntime } from './model.ts';
import { livePods, nodeFree, podRequests } from './query.ts';
import { asRecord, asStringArray, asStringMap, readContainers } from './resources.ts';

export interface NodeRejection {
  readonly nodeName: string;
  /** Tiếng Việt — đi thẳng vào Events của `describe`. */
  readonly reason: string;
}

export interface SchedulingResult {
  readonly nodeName: string | null;
  readonly reason: PodReason | null;
  readonly rejections: readonly NodeRejection[];
}

/** Taint dạng `khoa=gia-tri:NoSchedule`. Toleration của pod là chuỗi `khoa` hoặc cả cụm. */
function tolerates(tolerations: readonly string[], taint: string): boolean {
  const key = taint.split('=')[0]?.split(':')[0] ?? taint;
  return tolerations.some((toleration) => toleration === taint || toleration === key);
}

/**
 * PVC `ReadWriteOnce` chỉ gắn được vào pod trên MỘT node.
 *
 * Đây là sự cố `pvc-readwriteonce-hai-node`, và nó là thứ duy nhất trong bộ khiến
 * một Deployment 2 replica kẹt đúng một pod ở `Pending` trong khi pod kia chạy
 * bình thường — triệu chứng trông như "hết tài nguyên" nhưng `describe node` lại
 * nói còn dư.
 */
function rwoConflictNode(state: ClusterState, pod: K8sObject): string | null {
  const claims = new Set<string>();
  for (const entry of Array.isArray(pod.spec['volumes']) ? pod.spec['volumes'] : []) {
    const claim = asRecord(asRecord(entry)?.['persistentVolumeClaim'])?.['claimName'];
    if (typeof claim === 'string') {
      claims.add(claim);
    }
  }
  if (claims.size === 0) {
    return null;
  }
  const rwoClaims = new Set<string>();
  for (const pvc of state.objects) {
    if (pvc.kind !== 'PersistentVolumeClaim' || pvc.namespace !== pod.namespace) {
      continue;
    }
    if (claims.has(pvc.name) && asStringArray(pvc.spec['accessModes']).includes('ReadWriteOnce')) {
      rwoClaims.add(pvc.name);
    }
  }
  if (rwoClaims.size === 0) {
    return null;
  }
  for (const other of livePods(state, pod.namespace)) {
    if (other.uid === pod.uid) {
      continue;
    }
    const runtime = podRuntime(other);
    if (runtime === null || runtime.nodeName === null) {
      continue;
    }
    for (const entry of Array.isArray(other.spec['volumes']) ? other.spec['volumes'] : []) {
      const claim = asRecord(asRecord(entry)?.['persistentVolumeClaim'])?.['claimName'];
      if (typeof claim === 'string' && rwoClaims.has(claim)) {
        return runtime.nodeName;
      }
    }
  }
  return null;
}

function rejectionFor(
  state: ClusterState,
  pod: K8sObject,
  node: NodeState,
  tickMs: number,
  rwoHolder: string | null,
): string | null {
  const selector = asStringMap(pod.spec['nodeSelector']);
  for (const [key, value] of Object.entries(selector)) {
    if (node.labels[key] !== value) {
      return `không khớp nodeSelector ${key}=${value}`;
    }
  }
  const tolerations = asStringArray(pod.spec['tolerations']);
  for (const taint of node.taints) {
    if (!tolerates(tolerations, taint)) {
      return `có taint ${taint} mà pod không tolerate`;
    }
  }
  if (!node.ready) {
    return 'node đang NotReady';
  }
  if (node.unschedulable) {
    return 'node đã bị cordon';
  }
  const free = nodeFree(state, node, tickMs);
  const need = podRequests(pod, tickMs);
  if (free.cpu < need.cpu) {
    return `không đủ CPU (còn ${free.cpu}m, cần ${need.cpu}m)`;
  }
  if (free.memory < need.memory) {
    return `không đủ bộ nhớ (còn ${free.memory}Mi, cần ${need.memory}Mi)`;
  }
  if (rwoHolder !== null && rwoHolder !== node.name) {
    return `PVC ReadWriteOnce đang được node ${rwoHolder} giữ`;
  }
  return null;
}

/**
 * Chọn node.
 *
 * ⚠ Trong các node cùng thoả, chọn node CÒN NHIỀU tài nguyên nhất, hoà thì theo
 * TÊN. Không lấy node đầu mảng: `state.nodes` giữ thứ tự level khai báo, nên
 * "node đầu" là một chi tiết của cách viết level chứ không phải một quyết định.
 * Hoà-thì-theo-tên là thứ giữ tính tất định — thiếu nó thì hai lần phát lại cùng
 * một `RunLog` có thể xếp pod lên hai node khác nhau, và xác minh chống gian lận
 * sẽ báo sai một lượt chơi hợp lệ.
 */
export function schedulePod(state: ClusterState, pod: K8sObject, tickMs: number): SchedulingResult {
  const pinned = typeof pod.spec['nodeName'] === 'string' ? pod.spec['nodeName'] : null;
  const rwoHolder = rwoConflictNode(state, pod);
  const rejections: NodeRejection[] = [];
  const fits: { node: NodeState; freeCpu: number; freeMemory: number }[] = [];

  for (const node of [...state.nodes].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (pinned !== null && node.name !== pinned) {
      continue;
    }
    const rejection = rejectionFor(state, pod, node, tickMs, rwoHolder);
    if (rejection === null) {
      const free = nodeFree(state, node, tickMs);
      fits.push({ node, freeCpu: free.cpu, freeMemory: free.memory });
    } else {
      rejections.push({ nodeName: node.name, reason: rejection });
    }
  }

  if (fits.length === 0) {
    return { nodeName: null, reason: unschedulableReason(pod, rejections), rejections };
  }
  fits.sort((a, b) => b.freeCpu - a.freeCpu || b.freeMemory - a.freeMemory || (a.node.name < b.node.name ? -1 : 1));
  return { nodeName: fits[0]?.node.name ?? null, reason: null, rejections };
}

/**
 * `NodeAffinityConflict` khi MỌI node từ chối vì nhãn/taint, `Unschedulable` khi
 * còn lý do khác.
 *
 * Phân biệt này quan trọng: hai `reason` dẫn tới hai hành động sửa hoàn toàn khác
 * nhau — nới ràng buộc xếp lịch, hay thêm dung lượng. Gộp làm một là để người
 * chơi đoán.
 */
function unschedulableReason(pod: K8sObject, rejections: readonly NodeRejection[]): PodReason {
  if (rejections.length === 0) {
    return 'Unschedulable';
  }
  const affinityOnly = rejections.every(
    (rejection) => rejection.reason.includes('nodeSelector') || rejection.reason.includes('taint'),
  );
  return affinityOnly ? 'NodeAffinityConflict' : 'Unschedulable';
}

/** Container nào cũng phải có image — API server thật từ chối pod thiếu image. */
export function podIsValid(pod: K8sObject, tickMs: number): boolean {
  const containers = readContainers(pod.spec, tickMs);
  return containers.length > 0 && containers.every((container) => container.image !== '');
}
