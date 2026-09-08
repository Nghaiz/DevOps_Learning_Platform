/**
 * Bảng loại tài nguyên + bộ đọc `spec` an toàn.
 *
 * `ResourceSpec.spec` là `Record<string, unknown>` theo hợp đồng, nên MỌI lần
 * đọc phải đi qua một bộ ép kiểu có kiểm tra. Không `as` trần ở bất kỳ đâu khác
 * trong `k8s/`: một level gõ sai `replicas: '3'` (chuỗi) phải cho ra "không đọc
 * được, coi như không đặt" chứ không phải một `NaN` lan khắp mô phỏng rồi hiện
 * ra ở giao diện ba tầng sau.
 *
 * Từ vựng field bám đúng bản lane C ghi ở `levels/index.ts` § "Từ vựng
 * ResourceSpec.spec". Hai lane viết song song không thấy file của nhau, nên chỗ
 * này là điểm hẹn — lệch một tên là một level không bao giờ qua được, và triệu
 * chứng sẽ là "vị từ sai" chứ không phải "tên field sai".
 */

import type { ResourceKind } from './contract.ts';

// ── Bộ đọc an toàn ──────────────────────────────────────────────────────────

export function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Readonly<Record<string, unknown>>;
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStringArray(value: unknown): readonly string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string');
}

/** Bỏ mọi cặp có value không phải chuỗi — label của K8s luôn là chuỗi. */
export function asStringMap(value: unknown): Readonly<Record<string, string>> {
  const record = asRecord(value);
  if (record === null) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    if (typeof item === 'string') {
      out[key] = item;
    }
  }
  return out;
}

/** Đọc theo đường dẫn chấm: `readPath(spec, 'resources.requests.memory')`. */
export function readPath(spec: unknown, path: string): unknown {
  let cursor: unknown = spec;
  for (const segment of path.split('.')) {
    const record = asRecord(cursor);
    if (record === null) {
      return undefined;
    }
    cursor = record[segment];
  }
  return cursor;
}

/**
 * Đại lượng CPU → milli-core. `'500m'` → 500, `'2'` → 2000, `2` → 2000.
 *
 * ⚠ Số TRẦN nghĩa là CORE, không phải milli-core — đó là quy ước của Kubernetes
 * và đọc sai nó lệch đúng 1000 lần. `null` = không đặt (khác 0, vì "không đặt
 * requests" là chính nguyên nhân của sự cố `hpa-khong-co-metrics`).
 */
export function parseCpu(value: unknown): number | null {
  const num = asNumber(value);
  if (num !== null) {
    return Math.round(num * 1000);
  }
  const text = asString(value);
  if (text === null || text === '') {
    return null;
  }
  if (text.endsWith('m')) {
    const milli = Number.parseFloat(text.slice(0, -1));
    return Number.isFinite(milli) ? Math.round(milli) : null;
  }
  const cores = Number.parseFloat(text);
  return Number.isFinite(cores) ? Math.round(cores * 1000) : null;
}

const MEMORY_UNITS: Readonly<Record<string, number>> = {
  Ki: 1 / 1024,
  Mi: 1,
  Gi: 1024,
  Ti: 1024 * 1024,
  K: 1000 / 1024 / 1024,
  M: 1_000_000 / 1024 / 1024,
  G: 1_000_000_000 / 1024 / 1024,
};

/**
 * Đại lượng bộ nhớ/dung lượng → MiB. `'256Mi'` → 256, `'1Gi'` → 1024.
 *
 * ⚠ `Mi` (mebibyte, 1024²) và `M` (megabyte, 10⁶) KHÁC nhau và Kubernetes nhận
 * cả hai. Gộp chúng làm một là sai 4,8% — đủ để một pod đặt `limits: 1000M` bị
 * mô phỏng cho là có 1024Mi và không bao giờ OOM như level dự định.
 */
