/**
 * `(state, action) => state`. THUẦN, không side effect, không đồng hồ.
 *
 * ## Vì sao reducer tự tua mô phỏng tới `action.tick`
 *
 * Mỗi `GameAction` mang `tick` mà nó xảy ra. Reducer tua mô phỏng tới đúng tick
 * đó TRƯỚC khi áp hành động. Nhờ vậy `replay(level, seed, actions)` cho ra đúng
 * trạng thái mà người chơi đã thấy, mà không cần lưu thêm bất cứ thứ gì — đó
 * chính là điều kiện để xác minh chống gian lận (§8.3) hoạt động.
 *
 * Hệ quả phải nhớ: `action.tick` nhỏ hơn `state.tick` thì KHÔNG tua lùi. Mô
 * phỏng không đảo ngược được, và một `RunLog` sai thứ tự là dữ liệu hỏng chứ
 * không phải một tình huống chơi. Ta kẹp về 0 và áp hành động ở hiện tại — bản
 * lưu vẫn đọc được, và `verify.ts` của lane G sẽ thấy kết quả không khớp, đúng
 * như nó phải thấy.
 *
 * ⛔ Không `Date.now()`, không `Math.random()`, không đọc `localStorage` ở file
 * này hay bất cứ thứ gì nó gọi.
 */

import type { GameAction, Level, ResourceRef } from './contract.ts';
import type { ClusterState, K8sObject } from './model.ts';
import { seedIncidents } from './incidents.ts';
import {
  addObject,
  allocateUid,
  createCluster,
  emitEvent,
  findObject,
  newPod,
  podRuntime,
  removeObjectCascade,
  replaceObject,
} from './model.ts';
import { advance, markDeleting } from './tick.ts';
import { DEFAULT_GRACE_TICKS, templateHash } from './controllers.ts';
import { childrenOf, podsOwnedBy } from './query.ts';
import { runCommand } from './kubectl.ts';
import { parseManifests } from './yaml.ts';
import { asNumber, asString, asStringMap, isNamespaced } from './resources.ts';

/**
 * Kết quả áp một hành động.
 *
 * `accepted` trả lời đúng MỘT câu: hành động này có được GHI vào `RunLog` không.
 * Nó không phải "có tính là một nước đi không" — hai câu đó khác nhau, và gộp
 * chúng là cách hai lane đếm ra hai con số.
 *
 * | Hành động | `accepted` | Vào `RunLog` | Tính là nước đi |
 * |---|---|---|---|
 * | `apply` `delete` `scale` `edit` `kubectl` hợp lệ | `true` | có | **có** |
 * | `wait` `hint` | `true` | có | không |
 * | `kubectl` sai cú pháp | `false` | **không** | không |
 *
 * Lệnh sai cú pháp KHÔNG vào log, nên không lane nào phải nhớ loại nó ra khi
 * đếm. `parMoves` đo hiểu biết, không đo độ chính xác của bàn phím; và `wait` /
 * `hint` vẫn phải nằm trong log vì thiếu chúng thì phát lại ra một trạng thái
 * khác và một điểm số khác.
 */
export interface ReduceResult {
  readonly state: ClusterState;
  readonly output: string;
  readonly accepted: boolean;
}

/**
 * Năm loại hành động tính vào `movesUsed`.
 *
 * ⚠ Đây là SSOT của phép đếm đó. `verify.ts` của lane G đếm lại `commandsUsed`
 * từ `RunLog` để xác minh, nên hai bên PHẢI dùng cùng một tập; lệch một loại là
 * mọi lượt chơi trung thực đều bị gắn cờ gian lận.
 */
export const COMMAND_KINDS: ReadonlySet<GameAction['kind']> = new Set([
  'apply',
  'delete',
  'scale',
  'edit',
  'kubectl',
]);

export function countMoves(actions: readonly GameAction[]): number {
  return actions.filter((action) => COMMAND_KINDS.has(action.kind)).length;
}

export function countHints(actions: readonly GameAction[]): number {
  // Đếm CHỈ SỐ KHÁC NHAU, không đếm số lần bấm: mở lại gợi ý số 1 ba lần vẫn là
  // một gợi ý đã dùng. Đếm số lần bấm sẽ phạt người chơi vì đọc lại.
  return new Set(
    actions.filter((action) => action.kind === 'hint').map((action) => action.index),
  ).size;
}

