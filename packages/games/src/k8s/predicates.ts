/**
 * Hiện thực 31 vị từ mà `Objective.check` gọi tên.
 *
 * ## Ba luật chi phối cả file
 *
 * 1. **THUẦN và CHỈ ĐỌC.** Không vị từ nào sinh state mới. Một vị từ có tác dụng
 *    phụ sẽ làm phát lại ra kết quả khác lần chơi thật, và cơ chế chống gian lận
 *    sụp theo.
 * 2. **Thiếu tham số thì trả `false`, KHÔNG ném.** Một level viết sai chỉ được
 *    phép làm hỏng một mục tiêu, không được làm sập phiên chơi của người dùng.
 * 3. **Không mục tiêu nào được thoả bằng cách XOÁ bằng chứng.** Đây là luật đắt
 *    nhất và nó quyết định nhiều lựa chọn dưới đây: `pod-not-on-node` đòi pod
 *    phải tồn tại, `pod-no-reason` đòi có ít nhất một pod khớp, `replicas-at-least`
 *    chặn việc "sửa" ba pod kẹt bằng cách hạ xuống còn một. Một vị từ đúng theo
 *    nghĩa đen mà thoả được bằng `kubectl delete` là một bài học bị xoá.
 *
 * ## Vì sao mọi phép tính đi qua `query.ts`
 *
 * `readyPods`, `serviceEndpoints`, `podsOwnedBy`, `namespaceUsage` đã mang sẵn
 * những quyết định mà tính lại tay sẽ làm sai: endpoint phải lọc theo `ready`,
 * pod của Deployment nằm dưới MỘT tầng ReplicaSet, pod đã kết thúc không còn giữ
 * tài nguyên. Viết lại chúng ở đây là cách hai chỗ trong cùng một engine trả lời
 * khác nhau cho cùng một câu hỏi.
 */

import type { IncidentKind, ResourceKind } from './contract.ts';
import type { Predicate, PredicateTable } from './engine-boundary.ts';
import type { ClusterState, K8sObject } from './model.ts';
import { findByUid, findNode, findObject, objectRef, podRuntime } from './model.ts';
import {
  livePods,
  matchLabels,
  namespaceUsage,
  objectsOfKind,
  podsMatching,
  podsOwnedBy,
  readyPods,
  serviceEndpoints,
  workloadTemplate,
} from './query.ts';
import { hpaHasMetrics } from './controllers.ts';
import { TICK_MS } from './tick.ts';
import { INCIDENTS } from './incidents.ts';
import type { ContainerSpec } from './resources.ts';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  asStringMap,
  isNamespaced,
  parseCpu,
  parseMemory,
  readContainers,
  readSelector,
  resolveKind,
} from './resources.ts';

// ── Đọc tham số ─────────────────────────────────────────────────────────────

type Args = Readonly<Record<string, unknown>>;

function argString(args: Args, key: string): string | null {
  const value = asString(args[key]);
  return value === null || value === '' ? null : value;
}

function argNumber(args: Args, key: string): number | null {
  return asNumber(args[key]);
}

function argKind(args: Args, key = 'kind'): ResourceKind | null {
  const raw = argString(args, key);
  return raw === null ? null : resolveKind(raw);
}

/**
 * `labelSelector` tới từ level ở dạng CHUỖI (`'app=web'`), không phải map.
 *
 * ⚠ Hợp đồng ở `predicate-names.ts` chỉ ghi `labelSelector?` mà không nói dạng,
 * và mọi level đã viết đều dùng chuỗi kiểu `-l` của kubectl. Nhận cả hai dạng ở
 * đây là rẻ; bắt lane C sửa 9 level cho khớp một kiểu dữ liệu nội bộ thì không.
 * Chuỗi rỗng ⇒ map rỗng ⇒ KHỚP MỌI POD, đúng như `kubectl get pods -l ''`.
 */
function argSelector(args: Args, key = 'labelSelector'): Readonly<Record<string, string>> | null {
  const raw = args[key];
  if (raw === undefined || raw === null) {
    return null;
  }
  const text = asString(raw);
  if (text !== null) {
    const out: Record<string, string> = {};
    for (const part of text.split(',')) {
      const index = part.indexOf('=');
      if (index > 0) {
        out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
      }
    }
    return out;
  }
  const map = asStringMap(raw);
  return Object.keys(map).length === 0 && asRecord(raw) === null ? null : map;
}

/** Tra object theo khoá tự nhiên; loại phạm vi cluster luôn mang namespace rỗng. */
function lookup(
  state: ClusterState,
  kind: ResourceKind,
  name: string,
  namespace: string,
): K8sObject | null {
  return findObject(state, { kind, namespace: isNamespaced(kind) ? namespace : '', name });
}

