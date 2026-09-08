/**
 * Bộ dựng chuỗi `kubectl describe` — NGUỒN DUY NHẤT sinh mô tả.
 *
 * ## Vì sao tách khỏi `kubectl.ts`
 *
 * Hai chỗ cần đúng khối văn bản này: thanh lệnh (người chơi gõ
 * `kubectl describe pod web`) và tab Mô tả của bảng thông số (người chơi bấm
 * vào một pod trong cảnh 3D). Trước 2026-09-08 chỉ đường thứ nhất tồn tại, và
 * ba hàm dựng chuỗi nằm private trong `kubectl.ts` nhận `ClusterState` — giao
 * diện không với tới được, nên tab Mô tả phải ẩn.
 *
 * Đường sửa sai là viết một bộ định dạng thứ hai cho giao diện, và nó sai vì
 * hai bộ sẽ lệch nhau: người chơi gõ `describe` trong terminal rồi mở tab Mô tả
 * của cùng pod đó và thấy hai nội dung khác nhau. Không cái nào đỏ ở đâu cả.
 * Vì thế phần dựng chuỗi chuyển hẳn ra đây, `kubectl.ts` gọi vào, và
 * `session.describe(uid)` cũng gọi vào đúng chỗ này.
 *
 * ## Vì sao `describe` được đầu tư nhiều hơn `get`
 *
 * `kubectl get` là bảng tóm tắt; `describe` là chỗ NGUYÊN NHÂN nằm. Ba sự cố dễ
 * nhầm nhất (CrashLoopBackOff · OOMKilled · LivenessProbeFailed) cho ra cùng một
 * dòng ở `get` và chỉ tách nhau ở hai khối mà `describe` in ra: **Last State** và
 * **Events**. Bỏ hai khối đó là biến trò chơi thành đoán mò.
 */

import type { ClusterState, K8sObject } from './model.ts';
import { podRuntime } from './model.ts';
import { serviceEndpoints } from './query.ts';
import { readContainers, readSelector } from './resources.ts';
import { TICK_MS } from './tick.ts';

// ── Định dạng đơn vị ────────────────────────────────────────────────────────

/**
 * milli-core → ký pháp Kubernetes. Luôn hậu tố `m`, kể cả khi chia hết cho 1000.
 *
 * `1000m` thay vì `1` là có chủ ý: engine đã phân tích chuỗi gốc thành số nên
 * KHÔNG còn biết người chơi viết `1` hay `1000m`, và đoán lại sẽ hiện một chuỗi
 * người chơi chưa từng gõ. `1000m` luôn đúng về giá trị và luôn trung thực về
 * việc đây là con số engine đọc được, không phải chuỗi gốc.
 */
export function formatCpuMilli(milli: number): string {
  return `${milli}m`;
}

/** MiB → ký pháp Kubernetes. Cùng lập luận với `formatCpuMilli`. */
export function formatMemoryMi(mi: number): string {
  return `${mi}Mi`;
}

// ── Mẩu dùng chung với `kubectl get` ────────────────────────────────────────

/** Cột STATUS của `kubectl get pods`: `reason` thắng `phase` khi có mặt — đúng như kubectl. */
export function podStatusText(object: K8sObject): string {
  const pod = podRuntime(object);
  if (pod === null) {
    return '';
  }
  if (pod.phase === 'Terminating') {
    return 'Terminating';
  }
  return pod.reason ?? pod.phase;
}

export function labelText(object: K8sObject): string {
  const entries = Object.entries(object.labels);
  return entries.length === 0 ? '<none>' : entries.map(([key, value]) => `${key}=${value}`).join(',');
}

// ── Các khối ────────────────────────────────────────────────────────────────

/**
 * Khối Events. Scheduler ghi lý do TỪ CHỐI CỦA TỪNG NODE ở đây — nhiều người
 * dùng Kubernetes lâu năm không biết là có, và nó trả lời thẳng câu "vì sao pod
 * của tôi mãi Pending".
 */
function eventsBlock(state: ClusterState, uid: string): string {
  const events = state.events.filter((event) => event.involvedUid === uid).slice(-12);
  if (events.length === 0) {
    return 'Events:       <none>';
  }
  return [
    'Events:',
    ...events.map((event) => `  ${event.reason.padEnd(24)} ${event.message}`),
  ].join('\n');
}