export function initialState(level: Level, seed: number): ClusterState {
  /*
   * ⚠ `seedIncidents` PHẢI được gọi ở đây và chỉ ở đây.
   *
   * Đây là điểm nghẽn duy nhất mà CẢ HAI đường đi qua: phiên chơi thật
   * (`session.ts` → `initialState`) và phát lại để xác minh (`replay` ngay bên
   * dưới). Gieo ở một đường mà quên đường kia thì mọi lượt chơi THẬT THÀ đều
   * trượt xác minh, vì trạng thái đầu đã khác nhau trước cả action đầu tiên.
   *
   * Vì sao không nằm trong `createCluster`: `incidents.ts` import `model.ts`,
   * nên `model.ts` gọi ngược lại là vòng tròn.
   *
   * Bug đã sửa 2026-09-08: `seedIncidents` được export nhưng KHÔNG AI GỌI, nên
   * `state.incidents` luôn rỗng. Hệ quả im lặng: vị từ `no-incident-active`
   * đúng một cách RỖNG NGHĨA, và bảy level qua được mục tiêu đó trong khi sự cố
   * chưa từng tồn tại. Không test nào đỏ — hàm có mặt, có test riêng, chỉ là
   * không nằm trên đường chạy nào.
   */
  return seedIncidents(createCluster(level.initialState, seed), level.initialState.resources);
}

/** Tua mô phỏng tới `tick` rồi áp hành động. Xem chú thích đầu file về tua lùi. */
export function reduce(state: ClusterState, action: GameAction, namespace = 'default'): ReduceResult {
  const advanced = advance(state, Math.max(0, action.tick - state.tick));
  return apply(advanced, action, namespace);
}

function apply(state: ClusterState, action: GameAction, namespace: string): ReduceResult {
  switch (action.kind) {
    case 'wait':
      return { state: advance(state, action.ticks), output: '', accepted: true };
    case 'hint':
      // Gợi ý không đụng tới cụm. Nó vẫn nằm trong `RunLog` vì điểm số phụ thuộc
      // số gợi ý đã mở, và một `RunLog` thiếu nó sẽ phát lại ra một điểm khác.
      return { state, output: '', accepted: true };
    case 'apply':
      return applyYaml(state, action.yaml, namespace);
    case 'edit':
      return editResource(state, action.target, action.yaml, namespace);
    case 'delete':
      return deleteResource(state, action.target);
    case 'scale':
      return scaleResource(state, action.target, action.replicas);
    case 'kubectl':
      return runCommand(state, action.command, namespace);
  }
}

/** Phát lại từ số không. Đây là hàm mà `verify.ts` của lane G gọi. */
export function replay(level: Level, seed: number, actions: readonly GameAction[]): ClusterState {
  let state = initialState(level, seed);
  for (const action of actions) {
    state = reduce(state, action).state;
  }
  return state;
}

// ── apply ───────────────────────────────────────────────────────────────────

/**
 * `apply` là UPSERT, không phải create.
 *
 * Áp lại một manifest đã tồn tại thì SỬA object tại chỗ, giữ nguyên `uid` và
 * `createdTick`. Xoá-rồi-tạo-lại sẽ làm pod của một Deployment bị huỷ hết ở mỗi
 * lần sửa một nhãn, và người chơi sẽ học rằng `apply` là một thao tác nguy hiểm.
 * Đúng ngược lại: `apply` an toàn để chạy lại, và đó là cả điểm của nó.
 */
function applyYaml(state: ClusterState, yaml: string, namespace: string): ReduceResult {
  const parsed = parseManifests(yaml, namespace);
  if (!parsed.ok) {
    return { state, output: `Không áp được manifest: ${parsed.error}`, accepted: false };
  }
  let next = state;
  const lines: string[] = [];
  for (const manifest of parsed.manifests) {
    const ref: ResourceRef = {
      kind: manifest.kind,
      namespace: isNamespaced(manifest.kind) ? manifest.namespace : '',
      name: manifest.name,
    };
    const existing = findObject(next, ref);
    if (existing === null) {
      const created = createFrom(next, ref, manifest.spec);
      next = created.state;
      lines.push(`${manifest.kind.toLowerCase()}/${manifest.name} created`);
      continue;
    }
    next = replaceObject(next, {
      ...existing,
      spec: manifest.spec,
      labels: asStringMap(manifest.spec['labels']),
    });
    lines.push(`${manifest.kind.toLowerCase()}/${manifest.name} configured`);
  }
  return { state: next, output: lines.join('\n'), accepted: true };
}

function createFrom(
  state: ClusterState,
  ref: ResourceRef,
  spec: Readonly<Record<string, unknown>>,
): { state: ClusterState; object: K8sObject } {
  const allocated = allocateUid(state);
  const object: K8sObject = {
    uid: allocated.uid,
    kind: ref.kind,
    name: ref.name,
    namespace: ref.namespace,
    labels: asStringMap(spec['labels']),
    spec,
    ownerUid: null,
    createdTick: state.tick,
    runtime:
      ref.kind === 'Pod'
        ? { kind: 'pod', pod: newPod(asString(spec['nodeName'])) }
        : ref.kind === 'PersistentVolumeClaim'
          ? { kind: 'pvc', boundVolume: asString(spec['volumeName']) }
          : ref.kind === 'Job'
            ? { kind: 'job', succeeded: 0, failed: 0, startedTick: state.tick }
            : ref.kind === 'CronJob'
              ? { kind: 'cronjob', lastScheduleTick: -1 }
              : { kind: 'none' },
  };
  return { state: addObject(allocated.state, object), object };
}

