/**
 * Bước mô phỏng theo thời gian.
 *
 * ## Đơn vị
 *
 * Mọi khoảng thời gian TRONG mô phỏng là **tick**, không phải giây (hợp đồng
 * §3.3). `TICK_MS` là hằng công khai duy nhất nối hai thang đó, và nó nằm ở đây
 * chứ không rải khắp nơi: đổi nhịp mô phỏng mà phải sửa mười file là cách các
 * hằng thời gian lệch nhau.
 *
 * ## Vì sao `advance` nhận số tick chứ không nhận thời gian trôi
 *
 * Một hàm `advance(state, deltaMs)` sẽ đọc đồng hồ ở đâu đó, và đồng hồ là thứ
 * KHÔNG phát lại được. Xác minh chống gian lận (§8.3) chạy lại chuỗi action từ
 * `seed` và so kết quả; chỉ cần một `Date.now()` lọt vào đây là mọi lượt chơi
 * hợp lệ đều bị báo gian lận. Đồng hồ treo tường sống ở `session.ts` và chỉ ở đó
 * — nó đổi thời gian thật thành số tick rồi gọi hàm này.
 */

import type { PodPhase, PodReason } from './contract.ts';
import type { ClusterState, K8sObject, PodRuntime } from './model.ts';
import {
  emitEvent,
  findNode,
  isDoomed,
  objectRef,
  podRuntime,
  removeObjectCascade,
  replaceObject,
} from './model.ts';
import { objectsOfKind } from './query.ts';
import { podIsValid, schedulePod } from './scheduler.ts';
import { reconcile } from './controllers.ts';
import { configProblem, containerStartupProblem, probeFails } from './health.ts';
import { asRecord, asString, asStringArray, readContainers } from './resources.ts';

/**
 * 500 ms. Đủ nhanh để người chơi thấy trạng thái đổi mà không sốt ruột, đủ chậm
 * để một vòng điều hoà không nuốt mất pha `ContainerCreating` — pha đó chính là
 * thứ level 01 bảo người chơi ngồi nhìn.
 */
export const TICK_MS = 500;

/** Tạo container mất khoảng 2 giây. */
const CONTAINER_CREATE_TICKS = 4;
/** Ứng dụng mất khoảng 2 giây để sẵn sàng nhận traffic. */
const DEFAULT_STARTUP_TICKS = 4;
/** Container một-lần (`restartPolicy` khác `Always`) chạy khoảng 5 giây rồi xong. */
const ONE_SHOT_RUN_TICKS = 10;
/** Pod trên node NotReady bị đánh dấu mất sau khoảng 10 giây. */
const EVICTION_TICKS = 20;
/** Sau bao nhiêu lần chết LIÊN TIẾP thì `kubectl get` hiện `CrashLoopBackOff`. */
const CRASH_LOOP_THRESHOLD = 2;
const MAX_BACKOFF_TICKS = 600;

/** Backoff luỹ thừa, chặn trên — đúng cách kubelet giãn nhịp thử lại. */
function backoffTicks(streak: number): number {
  return Math.min(MAX_BACKOFF_TICKS, 20 * 2 ** Math.max(0, streak - 1));
}

export function advance(state: ClusterState, ticks = 1): ClusterState {
  let next = state;
  for (let i = 0; i < Math.max(0, Math.trunc(ticks)); i += 1) {
    next = step(next);
  }
  return next;
}

function step(state: ClusterState): ClusterState {
  let next: ClusterState = { ...state, tick: state.tick + 1 };
  next = reapDeleted(next);
  next = reconcile(next, TICK_MS);
  next = bindClaims(next);
  for (const pod of objectsOfKind(next, 'Pod')) {
    next = stepPod(next, pod.uid);
  }
  return next;
}

/** Pod hết grace period thì biến mất. Đây là nửa sau của `kubectl delete`. */
function reapDeleted(state: ClusterState): ClusterState {
  let next = state;
  for (const object of objectsOfKind(state, 'Pod')) {
    const pod = podRuntime(object);
    if (pod !== null && pod.deleteAtTick >= 0 && next.tick >= pod.deleteAtTick) {
      next = removeObjectCascade(next, object.uid);
    }
  }
  return next;
}

// ── PVC ↔ PV ────────────────────────────────────────────────────────────────

/**
 * Bind PVC vào PV KHỚP: đủ dung lượng, đúng accessMode, đúng StorageClass.
 *
 * Ba điều kiện, và một PVC `Pending` chỉ nói "chưa bind được" chứ không nói
 * THIẾU cái nào — người chơi phải `describe pvc` đọc Events rồi đối chiếu
 * `get pv`. Đó là bài học; rút xuống một điều kiện là mất nó.
 */