/**
 * Container của một object, dù nó là Pod hay một workload có `template`.
 *
 * Gộp hai đường ở đây vì mọi vị từ hỏi về container (`container-image-is`,
 * `resource-limits-set`, `probe-configured`) đều được level gọi với CẢ HAI loại —
 * `{kind: 'Pod'}` ở chương 1, `{kind: 'Deployment'}` từ chương 2 trở đi.
 */
function containersOf(object: K8sObject): readonly ContainerSpec[] {
  const template = workloadTemplate(object);
  return readContainers(template ?? object.spec, TICK_MS);
}

/**
 * "Pod đang chạy khoẻ" — `phase === 'Running'` VÀ không mang `reason`.
 *
 * ⚠ Chỉ đọc `phase` là sai, và sai theo đúng cách nguy hiểm nhất: một pod
 * `CrashLoopBackOff` có `phase` là `Running` ở Kubernetes thật (container đang
 * Waiting, còn pod thì đã được xếp lịch và đang tồn tại trên node). Một vị từ
 * `pod-running` chỉ nhìn `phase` sẽ TÍCH XANH cho đúng cái pod mà cả level đang
 * bảo người chơi đi sửa.
 */
function isHealthyRunning(object: K8sObject): boolean {
  const pod = podRuntime(object);
  return pod !== null && pod.phase === 'Running' && pod.reason === null;
}

function podsInScope(state: ClusterState, args: Args): readonly K8sObject[] | null {
  const namespace = argString(args, 'namespace');
  if (namespace === null) {
    return null;
  }
  const name = argString(args, 'name');
  const selector = argSelector(args);
  const pods = livePods(state, namespace);
  if (name !== null) {
    return pods.filter((pod) => pod.name === name);
  }
  return selector === null ? pods : pods.filter((pod) => matchLabels(pod.labels, selector));
}

// ── Tồn tại ─────────────────────────────────────────────────────────────────

const resourceExists: Predicate = (state, args) => {
  const kind = argKind(args);
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace') ?? '';
  return kind !== null && name !== null && lookup(state, kind, name, namespace) !== null;
};

const resourceAbsent: Predicate = (state, args) => {
  const kind = argKind(args);
  const name = argString(args, 'name');
  // Tham số hỏng ⇒ `false`, KHÔNG phải "vắng mặt là đúng". Một level gõ sai tên
  // khoá sẽ tích xanh vĩnh viễn nếu ta trả `true` cho trường hợp không đọc được.
  if (kind === null || name === null) {
    return false;
  }
  return lookup(state, kind, name, argString(args, 'namespace') ?? '') === null;
};

// ── Pod ─────────────────────────────────────────────────────────────────────

const podRunning: Predicate = (state, args) => {
  const pods = podsInScope(state, args);
  return pods !== null && pods.some(isHealthyRunning);
};

const podCountRunning: Predicate = (state, args) => {
  const namespace = argString(args, 'namespace');
  const selector = argSelector(args);
  const min = argNumber(args, 'min');
  if (namespace === null || selector === null || min === null) {
    return false;
  }
  return podsMatching(state, namespace, selector).filter(isHealthyRunning).length >= min;
};

/**
 * Không pod khớp nào mang `reason` — VÀ phải có ít nhất một pod khớp.
 *
 * Vế thứ hai không có trong hợp đồng và được thêm có chủ ý: "không pod nào mang
 * reason" đúng theo nghĩa đen khi KHÔNG CÒN POD NÀO, nên một người chơi xoá sạch
 * pod hỏng sẽ tích xanh mà chưa sửa gì. Vắng-mặt không phải là khoẻ-mạnh.
 */
const podNoReason: Predicate = (state, args) => {
  const pods = podsInScope(state, args);
  if (pods === null || pods.length === 0) {
    return false;
  }
  return pods.every((object) => podRuntime(object)?.reason == null);
};

const podOnNode: Predicate = (state, args) => {
  const pods = podsInScope(state, args);
  const nodeName = argString(args, 'nodeName');
  if (pods === null || nodeName === null || pods.length === 0) {
    return false;
  }
  return pods.some((object) => podRuntime(object)?.nodeName === nodeName);
};

/**
 * Pod KHÔNG nằm trên node đó — nhưng pod vẫn phải tồn tại.
 *
 * Bỏ vế "tồn tại" thì `kubectl delete pod` thoả mục tiêu ngay lập tức, trong khi
 * level đang dạy cách DỜI một pod (nodeSelector, taint, cordon). Đây là ví dụ
 * thẳng thắn nhất của luật số 3 ở đầu file.
 */
const podNotOnNode: Predicate = (state, args) => {
  const pods = podsInScope(state, args);
  const nodeName = argString(args, 'nodeName');
  if (pods === null || nodeName === null || pods.length === 0) {
    return false;
  }
  return pods.every((object) => podRuntime(object)?.nodeName !== nodeName);
};