/**
 * `kubectl describe pod` — khối mang toàn bộ giá trị chẩn đoán.
 *
 * Khối **Last State** là bằng chứng duy nhất phân biệt một pod thiếu RAM
 * (`OOMKilled` + `Exit Code: 137`) với một pod sai entrypoint, vì cột STATUS của
 * `get` nói `CrashLoopBackOff` cho cả hai.
 */
function describePod(state: ClusterState, object: K8sObject): string {
  const pod = podRuntime(object);
  if (pod === null) {
    return '';
  }
  const containers = readContainers(object.spec, TICK_MS);
  const lines = [
    `Name:         ${object.name}`,
    `Namespace:    ${object.namespace}`,
    `Node:         ${pod.nodeName ?? '<none>'}`,
    `Labels:       ${labelText(object)}`,
    `Status:       ${podStatusText(object)}`,
    `Ready:        ${pod.ready ? 'True' : 'False'}`,
    `Restart Count: ${pod.restarts}`,
    'Containers:',
  ];
  for (const container of containers) {
    lines.push(`  ${container.name}:`);
    lines.push(`    Image:        ${container.image}`);
    lines.push(`    Ports:        ${container.ports.join(', ') || '<none>'}`);
    lines.push(`    State:        ${pod.phase === 'Running' ? 'Running' : 'Waiting'}`);
    if (pod.reason !== null) {
      lines.push(`      Reason:     ${pod.reason}`);
    }
    if (pod.lastState !== null) {
      lines.push('    Last State:   Terminated');
      lines.push(`      Reason:     ${pod.lastState.reason}`);
      lines.push(`      Exit Code:  ${pod.lastState.exitCode}`);
    }
    const requests = [
      container.requestsCpu === null ? null : `cpu: ${formatCpuMilli(container.requestsCpu)}`,
      container.requestsMemory === null ? null : `memory: ${formatMemoryMi(container.requestsMemory)}`,
    ].filter((item): item is string => item !== null);
    const limits = [
      container.limitsCpu === null ? null : `cpu: ${formatCpuMilli(container.limitsCpu)}`,
      container.limitsMemory === null ? null : `memory: ${formatMemoryMi(container.limitsMemory)}`,
    ].filter((item): item is string => item !== null);
    lines.push(`    Requests:     ${requests.join(', ') || '<none>'}`);
    lines.push(`    Limits:       ${limits.join(', ') || '<none>'}`);
    if (container.readinessProbe !== null) {
      lines.push(`    Readiness:    cổng ${container.readinessProbe.port ?? '?'} ${container.readinessProbe.path}`);
    }
    if (container.livenessProbe !== null) {
      lines.push(`    Liveness:     cổng ${container.livenessProbe.port ?? '?'} ${container.livenessProbe.path}`);
    }
  }
  return [...lines, '', eventsBlock(state, object.uid)].join('\n');
}

function describeService(state: ClusterState, object: K8sObject): string {
  const endpoints = serviceEndpoints(state, object);
  const selector = Object.entries(readSelector(object.spec));
  return [
    `Name:         ${object.name}`,
    `Namespace:    ${object.namespace}`,
    `Selector:     ${selector.length === 0 ? '<none>' : selector.map(([k, v]) => `${k}=${v}`).join(',')}`,
    `Endpoints:    ${endpoints.length === 0 ? '<none>' : endpoints.map((pod) => pod.name).join(', ')}`,
    '',
    eventsBlock(state, object.uid),
  ].join('\n');
}

function describeGeneric(state: ClusterState, object: K8sObject): string {
  return [
    `Name:         ${object.name}`,
    `Namespace:    ${object.namespace || '<cluster-scoped>'}`,
    `Kind:         ${object.kind}`,
    `Labels:       ${labelText(object)}`,
    `Spec:         ${JSON.stringify(object.spec, null, 2)}`,
    '',
    eventsBlock(state, object.uid),
  ].join('\n');
}

/**
 * Một object → khối `describe` của nó. Điểm vào DUY NHẤT, cho cả `kubectl.ts`
 * lẫn `session.describe(uid)`.
 *
 * Phân nhánh theo `kind` nằm ở đây chứ không ở hai chỗ gọi, vì một chỗ gọi quên
 * thêm nhánh mới sẽ rơi về `describeGeneric` — nghĩa là in ra JSON thô của spec
 * ở đúng loại tài nguyên vừa được đầu tư một khối riêng, và không có gì báo.
 */
export function describeObject(state: ClusterState, object: K8sObject): string {
  if (object.kind === 'Pod') {
    return describePod(state, object);
  }
  if (object.kind === 'Service') {
    return describeService(state, object);
  }
  return describeGeneric(state, object);
}
