/**
 * Vòng điều hoà của các controller: Deployment → ReplicaSet → Pod, DaemonSet,
 * StatefulSet, Job, CronJob, HPA — cộng hai cổng chặn ở API server
 * (ResourceQuota, LimitRange).
 *
 * ## Deployment KHÔNG đẻ Pod
 *
 * Deployment tạo ReplicaSet, ReplicaSet mới tạo Pod. Cắt tầng giữa đi thì mô
 * phỏng gọn hơn thật, nhưng `kubectl get rs` sẽ rỗng, `rollout undo` mất chỗ
 * bám, và chương 2 (level 06–11) không còn gì để dạy. Giữ đủ ba tầng là điều
 * kiện để `DeploymentStuckRollout` — RS mới không lên nổi trong khi RS cũ vẫn
 * phục vụ — hiện ra được.
 *
 * ## Quota chặn ở API SERVER, không ở scheduler
 *
 * Pod vượt ResourceQuota **không xuất hiện ở trạng thái Pending** — nó không được
 * tạo ra chút nào, và bằng chứng duy nhất là một Event `FailedCreate` trên
 * ReplicaSet. Đây là chi tiết mà báo cáo nghiên cứu upstream gọi tên riêng, và là
 * lý do người ta tìm mãi không thấy pod: họ đang `get pods` trong khi câu trả lời
 * nằm ở `describe rs`.
 */

import type { RngState } from '../core/rng.ts';
import { nextInt } from '../core/rng.ts';
import type { ClusterState, K8sObject } from './model.ts';
import {
  allocateUid,
  addObject,
  compareObjects,
  emitEvent,
  findByUid,
  isDoomed,
  newPod,
  podRuntime,
  removeObjectCascade,
  replaceObject,
} from './model.ts';
import {
  childrenOf,
  namespaceUsage,
  objectsOfKind,
  podRequests,
  podsOwnedBy,
  readyPods,
  workloadTemplate,
} from './query.ts';
import { asNumber, asRecord, asString, asStringMap, parseCpu, parseMemory, readPath } from './resources.ts';

/** Grace period mặc định của Kubernetes là 30 giây. Ở `TICK_MS = 500` là 60 tick. */
export const DEFAULT_GRACE_TICKS = 60;

const SUFFIX_ALPHABET = 'bcdfghjklmnpqrstvwxz2456789';

/**
 * Hậu tố 5 ký tự kiểu `web-7d9f4-x2k9p`.
 *
 * Rút từ `core/rng.ts` có hạt giống chứ không `Math.random()`: tên pod đi vào
 * `ClusterView`, và xác minh chống gian lận so `ClusterView` sau khi phát lại.
 * Một tên ngẫu nhiên thật sẽ làm mọi lượt chơi hợp lệ đều bị báo là gian lận.
 */
function randomSuffix(rng: RngState): { suffix: string; rng: RngState } {
  let cursor = rng;
  let suffix = '';
  for (let i = 0; i < 5; i += 1) {
    const draw = nextInt(cursor, SUFFIX_ALPHABET.length);
    cursor = draw.state;
    suffix += SUFFIX_ALPHABET[draw.value] ?? 'x';
  }
  return { suffix, rng: cursor };
}

/**
 * Băm ổn định của template pod → `pod-template-hash`.
 *
 * ⚠ Sắp KHOÁ trước khi nối chuỗi. `JSON.stringify` giữ thứ tự chèn, nên cùng một
 * template viết `{image, name}` và `{name, image}` sẽ ra hai hash khác nhau — và
 * người chơi sửa YAML rồi apply lại sẽ vô tình kích hoạt một rollout mà họ không
 * yêu cầu. FNV-1a vì nó ngắn, tất định, và không cần thư viện.
 */