const allPodsHealthy: Predicate = (state, args) => {
  const namespace = argString(args, 'namespace');
  if (namespace === null) {
    return false;
  }
  const pods = livePods(state, namespace);
  if (pods.length === 0) {
    return false;
  }
  // Pod đã `Succeeded` là kết quả ĐÚNG của một Job, không phải một pod ốm. Tính
  // nó là không-khoẻ sẽ làm mọi level có Job không bao giờ qua được.
  return pods.every(
    (object) => isHealthyRunning(object) || podRuntime(object)?.phase === 'Succeeded',
  );
};

// ── Workload ────────────────────────────────────────────────────────────────

/**
 * Đủ replica SẴN SÀNG, đếm qua tầng ReplicaSet.
 *
 * `podsOwnedBy` đi xuống hai tầng vì Deployment không sở hữu Pod trực tiếp. Đếm
 * `spec.replicas` thay cho pod Ready sẽ tích xanh ngay lúc người chơi gõ
 * `--replicas=3`, tức là trước khi có bất kỳ pod nào lên — và đó chính là khác
 * biệt giữa "mong muốn" và "thực tế" mà cả chương 2 dạy.
 */
const deploymentReady: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const replicas = argNumber(args, 'replicas');
  if (name === null || namespace === null || replicas === null) {
    return false;
  }
  const deployment = lookup(state, 'Deployment', name, namespace);
  if (deployment === null) {
    return false;
  }
  return readyPods(podsOwnedBy(state, deployment.uid)).length >= replicas;
};

/**
 * Số replica KHAI BÁO còn ít nhất `n`.
 *
 * ⚠ Cố ý đọc `spec.replicas` chứ không đếm pod Ready — `deployment-ready` đã lo
 * vế "thực tế". Vị từ này canh vế còn lại: người chơi không được "sửa" ba pod
 * kẹt bằng cách hạ StatefulSet xuống còn một. Nhãn mà level đặt cho nó
 * ("giữ đủ 3 replica", "giữ tối thiểu 3 replica") nói đúng nghĩa đó.
 */
const replicasAtLeast: Predicate = (state, args) => {
  const kind = argKind(args);
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const n = argNumber(args, 'n');
  if (kind === null || name === null || namespace === null || n === null) {
    return false;
  }
  const object = lookup(state, kind, name, namespace);
  return object !== null && (asNumber(object.spec['replicas']) ?? 0) >= n;
};

const containerImageIs: Predicate = (state, args) => {
  const kind = argKind(args);
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const image = argString(args, 'image');
  if (kind === null || name === null || namespace === null || image === null) {
    return false;
  }
  const object = lookup(state, kind, name, namespace);
  if (object === null) {
    return false;
  }
  return containersOf(object).some((container) => container.image === image);
};

/**
 * Cả `requests` lẫn `limits`, cả CPU lẫn bộ nhớ, ở MỌI container.
 *
 * Bốn giá trị chứ không phải một, vì mỗi cái chặn một hỏng hóc khác nhau: thiếu
 * `requests` thì scheduler xếp mù và HPA không đọc được metric; thiếu `limits`
 * thì một container rò rỉ kéo sập cả node. Level dùng vị từ này như một cái chốt
 * chống lách — sửa OOM bằng cách XOÁ HẲN memory limit thì pod hết bị giết thật,
 * nhưng đó là dời quả bom sang node chứ không phải sửa.
 */
const resourceLimitsSet: Predicate = (state, args) => {
  const kind = argKind(args);
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  if (kind === null || name === null || namespace === null) {
    return false;
  }
  const object = lookup(state, kind, name, namespace);
  if (object === null) {
    return false;
  }
  const containers = containersOf(object);
  return (
    containers.length > 0 &&
    containers.every(
      (container) =>
        container.requestsCpu !== null &&
        container.requestsMemory !== null &&
        container.limitsCpu !== null &&
        container.limitsMemory !== null,
    )
  );
};

const probeConfigured: Predicate = (state, args) => {
  const kind = argKind(args);
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const probe = argString(args, 'probe');
  if (kind === null || name === null || namespace === null || probe === null) {
    return false;
  }
  const object = lookup(state, kind, name, namespace);
  if (object === null) {
    return false;
  }
  return containersOf(object).some((container) => {
    const spec =
      probe === 'readiness'
        ? container.readinessProbe
        : probe === 'liveness'
          ? container.livenessProbe
          : probe === 'startup'
            ? container.startupProbe
            : null;
    // Probe khai mà thiếu cổng là cấu hình vô nghĩa — đúng nội dung sự cố
    // `readiness-probe-sai-cong`, nên nó KHÔNG tính là "đã cấu hình".
    return spec !== null && spec.port !== null;
  });
};

const jobSucceeded: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  if (name === null || namespace === null) {
    return false;
  }
  const job = lookup(state, 'Job', name, namespace);
  if (job === null || job.runtime.kind !== 'job') {
    return false;
  }
  return job.runtime.succeeded >= (asNumber(job.spec['completions']) ?? 1);
};

