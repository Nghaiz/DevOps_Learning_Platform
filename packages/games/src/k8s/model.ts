/**
 * Trạng thái cụm LÚC CHẠY. Khác `ClusterSpec` của `contract.ts`, vốn là mô tả
 * KHAI BÁO và serialize được của một level.
 *
 * ## Ba trục trạng thái pod, không phải hai
 *
 * `contract.ts` đã tách `phase` khỏi `reason` và giải thích vì sao. Mô phỏng cần
 * thêm hai trục nữa, và đây là chỗ giá trị sư phạm thật sự nằm:
 *
 * | Trục | Ai đọc được | Vì sao phải tách |
 * |---|---|---|
 * | `phase` | `kubectl get` | `Running` không nói gì về việc container có khoẻ không |
 * | `reason` | `kubectl get` cột STATUS | `CrashLoopBackOff` là trạng thái CONTAINER, chưa bao giờ là phase |
 * | `ready` | `kubectl get` cột READY | Running-nhưng-chưa-Ready là trạng thái THẬT, và là lý do Service rỗng endpoint |
 * | `lastState` | CHỈ `kubectl describe` | `OOMKilled` + exit 137 nằm ở **Last State**, không ở Current State |
 *
 * Trục `lastState` là thứ làm ba sự cố dễ nhầm nhất phân biệt được:
 * CrashLoopBackOff (entrypoint sai), OOMKilled (thiếu RAM) và LivenessProbeFailed
 * (probe quá gắt) đều cho ra ĐÚNG một triệu chứng ở `kubectl get` — restart tăng
 * dần, không bao giờ Ready. Người chơi buộc phải `describe` hoặc
 * `logs --previous` mới phân biệt được, đúng như ở cụm thật. Gộp ba trục lại là
 * xoá mất chính bài học đó.
 */

import type { RngState } from '../core/rng.ts';
import { seedRng } from '../core/rng.ts';
import type {
  ClusterSpec,
  IncidentKind,
  PodPhase,
  PodReason,
  ResourceKind,
  ResourceRef,
} from './contract.ts';
import { asStringMap, asString, isNamespaced } from './resources.ts';

/** Số sự kiện giữ lại. Chaos mode chạy vô hạn, nên mảng này PHẢI có trần. */
export const EVENT_LIMIT = 240;

export interface NodeState {
  readonly name: string;
  /** milli-core. */
  readonly cpu: number;
  /** MiB. */
  readonly memory: number;
  readonly ready: boolean;
  readonly labels: Readonly<Record<string, string>>;
  /** Dạng `khoa=gia-tri:NoSchedule`, đúng như `kubectl taint` in ra. */
  readonly taints: readonly string[];
  /** `true` = đã cordon; scheduler bỏ qua nhưng pod đang chạy vẫn ở lại. */
  readonly unschedulable: boolean;
}

/** Kết quả lần chạy TRƯỚC của container. Chỉ `describe` và `logs --previous` thấy. */
export interface TerminationState {
  readonly reason: PodReason;
  /** 137 = SIGKILL (OOM), 1 = lỗi ứng dụng, 0 = kết thúc bình thường. */
  readonly exitCode: number;
  readonly finishedTick: number;
}

export interface PodRuntime {
  readonly phase: PodPhase;
  readonly reason: PodReason | null;
  /** Đã qua readiness probe. TÁCH khỏi `phase`; xem bảng ở đầu file. */
  readonly ready: boolean;
  readonly nodeName: string | null;
  readonly restarts: number;
  /** Tick container hiện tại bắt đầu. `-1` = chưa từng chạy. */
  readonly startedTick: number;
  /** Tick sớm nhất được thử lại. Backoff luỹ thừa, đúng như kubelet. */
  readonly nextRetryTick: number;
  readonly lastState: TerminationState | null;
  /** Tick pod hết grace period và biến mất. `-1` = không đang bị xoá. */
  readonly deleteAtTick: number;
  /** Số lần fail LIÊN TIẾP. Đủ ngưỡng thì `reason` thành `CrashLoopBackOff`. */
  readonly failureStreak: number;
  /** Số tick probe readiness fail liên tiếp. */
  readonly readinessFailures: number;
  readonly livenessFailures: number;
  readonly logs: readonly string[];
  /** Log của lần chạy trước — `kubectl logs --previous`. */
  readonly previousLogs: readonly string[];
}