function bindClaims(state: ClusterState): ClusterState {
  let next = state;
  for (const pvc of objectsOfKind(state, 'PersistentVolumeClaim')) {
    if (pvc.runtime.kind !== 'pvc' || pvc.runtime.boundVolume !== null) {
      continue;
    }
    const wantClass = asString(pvc.spec['storageClassName']);
    const wantModes = asStringArray(pvc.spec['accessModes']);
    const wantSize = readStorage(pvc.spec);
    if (wantClass !== null) {
      const classes = objectsOfKind(next, 'StorageClass').map((item) => item.name);
      if (!classes.includes(wantClass)) {
        next = emitEvent(next, {
          level: 'warning',
          reason: 'ProvisioningFailed',
          message: `PVC ${pvc.name} tham chiếu StorageClass "${wantClass}" không tồn tại.`,
          involvedUid: pvc.uid,
        });
        continue;
      }
    }
    const taken = new Set(
      objectsOfKind(next, 'PersistentVolumeClaim')
        .map((item) => (item.runtime.kind === 'pvc' ? item.runtime.boundVolume : null))
        .filter((name): name is string => name !== null),
    );
    const match = objectsOfKind(next, 'PersistentVolume').find((pv) => {
      if (taken.has(pv.name)) {
        return false;
      }
      const size = readCapacity(pv.spec);
      const modes = asStringArray(pv.spec['accessModes']);
      const pvClass = asString(pv.spec['storageClassName']);
      if (wantClass !== null && pvClass !== wantClass) {
        return false;
      }
      if (wantSize !== null && size !== null && size < wantSize) {
        return false;
      }
      return wantModes.length === 0 || wantModes.every((mode) => modes.includes(mode));
    });
    if (match === undefined) {
      next = emitEvent(next, {
        level: 'warning',
        reason: 'FailedBinding',
        message: `PVC ${pvc.name} chưa tìm được PersistentVolume khớp (dung lượng, accessMode, hoặc StorageClass).`,
        involvedUid: pvc.uid,
      });
      continue;
    }
    next = emitEvent(
      replaceObject(next, { ...pvc, runtime: { kind: 'pvc', boundVolume: match.name } }),
      {
        level: 'info',
        reason: 'ProvisioningSucceeded',
        message: `PVC ${pvc.name} đã bind vào PersistentVolume ${match.name}.`,
        involvedUid: pvc.uid,
      },
    );
  }
  return next;
}

function readStorage(spec: Readonly<Record<string, unknown>>): number | null {
  const raw = asRecord(asRecord(spec['resources'])?.['requests'])?.['storage'];
  return parseQuantityMi(raw);
}

function readCapacity(spec: Readonly<Record<string, unknown>>): number | null {
  return parseQuantityMi(asRecord(spec['capacity'])?.['storage']);
}

function parseQuantityMi(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return raw;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const match = /^([0-9.]+)\s*(Ki|Mi|Gi|Ti)?$/.exec(raw.trim());
  const amount = Number.parseFloat(match?.[1] ?? '');
  if (!Number.isFinite(amount)) {
    return null;
  }
  const unit = match?.[2] ?? 'Mi';
  const factor = unit === 'Ki' ? 1 / 1024 : unit === 'Gi' ? 1024 : unit === 'Ti' ? 1024 * 1024 : 1;
  return Math.round(amount * factor);
}

/** PVC mà pod mount nhưng chưa Bound. Pod kẹt `Pending` với reason `PVCPending`. */
function pendingClaim(state: ClusterState, pod: K8sObject): string | null {
  for (const entry of Array.isArray(pod.spec['volumes']) ? pod.spec['volumes'] : []) {
    const claimName = asRecord(asRecord(entry)?.['persistentVolumeClaim'])?.['claimName'];
    if (typeof claimName !== 'string') {
      continue;
    }
    const pvc = objectsOfKind(state, 'PersistentVolumeClaim', pod.namespace).find(
      (item) => item.name === claimName,
    );
    if (pvc === undefined) {
      return claimName;
    }
    if (pvc.runtime.kind === 'pvc' && pvc.runtime.boundVolume === null) {
      return claimName;
    }
  }
  return null;
}

// ── Vòng đời pod ────────────────────────────────────────────────────────────

function put(state: ClusterState, object: K8sObject, pod: PodRuntime): ClusterState {
  return replaceObject(state, { ...object, runtime: { kind: 'pod', pod } });
}