/**
 * Lịch của CronJob đúng bằng chuỗi cron mà level yêu cầu.
 *
 * ⚠ So `spec.schedule` — chuỗi cron thật — chứ KHÔNG so `everyTicks`, thứ mà
 * `controllers.ts` dùng để chạy mô phỏng. Hai trường phục vụ hai việc khác nhau
 * và chỉ trường đầu là thứ người học mang được ra cụm thật; kiểm `everyTicks` sẽ
 * dạy một cú pháp chỉ tồn tại trong trò chơi này.
 *
 * Khoảng trắng thừa được gom lại trước khi so: `0  2 * * *` và `0 2 * * *` là
 * cùng một lịch, và trượt người chơi vì một dấu cách là chấm chính tả chứ không
 * phải chấm hiểu biết.
 */
const cronjobScheduleIs: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const schedule = argString(args, 'schedule');
  if (name === null || namespace === null || schedule === null) {
    return false;
  }
  const cronjob = lookup(state, 'CronJob', name, namespace);
  if (cronjob === null) {
    return false;
  }
  const declared = asString(cronjob.spec['schedule']);
  const tidy = (value: string): string => value.trim().split(/\s+/u).join(' ');
  return declared !== null && tidy(declared) === tidy(schedule);
};

// ── Mạng ────────────────────────────────────────────────────────────────────

const serviceHasEndpoints: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const min = argNumber(args, 'min') ?? 1;
  if (name === null || namespace === null) {
    return false;
  }
  const service = lookup(state, 'Service', name, namespace);
  return service !== null && serviceEndpoints(state, service).length >= min;
};

/**
 * Ingress có một rule đưa `path` tới `serviceName`.
 *
 * ⚠ Chỉ kiểm định tuyến, KHÔNG kiểm Service đích có endpoint hay không. Hai câu
 * hỏi đó tách nhau ở đời thật và cần tách ở đây: một Ingress trỏ đúng vào một
 * Service rỗng cho ra 503, còn một Ingress trỏ sai path cho ra 404 — hai triệu
 * chứng khác nhau dẫn tới hai chỗ sửa khác nhau. Level nào cần cả hai thì ra hai
 * mục tiêu (`ingress-routes` + `service-has-endpoints`), và đã có level làm đúng
 * như vậy.
 */
const ingressRoutes: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const path = argString(args, 'path');
  const serviceName = argString(args, 'serviceName');
  if (name === null || namespace === null || path === null || serviceName === null) {
    return false;
  }
  const ingress = lookup(state, 'Ingress', name, namespace);
  if (ingress === null) {
    return false;
  }
  for (const rule of asArray(ingress.spec['rules'])) {
    for (const entry of asArray(asRecord(rule)?.['paths'])) {
      const record = asRecord(entry);
      if (record === null) {
        continue;
      }
      if (asString(record['path']) === path && asString(record['serviceName']) === serviceName) {
        return true;
      }
    }
  }
  return false;
};

/**
 * NetworkPolicy: pod nguồn có tới được pod đích ở cổng đó không.
 *
 * Luật của Kubernetes, và nó ngược với trực giác của gần như mọi người mới:
 *
 * - Không policy nào CHỌN pod đích ⇒ **cho phép hết**. Kubernetes mặc định mở.
 * - Có ít nhất một policy chọn pod đích (kể cả `podSelector: {}`, tức chọn mọi
 *   pod trong namespace) ⇒ pod đó chuyển sang **từ chối mặc định**, và chỉ những
 *   gì được liệt kê tường minh mới qua. Thêm một policy default-deny là cách
 *   người ta vô tình cắt đứt cả DNS.
 * - Nhiều policy thì HỢP các quyền lại — policy không bao giờ "trừ" đi.
 */
function netpolAllows(
  state: ClusterState,
  namespace: string,
  fromLabels: Readonly<Record<string, string>>,
  toLabels: Readonly<Record<string, string>>,
  port: number | null,
): boolean {
  const policies = objectsOfKind(state, 'NetworkPolicy', namespace).filter((policy) => {
    const selector = asStringMap(asRecord(policy.spec['podSelector'])?.['matchLabels']);
    return matchLabels(toLabels, selector);
  });
  const guarding = policies.filter((policy) => {
    const types = asStringArray(policy.spec['policyTypes']);
    // `policyTypes` vắng ⇒ suy ra từ các khối có mặt, đúng luật K8s.
    return types.length === 0 ? policy.spec['ingress'] !== undefined : types.includes('Ingress');
  });
  if (guarding.length === 0) {
    return true;
  }
  return guarding.some((policy) =>
    asArray(policy.spec['ingress']).some((rule) => {
      const record = asRecord(rule);
      if (record === null) {
        return false;
      }
      const froms = asArray(record['from']);
      // `from` rỗng/vắng trong một rule ⇒ cho phép MỌI nguồn, không phải cấm hết.
      const sourceOk =
        froms.length === 0 ||
        froms.some((entry) => {
          const selector = asStringMap(asRecord(asRecord(entry)?.['podSelector'])?.['matchLabels']);
          return matchLabels(fromLabels, selector);
        });
      const ports = asArray(record['ports']);
      const portOk =
        port === null ||
        ports.length === 0 ||
        ports.some((entry) => asNumber(asRecord(entry)?.['port']) === port);
      return sourceOk && portOk;
    }),
  );
}