/**
 * Trạng thái lúc chạy theo loại. Union phân biệt chứ không phải một đống field
 * tuỳ chọn trên mọi object: một Service mang `restarts` là một lời nói dối trong
 * kiểu, và `exactOptionalPropertyTypes` sẽ bắt ta viết `?? undefined` ở mọi chỗ
 * đọc để đổi lấy đúng lời nói dối đó.
 */
export type Runtime =
  | { readonly kind: 'pod'; readonly pod: PodRuntime }
  /** PVC: tên PV đã bind. `null` = Pending. */
  | { readonly kind: 'pvc'; readonly boundVolume: string | null }
  | {
      readonly kind: 'job';
      readonly succeeded: number;
      readonly failed: number;
      readonly startedTick: number;
    }
  | { readonly kind: 'cronjob'; readonly lastScheduleTick: number }
  | { readonly kind: 'none' };

export interface K8sObject {
  /** Nội bộ engine. KHÔNG vào `RunLog` — `ResourceRef` mới là khoá bền của hợp đồng. */
  readonly uid: string;
  readonly kind: ResourceKind;
  readonly name: string;
  /** Chuỗi rỗng cho tài nguyên phạm vi cluster. */
  readonly namespace: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly spec: Readonly<Record<string, unknown>>;
  readonly ownerUid: string | null;
  readonly createdTick: number;
  readonly runtime: Runtime;
}

export interface ClusterEvent {
  readonly tick: number;
  readonly level: 'info' | 'warning' | 'error';
  /** Tiếng Việt — thứ người chơi đọc. */
  readonly message: string;
  /**
   * Reason kiểu Kubernetes, giữ TIẾNG ANH: `Scheduled`, `BackOff`, `Unhealthy`,
   * `FailedScheduling`. Đây là chuỗi thật của API, và người học sẽ gặp lại đúng
   * chuỗi đó khi chạy `kubectl get events` trên một cụm thật — dịch nó ra tiếng
   * Việt là dạy một từ vựng không tồn tại.
   */
  readonly reason: string;
  readonly involvedUid: string | null;
}

export interface ActiveIncident {
  readonly kind: IncidentKind;
  readonly targetUid: string;
  readonly startedTick: number;
  /** `null` = còn hoạt động. Đã xử lý xong thì GIỮ LẠI bản ghi, không xoá. */
  readonly resolvedTick: number | null;
}

export interface ClusterState {
  readonly tick: number;
  readonly rng: RngState;
  readonly nodes: readonly NodeState[];
  readonly namespaces: readonly string[];
  /** ⚠ LUÔN sắp theo `compareObjects`. Xem chú thích ở hàm đó. */
  readonly objects: readonly K8sObject[];
  readonly events: readonly ClusterEvent[];
  readonly incidents: readonly ActiveIncident[];
  /** Bộ đếm cấp uid. Tăng dần ⇒ uid tất định theo chuỗi action. */
  readonly nextUid: number;
}

// ── Khoá và thứ tự ──────────────────────────────────────────────────────────

export function refKey(ref: ResourceRef): string {
  return `${ref.kind}/${ref.namespace}/${ref.name}`;
}

export function objectRef(object: K8sObject): ResourceRef {
  return { kind: object.kind, namespace: object.namespace, name: object.name };
}

/**
 * Thứ tự TOÀN PHẦN theo (kind, namespace, name) — khoá tự nhiên của Kubernetes,
 * nên không bao giờ hoà.
 *
 * ⛔ `state.objects` phải luôn sắp theo hàm này, và mọi chỗ chèn/sửa phải sắp
 * lại. Lý do là tính tất định: giữ thứ tự CHÈN thì hai chuỗi action cho ra cùng
 * tập object vẫn có thể cho ra hai mảng khác thứ tự, và `ClusterView` — thứ mà
 * xác minh chống gian lận (§8.3) so bằng giá trị — sẽ khác nhau ở hai lần phát
 * lại hợp lệ. Triệu chứng sẽ là "điểm thật bị báo gian lận", và không có gì trong
 * log chỉ về đây.
 *
 * So bằng `<`/`>` chứ không `localeCompare`: `localeCompare` phụ thuộc locale
 * của máy, và repo đã trả giá đúng một lần cho việc Postgres và JS không đồng ý
 * về thứ tự tiếng Việt. Ở đây tên tài nguyên là ASCII theo luật K8s, nên thứ tự
 * mã điểm vừa đủ và vừa ổn định trên mọi máy.
 */