/**
 * Một tick của một pod.
 *
 * Thứ tự các nhánh dưới đây khớp thứ tự kubelet gặp vấn đề, và đó là điều làm
 * triệu chứng đúng: một pod chưa được xếp lịch KHÔNG thể có lỗi kéo image, vì
 * chưa có kubelet nào nhận nó. Đảo thứ tự sẽ dựng ra những cặp
 * (phase, reason) không tồn tại ngoài đời và dạy một mô hình sai.
 */
function stepPod(state: ClusterState, uid: string): ClusterState {
  const object = state.objects.find((item) => item.uid === uid);
  const pod = object === undefined ? null : podRuntime(object);
  if (object === undefined || pod === null) {
    return state;
  }
  if (isDoomed(pod) || pod.phase === 'Succeeded' || pod.phase === 'Failed') {
    return state;
  }
  if (!podIsValid(object, TICK_MS)) {
    return put(state, object, { ...pod, phase: 'Pending', reason: 'CreateContainerConfigError', ready: false });
  }
  if (pod.nodeName === null) {
    return schedule(state, object, pod);
  }
  const node = findNode(state, pod.nodeName);
  if (node === null || !node.ready) {
    return evict(state, object, pod);
  }
  const claim = pendingClaim(state, object);
  if (claim !== null) {
    return put(state, object, { ...pod, phase: 'Pending', reason: 'PVCPending', ready: false });
  }
  const config = configProblem(state, object, TICK_MS);
  if (config !== null) {
    const already = pod.reason === 'CreateContainerConfigError';
    const next = put(state, object, {
      ...pod,
      phase: 'Pending',
      reason: 'CreateContainerConfigError',
      ready: false,
    });
    return already
      ? next
      : emitEvent(next, {
          level: 'error',
          reason: 'Failed',
          message: `Pod ${object.name} không tạo được container: ${config}`,
          involvedUid: object.uid,
        });
  }
  // ⚠ Backoff phải xét TRƯỚC pha tạo container, dù cả hai đều là "đang chờ tới
  // `startedTick`". Xét ngược lại thì một pod đang CrashLoopBackOff hiện
  // `ContainerCreating` ở cột STATUS suốt cửa sổ backoff — một trạng thái trông
  // như "sắp chạy được" trong khi thật ra nó đang chết đi chết lại. Đó là dạy
  // ngược hẳn, và nó chỉ lộ ra khi có test đọc `reason` giữa hai lần restart.
  if (state.tick < pod.nextRetryTick) {
    return waitingInBackoff(state, object, pod);
  }
  if (state.tick < pod.startedTick) {
    return put(state, object, { ...pod, phase: 'Pending', reason: 'ContainerCreating', ready: false });
  }
  return runContainers(state, object, pod);
}

function schedule(state: ClusterState, object: K8sObject, pod: PodRuntime): ClusterState {
  const result = schedulePod(state, object, TICK_MS);
  if (result.nodeName === null) {
    const changed = pod.reason !== result.reason;
    const next = put(state, object, { ...pod, phase: 'Pending', reason: result.reason, ready: false });
    if (!changed) {
      return next;
    }
    const detail = result.rejections
      .map((rejection) => `${rejection.nodeName}: ${rejection.reason}`)
      .join('; ');
    return emitEvent(next, {
      level: 'warning',
      reason: 'FailedScheduling',
      message:
        detail === ''
          ? `Không xếp lịch được pod ${object.name}: cụm chưa có node nào.`
          : `Không xếp lịch được pod ${object.name}. Lý do từng node — ${detail}.`,
      involvedUid: object.uid,
    });
  }
  return emitEvent(
    put(state, object, {
      ...pod,
      phase: 'Pending',
      reason: 'ContainerCreating',
      nodeName: result.nodeName,
      startedTick: state.tick + CONTAINER_CREATE_TICKS,
      ready: false,
    }),
    {
      level: 'info',
      reason: 'Scheduled',
      message: `Pod ${object.name} được xếp lên node ${result.nodeName}.`,
      involvedUid: object.uid,
    },
  );
}

/**
 * Node NotReady: pod mất Ready NGAY (nên rớt khỏi endpoint của Service), nhưng
 * phase chỉ chuyển `Failed` sau một khoảng chờ.
 *
 * Độ trễ đó là hành vi thật và hay gây hoang mang: `kubectl get pods` vẫn hiện
 * `Running` một lúc lâu sau khi node đã chết, vì API server chưa có ai báo là pod
 * đã mất. Cột READY mới là chỗ đổi trước — thêm một lý do nữa để `ready` là một
 * trục riêng chứ không nhét vào `phase`.
 */