function netpolArgs(
  args: Args,
): { namespace: string; from: Readonly<Record<string, string>>; to: Readonly<Record<string, string>>; port: number | null } | null {
  const namespace = argString(args, 'namespace');
  const from = argSelector(args, 'fromLabels');
  const to = argSelector(args, 'toLabels');
  if (namespace === null || from === null || to === null) {
    return null;
  }
  return { namespace, from, to, port: argNumber(args, 'port') };
}

const netpolAllowsPredicate: Predicate = (state, args) => {
  const parsed = netpolArgs(args);
  return parsed !== null && netpolAllows(state, parsed.namespace, parsed.from, parsed.to, parsed.port);
};

const netpolDeniesPredicate: Predicate = (state, args) => {
  const parsed = netpolArgs(args);
  return parsed !== null && !netpolAllows(state, parsed.namespace, parsed.from, parsed.to, parsed.port);
};

/** Cổng DNS. Một NetworkPolicy quên mở egress 53 là cách kinh điển làm sập DNS. */
const DNS_PORT = 53;

/**
 * `dns-resolves` — pod nguồn phân giải được một tên dịch vụ.
 *
 * Ba điều kiện, và cả ba đều là nguyên nhân THẬT của "DNS không phân giải":
 *
 * 1. Tên phải trỏ tới một Service có thật (sai tên, hoặc quên phần namespace
 *    trong FQDN chéo namespace).
 * 2. Service đó phải có endpoint — `nslookup` trả về được nhưng gọi vào thì
 *    không ai trả lời, và người chơi hay dừng lại ở bước một rồi kết luận sai.
 * 3. Egress cổng 53 của pod nguồn không bị NetworkPolicy chặn. Đây là nguyên
 *    nhân tốn nhiều giờ nhất trong ba, vì mọi thứ khác đều trông hoàn hảo.
 */
const dnsResolves: Predicate = (state, args) => {
  const namespace = argString(args, 'namespace');
  const fromName = argString(args, 'fromName');
  const toName = argString(args, 'toName');
  if (namespace === null || fromName === null || toName === null) {
    return false;
  }
  const parts = toName.split('.');
  const serviceName = parts[0] ?? '';
  const serviceNamespace = parts[1] ?? namespace;
  const service = findObject(state, {
    kind: 'Service',
    namespace: serviceNamespace,
    name: serviceName,
  });
  if (service === null || serviceEndpoints(state, service).length === 0) {
    return false;
  }
  const source = livePods(state, namespace).find((pod) => pod.name === fromName);
  return source === null || source === undefined ? false : egressAllowed(state, source, DNS_PORT);
};

/** Egress của một pod tới một cổng. Cùng luật "có policy chọn ⇒ từ chối mặc định". */
function egressAllowed(state: ClusterState, pod: K8sObject, port: number): boolean {
  const guarding = objectsOfKind(state, 'NetworkPolicy', pod.namespace).filter((policy) => {
    const selector = asStringMap(asRecord(policy.spec['podSelector'])?.['matchLabels']);
    if (!matchLabels(pod.labels, selector)) {
      return false;
    }
    const types = asStringArray(policy.spec['policyTypes']);
    return types.length === 0 ? policy.spec['egress'] !== undefined : types.includes('Egress');
  });
  if (guarding.length === 0) {
    return true;
  }
  return guarding.some((policy) =>
    asArray(policy.spec['egress']).some((rule) => {
      const ports = asArray(asRecord(rule)?.['ports']);
      return ports.length === 0 || ports.some((entry) => asNumber(asRecord(entry)?.['port']) === port);
    }),
  );
}

// ── Cấu hình và lưu trữ ─────────────────────────────────────────────────────

const configmapKeySet: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  const key = argString(args, 'key');
  if (name === null || namespace === null || key === null) {
    return false;
  }
  const configMap = lookup(state, 'ConfigMap', name, namespace);
  if (configMap === null) {
    return false;
  }
  const value = asRecord(configMap.spec['data'])?.[key];
  // Khoá tồn tại nhưng rỗng KHÔNG tính: `KHO_URL: ''` làm ứng dụng hỏng đúng như
  // khi thiếu hẳn khoá, và người chơi phải điền giá trị thật.
  return value !== undefined && value !== null && String(value) !== '';
};