export function compareObjects(a: K8sObject, b: K8sObject): number {
  if (a.kind !== b.kind) {
    return a.kind < b.kind ? -1 : 1;
  }
  if (a.namespace !== b.namespace) {
    return a.namespace < b.namespace ? -1 : 1;
  }
  if (a.name !== b.name) {
    return a.name < b.name ? -1 : 1;
  }
  return 0;
}

function sorted(objects: readonly K8sObject[]): readonly K8sObject[] {
  return [...objects].sort(compareObjects);
}

// ── Truy vấn cơ bản ─────────────────────────────────────────────────────────

export function findObject(state: ClusterState, ref: ResourceRef): K8sObject | null {
  const key = refKey(ref);
  return state.objects.find((object) => refKey(objectRef(object)) === key) ?? null;
}

export function findByUid(state: ClusterState, uid: string): K8sObject | null {
  return state.objects.find((object) => object.uid === uid) ?? null;
}

export function findNode(state: ClusterState, name: string): NodeState | null {
  return state.nodes.find((node) => node.name === name) ?? null;
}

/** Pod thật sự tồn tại — bỏ pod đang chờ hết grace period. Xem `isDoomed`. */
export function podRuntime(object: K8sObject): PodRuntime | null {
  return object.runtime.kind === 'pod' ? object.runtime.pod : null;
}

/**
 * ⚠ "Đang sống" KHÔNG chỉ là `phase === 'Running'`.
 *
 * Repo đã trả giá đúng ở đây: một cổng chỉ đọc `phase` coi pod `Terminating` là
 * còn sống và bỏ lọt cửa sổ grace. Hàm này tồn tại để không chỗ nào phải tự viết
 * lại phép so sánh đó.
 */
export function isDoomed(pod: PodRuntime): boolean {
  return pod.phase === 'Terminating' || pod.deleteAtTick >= 0;
}

export function isTerminal(pod: PodRuntime): boolean {
  return pod.phase === 'Succeeded' || pod.phase === 'Failed';
}

// ── Biến đổi bất biến ───────────────────────────────────────────────────────

export function addObject(state: ClusterState, object: K8sObject): ClusterState {
  return { ...state, objects: sorted([...state.objects, object]) };
}

export function replaceObject(state: ClusterState, object: K8sObject): ClusterState {
  const objects = state.objects.map((item) => (item.uid === object.uid ? object : item));
  return { ...state, objects: sorted(objects) };
}

/** Xoá theo uid. Object con (`ownerUid` trỏ tới nó) bị xoá theo — cascade thật của K8s. */
export function removeObjectCascade(state: ClusterState, uid: string): ClusterState {
  const doomed = new Set<string>([uid]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const object of state.objects) {
      if (object.ownerUid !== null && doomed.has(object.ownerUid) && !doomed.has(object.uid)) {
        doomed.add(object.uid);
        grew = true;
      }
    }
  }
  return { ...state, objects: state.objects.filter((object) => !doomed.has(object.uid)) };
}

export function emitEvent(
  state: ClusterState,
  event: Omit<ClusterEvent, 'tick'> & { readonly tick?: number },
): ClusterState {
  const full: ClusterEvent = {
    tick: event.tick ?? state.tick,
    level: event.level,
    message: event.message,
    reason: event.reason,
    involvedUid: event.involvedUid,
  };
  const events = [...state.events, full];
  return { ...state, events: events.length > EVENT_LIMIT ? events.slice(-EVENT_LIMIT) : events };
}

export function allocateUid(state: ClusterState): { uid: string; state: ClusterState } {
  return { uid: `o${state.nextUid}`, state: { ...state, nextUid: state.nextUid + 1 } };
}

// ── Dựng trạng thái ban đầu ─────────────────────────────────────────────────

const PHASES: readonly PodPhase[] = ['Pending', 'Running', 'Succeeded', 'Failed', 'Terminating'];

function readSeededPhase(spec: Readonly<Record<string, unknown>>): PodPhase | null {
  const raw = asString(spec['phase']);
  return raw !== null && (PHASES as readonly string[]).includes(raw) ? (raw as PodPhase) : null;
}