function evict(state: ClusterState, object: K8sObject, pod: PodRuntime): ClusterState {
  const lostSince = pod.readinessFailures;
  if (lostSince + 1 >= EVICTION_TICKS) {
    return emitEvent(
      put(state, object, {
        ...pod,
        phase: 'Failed',
        reason: 'Evicted',
        ready: false,
        lastState: { reason: 'Evicted', exitCode: 137, finishedTick: state.tick },
      }),
      {
        level: 'error',
        reason: 'NodeNotReady',
        message: `Pod ${object.name} bị đánh dấu mất vì node ${pod.nodeName ?? '?'} không còn Ready.`,
        involvedUid: object.uid,
      },
    );
  }
  return put(state, object, { ...pod, ready: false, readinessFailures: lostSince + 1 });
}

/**
 * Đang chờ backoff.
 *
 * ⚠ `reason` ở đây chuyển sang `CrashLoopBackOff` sau ngưỡng, trong khi
 * `lastState.reason` GIỮ NGUYÊN nguyên nhân thật (`OOMKilled`). Đó không phải
 * lỗi mô hình — đó chính xác là thứ `kubectl` làm, và là lý do cột STATUS nói
 * `CrashLoopBackOff` cho cả một pod bị OOM lẫn một pod sai entrypoint. Người chơi
 * buộc phải `describe` (đọc Last State) hoặc `logs --previous` mới phân biệt
 * được — đó là bài học, không phải sự bất tiện.
 */
function waitingInBackoff(state: ClusterState, object: K8sObject, pod: PodRuntime): ClusterState {
  const looping = pod.failureStreak >= CRASH_LOOP_THRESHOLD;
  const imageIssue = pod.lastState?.reason === 'ErrImagePull' || pod.lastState?.reason === 'ImagePullBackOff';
  const reason: PodReason = imageIssue
    ? 'ImagePullBackOff'
    : looping
      ? 'CrashLoopBackOff'
      : (pod.lastState?.reason ?? 'CrashLoopBackOff');
  const phase: PodPhase = imageIssue ? 'Pending' : 'Running';
  return put(state, object, { ...pod, phase, reason, ready: false });
}

/** `restartPolicy` khác `Always` = container một-lần (pod của Job). */
function isOneShot(object: K8sObject): boolean {
  const policy = asString(object.spec['restartPolicy']);
  return policy === 'Never' || policy === 'OnFailure';
}

function runContainers(state: ClusterState, object: K8sObject, pod: PodRuntime): ClusterState {
  const containers = readContainers(object.spec, TICK_MS);
  for (const container of containers) {
    const problem = containerStartupProblem(state, object, container);
    if (problem !== null) {
      return terminate(state, object, pod, problem.reason, problem.exitCode, problem.log, problem.event, problem.eventReason);
    }
  }
  // Liveness fail: kubelet GIẾT container rồi khởi động lại. Khác readiness —
  // readiness chỉ gỡ pod khỏi endpoint, không đụng tới container.
  for (const container of containers) {
    const liveness = container.livenessProbe;
    if (liveness === null) {
      continue;
    }
    const tooEarly = liveness.initialDelayTicks < DEFAULT_STARTUP_TICKS;
    if (probeFails(container, liveness) || tooEarly) {
      return terminate(
        state,
        object,
        pod,
        'LivenessProbeFailed',
        137,
        '',
        tooEarly
          ? `Liveness probe của container ${container.name} chạy trước khi ứng dụng kịp khởi động (initialDelaySeconds quá ngắn).`
          : `Liveness probe của container ${container.name} gõ cổng ${liveness.port ?? '?'} — container không mở cổng đó.`,
        'Unhealthy',
      );
    }
  }
  const startedFor = state.tick - Math.max(pod.startedTick, 0);
  if (isOneShot(object) && startedFor >= ONE_SHOT_RUN_TICKS) {
    return emitEvent(
      put(state, object, {
        ...pod,
        phase: 'Succeeded',
        reason: null,
        ready: false,
        lastState: { reason: 'Terminated', exitCode: 0, finishedTick: state.tick },
        logs: [...pod.logs, 'Hoàn tất, thoát với mã 0.'],
      }),
      {
        level: 'info',
        reason: 'Completed',
        message: `Pod ${object.name} chạy xong và thoát với mã 0.`,
        involvedUid: object.uid,
      },
    );
  }

  // Readiness: pod VẪN Running, chỉ là chưa nhận traffic. Đây là nửa còn lại của
  // cặp dễ nhầm "Service rỗng endpoint" — xem `query.serviceEndpoints`.
  const failing = containers.find(
    (container) => container.readinessProbe !== null && probeFails(container, container.readinessProbe),
  );
  if (failing !== undefined) {
    const first = pod.reason !== 'ReadinessProbeFailed';
    const next = put(state, object, {
      ...pod,
      phase: 'Running',
      reason: 'ReadinessProbeFailed',
      ready: false,
      failureStreak: 0,
      readinessFailures: pod.readinessFailures + 1,
      logs: pod.logs.length === 0 ? ['Ứng dụng đã khởi động.'] : pod.logs,
    });
    return first
      ? emitEvent(next, {
          level: 'warning',
          reason: 'Unhealthy',
          message: `Readiness probe của pod ${object.name} thất bại — pod bị gỡ khỏi endpoint của Service.`,
          involvedUid: object.uid,
        })
      : next;
  }

  const readinessDelay = containers.reduce(
    (max, container) => Math.max(max, container.readinessProbe?.initialDelayTicks ?? 0),
    DEFAULT_STARTUP_TICKS,
  );
  const ready = startedFor >= readinessDelay;
  const becameReady = ready && !pod.ready;
  const next = put(state, object, {
    ...pod,
    phase: 'Running',
    reason: null,
    ready,
    failureStreak: 0,
    readinessFailures: 0,
    logs: pod.logs.length === 0 ? ['Ứng dụng đã khởi động.'] : pod.logs,
  });
  return becameReady
    ? emitEvent(next, {
        level: 'info',
        reason: 'Started',
        message: `Pod ${object.name} đã sẵn sàng nhận traffic.`,
        involvedUid: object.uid,
      })
    : next;
}