/**
 * Secret có tới được pod không — qua volume HOẶC qua biến môi trường.
 *
 * Nhận cả hai đường vì cả hai đều đúng ở Kubernetes thật và level không nên ép
 * một kiểu. Mục tiêu "mount vào đúng chỗ" là việc của `volume-mounted`; tách hai
 * câu hỏi ra cho phép một level hỏi riêng từng cái.
 */
const secretMounted: Predicate = (state, args) => {
  const podName = argString(args, 'podName');
  const namespace = argString(args, 'namespace');
  const secretName = argString(args, 'secretName');
  if (podName === null || namespace === null || secretName === null) {
    return false;
  }
  const pod = livePods(state, namespace).find((object) => object.name === podName);
  if (pod === undefined) {
    return false;
  }
  if (lookup(state, 'Secret', secretName, namespace) === null) {
    return false;
  }
  const viaEnv = readContainers(pod.spec, TICK_MS).some((container) =>
    container.secretRefs.some((ref) => ref.name === secretName),
  );
  const viaVolume = asArray(pod.spec['volumes']).some((entry) => {
    const secret = asRecord(asRecord(entry)?.['secret']);
    return asString(secret?.['secretName']) === secretName || asString(secret?.['name']) === secretName;
  });
  return viaEnv || viaVolume;
};

const pvcBound: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  if (name === null || namespace === null) {
    return false;
  }
  const pvc = lookup(state, 'PersistentVolumeClaim', name, namespace);
  return pvc !== null && pvc.runtime.kind === 'pvc' && pvc.runtime.boundVolume !== null;
};

const volumeMounted: Predicate = (state, args) => {
  const podName = argString(args, 'podName');
  const namespace = argString(args, 'namespace');
  const mountPath = argString(args, 'mountPath');
  if (podName === null || namespace === null || mountPath === null) {
    return false;
  }
  const pod = livePods(state, namespace).find((object) => object.name === podName);
  if (pod === undefined) {
    return false;
  }
  return readContainers(pod.spec, TICK_MS).some((container) =>
    container.volumeMounts.some((mount) => mount.mountPath === mountPath),
  );
};

// ── Xếp lịch và quota ───────────────────────────────────────────────────────

/**
 * Node Ready.
 *
 * ⚠ Cordon KHÔNG phải NotReady, và vị từ này cố ý không kiểm `unschedulable`.
 * Một node bị cordon vẫn Ready và vẫn chạy pod đang có — nó chỉ không nhận pod
 * MỚI. Gộp hai thứ đó lại là dạy sai đúng cái khác biệt mà `kubectl drain` dựa
 * vào, và `kubectl get nodes` cũng in ra hai chữ khác nhau
 * (`Ready` với `Ready,SchedulingDisabled`).
 */
const nodeReady: Predicate = (state, args) => {
  const nodeName = argString(args, 'nodeName');
  if (nodeName === null) {
    return false;
  }
  return findNode(state, nodeName)?.ready === true;
};

/**
 * Toleration của pod/workload phủ được taint của một node CÓ TAINT.
 *
 * ⚠ Luật khớp taint ở đây là bản sao của `tolerates()` trong `scheduler.ts`, vốn
 * không được export. Hai bản là một nợ SSOT có thật — đã báo lead để export bản
 * gốc. Cho tới lúc đó, sửa một bên thì phải sửa cả bên kia.
 */
function toleratesTaint(tolerations: readonly string[], taint: string): boolean {
  const key = taint.split('=')[0]?.split(':')[0] ?? taint;
  return tolerations.some((toleration) => toleration === taint || toleration === key);
}

const tolerationMatches: Predicate = (state, args) => {
  const kind = argKind(args);
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  if (kind === null || name === null || namespace === null) {
    return false;
  }
  const object = lookup(state, kind, name, namespace);
  if (object === null) {
    return false;
  }
  const template = workloadTemplate(object);
  const tolerations = asStringArray((template ?? object.spec)['tolerations']);
  const tainted = state.nodes.filter((node) => node.taints.length > 0);
  // Không node nào có taint ⇒ câu hỏi vô nghĩa, và trả `true` sẽ là một mục tiêu
  // tích xanh sẵn từ tick 0. Level dùng vị từ này luôn có ít nhất một node taint.
  if (tainted.length === 0) {
    return false;
  }
  return tainted.some((node) => node.taints.every((taint) => toleratesTaint(tolerations, taint)));
};

/**
 * Namespace không vượt bất kỳ ResourceQuota nào của nó.
 *
 * Đọc lại mức dùng từ `namespaceUsage` chứ không tin một field lưu sẵn: quota
 * "đã dùng" là thứ đổi mỗi lần một pod sinh ra hoặc chết đi, và một con số lưu
 * sẵn sẽ nói dối đúng vào lúc đang có tranh chấp.
 */