/**
 * Pod mới sinh. `phase: 'Pending'` và `reason: null` — KHÔNG phải
 * `ContainerCreating`: một pod vừa được API server nhận nhưng chưa được xếp lịch
 * thì chưa có container nào để mà "đang tạo". `ContainerCreating` chỉ xuất hiện
 * SAU khi scheduler đã gán node, và giữ đúng thứ tự đó là điều kiện để level 1
 * dạy được vòng đời pod.
 */
export function newPod(nodeName: string | null): PodRuntime {
  return {
    phase: 'Pending',
    reason: null,
    ready: false,
    nodeName,
    restarts: 0,
    startedTick: -1,
    nextRetryTick: 0,
    lastState: null,
    deleteAtTick: -1,
    failureStreak: 0,
    readinessFailures: 0,
    livenessFailures: 0,
    logs: [],
    previousLogs: [],
  };
}

/** Pod gieo sẵn ở một phase kết thúc — cách level 04 dựng ba pod ba trạng thái. */
function seededPod(phase: PodPhase, nodeName: string | null): PodRuntime {
  const base = newPod(nodeName);
  if (phase === 'Succeeded') {
    return {
      ...base,
      phase,
      startedTick: 0,
      lastState: { reason: 'Terminated', exitCode: 0, finishedTick: 0 },
      logs: ['Hoàn tất, thoát với mã 0.'],
    };
  }
  if (phase === 'Failed') {
    return {
      ...base,
      phase,
      startedTick: 0,
      lastState: { reason: 'Terminated', exitCode: 1, finishedTick: 0 },
      logs: ['Kết thúc trong lỗi, thoát với mã 1.'],
    };
  }
  if (phase === 'Running') {
    return { ...base, phase, ready: true, startedTick: 0 };
  }
  return { ...base, phase };
}

function initialRuntime(
  kind: ResourceKind,
  spec: Readonly<Record<string, unknown>>,
  tick: number,
): Runtime {
  if (kind === 'Pod') {
    const phase = readSeededPhase(spec);
    const nodeName = asString(spec['nodeName']);
    return {
      kind: 'pod',
      pod: phase === null ? newPod(nodeName) : seededPod(phase, nodeName),
    };
  }
  if (kind === 'PersistentVolumeClaim') {
    return { kind: 'pvc', boundVolume: asString(spec['volumeName']) };
  }
  if (kind === 'Job') {
    return { kind: 'job', succeeded: 0, failed: 0, startedTick: tick };
  }
  if (kind === 'CronJob') {
    return { kind: 'cronjob', lastScheduleTick: -1 };
  }
  return { kind: 'none' };
}

/**
 * `ClusterSpec` (khai báo, của level) → `ClusterState` (lúc chạy).
 *
 * ⚠ Namespace của tài nguyên phạm vi cluster bị ÉP về chuỗi rỗng ngay ở đây, dù
 * level có ghi gì. Nếu không, `refKey` của cùng một Node sẽ khác nhau tuỳ level
 * viết `namespace: ''` hay `namespace: 'default'`, và mọi vị từ tra theo khoá sẽ
 * trượt ở đúng một nửa số level — dạng lỗi chỉ lộ ra ở level thứ hai mươi.
 */
export function createCluster(spec: ClusterSpec, seed: number): ClusterState {
  let nextUid = 0;
  const objects: K8sObject[] = [];
  for (const resource of spec.resources) {
    const namespace = isNamespaced(resource.kind) ? resource.namespace : '';
    objects.push({
      uid: `o${nextUid}`,
      kind: resource.kind,
      name: resource.name,
      namespace,
      labels: asStringMap(resource.spec['labels']),
      spec: resource.spec,
      ownerUid: null,
      createdTick: 0,
      runtime: initialRuntime(resource.kind, resource.spec, 0),
    });
    nextUid += 1;
  }
  return {
    tick: 0,
    rng: seedRng(seed),
    nodes: spec.nodes.map((node) => ({
      name: node.name,
      cpu: node.cpu,
      memory: node.memory,
      ready: node.ready,
      labels: node.labels ?? {},
      taints: node.taints ?? [],
      unschedulable: false,
    })),
    // `default` luôn tồn tại trong mọi cụm Kubernetes thật. Level không cần khai
    // báo lại, nhưng cũng không được có hai bản ghi nếu nó khai.
    namespaces: [...new Set(['default', ...spec.namespaces])].sort(),
    objects: sorted(objects),
    events: [],
    incidents: [],
    nextUid,
  };
}