export function parseMemory(value: unknown): number | null {
  const num = asNumber(value);
  if (num !== null) {
    return Math.round(num / 1024 / 1024);
  }
  const text = asString(value);
  if (text === null || text === '') {
    return null;
  }
  for (const [suffix, factor] of Object.entries(MEMORY_UNITS)) {
    if (text.endsWith(suffix)) {
      const amount = Number.parseFloat(text.slice(0, -suffix.length));
      return Number.isFinite(amount) ? Math.round(amount * factor) : null;
    }
  }
  const bytes = Number.parseFloat(text);
  return Number.isFinite(bytes) ? Math.round(bytes / 1024 / 1024) : null;
}

// ── Container ───────────────────────────────────────────────────────────────

export interface ProbeSpec {
  /** `null` = probe khai báo nhưng thiếu cổng — chính là sự cố `readiness-probe-sai-cong`. */
  readonly port: number | null;
  readonly path: string;
  readonly initialDelayTicks: number;
  readonly periodTicks: number;
  readonly timeoutTicks: number;
  readonly failureThreshold: number;
}

export interface ContainerSpec {
  readonly name: string;
  readonly image: string;
  readonly command: readonly string[];
  readonly ports: readonly number[];
  /** milli-core / MiB. `null` = KHÔNG đặt — khác 0, và HPA phân biệt hai cái đó. */
  readonly requestsCpu: number | null;
  readonly requestsMemory: number | null;
  readonly limitsCpu: number | null;
  readonly limitsMemory: number | null;
  /** Tên ConfigMap/Secret container này tham chiếu, gộp từ `env[]` và `envFrom[]`. */
  readonly configMapRefs: readonly ConfigRef[];
  readonly secretRefs: readonly ConfigRef[];
  readonly volumeMounts: readonly { readonly name: string; readonly mountPath: string }[];
  readonly readinessProbe: ProbeSpec | null;
  readonly livenessProbe: ProbeSpec | null;
  readonly startupProbe: ProbeSpec | null;
}

export interface ConfigRef {
  readonly name: string;
  /** `null` = tham chiếu cả object (`envFrom`), có giá trị = tham chiếu một key. */
  readonly key: string | null;
}

/**
 * Giây → tick, làm tròn LÊN và tối thiểu 1.
 *
 * Làm tròn lên chứ không xuống: `initialDelaySeconds: 1` với `TICK_MS = 500` cho
 * ra 2 tick. Làm tròn xuống sẽ biến mọi giá trị dưới một tick thành 0, và một
 * `initialDelaySeconds` bằng 0 là chính nội dung của sự cố
 * `probe-khong-co-initialdelay` — mô phỏng sẽ không phân biệt được "đặt rất nhỏ"
 * với "không đặt".
 */
export function secondsToTicks(seconds: unknown, tickMs: number, fallback: number): number {
  const value = asNumber(seconds);
  if (value === null || value < 0) {
    return fallback;
  }
  return Math.max(1, Math.ceil((value * 1000) / tickMs));
}

function readProbe(value: unknown, tickMs: number): ProbeSpec | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const http = asRecord(record['httpGet']);
  const tcp = asRecord(record['tcpSocket']);
  const port = asNumber(record['port'] ?? http?.['port'] ?? tcp?.['port']);
  return {
    port,
    path: asString(record['path'] ?? http?.['path']) ?? '/',
    // `initialDelaySeconds` KHÔNG có mặc định 1 tick: vắng nó nghĩa là 0 trong
    // Kubernetes thật, và đó là một nguyên nhân sự cố có thật.
    initialDelayTicks:
      asNumber(record['initialDelaySeconds']) === null
        ? 0
        : secondsToTicks(record['initialDelaySeconds'], tickMs, 0),
    periodTicks: secondsToTicks(record['periodSeconds'], tickMs, secondsToTicks(10, tickMs, 20)),
    timeoutTicks: secondsToTicks(record['timeoutSeconds'], tickMs, secondsToTicks(1, tickMs, 2)),
    failureThreshold: asNumber(record['failureThreshold']) ?? 3,
  };
}