// ── edit ────────────────────────────────────────────────────────────────────

function editResource(
  state: ClusterState,
  target: ResourceRef,
  yaml: string,
  namespace: string,
): ReduceResult {
  const existing = findObject(state, normalize(target, namespace));
  if (existing === null) {
    return { state, output: notFound(target), accepted: false };
  }
  const parsed = parseManifests(yaml, target.namespace === '' ? namespace : target.namespace);
  if (!parsed.ok) {
    return { state, output: `Không lưu được thay đổi: ${parsed.error}`, accepted: false };
  }
  const manifest = parsed.manifests[0];
  if (manifest === undefined) {
    return { state, output: 'Không lưu được thay đổi: YAML rỗng.', accepted: false };
  }
  // `edit` KHÔNG cho đổi định danh. Sửa `metadata.name` trong `kubectl edit` ở
  // cụm thật bị API server từ chối; cho phép ở đây sẽ dạy rằng đổi tên là một
  // thao tác tại chỗ, trong khi thật ra nó là xoá-và-tạo-mới.
  if (manifest.name !== existing.name || manifest.kind !== existing.kind) {
    return {
      state,
      output: 'Không đổi được `kind` hay `metadata.name` bằng `edit` — hãy xoá rồi tạo lại.',
      accepted: false,
    };
  }
  return {
    state: replaceObject(state, {
      ...existing,
      spec: manifest.spec,
      labels: asStringMap(manifest.spec['labels']),
    }),
    output: `${existing.kind.toLowerCase()}/${existing.name} edited`,
    accepted: true,
  };
}

// ── delete ──────────────────────────────────────────────────────────────────

/**
 * Pod đi qua `Terminating` (30 giây grace) rồi mới biến mất; loại khác biến mất
 * ngay.
 *
 * Cửa sổ grace là thứ repo đã trả giá để học: một cổng chỉ đọc `phase` coi pod
 * `Terminating` là còn sống và bỏ lọt đúng 30 giây đó. Cắt nó đi cho gọn là bỏ
 * mất một trạng thái CÓ THẬT mà người vận hành gặp hằng ngày.
 */
function deleteResource(state: ClusterState, target: ResourceRef): ReduceResult {
  const existing = findObject(state, target);
  if (existing === null) {
    return { state, output: notFound(target), accepted: false };
  }
  const output = `${existing.kind.toLowerCase()} "${existing.name}" deleted`;
  if (existing.kind === 'Pod') {
    return { state: markDeleting(state, existing, DEFAULT_GRACE_TICKS), output, accepted: true };
  }
  return {
    state: emitEvent(removeObjectCascade(state, existing.uid), {
      level: 'info',
      reason: 'Deleted',
      message: `Đã xoá ${existing.kind} ${existing.name} và mọi object nó sở hữu.`,
      involvedUid: null,
    }),
    output,
    accepted: true,
  };
}

function normalize(ref: ResourceRef, namespace: string): ResourceRef {
  if (!isNamespaced(ref.kind)) {
    return { ...ref, namespace: '' };
  }
  return ref.namespace === '' ? { ...ref, namespace } : ref;
}

function notFound(ref: ResourceRef): string {
  return `Không tìm thấy ${ref.kind} "${ref.name}" trong namespace ${ref.namespace || 'default'}.`;
}

// ── scale ───────────────────────────────────────────────────────────────────

/**
 * `scale` chỉ áp cho tài nguyên CÓ `replicas`, và đặt số mong muốn — nó không tự
 * tạo hay xoá pod. Việc đó là của controller ở tick sau.
 *
 * Tách hai việc đó ra không phải để cho gọn: đó chính là mô hình mà Kubernetes
 * dạy. `kubectl scale` ghi một con số vào `spec`; vòng điều hoà mới là thứ làm
 * thế giới khớp với con số đó, và nó có thể KHÔNG làm được (hết tài nguyên, vướng
 * quota). Nếu `scale` tự đẻ pod ngay thì người chơi sẽ học rằng ra lệnh là xong,
 * và sẽ không hiểu vì sao `kubectl get deploy` hiện `2/5`.
 */