export function templateHash(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const char of stableStringify(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const record = asRecord(value);
  if (record === null) {
    return JSON.stringify(value ?? null) ?? 'null';
  }
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

// ── Cổng API server ─────────────────────────────────────────────────────────

export interface AdmissionResult {
  readonly allowed: boolean;
  /** Tiếng Việt, một dòng. Rỗng khi `allowed`. */
  readonly message: string;
  /** Reason kiểu K8s, giữ tiếng Anh. */
  readonly reason: string;
}

const ALLOWED: AdmissionResult = { allowed: true, message: '', reason: '' };

/**
 * ResourceQuota + LimitRange. Chạy TRƯỚC khi pod tồn tại, đúng như admission
 * controller thật — nên pod bị chặn không để lại dấu vết nào ở `get pods`.
 */
export function admitPod(state: ClusterState, pod: K8sObject, tickMs: number): AdmissionResult {
  const need = podRequests(pod, tickMs);
  for (const range of objectsOfKind(state, 'LimitRange', pod.namespace)) {
    for (const entry of Array.isArray(range.spec['limits']) ? range.spec['limits'] : []) {
      const record = asRecord(entry);
      if (record === null || asString(record['type']) !== 'Container') {
        continue;
      }
      const minCpu = parseCpu(readPath(record, 'min.cpu'));
      const maxCpu = parseCpu(readPath(record, 'max.cpu'));
      const minMem = parseMemory(readPath(record, 'min.memory'));
      const maxMem = parseMemory(readPath(record, 'max.memory'));
      if (minCpu !== null && need.cpu < minCpu) {
        return fail(`LimitRange ${range.name} đòi CPU tối thiểu ${minCpu}m, pod xin ${need.cpu}m.`);
      }
      if (maxCpu !== null && need.cpu > maxCpu) {
        return fail(`LimitRange ${range.name} chặn CPU trên ${maxCpu}m, pod xin ${need.cpu}m.`);
      }
      if (minMem !== null && need.memory < minMem) {
        return fail(`LimitRange ${range.name} đòi bộ nhớ tối thiểu ${minMem}Mi, pod xin ${need.memory}Mi.`);
      }
      if (maxMem !== null && need.memory > maxMem) {
        return fail(`LimitRange ${range.name} chặn bộ nhớ trên ${maxMem}Mi, pod xin ${need.memory}Mi.`);
      }
    }
  }
  const used = namespaceUsage(state, pod.namespace, tickMs);
  for (const quota of objectsOfKind(state, 'ResourceQuota', pod.namespace)) {
    const hard = asRecord(quota.spec['hard']);
    if (hard === null) {
      continue;
    }
    const maxPods = asNumber(hard['pods']);
    if (maxPods !== null && used.pods + 1 > maxPods) {
      return fail(`ResourceQuota ${quota.name} chỉ cho ${maxPods} pod, namespace đã dùng ${used.pods}.`);
    }
    const maxCpu = parseCpu(hard['requests.cpu']);
    if (maxCpu !== null && used.cpu + need.cpu > maxCpu) {
      return fail(`ResourceQuota ${quota.name} chỉ cho ${maxCpu}m CPU, đã dùng ${used.cpu}m.`);
    }
    const maxMem = parseMemory(hard['requests.memory']);
    if (maxMem !== null && used.memory + need.memory > maxMem) {
      return fail(`ResourceQuota ${quota.name} chỉ cho ${maxMem}Mi bộ nhớ, đã dùng ${used.memory}Mi.`);
    }
  }
  return ALLOWED;
}

function fail(message: string): AdmissionResult {
  return { allowed: false, message, reason: 'FailedCreate' };
}

// ── Tạo và xoá pod ──────────────────────────────────────────────────────────

function spawnPod(
  state: ClusterState,
  owner: K8sObject,
  name: string,
  template: Readonly<Record<string, unknown>>,
  extraLabels: Readonly<Record<string, string>>,
  tickMs: number,
): ClusterState {
  const labels = { ...asStringMap(template['labels']), ...extraLabels };
  const spec: Record<string, unknown> = { ...template, labels };
  const allocated = allocateUid(state);
  const pod: K8sObject = {
    uid: allocated.uid,
    kind: 'Pod',
    name,
    namespace: owner.namespace,
    labels,
    spec,
    ownerUid: owner.uid,
    createdTick: state.tick,
    runtime: { kind: 'pod', pod: newPod(null) },
  };
  const admission = admitPod(allocated.state, pod, tickMs);
  if (!admission.allowed) {
    return emitEvent(allocated.state, {
      level: 'error',
      reason: admission.reason,
      message: `Không tạo được pod ${name}: ${admission.message}`,
      involvedUid: owner.uid,
    });
  }
  return emitEvent(addObject(allocated.state, pod), {
    level: 'info',
    reason: 'SuccessfulCreate',
    message: `Đã tạo pod ${name}.`,
    involvedUid: owner.uid,
  });
}

/**
 * Xoá bớt pod thừa. Chọn theo thứ tự TÊN GIẢM DẦN, không phải "pod mới nhất".
 *
 * Kubernetes thật có cả một thang chấm (pod chưa Ready trước, pod trẻ trước…).
 * Mô phỏng lấy một luật đơn giản hơn nhưng phải TẤT ĐỊNH — "pod mới nhất" đọc
 * theo thứ tự mảng sẽ đổi khi mảng được sắp lại, và hai lần phát lại cùng một
 * `RunLog` sẽ xoá hai pod khác nhau.
 */
function removeSurplus(state: ClusterState, pods: readonly K8sObject[], count: number): ClusterState {
  const doomed = [...pods].sort(compareObjects).reverse().slice(0, count);
  let next = state;
  for (const pod of doomed) {
    next = removeObjectCascade(next, pod.uid);
    next = emitEvent(next, {
      level: 'info',
      reason: 'SuccessfulDelete',
      message: `Đã xoá pod ${pod.name} để khớp số replica mong muốn.`,
      involvedUid: pod.ownerUid,
    });
  }
  return next;
}

// ── ReplicaSet ──────────────────────────────────────────────────────────────

function reconcileReplicaSet(state: ClusterState, rs: K8sObject, tickMs: number): ClusterState {
  const template = workloadTemplate(rs);
  if (template === null) {
    return state;
  }
  const desired = asNumber(rs.spec['replicas']) ?? 1;
  const pods = podsOwnedBy(state, rs.uid);
  if (pods.length > desired) {
    return removeSurplus(state, pods, pods.length - desired);
  }
  if (pods.length < desired) {
    const suffix = randomSuffix(state.rng);
    const withRng: ClusterState = { ...state, rng: suffix.rng };
    return spawnPod(withRng, rs, `${rs.name}-${suffix.suffix}`, template, {}, tickMs);
  }
  return state;
}

// ── Deployment ──────────────────────────────────────────────────────────────

/**
 * Rolling update thu gọn: RS mới lên một pod mỗi tick trong giới hạn `maxSurge`,
 * RS cũ chỉ co lại KHI pod mới đã Ready.
 *
 * Điều kiện "khi pod mới đã Ready" là toàn bộ giá trị dạy của cơ chế này. Bỏ nó
 * đi thì một rollout với image hỏng vẫn xoá sạch RS cũ và dịch vụ sập — trong khi
 * hành vi thật của Kubernetes là **giữ nguyên phiên bản cũ đang chạy** và treo
 * rollout lại. Đó là lý do `kubectl rollout status` tồn tại.
 */
function reconcileDeployment(state: ClusterState, deployment: K8sObject): ClusterState {
  const template = workloadTemplate(deployment);
  if (template === null) {
    return state;
  }
  const desired = asNumber(deployment.spec['replicas']) ?? 1;
  const hash = templateHash(template);
  const rsName = `${deployment.name}-${hash}`;
  const owned = childrenOf(state, deployment.uid).filter((item) => item.kind === 'ReplicaSet');
  let next = state;
  let current = owned.find((item) => item.name === rsName) ?? null;

  if (current === null) {
    const allocated = allocateUid(next);
    const labels = { ...asStringMap(template['labels']), 'pod-template-hash': hash };
    current = {
      uid: allocated.uid,
      kind: 'ReplicaSet',
      name: rsName,
      namespace: deployment.namespace,
      labels,
      spec: {
        replicas: 0,
        selector: { matchLabels: labels },
        template: { ...template, labels },
        revision: (asNumber(deployment.spec['revision']) ?? 0) + 1,
      },
      ownerUid: deployment.uid,
      createdTick: next.tick,
      runtime: { kind: 'none' },
    };
    next = emitEvent(addObject(allocated.state, current), {
      level: 'info',
      reason: 'ScalingReplicaSet',
      message: `Deployment ${deployment.name} tạo ReplicaSet ${rsName}.`,
      involvedUid: deployment.uid,
    });
  }

  const maxSurge = asNumber(readPath(deployment.spec, 'strategy.maxSurge')) ?? 1;
  const currentReplicas = asNumber(current.spec['replicas']) ?? 0;
  const currentReady = readyPods(podsOwnedBy(next, current.uid)).length;
  const olds = childrenOf(next, deployment.uid).filter(
    (item) => item.kind === 'ReplicaSet' && item.uid !== current?.uid,
  );
  const oldReplicas = olds.reduce((sum, rs) => sum + (asNumber(rs.spec['replicas']) ?? 0), 0);

  const target = Math.min(desired, Math.max(currentReplicas, currentReady + maxSurge));
  if (target !== currentReplicas) {
    next = replaceObject(next, { ...current, spec: { ...current.spec, replicas: target } });
  }
  const allowedOld = Math.max(0, desired - currentReady);
  if (oldReplicas > allowedOld) {
    let budget = oldReplicas - allowedOld;
    for (const rs of [...olds].sort(compareObjects)) {
      if (budget <= 0) {
        break;
      }
      const replicas = asNumber(rs.spec['replicas']) ?? 0;
      const cut = Math.min(replicas, budget);
      budget -= cut;
      next = replaceObject(next, { ...rs, spec: { ...rs.spec, replicas: replicas - cut } });
    }
  }
  return next;
}

// ── DaemonSet ───────────────────────────────────────────────────────────────

/** Đúng một pod mỗi node Ready. Không có `replicas` — số node LÀ số replica. */
function reconcileDaemonSet(state: ClusterState, ds: K8sObject, tickMs: number): ClusterState {
  const template = workloadTemplate(ds);
  if (template === null) {
    return state;
  }
  const pods = podsOwnedBy(state, ds.uid);
  const covered = new Set(
    pods.map((pod) => podRuntime(pod)?.nodeName).filter((name): name is string => name !== null && name !== undefined),
  );
  const pending = pods.filter((pod) => podRuntime(pod)?.nodeName === null);
  for (const node of [...state.nodes].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!node.ready || covered.has(node.name) || pending.length > 0) {
      continue;
    }
    const suffix = randomSuffix(state.rng);
    return spawnPod(
      { ...state, rng: suffix.rng },
      ds,
      `${ds.name}-${suffix.suffix}`,
      { ...template, nodeName: node.name },
      {},
      tickMs,
    );
  }
  return state;
}

// ── StatefulSet ─────────────────────────────────────────────────────────────

/**
 * Tên có SỐ THỨ TỰ (`db-0`, `db-1`) và `podManagementPolicy: OrderedReady` bắt
 * pod thứ N-1 phải Ready trước khi tạo pod thứ N.
 *
 * Đây là hành vi mà CHỈ StatefulSet có, và là lý do một pod hỏng ở giữa chặn sạch
 * phần đuôi — Deployment không như vậy. Bỏ ràng buộc thứ tự đi thì StatefulSet
 * chỉ còn là một Deployment có tên đẹp hơn, và level dạy nó mất nội dung.
 */
function reconcileStatefulSet(state: ClusterState, sts: K8sObject, tickMs: number): ClusterState {
  const template = workloadTemplate(sts);
  if (template === null) {
    return state;
  }
  const desired = asNumber(sts.spec['replicas']) ?? 1;
  const ordered = asString(sts.spec['podManagementPolicy']) !== 'Parallel';
  const pods = podsOwnedBy(state, sts.uid);
  const byName = new Map(pods.map((pod) => [pod.name, pod]));

  if (pods.length > desired) {
    // Co lại theo thứ tự NGƯỢC: `db-2` biến mất trước `db-1`, đúng luật.
    const surplus = pods
      .filter((pod) => (ordinalOf(pod.name) ?? 0) >= desired)
      .sort((a, b) => (ordinalOf(b.name) ?? 0) - (ordinalOf(a.name) ?? 0));
    const victim = surplus[0];
    return victim === undefined ? state : removeSurplus(state, [victim], 1);
  }

  for (let index = 0; index < desired; index += 1) {
    const name = `${sts.name}-${index}`;
    if (byName.has(name)) {
      continue;
    }
    if (ordered && index > 0) {
      const previous = byName.get(`${sts.name}-${index - 1}`);
      const runtime = previous === undefined ? null : podRuntime(previous);
      if (runtime === null || !runtime.ready) {
        return emitEvent(state, {
          level: 'warning',
          reason: 'OrderedReady',
          message: `StatefulSet ${sts.name} đang chờ pod ${sts.name}-${index - 1} Ready trước khi tạo ${name}.`,
          involvedUid: sts.uid,
        });
      }
    }
    return spawnPod(state, sts, name, template, {}, tickMs);
  }
  return state;
}

function ordinalOf(name: string): number | null {
  const value = Number.parseInt(name.slice(name.lastIndexOf('-') + 1), 10);
  return Number.isFinite(value) ? value : null;
}

// ── Job và CronJob ──────────────────────────────────────────────────────────

function reconcileJob(state: ClusterState, job: K8sObject, tickMs: number): ClusterState {
  const template = workloadTemplate(job);
  const runtime = job.runtime;
  if (template === null || runtime.kind !== 'job') {
    return state;
  }
  const completions = asNumber(job.spec['completions']) ?? 1;
  const parallelism = asNumber(job.spec['parallelism']) ?? 1;
  const backoffLimit = asNumber(job.spec['backoffLimit']) ?? 6;
  const pods = childrenOf(state, job.uid).filter((pod) => pod.kind === 'Pod');
  const succeeded = pods.filter((pod) => podRuntime(pod)?.phase === 'Succeeded').length;
  const failed = pods.filter((pod) => podRuntime(pod)?.phase === 'Failed').length;
  const active = pods.filter((pod) => {
    const state_ = podRuntime(pod);
    return state_ !== null && state_.phase !== 'Succeeded' && state_.phase !== 'Failed';
  }).length;

  let next = replaceObject(state, {
    ...job,
    runtime: { kind: 'job', succeeded, failed, startedTick: runtime.startedTick },
  });
  if (failed > backoffLimit) {
    return emitEvent(next, {
      level: 'error',
      reason: 'BackoffLimitExceeded',
      message: `Job ${job.name} đã thất bại ${failed} lần, vượt backoffLimit ${backoffLimit}. Ngừng thử lại.`,
      involvedUid: job.uid,
    });
  }
  if (succeeded >= completions || active >= parallelism || succeeded + active >= completions) {
    return next;
  }
  const suffix = randomSuffix(next.rng);
  next = { ...next, rng: suffix.rng };
  return spawnPod(
    next,
    job,
    `${job.name}-${suffix.suffix}`,
    { restartPolicy: 'OnFailure', ...template },
    {},
    tickMs,
  );
}

/**
 * Lịch tính bằng TICK, không phải cron thật.
 *
 * `schedule: '*\/5 * * * *'` giữ lại để hiện ra ở `kubectl get cronjob` cho đúng
 * hình dạng thật, nhưng thứ điều khiển mô phỏng là `everyTicks`. Viết một bộ
 * phân tích cron đầy đủ ở đây là thêm một lớp lỗi để đổi lấy một hành vi mà một
 * ván chơi dài vài phút không bao giờ quan sát được.
 */
function reconcileCronJob(state: ClusterState, cronjob: K8sObject): ClusterState {
  const runtime = cronjob.runtime;
  if (runtime.kind !== 'cronjob' || asString(cronjob.spec['suspend']) === 'true') {
    return state;
  }
  const everyTicks = asNumber(cronjob.spec['everyTicks']) ?? 120;
  if (runtime.lastScheduleTick >= 0 && state.tick - runtime.lastScheduleTick < everyTicks) {
    return state;
  }
  const template = asRecord(cronjob.spec['jobTemplate']);
  if (template === null) {
    return state;
  }
  const allocated = allocateUid(state);
  const job: K8sObject = {
    uid: allocated.uid,
    kind: 'Job',
    name: `${cronjob.name}-${state.tick}`,
    namespace: cronjob.namespace,
    labels: asStringMap(template['labels']),
    spec: template,
    ownerUid: cronjob.uid,
    createdTick: state.tick,
    runtime: { kind: 'job', succeeded: 0, failed: 0, startedTick: state.tick },
  };
  const withJob = replaceObject(addObject(allocated.state, job), {
    ...cronjob,
    runtime: { kind: 'cronjob', lastScheduleTick: state.tick },
  });
  return emitEvent(withJob, {
    level: 'info',
    reason: 'SuccessfulCreate',
    message: `CronJob ${cronjob.name} đã tạo Job ${job.name}.`,
    involvedUid: cronjob.uid,
  });
}

// ── HorizontalPodAutoscaler ─────────────────────────────────────────────────

/**
 * HPA giữ số replica của đích trong khoảng `[minReplicas, maxReplicas]`.
 *
 * ⚠ HPA đọc `requests.cpu` để tính phần trăm sử dụng. Container KHÔNG khai
 * `requests` thì mẫu số bằng không và HPA mù — `kubectl get hpa` hiện
 * `<unknown>/80%` và không scale gì cả. Đó là sự cố `hpa-khong-co-metrics`, và
 * nó là lý do `readContainers` giữ `null` thay vì quy về 0: phân biệt "xin 0 CPU"
 * với "không xin gì" chính là toàn bộ nội dung của sự cố này.
 *
 * Mô phỏng không có tải thật, nên HPA ở đây chỉ ép biên. Đủ để dạy điều quan
 * trọng nhất: HPA không cứu được một Deployment đã chạm `maxReplicas`.
 */
function reconcileHpa(state: ClusterState, hpa: K8sObject): ClusterState {
  const targetName = asString(readPath(hpa.spec, 'scaleTargetRef.name'));
  if (targetName === null) {
    return state;
  }
  const target = state.objects.find(
    (object) =>
      object.name === targetName &&
      object.namespace === hpa.namespace &&
      (object.kind === 'Deployment' || object.kind === 'StatefulSet' || object.kind === 'ReplicaSet'),
  );
  if (target === undefined) {
    return emitEvent(state, {
      level: 'warning',
      reason: 'FailedGetScale',
      message: `HPA ${hpa.name} không tìm thấy đích ${targetName}.`,
      involvedUid: hpa.uid,
    });
  }
  if (!hpaHasMetrics(target)) {
    return emitEvent(state, {
      level: 'warning',
      reason: 'FailedGetResourceMetric',
      message: `HPA ${hpa.name} không đọc được metric: container của ${targetName} chưa khai resources.requests.cpu.`,
      involvedUid: hpa.uid,
    });
  }
  const min = asNumber(hpa.spec['minReplicas']) ?? 1;
  const max = asNumber(hpa.spec['maxReplicas']) ?? min;
  const replicas = asNumber(target.spec['replicas']) ?? 1;
  const clamped = Math.min(Math.max(replicas, min), max);
  if (clamped === replicas) {
    return state;
  }
  return emitEvent(replaceObject(state, { ...target, spec: { ...target.spec, replicas: clamped } }), {
    level: 'info',
    reason: 'SuccessfulRescale',
    message: `HPA ${hpa.name} đổi số replica của ${targetName} từ ${replicas} sang ${clamped}.`,
    involvedUid: hpa.uid,
  });
}

/** Export để `predicates.ts` dùng CHUNG một định nghĩa với vòng điều hoà. */
export function hpaHasMetrics(target: K8sObject): boolean {
  const template = workloadTemplate(target);
  if (template === null) {
    return false;
  }
  const containers = Array.isArray(template['containers']) ? template['containers'] : [];
  if (containers.length === 0) {
    return false;
  }
  return containers.every((entry) => parseCpu(readPath(entry, 'resources.requests.cpu')) !== null);
}

// ── Vòng điều hoà ───────────────────────────────────────────────────────────

/**
 * Thứ tự chạy các controller là CÓ CHỦ Ý: cấp cao xuống cấp thấp trong cùng một
 * tick, để một `scale deployment` thấy được kết quả ở pod sau đúng vài tick chứ
 * không phải sau một tick cho mỗi tầng. Trong mỗi loại thì duyệt theo thứ tự đã
 * sắp của `state.objects` — tất định, không theo thứ tự tạo.
 */
export function reconcile(state: ClusterState, tickMs: number): ClusterState {
  let next = state;
  for (const cronjob of objectsOfKind(next, 'CronJob')) {
    next = reconcileCronJob(next, cronjob);
  }
  for (const hpa of objectsOfKind(next, 'HorizontalPodAutoscaler')) {
    const live = findByUid(next, hpa.uid);
    if (live !== null) {
      next = reconcileHpa(next, live);
    }
  }
  for (const deployment of objectsOfKind(next, 'Deployment')) {
    const live = findByUid(next, deployment.uid);
    if (live !== null) {
      next = reconcileDeployment(next, live);
    }
  }
  for (const rs of objectsOfKind(next, 'ReplicaSet')) {
    const live = findByUid(next, rs.uid);
    if (live !== null) {
      next = reconcileReplicaSet(next, live, tickMs);
    }
  }
  for (const sts of objectsOfKind(next, 'StatefulSet')) {
    const live = findByUid(next, sts.uid);
    if (live !== null) {
      next = reconcileStatefulSet(next, live, tickMs);
    }
  }
  for (const ds of objectsOfKind(next, 'DaemonSet')) {
    const live = findByUid(next, ds.uid);
    if (live !== null) {
      next = reconcileDaemonSet(next, live, tickMs);
    }
  }
  for (const job of objectsOfKind(next, 'Job')) {
    const live = findByUid(next, job.uid);
    if (live !== null) {
      next = reconcileJob(next, live, tickMs);
    }
  }
  return next;
}

/** Dùng lại ở `reducer.ts` khi người chơi tạo pod trần. */
export { randomSuffix, isDoomed };