const quotaWithinLimit: Predicate = (state, args) => {
  const namespace = argString(args, 'namespace');
  if (namespace === null) {
    return false;
  }
  const used = namespaceUsage(state, namespace, TICK_MS);
  for (const quota of objectsOfKind(state, 'ResourceQuota', namespace)) {
    const hard = asRecord(quota.spec['hard']);
    if (hard === null) {
      continue;
    }
    const maxPods = asNumber(hard['pods']);
    const maxCpu = parseCpu(hard['requests.cpu']);
    const maxMemory = parseMemory(hard['requests.memory']);
    if (maxPods !== null && used.pods > maxPods) {
      return false;
    }
    if (maxCpu !== null && used.cpu > maxCpu) {
      return false;
    }
    if (maxMemory !== null && used.memory > maxMemory) {
      return false;
    }
  }
  return true;
};

const hpaHasMetricsPredicate: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  if (name === null || namespace === null) {
    return false;
  }
  const hpa = lookup(state, 'HorizontalPodAutoscaler', name, namespace);
  if (hpa === null) {
    return false;
  }
  const targetName = asString(asRecord(hpa.spec['scaleTargetRef'])?.['name']);
  if (targetName === null) {
    return false;
  }
  const target = state.objects.find(
    (object) =>
      object.name === targetName &&
      object.namespace === namespace &&
      (object.kind === 'Deployment' ||
        object.kind === 'StatefulSet' ||
        object.kind === 'ReplicaSet'),
  );
  // `hpaHasMetrics` lấy từ `controllers.ts` để vị từ và vòng điều hoà không bao
  // giờ bất đồng: HPA scale được thì mục tiêu xanh, và ngược lại.
  return target !== undefined && hpaHasMetrics(target);
};

/**
 * PodDisruptionBudget đang được thoả: số pod Ready khớp selector ≥ `minAvailable`.
 *
 * `minAvailable` lấy từ args nếu level nêu, nếu không thì đọc từ chính PDB —
 * level dạy PDB thường muốn khẳng định "ngân sách này đang được tôn trọng" mà
 * không phải chép lại con số ra hai chỗ.
 */
const pdbSatisfied: Predicate = (state, args) => {
  const name = argString(args, 'name');
  const namespace = argString(args, 'namespace');
  if (name === null || namespace === null) {
    return false;
  }
  const pdb = lookup(state, 'PodDisruptionBudget', name, namespace);
  if (pdb === null) {
    return false;
  }
  const minAvailable = argNumber(args, 'minAvailable') ?? asNumber(pdb.spec['minAvailable']);
  if (minAvailable === null) {
    return false;
  }
  const selector = readSelector(pdb.spec);
  if (Object.keys(selector).length === 0) {
    return false;
  }
  return readyPods(podsMatching(state, namespace, selector)).length >= minAvailable;
};

// ── RBAC ────────────────────────────────────────────────────────────────────

/**
 * `serviceAccount` có được phép `verb` trên `resource` không — đúng câu mà
 * `kubectl auth can-i` trả lời.
 *
 * RBAC của Kubernetes là **thuần cộng dồn**: không có luật "từ chối". Quyền là
 * hợp của mọi Role/ClusterRole được bind tới subject đó, và `*` khớp tất cả. Bởi
 * vậy `rbac-denies` chỉ là phủ định của phép hợp này — không có gì để "trừ".
 */
function rbacAllows(
  state: ClusterState,
  serviceAccount: string,
  namespace: string,
  verb: string,
  resource: string,
): boolean {
  const bindings = [
    ...objectsOfKind(state, 'RoleBinding', namespace),
    ...objectsOfKind(state, 'ClusterRoleBinding'),
  ];
  for (const binding of bindings) {
    const bound = asArray(binding.spec['subjects']).some((entry) => {
      const subject = asRecord(entry);
      if (subject === null || asString(subject['kind']) !== 'ServiceAccount') {
        return false;
      }
      const subjectNamespace = asString(subject['namespace']) ?? binding.namespace ?? namespace;
      return asString(subject['name']) === serviceAccount && subjectNamespace === namespace;
    });
    if (!bound) {
      continue;
    }
    const roleRef = asRecord(binding.spec['roleRef']);
    const roleName = asString(roleRef?.['name']);
    if (roleName === null) {
      continue;
    }
    const roleKind = asString(roleRef?.['kind']) === 'ClusterRole' ? 'ClusterRole' : 'Role';
    const role =
      roleKind === 'ClusterRole'
        ? findObject(state, { kind: 'ClusterRole', namespace: '', name: roleName })
        : findObject(state, { kind: 'Role', namespace, name: roleName });
    if (role === null) {
      continue;
    }
    for (const entry of asArray(role.spec['rules'])) {
      const rule = asRecord(entry);
      if (rule === null) {
        continue;
      }
      const verbs = asStringArray(rule['verbs']);
      const resources = asStringArray(rule['resources']);
      if (
        (verbs.includes('*') || verbs.includes(verb)) &&
        (resources.includes('*') || resources.includes(resource))
      ) {
        return true;
      }
    }
  }
  return false;
}