function scaleResource(state: ClusterState, target: ResourceRef, replicas: number): ReduceResult {
  const existing = findObject(state, target);
  if (existing === null) {
    return { state, output: notFound(target), accepted: false };
  }
  const scalable =
    existing.kind === 'Deployment' ||
    existing.kind === 'ReplicaSet' ||
    existing.kind === 'StatefulSet';
  if (!scalable) {
    return {
      state,
      output: `Không scale được ${existing.kind} — chỉ Deployment, ReplicaSet và StatefulSet có \`replicas\`.`,
      accepted: false,
    };
  }
  if (!Number.isFinite(replicas) || replicas < 0) {
    return { state, output: 'Số replica phải là một số nguyên không âm.', accepted: false };
  }
  const desired = Math.trunc(replicas);
  const before = asNumber(existing.spec['replicas']) ?? 1;
  const next = replaceObject(state, {
    ...existing,
    spec: { ...existing.spec, replicas: desired },
  });
  return {
    state: emitEvent(next, {
      level: 'info',
      reason: 'ScalingReplicaSet',
      message: `Đổi số replica mong muốn của ${existing.kind} ${existing.name} từ ${before} sang ${desired}.`,
      involvedUid: existing.uid,
    }),
    output: `${existing.kind.toLowerCase()}.apps/${existing.name} scaled`,
    accepted: true,
  };
}

// ── rollout ─────────────────────────────────────────────────────────────────

/**
 * `rollout restart` đổi template để sinh ra một `pod-template-hash` MỚI, đúng
 * cách kubectl thật làm: nó ghi một annotation `kubectl.kubernetes.io/
 * restartedAt`. Không có gì "khởi động lại" ở đây — Deployment chỉ thấy một
 * template khác và chạy một rollout bình thường. Đó là chi tiết đáng dạy: mọi
 * thứ trong Kubernetes đều là điều hoà về trạng thái mong muốn, kể cả những lệnh
 * nghe như mệnh lệnh.
 */
export function rolloutRestart(state: ClusterState, target: ResourceRef): ReduceResult {
  const existing = findObject(state, target);
  if (existing === null || existing.kind !== 'Deployment') {
    return { state, output: notFound(target), accepted: false };
  }
  const template = existing.spec['template'];
  if (typeof template !== 'object' || template === null) {
    return { state, output: `Deployment ${existing.name} không có template.`, accepted: false };
  }
  const stamped = {
    ...(template as Record<string, unknown>),
    'kubectl.kubernetes.io/restartedAt': `tick-${state.tick}`,
  };
  return {
    state: replaceObject(state, { ...existing, spec: { ...existing.spec, template: stamped } }),
    output: `deployment.apps/${existing.name} restarted`,
    accepted: true,
  };
}

/**
 * `rollout undo` trả template về ReplicaSet có `revision` cao thứ hai.
 *
 * Không lưu một "lịch sử revision" riêng: ReplicaSet CHÍNH LÀ lịch sử đó, và đó
 * là lý do Kubernetes giữ lại các RS cũ với `replicas: 0` thay vì xoá chúng. Một
 * bảng lịch sử song song sẽ là dữ liệu suy ra được, và sẽ nói dối ngay lần đầu
 * ai đó xoá tay một RS.
 */
export function rolloutUndo(state: ClusterState, target: ResourceRef): ReduceResult {
  const existing = findObject(state, target);
  if (existing === null || existing.kind !== 'Deployment') {
    return { state, output: notFound(target), accepted: false };
  }
  const currentHash = templateHash(existing.spec['template']);
  const history = childrenOf(state, existing.uid)
    .filter((rs) => rs.kind === 'ReplicaSet' && !rs.name.endsWith(currentHash))
    .sort((a, b) => (asNumber(b.spec['revision']) ?? 0) - (asNumber(a.spec['revision']) ?? 0));
  const previous = history[0];
  if (previous === undefined) {
    return {
      state,
      output: `Deployment ${existing.name} chưa có revision trước để quay về.`,
      accepted: false,
    };
  }
  return {
    state: replaceObject(state, {
      ...existing,
      spec: { ...existing.spec, template: previous.spec['template'] },
    }),
    output: `deployment.apps/${existing.name} rolled back`,
    accepted: true,
  };
}

/** Rollout đã xong khi số pod SẴN SÀNG của RS hiện tại bằng số mong muốn. */
export function rolloutStatus(state: ClusterState, target: ResourceRef): string {
  const existing = findObject(state, target);
  if (existing === null) {
    return notFound(target);
  }
  const desired = asNumber(existing.spec['replicas']) ?? 1;
  const hash = templateHash(existing.spec['template']);
  const current = childrenOf(state, existing.uid).find((rs) => rs.name.endsWith(hash));
  if (current === undefined) {
    return `Waiting for deployment "${existing.name}" rollout to start...`;
  }
  const ready = podsOwnedBy(state, current.uid).filter(
    (pod) => podRuntime(pod)?.ready === true,
  ).length;
  return ready >= desired
    ? `deployment "${existing.name}" successfully rolled out`
    : `Waiting for deployment "${existing.name}" rollout to finish: ${ready} of ${desired} updated replicas are available...`;
}