function readConfigRefs(container: Readonly<Record<string, unknown>>): {
  configMaps: readonly ConfigRef[];
  secrets: readonly ConfigRef[];
} {
  const configMaps: ConfigRef[] = [];
  const secrets: ConfigRef[] = [];
  for (const entry of asArray(container['env'])) {
    const record = asRecord(entry);
    const from = asRecord(record?.['valueFrom']);
    const cm = asRecord(from?.['configMapKeyRef']);
    const secret = asRecord(from?.['secretKeyRef']);
    if (cm !== null) {
      const name = asString(cm['name']);
      if (name !== null) {
        configMaps.push({ name, key: asString(cm['key']) });
      }
    }
    if (secret !== null) {
      const name = asString(secret['name']);
      if (name !== null) {
        secrets.push({ name, key: asString(secret['key']) });
      }
    }
  }
  for (const entry of asArray(container['envFrom'])) {
    const record = asRecord(entry);
    const cm = asRecord(record?.['configMapRef']);
    const secret = asRecord(record?.['secretRef']);
    const cmName = asString(cm?.['name']);
    const secretName = asString(secret?.['name']);
    if (cmName !== null) {
      configMaps.push({ name: cmName, key: null });
    }
    if (secretName !== null) {
      secrets.push({ name: secretName, key: null });
    }
  }
  return { configMaps, secrets };
}

export function readContainers(spec: unknown, tickMs: number): readonly ContainerSpec[] {
  const record = asRecord(spec);
  if (record === null) {
    return [];
  }
  const out: ContainerSpec[] = [];
  for (const entry of asArray(record['containers'])) {
    const container = asRecord(entry);
    if (container === null) {
      continue;
    }
    const refs = readConfigRefs(container);
    out.push({
      name: asString(container['name']) ?? 'container',
      image: asString(container['image']) ?? '',
      command: asStringArray(container['command']),
      ports: asArray(container['ports'])
        .map((port) => asNumber(asRecord(port)?.['containerPort']))
        .filter((port): port is number => port !== null),
      requestsCpu: parseCpu(readPath(container, 'resources.requests.cpu')),
      requestsMemory: parseMemory(readPath(container, 'resources.requests.memory')),
      limitsCpu: parseCpu(readPath(container, 'resources.limits.cpu')),
      limitsMemory: parseMemory(readPath(container, 'resources.limits.memory')),
      configMapRefs: refs.configMaps,
      secretRefs: refs.secrets,
      volumeMounts: asArray(container['volumeMounts'])
        .map((mount) => asRecord(mount))
        .filter((mount): mount is Readonly<Record<string, unknown>> => mount !== null)
        .map((mount) => ({
          name: asString(mount['name']) ?? '',
          mountPath: asString(mount['mountPath']) ?? '',
        })),
      readinessProbe: readProbe(container['readinessProbe'], tickMs),
      livenessProbe: readProbe(container['livenessProbe'], tickMs),
      startupProbe: readProbe(container['startupProbe'], tickMs),
    });
  }
  return out;
}

/** `selector.matchLabels` (workload) hoặc `selector` phẳng (Service). Cả hai đều gặp. */
export function readSelector(spec: unknown): Readonly<Record<string, string>> {
  const record = asRecord(spec);
  if (record === null) {
    return {};
  }
  const selector = record['selector'];
  const nested = asRecord(selector)?.['matchLabels'];
  if (nested !== undefined) {
    return asStringMap(nested);
  }
  return asStringMap(selector);
}

// ── Bảng 26 loại ────────────────────────────────────────────────────────────

export interface KindInfo {
  readonly kind: ResourceKind;
  /** Dạng số nhiều viết thường, như `kubectl` in ra. */
  readonly plural: string;
  /** Tên tắt THẬT của kubectl. Không bịa thêm — người học sẽ gõ lại ở cụm thật. */
  readonly shortNames: readonly string[];
  /** `false` = phạm vi cluster; `namespace` của object đó phải là chuỗi rỗng. */
  readonly namespaced: boolean;
  /**
   * Các field mô phỏng THẬT SỰ đọc. Đây là sổ cái đối chiếu với
   * `levels/index.ts`; test khẳng định level không đặt field ngoài danh sách,
   * nên một lỗi gõ trong level bị bắt bằng DỮ LIỆU chứ không bằng kiểu.
   */
  readonly specFields: readonly string[];
  /** Cột `kubectl get` in ra, sau `NAME`. */
  readonly listColumns: readonly string[];
}