function rbacArgs(
  args: Args,
): { sa: string; namespace: string; verb: string; resource: string } | null {
  const sa = argString(args, 'serviceAccount');
  const namespace = argString(args, 'namespace');
  const verb = argString(args, 'verb');
  const resource = argString(args, 'resource');
  return sa === null || namespace === null || verb === null || resource === null
    ? null
    : { sa, namespace, verb, resource };
}

const rbacAllowsPredicate: Predicate = (state, args) => {
  const parsed = rbacArgs(args);
  return parsed !== null && rbacAllows(state, parsed.sa, parsed.namespace, parsed.verb, parsed.resource);
};

const rbacDeniesPredicate: Predicate = (state, args) => {
  const parsed = rbacArgs(args);
  return parsed !== null && !rbacAllows(state, parsed.sa, parsed.namespace, parsed.verb, parsed.resource);
};

// ── Tổng thể ────────────────────────────────────────────────────────────────

/**
 * Không sự cố nào CÒN HOẠT ĐỘNG trong namespace.
 *
 * ⚠ Hỏi lại `INCIDENTS[kind].isActive` chứ KHÔNG đọc `ActiveIncident.resolvedTick`.
 * Lý do là một ràng buộc thật của kiến trúc: không ai đặt `resolvedTick` — sự cố
 * hết là vì người chơi đã sửa NGUYÊN NHÂN trong trạng thái cụm, không vì có ai đó
 * đánh dấu. Đọc cờ sẽ làm mọi mục tiêu loại này không bao giờ xanh.
 *
 * Đối tượng đích biến mất ⇒ sự cố coi như hết: xoá rồi tạo lại cho đúng là một
 * cách sửa hợp lệ. Điều đó KHÔNG mở đường lách, vì level luôn kèm một mục tiêu
 * đòi thứ vừa xoá phải tồn tại và chạy được.
 */
const noIncidentActive: Predicate = (state, args) => {
  const namespace = argString(args, 'namespace');
  if (namespace === null) {
    return false;
  }
  const only = argString(args, 'kind');
  for (const incident of state.incidents) {
    if (incident.resolvedTick !== null) {
      continue;
    }
    if (only !== null && incident.kind !== only) {
      continue;
    }
    const target = findByUid(state, incident.targetUid);
    if (target === null || target.namespace !== namespace) {
      continue;
    }
    const definition = INCIDENTS[incident.kind as IncidentKind] as
      | (typeof INCIDENTS)[IncidentKind]
      | undefined;
    if (definition !== undefined && definition.isActive(state, objectRef(target))) {
      return false;
    }
  }
  return true;
};

// ── Bảng tra ────────────────────────────────────────────────────────────────

/**
 * ⛔ Khoá của bảng này PHẢI phủ đúng `PREDICATE_NAMES` — `PredicateTable` là
 * `Record<PredicateName, Predicate>`, nên thiếu một tên là lỗi biên dịch. Chiều
 * ngược lại (một hiện thực không có tên) thì kiểu KHÔNG bắt được, và đó là việc
 * của `predicates.test.ts`.
 */
export const PREDICATES: PredicateTable = {
  'resource-exists': resourceExists,
  'resource-absent': resourceAbsent,
  'pod-running': podRunning,
  'pod-count-running': podCountRunning,
  'pod-no-reason': podNoReason,
  'pod-on-node': podOnNode,
  'pod-not-on-node': podNotOnNode,
  'all-pods-healthy': allPodsHealthy,
  'deployment-ready': deploymentReady,
  'replicas-at-least': replicasAtLeast,
  'container-image-is': containerImageIs,
  'resource-limits-set': resourceLimitsSet,
  'probe-configured': probeConfigured,
  'job-succeeded': jobSucceeded,
  'cronjob-schedule-is': cronjobScheduleIs,
  'service-has-endpoints': serviceHasEndpoints,
  'ingress-routes': ingressRoutes,
  'netpol-allows': netpolAllowsPredicate,
  'netpol-denies': netpolDeniesPredicate,
  'dns-resolves': dnsResolves,
  'configmap-key-set': configmapKeySet,
  'secret-mounted': secretMounted,
  'pvc-bound': pvcBound,
  'volume-mounted': volumeMounted,
  'node-ready': nodeReady,
  'toleration-matches': tolerationMatches,
  'quota-within-limit': quotaWithinLimit,
  'hpa-has-metrics': hpaHasMetricsPredicate,
  'pdb-satisfied': pdbSatisfied,
  'rbac-allows': rbacAllowsPredicate,
  'rbac-denies': rbacDeniesPredicate,
  'no-incident-active': noIncidentActive,
};

/** Danh sách tên đã hiện thực — chiều thứ hai của test hai chiều. */
export const IMPLEMENTED_PREDICATE_NAMES: readonly string[] = Object.keys(PREDICATES).sort();