/**
 * Container chết. Ghi lại `lastState`, đẩy log hiện tại sang `previousLogs`, tăng
 * `restarts`, đặt lịch thử lại.
 *
 * ⚠ Log cũ được GIỮ ở `previousLogs` chứ không bị vứt. `kubectl logs` của một pod
 * đang CrashLoop gần như luôn rỗng — container mới chưa kịp ghi gì — nên
 * `logs --previous` là chỗ duy nhất còn bằng chứng. Vứt nó đi là cắt mất công cụ
 * chẩn đoán số một của cả bộ.
 */
function terminate(
  state: ClusterState,
  object: K8sObject,
  pod: PodRuntime,
  reason: PodReason,
  exitCode: number,
  log: string,
  event: string,
  eventReason: string,
): ClusterState {
  const streak = pod.failureStreak + 1;
  const oneShot = isOneShot(object);
  const policyNever = asString(object.spec['restartPolicy']) === 'Never';
  const phase: PodPhase = policyNever ? 'Failed' : pod.phase === 'Pending' ? 'Pending' : 'Running';
  const next = put(state, object, {
    ...pod,
    phase,
    reason,
    ready: false,
    restarts: policyNever ? pod.restarts : pod.restarts + 1,
    failureStreak: streak,
    lastState: { reason, exitCode, finishedTick: state.tick },
    previousLogs: log === '' ? pod.logs : [...pod.logs, log],
    logs: [],
    nextRetryTick: policyNever ? state.tick : state.tick + backoffTicks(streak),
    startedTick: policyNever ? pod.startedTick : state.tick + backoffTicks(streak),
  });
  // Chỉ phát sự kiện ở lần đầu và ở mốc CrashLoop — không thì một pod
  // CrashLoopBackOff sẽ nhấn chìm nhật ký và mọi sự cố khác biến mất khỏi màn hình.
  const notable = streak === 1 || streak === CRASH_LOOP_THRESHOLD;
  return notable
    ? emitEvent(next, {
        level: 'error',
        reason: eventReason,
        message: oneShot ? `${event} (pod một-lần, sẽ không chạy lại nếu restartPolicy là Never)` : event,
        involvedUid: object.uid,
      })
    : next;
}

/** Đánh dấu xoá — pod vào `Terminating` và biến mất sau grace period. */
export function markDeleting(state: ClusterState, object: K8sObject, graceTicks: number): ClusterState {
  const pod = podRuntime(object);
  if (pod === null) {
    return removeObjectCascade(state, object.uid);
  }
  return emitEvent(
    put(state, object, {
      ...pod,
      phase: 'Terminating',
      ready: false,
      deleteAtTick: state.tick + Math.max(0, graceTicks),
    }),
    {
      level: 'info',
      reason: 'Killing',
      message: `Đang dừng pod ${object.name} (${objectRef(object).namespace}).`,
      involvedUid: object.uid,
    },
  );
}