const POD_FIELDS = [
  'labels',
  'phase',
  'restartPolicy',
  'nodeName',
  'nodeSelector',
  'tolerations',
  'serviceAccountName',
  'imagePullSecrets',
  'volumes',
  'containers',
  'initContainers',
] as const;

const WORKLOAD_FIELDS = [
  'replicas',
  'selector',
  'template',
  'labels',
  'strategy',
  'revision',
] as const;

function info(
  kind: ResourceKind,
  plural: string,
  shortNames: readonly string[],
  namespaced: boolean,
  specFields: readonly string[],
  listColumns: readonly string[],
): KindInfo {
  return { kind, plural, shortNames, namespaced, specFields, listColumns };
}

export const KINDS: Readonly<Record<ResourceKind, KindInfo>> = {
  Pod: info('Pod', 'pods', ['po'], true, POD_FIELDS, ['READY', 'STATUS', 'RESTARTS', 'AGE', 'NODE']),
  ReplicaSet: info('ReplicaSet', 'replicasets', ['rs'], true, WORKLOAD_FIELDS, [
    'DESIRED',
    'CURRENT',
    'READY',
    'AGE',
  ]),
  Deployment: info('Deployment', 'deployments', ['deploy'], true, WORKLOAD_FIELDS, [
    'READY',
    'UP-TO-DATE',
    'AVAILABLE',
    'AGE',
  ]),
  StatefulSet: info(
    'StatefulSet',
    'statefulsets',
    ['sts'],
    true,
    [...WORKLOAD_FIELDS, 'serviceName', 'volumeClaimTemplates', 'podManagementPolicy'],
    ['READY', 'AGE'],
  ),
  DaemonSet: info('DaemonSet', 'daemonsets', ['ds'], true, WORKLOAD_FIELDS, [
    'DESIRED',
    'CURRENT',
    'READY',
    'AGE',
  ]),
  Job: info(
    'Job',
    'jobs',
    [],
    true,
    ['template', 'labels', 'completions', 'parallelism', 'backoffLimit', 'activeDeadlineSeconds'],
    ['COMPLETIONS', 'DURATION', 'AGE'],
  ),
  CronJob: info(
    'CronJob',
    'cronjobs',
    ['cj'],
    true,
    ['schedule', 'everyTicks', 'jobTemplate', 'labels', 'concurrencyPolicy', 'suspend'],
    ['SCHEDULE', 'SUSPEND', 'ACTIVE', 'AGE'],
  ),
  Service: info(
    'Service',
    'services',
    ['svc'],
    true,
    ['type', 'selector', 'ports', 'labels'],
    ['TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE'],
  ),
  Ingress: info(
    'Ingress',
    'ingresses',
    ['ing'],
    true,
    ['rules', 'tls', 'labels', 'ingressClassName'],
    ['CLASS', 'HOSTS', 'PORTS', 'AGE'],
  ),
  ConfigMap: info('ConfigMap', 'configmaps', ['cm'], true, ['data', 'labels'], ['DATA', 'AGE']),
  Secret: info('Secret', 'secrets', [], true, ['type', 'data', 'labels'], ['TYPE', 'DATA', 'AGE']),
  PersistentVolume: info(
    'PersistentVolume',
    'persistentvolumes',
    ['pv'],
    false,
    ['capacity', 'accessModes', 'storageClassName', 'labels', 'claimRef'],
    ['CAPACITY', 'ACCESS MODES', 'STATUS', 'CLAIM', 'STORAGECLASS', 'AGE'],
  ),
  PersistentVolumeClaim: info(
    'PersistentVolumeClaim',
    'persistentvolumeclaims',
    ['pvc'],
    true,
    ['accessModes', 'storageClassName', 'resources', 'volumeName', 'labels'],
    ['STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'AGE'],
  ),
  StorageClass: info(
    'StorageClass',
    'storageclasses',
    ['sc'],
    false,
    ['provisioner', 'labels'],
    ['PROVISIONER', 'AGE'],
  ),
  Namespace: info('Namespace', 'namespaces', ['ns'], false, ['labels'], ['STATUS', 'AGE']),
  Node: info(
    'Node',
    'nodes',
    ['no'],
    false,
    ['labels', 'taints', 'capacity'],
    ['STATUS', 'ROLES', 'AGE'],
  ),
  ServiceAccount: info(
    'ServiceAccount',
    'serviceaccounts',
    ['sa'],
    true,
    ['labels'],
    ['SECRETS', 'AGE'],
  ),
  Role: info('Role', 'roles', [], true, ['rules', 'labels'], ['AGE']),
  RoleBinding: info(
    'RoleBinding',
    'rolebindings',
    [],
    true,
    ['roleRef', 'subjects', 'labels'],
    ['ROLE', 'AGE'],
  ),
  ClusterRole: info('ClusterRole', 'clusterroles', [], false, ['rules', 'labels'], ['AGE']),
  ClusterRoleBinding: info(
    'ClusterRoleBinding',
    'clusterrolebindings',
    [],
    false,
    ['roleRef', 'subjects', 'labels'],
    ['ROLE', 'AGE'],
  ),
  NetworkPolicy: info(
    'NetworkPolicy',
    'networkpolicies',
    ['netpol'],
    true,
    ['podSelector', 'policyTypes', 'ingress', 'egress', 'labels'],
    ['POD-SELECTOR', 'AGE'],
  ),
  HorizontalPodAutoscaler: info(
    'HorizontalPodAutoscaler',
    'horizontalpodautoscalers',
    ['hpa'],
    true,
    ['scaleTargetRef', 'minReplicas', 'maxReplicas', 'metrics', 'labels'],
    ['REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS', 'AGE'],
  ),
  PodDisruptionBudget: info(
    'PodDisruptionBudget',
    'poddisruptionbudgets',
    ['pdb'],
    true,
    ['minAvailable', 'maxUnavailable', 'selector', 'labels'],
    ['MIN AVAILABLE', 'MAX UNAVAILABLE', 'ALLOWED DISRUPTIONS', 'AGE'],
  ),
  ResourceQuota: info(
    'ResourceQuota',
    'resourcequotas',
    ['quota'],
    true,
    ['hard', 'labels'],
    ['REQUEST', 'LIMIT', 'AGE'],
  ),
  LimitRange: info(
    'LimitRange',
    'limitranges',
    ['limits'],
    true,
    ['limits', 'labels'],
    ['CREATED AT'],
  ),
};

export const ALL_KINDS: readonly ResourceKind[] = (Object.keys(KINDS) as ResourceKind[])
  .slice()
  .sort();

/**
 * Bảng tra tên tắt, dựng MỘT LẦN ở module scope.
 *
 * Quét tuyến tính mỗi lần gõ lệnh vẫn đúng, nhưng `kubectl.ts` gọi hàm này cho
 * từng token của từng lệnh trong MỖI lần phát lại một `RunLog` — và phát lại là
 * thứ chạy hàng nghìn lần trong một lần xác minh chống gian lận.
 */
const KIND_ALIASES: ReadonlyMap<string, ResourceKind> = (() => {
  const map = new Map<string, ResourceKind>();
  for (const item of Object.values(KINDS)) {
    map.set(item.kind.toLowerCase(), item.kind);
    map.set(item.plural, item.kind);
    for (const short of item.shortNames) {
      map.set(short, item.kind);
    }
  }
  return map;
})();

/** `po` · `pods` · `Pod` · `deployment.apps` đều tra được. `null` = không biết loại này. */
export function resolveKind(token: string): ResourceKind | null {
  const normalized = token.trim().toLowerCase().split('.')[0] ?? '';
  return KIND_ALIASES.get(normalized) ?? null;
}

export function isNamespaced(kind: ResourceKind): boolean {
  return KINDS[kind].namespaced;
}
