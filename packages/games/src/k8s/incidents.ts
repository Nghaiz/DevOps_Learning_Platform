/**
 * 32 sự cố: gieo NGUYÊN NHÂN, để máy mô phỏng tự sinh TRIỆU CHỨNG.
 *
 * ## Luật số một: `inject` không được vẽ triệu chứng
 *
 * Không hàm nào ở đây đặt thẳng `reason: 'CrashLoopBackOff'` lên một pod. Nó sửa
 * đúng thứ mà một người vận hành bất cẩn sẽ sửa — một dòng `image`, một cổng
 * probe, một hạn mức bộ nhớ — rồi `health.ts` / `scheduler.ts` / `tick.ts` sinh
 * ra phần còn lại. Hai hệ quả, cả hai đều là lý do file này viết như vậy:
 *
 * 1. Triệu chứng luôn ĐÚNG với nguyên nhân, kể cả ở những chỗ ta không nghĩ tới,
 *    vì nó đi qua chính bộ luật mà một cụm thật đi qua.
 * 2. Người chơi SỬA ĐƯỢC. Vẽ triệu chứng lên pod thì không có gì để sửa cả — chỉ
 *    còn cách đoán tên sự cố rồi bấm nút, tức là đố mẹo chứ không phải chẩn đoán.
 *
 * ## Luật số hai: cặp dễ nhầm phải THẬT SỰ dễ nhầm
 *
 * `symptom` là thứ người chơi QUAN SÁT, không bao giờ là nguyên nhân. Bốn sự cố
 * của nhóm "container restart" dùng CHUNG một chuỗi `symptom` từng chữ một, và
 * `incidents.test.ts` khẳng định điều đó — sửa cho chúng khác nhau là làm hỏng
 * bài học, nên test sẽ đỏ. Muốn phân biệt, người chơi phải đi tìm bằng chứng:
 *
 * | Nhóm | Cùng thấy gì ở `kubectl get` | Bằng chứng tách chúng ra |
 * |---|---|---|
 * | entrypoint sai · thiếu RAM · liveness sai cổng · thiếu initialDelay | RESTARTS tăng, không bao giờ Ready | `logs --previous` (exit 127 có log) vs `describe` Last State (`OOMKilled` / `LivenessProbeFailed`, cả hai exit 137) |
 * | tag sai · registry chết · thiếu credential | Pending, RESTARTS = 0 | Events của `describe` — ba câu khác nhau |
 * | thiếu ConfigMap · thiếu Secret · sai key | Pending, `logs` rỗng | Events: tên object và tên key |
 * | selector lệch · readiness fail · không còn pod | `get endpoints` rỗng | `get pods --show-labels` vs cột READY vs `get deploy` |
 * | hết CPU · hết RAM · taint · nodeSelector | Pending, không node nào nhận | `describe pod` — scheduler ghi lý do TỪNG node |
 * | quota chặn · LimitRange từ chối · replica vượt quota | Pod không hề xuất hiện | `describe rs` (Event `FailedCreate`) — `get pods` không có gì để xem |
 * | RBAC thiếu quyền · ServiceAccount không tồn tại | 403, pod vẫn Running | `describe pod` (tên SA) vs `get rolebindings` |
 *
 * Hai sự cố mang exit code 137 GIỐNG NHAU (OOMKilled và LivenessProbeFailed) là
 * cố ý — ở cụm thật cũng vậy, vì cả hai đều là SIGKILL. Chỉ dòng `Reason` trong
 * **Last State** tách được chúng.
 *
 * ## Luật số ba: `isActive` hỏi về NGUYÊN NHÂN, không hỏi về triệu chứng
 *
 * Vị từ `no-incident-active` gọi hàm này, và nó phải trả lời "người chơi đã sửa
 * chưa", không phải "lúc này pod có đỏ không". Một pod vừa được restart trông
 * xanh trong vài tick trước khi chết lại; đọc triệu chứng sẽ tích xanh đúng vào
 * cửa sổ đó. Vì thế mỗi `isActive` đọc lại đúng cái field mà `inject` đã sửa.
 *
 * ⛔ THUẦN. Không `Math.random()`, không `Date.now()`. Ngẫu nhiên (nếu cần) đi qua
 * `state.rng` và trả về trong state mới.
 */

import type { IncidentKind, ResourceKind, ResourceRef } from './contract.ts';
import type { IncidentDefinition, IncidentTable } from './engine-boundary.ts';
import type { ClusterState, K8sObject } from './model.ts';
import {
  addObject,
  allocateUid,
  findObject,
  objectRef,
  podRuntime,
  removeObjectCascade,
  replaceObject,
} from './model.ts';
import {
  livePods,
  matchLabels,
  namespaceUsage,
  objectsOfKind,
  podsMatching,
  podsOwnedBy,
  templateLabels,
  workloadTemplate,
} from './query.ts';
import { admitPod, hpaHasMetrics } from './controllers.ts';
import {
  MISSING_BINARY_MARKER,
  MISSING_TAG_MARKER,
  PRIVATE_REPO_MARKER,
  UNREACHABLE_REGISTRIES,
  hasPullSecrets,
  imageProblem,
  memoryUsageOf,
  parseImage,
} from './health.ts';
import { TICK_MS } from './tick.ts';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  asStringMap,
  parseMemory,
  readContainers,
  readPath,
  readSelector,
} from './resources.ts';

// ── Đọc và sửa spec ─────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

/**
 * Nơi container thật sự nằm: `spec.containers` với Pod, `spec.template.containers`
 * với workload. Mọi sự cố về container phải sửa ĐÚNG chỗ đó, vì level gieo sự cố
 * lên cả hai loại — chương 1 lên Pod, từ chương 2 lên Deployment.
 */
function containerHost(object: K8sObject): { readonly inTemplate: boolean; readonly host: Raw } {
  const template = workloadTemplate(object);
  return template === null
    ? { inTemplate: false, host: { ...object.spec } }
    : { inTemplate: true, host: { ...template } };
}

function rawContainers(object: K8sObject): readonly Raw[] {
  const { host } = containerHost(object);
  return asArray(host['containers'])
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Raw => entry !== null)
    .map((entry) => ({ ...entry }));
}

/** Ghi lại danh sách container vào đúng tầng (pod spec hay template). */
function withContainers(object: K8sObject, containers: readonly Raw[]): K8sObject {
  const { inTemplate, host } = containerHost(object);
  const nextHost: Raw = { ...host, containers };
  return inTemplate
    ? { ...object, spec: { ...object.spec, template: nextHost } }
    : { ...object, spec: nextHost };
}

/** Sửa một field ở tầng pod (Pod: `spec`; workload: `spec.template`). */
function withPodField(object: K8sObject, key: string, value: unknown): K8sObject {
  const { inTemplate, host } = containerHost(object);
  const nextHost: Raw = { ...host, [key]: value };
  return inTemplate
    ? { ...object, spec: { ...object.spec, template: nextHost } }
    : { ...object, spec: nextHost };
}

function mapContainers(object: K8sObject, mapper: (container: Raw) => Raw): K8sObject {
  return withContainers(object, rawContainers(object).map(mapper));
}

function withSpec(object: K8sObject, patch: Raw): K8sObject {
  return { ...object, spec: { ...object.spec, ...patch } };
}

/** Container đã phân tích — dùng cho `isActive`, nơi ta hỏi về giá trị chứ không sửa. */
function parsedContainers(object: K8sObject) {
  const template = workloadTemplate(object);
  return readContainers(template ?? object.spec, TICK_MS);
}

// ── Khung định nghĩa ────────────────────────────────────────────────────────

type Mutate = (state: ClusterState, object: K8sObject) => ClusterState;
type Check = (state: ClusterState, object: K8sObject) => boolean;

/**
 * Ghi nhận sự cố vào `state.incidents`.
 *
 * Bản ghi được GIỮ LẠI sau khi người chơi sửa (`resolvedTick` vẫn `null`, và
 * `no-incident-active` hỏi lại `isActive` mỗi lần) — nhờ vậy hệ thống chấm điểm
 * phân biệt được "đã sửa" với "chưa bao giờ có sự cố", điều mà xoá bản ghi đi thì
 * không làm được nữa.
 */
function record(state: ClusterState, kind: IncidentKind, targetUid: string): ClusterState {
  const already = state.incidents.some(
    (incident) => incident.kind === kind && incident.targetUid === targetUid,
  );
  if (already) {
    return state;
  }
  return {
    ...state,
    incidents: [
      ...state.incidents,
      { kind, targetUid, startedTick: state.tick, resolvedTick: null },
    ],
  };
}

/**
 * Dựng một `IncidentDefinition` từ hai hàm làm việc trên OBJECT thay vì trên ref.
 *
 * ⚠ `inject` KHÔNG phát sự kiện thông báo "vừa gieo sự cố". Nhật ký sự kiện là
 * thứ người chơi đọc để chẩn đoán, và một dòng nói thẳng tên sự cố ở đó sẽ xoá
 * mất toàn bộ phần điều tra. Sự kiện duy nhất được phép xuất hiện là sự kiện mà
 * kubelet/scheduler thật sự sinh ra ở các tick sau.
 */
function define(
  kind: IncidentKind,
  symptom: string,
  mutate: Mutate,
  check: Check,
): IncidentDefinition {
  return {
    kind,
    symptom,
    inject(state, target) {
      const object = findObject(state, target);
      if (object === null) {
        return state;
      }
      return record(mutate(state, object), kind, object.uid);
    },
    isActive(state, target) {
      const object = findObject(state, target);
      return object === null ? false : check(state, object);
    },
  };
}

// ── Chuỗi triệu chứng dùng chung ────────────────────────────────────────────

/**
 * ⛔ Mỗi hằng dưới đây được DÙNG LẠI nguyên văn cho nhiều sự cố. Đó là chủ ý và
 * là phần đắt nhất của thiết kế: nếu mỗi sự cố có một câu riêng, người chơi đọc
 * câu đó là biết ngay phải sửa gì, và trò chơi rơi xuống thành ghi nhớ. Chép ra
 * thành nhiều câu khác nhau = xoá bài học. `incidents.test.ts` canh đúng chỗ này.
 */
const SYMPTOM_RESTART_LOOP =
  'Pod khởi động lại liên tục — cột RESTARTS tăng dần và READY không bao giờ lên đủ.';
const SYMPTOM_IMAGE_STUCK =
  'Pod đứng ở Pending, chưa từng vào ContainerCreating, và RESTARTS vẫn là 0.';
const SYMPTOM_CONFIG_STUCK =
  'Pod kẹt ở Pending và `kubectl logs` không trả về gì cả.';
const SYMPTOM_NO_ENDPOINT =
  'Service tồn tại nhưng gọi vào không ai trả lời; `kubectl get endpoints` rỗng.';
const SYMPTOM_UNSCHEDULABLE =
  'Pod mới nằm ở Pending và không node nào nhận; pod cũ vẫn chạy bình thường.';
const SYMPTOM_POD_NEVER_APPEARS =
  'Số pod không tăng dù đã yêu cầu thêm, và không có pod nào ở Pending để mà xem.';
const SYMPTOM_PVC_PENDING =
  'PVC đứng ở Pending, pod dùng nó kẹt theo và chưa bao giờ tạo container.';
const SYMPTOM_FORBIDDEN =
  'Ứng dụng báo 403 khi gọi API server, trong khi pod vẫn Running và mọi probe vẫn xanh.';

// ── Nhóm image ──────────────────────────────────────────────────────────────

const imageTagSai = define(
  'image-tag-sai',
  SYMPTOM_IMAGE_STUCK,
  (state, object) =>
    replaceObject(
      state,
      mapContainers(object, (container) => {
        const image = asString(container['image']) ?? '';
        const ref = parseImage(image);
        const repository = ref.registry === 'docker.io' ? ref.repository : `${ref.registry}/${ref.repository}`;
        return { ...container, image: `${repository}:${MISSING_TAG_MARKER}` };
      }),
    ),
  (state, object) =>
    parsedContainers(object).some(
      (container) => imageProblem(container.image, true) === 'tag-khong-ton-tai',
    ),
);

const imageRegistryKhongToiDuoc = define(
  'image-registry-khong-toi-duoc',
  SYMPTOM_IMAGE_STUCK,
  (state, object) =>
    replaceObject(
      state,
      mapContainers(object, (container) => {
        const ref = parseImage(asString(container['image']) ?? '');
        return {
          ...container,
          image: `${UNREACHABLE_REGISTRIES[0] ?? 'registry.noi-bo.local'}/${ref.repository}:${ref.tag}`,
        };
      }),
    ),
  (state, object) =>
    parsedContainers(object).some(
      (container) => imageProblem(container.image, true) === 'registry-khong-toi-duoc',
    ),
);

/**
 * Repo riêng tư mà pod không có credential.
 *
 * ⚠ `isActive` truyền `hasPullSecrets` THẬT chứ không truyền `true` như hai sự cố
 * trên: ở đây câu hỏi chính là "pod đã có secret chưa", nên đường sửa hợp lệ gồm
 * cả việc thêm `imagePullSecrets` chứ không chỉ đổi image.
 */
const thieuImagePullSecret = define(
  'thieu-imagepullsecret',
  SYMPTOM_IMAGE_STUCK,
  (state, object) => {
    const patched = mapContainers(object, (container) => {
      const ref = parseImage(asString(container['image']) ?? '');
      const repository = ref.repository.includes(PRIVATE_REPO_MARKER)
        ? ref.repository
        : `${ref.repository.split('/')[0] ?? 'dlp'}${PRIVATE_REPO_MARKER}/${ref.repository.split('/').pop() ?? 'app'}`;
      return { ...container, image: `${repository}:${ref.tag}` };
    });
    return replaceObject(state, withPodField(patched, 'imagePullSecrets', []));
  },
  (state, object) => {
    const secretsOk = object.kind === 'Pod' ? hasPullSecrets(state, object) : podPullSecretsOk(state, object);
    return parsedContainers(object).some(
      (container) => imageProblem(container.image, secretsOk) === 'thieu-credential',
    );
  },
);

/** Workload: hỏi qua một pod con nếu có, không thì đọc thẳng template. */
function podPullSecretsOk(state: ClusterState, object: K8sObject): boolean {
  const pod = podsOwnedBy(state, object.uid)[0];
  if (pod !== undefined) {
    return hasPullSecrets(state, pod);
  }
  const template = workloadTemplate(object);
  const names = asStringArray(template?.['imagePullSecrets']);
  const secrets = new Set(objectsOfKind(state, 'Secret', object.namespace).map((item) => item.name));
  return names.some((name) => secrets.has(name));
}

// ── Nhóm container chết đi chết lại ─────────────────────────────────────────

/**
 * Memory limit thấp hơn mức container thật sự dùng.
 *
 * Đặt limit bằng một NỬA mức dùng chứ không phải một giá trị cố định: level nào
 * cũng khai `requests.memory` khác nhau, và một hằng số sẽ hoặc không gây OOM ở
 * pod lớn, hoặc gây OOM cả ở pod mà level không nhắm tới.
 */
const memoryLimitQuaThap = define(
  'memory-limit-qua-thap',
  SYMPTOM_RESTART_LOOP,
  (state, object) =>
    replaceObject(
      state,
      mapContainers(object, (container) => {
        const requested = parseMemory(readPath(container, 'resources.requests.memory')) ?? 64;
        const resources = asRecord(container['resources']) ?? {};
        const limits = asRecord(resources['limits']) ?? {};
        return {
          ...container,
          resources: {
            ...resources,
            limits: { ...limits, memory: `${Math.max(1, Math.floor(requested / 2))}Mi` },
          },
        };
      }),
    ),
  (state, object) =>
    parsedContainers(object).some(
      (container) =>
        container.limitsMemory !== null && container.limitsMemory < memoryUsageOf(container),
    ),
);

const lenhEntrypointSai = define(
  'lenh-entrypoint-sai',
  SYMPTOM_RESTART_LOOP,
  (state, object) =>
    replaceObject(
      state,
      mapContainers(object, (container) => ({
        ...container,
        command: [`/usr/local/bin/${MISSING_BINARY_MARKER}-lenh-nay`, '--phuc-vu'],
      })),
    ),
  (state, object) =>
    parsedContainers(object).some((container) =>
      container.command.some((part) => part.includes(MISSING_BINARY_MARKER)),
    ),
);

/**
 * Liveness probe gõ một cổng container không mở.
 *
 * `initialDelaySeconds` để RỘNG (10 giây) một cách có chủ ý: nếu để 0 thì
 * `tick.ts` sẽ báo "probe chạy quá sớm" và sự cố này biến thành
 * `probe-khong-co-initialdelay`. Hai sự cố phải khác nhau ở NGUYÊN NHÂN dù cùng
 * một triệu chứng, nên chỉ được sai đúng một thứ mỗi lần.
 */
const livenessProbeQuaGat = define(
  'liveness-probe-qua-gat',
  SYMPTOM_RESTART_LOOP,
  (state, object) =>
    replaceObject(
      state,
      mapContainers(object, (container) => {
        const open = asArray(container['ports'])
          .map((entry) => asNumber(asRecord(entry)?.['containerPort']))
          .filter((port): port is number => port !== null);
        const wrong = (open[0] ?? 8080) + 1;
        return {
          ...container,
          livenessProbe: {
            httpGet: { path: '/khoe-manh', port: wrong },
            initialDelaySeconds: 10,
            periodSeconds: 5,
            failureThreshold: 3,
          },
        };
      }),
    ),
  (state, object) =>
    parsedContainers(object).some((container) => {
      const probe = container.livenessProbe;
      return probe !== null && probe.port !== null && !container.ports.includes(probe.port);
    }),
);

/**
 * Liveness probe đúng cổng nhưng KHÔNG có `initialDelaySeconds`.
 *
 * Ứng dụng cần vài giây để khởi động; probe chạy ngay từ giây 0, kết luận container
 * treo, và giết nó trước khi nó kịp sống. Vòng lặp vĩnh viễn — và nhìn từ
 * `kubectl get` thì không khác gì một app hỏng thật. Đây là bẫy mà câu trả lời
 * đúng nhất lại là thứ hay bị bỏ sót nhất: thêm `startupProbe`.
 */
/**
 * Thời gian một container cần để sẵn sàng, tính bằng tick.
 *
 * ⚠ Bản sao của `DEFAULT_STARTUP_TICKS` trong `tick.ts`, vốn không được export.
 * Hai bản là một nợ SSOT có thật và đã báo lead — nhưng để `isActive` so với 0
 * thay vì so với ngưỡng thì tệ hơn nhiều: nó sẽ báo "đã sửa" cho một pod vẫn
 * đang bị giết. Sửa một bên thì phải sửa cả bên kia.
 */
const MIN_SAFE_INITIAL_DELAY_TICKS = 4;

const probeKhongCoInitialDelay = define(
  'probe-khong-co-initialdelay',
  SYMPTOM_RESTART_LOOP,
  (state, object) =>
    replaceObject(
      state,
      mapContainers(object, (container) => {
        const open = asArray(container['ports'])
          .map((entry) => asNumber(asRecord(entry)?.['containerPort']))
          .filter((port): port is number => port !== null);
        // KHÔNG ghi `initialDelaySeconds: 0` — ghi số 0 vào đó cho ra 1 tick chứ
        // không phải 0 (`secondsToTicks` chặn sàn ở 1). Sự cố này đúng nghĩa đen
        // là "probe không khai initialDelay", nên trường phải VẮNG MẶT.
        return {
          ...container,
          livenessProbe: {
            httpGet: { path: '/khoe-manh', port: open[0] ?? 8080 },
            periodSeconds: 2,
            failureThreshold: 1,
          },
        };
      }),
    ),
  (state, object) =>
    parsedContainers(object).some((container) => {
      const probe = container.livenessProbe;
      // Cổng ĐÚNG mà độ trễ vẫn ngắn hơn thời gian ứng dụng cần để lên — nếu cổng
      // sai thì đó là sự cố kia.
      //
      // ⚠ So với NGƯỠNG chứ không so với 0. Người chơi "sửa" bằng
      // `initialDelaySeconds: 1` vẫn bị kubelet giết y như cũ, và một phép so với
      // 0 sẽ báo ĐÃ SỬA trong khi pod còn đang chết đi chết lại — đúng loại lời
      // nói dối mà `isActive` sinh ra để tránh.
      return (
        probe !== null &&
        probe.initialDelayTicks < MIN_SAFE_INITIAL_DELAY_TICKS &&
        (probe.port === null || container.ports.includes(probe.port))
      );
    }),
);

// ── Nhóm cấu hình ───────────────────────────────────────────────────────────

/** Tên ConfigMap/Secret mà container tham chiếu nhưng không tồn tại trong namespace. */
function missingRefs(state: ClusterState, object: K8sObject, kind: 'ConfigMap' | 'Secret'): readonly string[] {
  const existing = new Set(objectsOfKind(state, kind, object.namespace).map((item) => item.name));
  const refs = parsedContainers(object).flatMap((container) =>
    kind === 'ConfigMap' ? container.configMapRefs : container.secretRefs,
  );
  return refs.filter((ref) => !existing.has(ref.name)).map((ref) => ref.name);
}

/**
 * ConfigMap biến mất.
 *
 * Nếu pod đã tham chiếu một ConfigMap thì XOÁ chính nó — đó là kịch bản thật
 * ("ai đó dọn namespace"). Nếu chưa tham chiếu gì thì thêm một `envFrom` trỏ vào
 * một tên không tồn tại, vì một sự cố không gieo được là một level không chơi được.
 */
const thieuConfigMap = define(
  'thieu-configmap',
  SYMPTOM_CONFIG_STUCK,
  (state, object) => {
    const referenced = parsedContainers(object).flatMap((container) => container.configMapRefs);
    const first = referenced[0];
    if (first !== undefined) {
      const source = objectsOfKind(state, 'ConfigMap', object.namespace).find(
        (item) => item.name === first.name,
      );
      if (source !== undefined) {
        return removeObjectCascade(state, source.uid);
      }
    }
    return replaceObject(
      state,
      mapContainers(object, (container) => ({
        ...container,
        envFrom: [
          ...asArray(container['envFrom']),
          { configMapRef: { name: `${object.name}-cau-hinh` } },
        ],
      })),
    );
  },
  (state, object) => missingRefs(state, object, 'ConfigMap').length > 0,
);

const thieuSecret = define(
  'thieu-secret',
  SYMPTOM_CONFIG_STUCK,
  (state, object) => {
    const referenced = parsedContainers(object).flatMap((container) => container.secretRefs);
    const first = referenced[0];
    if (first !== undefined) {
      const source = objectsOfKind(state, 'Secret', object.namespace).find(
        (item) => item.name === first.name,
      );
      if (source !== undefined) {
        return removeObjectCascade(state, source.uid);
      }
    }
    return replaceObject(
      state,
      mapContainers(object, (container) => ({
        ...container,
        envFrom: [...asArray(container['envFrom']), { secretRef: { name: `${object.name}-bi-mat` } }],
      })),
    );
  },
  (state, object) => missingRefs(state, object, 'Secret').length > 0,
);

/**
 * ConfigMap còn nguyên, chỉ KHÓA bị đổi tên.
 *
 * Đây là nửa khó hơn của cặp: `kubectl get configmap` hiện đúng tên, đúng số
 * lượng key, và người chơi dễ gạch nó ra khỏi danh sách nghi ngờ. Chỉ Events của
 * `describe pod` mới nói ra tên key đang thiếu.
 */
const keyConfigMapSai = define(
  'key-configmap-sai',
  SYMPTOM_CONFIG_STUCK,
  (state, object) => {
    let next = state;
    for (const container of parsedContainers(object)) {
      for (const ref of container.configMapRefs) {
        if (ref.key === null) {
          continue;
        }
        const source = objectsOfKind(next, 'ConfigMap', object.namespace).find(
          (item) => item.name === ref.name,
        );
        const data = source === undefined ? null : asRecord(source.spec['data']);
        if (source === undefined || data === null || data[ref.key] === undefined) {
          continue;
        }
        const renamed: Raw = {};
        for (const [key, value] of Object.entries(data)) {
          renamed[key === ref.key ? `${key}_CU` : key] = value;
        }
        next = replaceObject(next, withSpec(source, { data: renamed }));
      }
    }
    return next;
  },
  (state, object) =>
    parsedContainers(object).some((container) =>
      container.configMapRefs.some((ref) => {
        if (ref.key === null) {
          return false;
        }
        const source = objectsOfKind(state, 'ConfigMap', object.namespace).find(
          (item) => item.name === ref.name,
        );
        // ConfigMap MẤT HẲN là sự cố khác — ở đây chỉ tính trường hợp còn object
        // mà thiếu key, đúng như tên gọi.
        return source !== undefined && asRecord(source.spec['data'])?.[ref.key] === undefined;
      }),
    ),
);

// ── Nhóm "Service rỗng endpoint" ────────────────────────────────────────────

/** Đổi một giá trị trong selector của Service — label của pod vẫn y nguyên. */
const serviceSelectorLechLabel = define(
  'service-selector-lech-label',
  SYMPTOM_NO_ENDPOINT,
  (state, object) => {
    const selector = readSelector(object.spec);
    const entries = Object.entries(selector);
    const first = entries[0];
    if (first === undefined) {
      return state;
    }
    const [key, value] = first;
    return replaceObject(state, withSpec(object, { selector: { ...selector, [key]: `${value}-cu` } }));
  },
  (state, object) => {
    const selector = readSelector(object.spec);
    if (Object.keys(selector).length === 0) {
      return false;
    }
    // Không pod nào khớp TRONG KHI namespace vẫn có pod ⇒ selector lệch. Namespace
    // rỗng thật thì đó là sự cố `khong-co-endpoint`, không phải cái này.
    return (
      livePods(state, object.namespace).length > 0 &&
      podsMatching(state, object.namespace, selector).length === 0
    );
  },
);

/**
 * Readiness probe gõ sai cổng: pod `Running` hoàn hảo, label khớp hoàn hảo, mà
 * endpoint vẫn rỗng vì kubelet gỡ pod ra khi READY là 0/1.
 *
 * Đây là nửa còn lại của cặp với `service-selector-lech-label`, và là nửa hay bị
 * bỏ qua: người chơi kiểm label thấy đúng rồi đi tìm chỗ khác.
 *
 * Đích gieo là WORKLOAD (nơi có container), không phải Service.
 */
const readinessProbeSaiCong = define(
  'readiness-probe-sai-cong',
  SYMPTOM_NO_ENDPOINT,
  (state, object) =>
    replaceObject(
      state,
      mapContainers(object, (container) => {
        const open = asArray(container['ports'])
          .map((entry) => asNumber(asRecord(entry)?.['containerPort']))
          .filter((port): port is number => port !== null);
        return {
          ...container,
          readinessProbe: {
            httpGet: { path: '/san-sang', port: (open[0] ?? 8080) + 1 },
            initialDelaySeconds: 3,
            periodSeconds: 5,
          },
        };
      }),
    ),
  (state, object) =>
    parsedContainers(object).some((container) => {
      const probe = container.readinessProbe;
      return probe !== null && probe.port !== null && !container.ports.includes(probe.port);
    }),
);

/**
 * Không còn pod nào phía sau Service — ai đó đã scale workload về 0.
 *
 * Cùng triệu chứng với hai sự cố trên, và là cái duy nhất trong ba mà `get pods`
 * trả lời ngay. Giữ nó trong nhóm vì bước ĐẦU TIÊN vẫn giống hệt (`get endpoints`
 * rỗng), và vì đây là cái người ta hay quên kiểm nhất khi đã tin là mình biết
 * nguyên nhân.
 */
const khongCoEndpoint = define(
  'khong-co-endpoint',
  SYMPTOM_NO_ENDPOINT,
  (state, object) => {
    const selector = readSelector(object.spec);
    if (Object.keys(selector).length === 0) {
      return state;
    }
    let next = state;
    for (const kind of ['Deployment', 'StatefulSet', 'ReplicaSet'] as const) {
      for (const workload of objectsOfKind(next, kind, object.namespace)) {
        if (matchLabels(templateLabels(workload), selector)) {
          next = replaceObject(next, withSpec(workload, { replicas: 0 }));
        }
      }
    }
    // Pod TRẦN không có controller nào để hạ về 0 — nó chỉ biến mất khi bị xoá,
    // và đó cũng là cách nó biến mất ngoài đời. Thiếu nhánh này thì sự cố không
    // gieo được lên một Service đứng sau pod trần, và nó im lặng không làm gì.
    for (const pod of podsMatching(next, object.namespace, selector)) {
      if (pod.ownerUid === null) {
        next = removeObjectCascade(next, pod.uid);
      }
    }
    return next;
  },
  (state, object) => {
    const selector = readSelector(object.spec);
    if (Object.keys(selector).length === 0) {
      return false;
    }
    const backing = ['Deployment', 'StatefulSet', 'ReplicaSet'].flatMap((kind) =>
      objectsOfKind(state, kind as 'Deployment', object.namespace).filter((workload) =>
        matchLabels(templateLabels(workload), selector),
      ),
    );
    // Không pod nào khớp, và không workload nào còn được yêu cầu chạy ⇒ thật sự
    // không còn gì phía sau Service. Chồng lấn với `service-selector-lech-label`
    // là vô hại: `no-incident-active` chỉ hỏi những sự cố ĐÃ được gieo.
    return (
      podsMatching(state, object.namespace, selector).length === 0 &&
      backing.every((workload) => (asNumber(workload.spec['replicas']) ?? 0) === 0)
    );
  },
);

/** Service trỏ `targetPort` vào một cổng container không mở — endpoint VẪN đủ. */
const serviceSaiTargetPort = define(
  'service-sai-targetport',
  'Endpoints có đủ pod và pod nào cũng Ready, nhưng gọi vào Service thì không có phản hồi.',
  (state, object) => {
    const ports = asArray(object.spec['ports']).map((entry) => {
      const record = asRecord(entry);
      if (record === null) {
        return entry;
      }
      const port = asNumber(record['port']) ?? 80;
      const target = asNumber(record['targetPort']) ?? port;
      return { ...record, targetPort: target + 1 };
    });
    return replaceObject(state, withSpec(object, { ports }));
  },
  (state, object) => {
    const selector = readSelector(object.spec);
    const pods = podsMatching(state, object.namespace, selector);
    if (pods.length === 0) {
      return false;
    }
    const open = new Set(
      pods.flatMap((pod) => readContainers(pod.spec, TICK_MS).flatMap((container) => container.ports)),
    );
    const targets = asArray(object.spec['ports'])
      .map((entry) => {
        const record = asRecord(entry);
        const port = asNumber(record?.['port']);
        return asNumber(record?.['targetPort']) ?? port;
      })
      .filter((port): port is number => port !== null);
    return targets.length > 0 && targets.every((port) => !open.has(port));
  },
);

// ── Nhóm mạng ───────────────────────────────────────────────────────────────

/**
 * Đánh giá NetworkPolicy. Hai hàm này sống ở đây vì hai sự cố dưới cần chúng, và
 * `predicates.ts` nhập lại từ đây — một chiều, không vòng.
 *
 * Luật của Kubernetes, ngược trực giác của gần như mọi người mới: không policy
 * nào chọn pod ⇒ **mở hết**; có ít nhất một policy chọn pod ⇒ pod đó chuyển sang
 * **từ chối mặc định** và chỉ những gì liệt kê tường minh mới qua. Nhiều policy
 * thì HỢP quyền lại — policy không bao giờ trừ đi.
 */
export function ingressAllowed(
  state: ClusterState,
  namespace: string,
  fromLabels: Readonly<Record<string, string>>,
  toLabels: Readonly<Record<string, string>>,
  port: number | null,
): boolean {
  const guarding = objectsOfKind(state, 'NetworkPolicy', namespace).filter((policy) => {
    const selector = asStringMap(asRecord(policy.spec['podSelector'])?.['matchLabels']);
    if (!matchLabels(toLabels, selector)) {
      return false;
    }
    const types = asStringArray(policy.spec['policyTypes']);
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
      // `from` vắng ⇒ cho phép MỌI nguồn, không phải cấm hết.
      const sourceOk =
        froms.length === 0 ||
        froms.some((entry) =>
          matchLabels(
            fromLabels,
            asStringMap(asRecord(asRecord(entry)?.['podSelector'])?.['matchLabels']),
          ),
        );
      const ports = asArray(record['ports']);
      const portOk =
        port === null ||
        ports.length === 0 ||
        ports.some((entry) => asNumber(asRecord(entry)?.['port']) === port);
      return sourceOk && portOk;
    }),
  );
}

export function egressAllowed(state: ClusterState, pod: K8sObject, port: number): boolean {
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

/** Cổng DNS. Một policy default-deny quên mở egress 53 là cách kinh điển làm sập DNS. */
const DNS_PORT = 53;

function addPolicy(state: ClusterState, object: K8sObject, name: string, spec: Raw): ClusterState {
  const existing = objectsOfKind(state, 'NetworkPolicy', object.namespace).find(
    (policy) => policy.name === name,
  );
  if (existing !== undefined) {
    return replaceObject(state, withSpec(existing, spec));
  }
  const allocated = allocateUid(state);
  return addObject(allocated.state, {
    uid: allocated.uid,
    kind: 'NetworkPolicy',
    name,
    namespace: object.namespace,
    labels: {},
    spec,
    ownerUid: null,
    createdTick: state.tick,
    runtime: { kind: 'none' },
  });
}

/** Nhãn của pod mà một object đại diện — template với workload, labels với Pod. */
function podLabelsOf(object: K8sObject): Readonly<Record<string, string>> {
  const template = workloadTemplate(object);
  return template === null ? object.labels : templateLabels(object);
}

/**
 * DNS chết vì một policy default-deny quên mở egress 53.
 *
 * Triệu chứng tách nó khỏi `networkpolicy-chan-nham` bằng đúng một quan sát: gọi
 * theo TÊN thì hỏng, gọi theo IP thì được. Nguyên nhân thì cùng họ (đều là
 * NetworkPolicy), nên người chơi đúng đường vẫn phải đọc kỹ chiều của policy.
 */
const dnsKhongPhanGiai = define(
  'dns-khong-phan-giai',
  'Gọi dịch vụ theo tên thì hỏng, gọi thẳng bằng địa chỉ IP thì vẫn được.',
  (state, object) =>
    addPolicy(state, object, 'chan-het-egress', {
      podSelector: { matchLabels: podLabelsOf(object) },
      policyTypes: ['Egress'],
      egress: [{ ports: [{ port: 8080, protocol: 'TCP' }] }],
    }),
  (state, object) => {
    const pods = object.kind === 'Pod' ? [object] : podsOwnedBy(state, object.uid);
    return pods.length > 0 && pods.every((pod) => !egressAllowed(state, pod, DNS_PORT));
  },
);

/**
 * Policy chặn nhầm traffic hợp lệ: hai dịch vụ đều khoẻ mà không nói chuyện được.
 *
 * `from` trỏ vào một nhãn không pod nào mang, nên policy đóng vai default-deny mà
 * nhìn qua vẫn có vẻ "đã cho phép ai đó".
 */
const networkPolicyChanNham = define(
  'networkpolicy-chan-nham',
  'Hai dịch vụ không gọi được nhau dù cả hai đều Running và Ready.',
  (state, object) =>
    addPolicy(state, object, 'chi-cho-noi-bo', {
      podSelector: { matchLabels: podLabelsOf(object) },
      policyTypes: ['Ingress'],
      ingress: [{ from: [{ podSelector: { matchLabels: { tang: 'khong-ton-tai' } } }] }],
    }),
  (state, object) => {
    // ⚠ Hỏi về CHÍNH policy, không hỏi "có ai đang bị chặn không". Bản đầu đếm
    // pod nguồn bị chặn, và nó có hai chỗ hỏng: ở một namespace chỉ có một pod
    // thì không có nguồn nào để đếm, còn người chơi XOÁ pod nguồn đi thì sự cố
    // đọc ra là "đã sửa" trong khi policy vẫn chặn y nguyên.
    const to = podLabelsOf(object);
    const pods = livePods(state, object.namespace);
    return objectsOfKind(state, 'NetworkPolicy', object.namespace).some((policy) => {
      const selector = asStringMap(asRecord(policy.spec['podSelector'])?.['matchLabels']);
      if (!matchLabels(to, selector)) {
        return false;
      }
      const types = asStringArray(policy.spec['policyTypes']);
      const guardsIngress =
        types.length === 0 ? policy.spec['ingress'] !== undefined : types.includes('Ingress');
      if (!guardsIngress) {
        return false;
      }
      const rules = asArray(policy.spec['ingress']);
      // Policy có chọn pod đích nhưng KHÔNG rule nào mở cho một nguồn có thật ⇒
      // nó là default-deny đội lốt một policy trông có vẻ đã cho phép ai đó.
      return !rules.some((rule) => {
        const froms = asArray(asRecord(rule)?.['from']);
        if (froms.length === 0) {
          return true;
        }
        return froms.some((entry) => {
          const from = asStringMap(asRecord(asRecord(entry)?.['podSelector'])?.['matchLabels']);
          return pods.some((pod) => matchLabels(pod.labels, from));
        });
      });
    });
  },
);

/**
 * Ingress định tuyến sai.
 *
 * ⚠ Gieo sai CẢ `path` lẫn `serviceName` — cố ý, và đây là một đánh đổi có ghi
 * lại. `isActive` cần một dấu hiệu tự kiểm được, mà "path này có đúng không" thì
 * không có gốc tham chiếu nào trong trạng thái cụm để đối chiếu; còn "rule trỏ
 * tới một Service không tồn tại" thì có. Người chơi vẫn sửa đúng một chỗ (mục
 * tiêu `ingress-routes` đòi đủ cặp path + serviceName), và `no-incident-active`
 * tắt đúng lúc mục tiêu xanh.
 */
const ingressSaiPath = define(
  'ingress-sai-path',
  'Truy cập từ ngoài trả 404; gọi thẳng Service ở trong cluster thì vẫn bình thường.',
  (state, object) => {
    const rules = asArray(object.spec['rules']).map((rule) => {
      const record = asRecord(rule);
      if (record === null) {
        return rule;
      }
      const paths = asArray(record['paths']).map((entry) => {
        const path = asRecord(entry);
        if (path === null) {
          return entry;
        }
        return {
          ...path,
          path: `${asString(path['path']) ?? '/'}-cu`,
          serviceName: `${asString(path['serviceName']) ?? 'web'}-cu`,
        };
      });
      return { ...record, paths };
    });
    return replaceObject(state, withSpec(object, { rules }));
  },
  (state, object) => {
    const services = new Set(objectsOfKind(state, 'Service', object.namespace).map((item) => item.name));
    return asArray(object.spec['rules']).some((rule) =>
      asArray(asRecord(rule)?.['paths']).some((entry) => {
        const name = asString(asRecord(entry)?.['serviceName']);
        return name !== null && !services.has(name);
      }),
    );
  },
);

// ── Nhóm lưu trữ ────────────────────────────────────────────────────────────

const pvcKhongCoPvKhop = define(
  'pvc-khong-co-pv-khop',
  SYMPTOM_PVC_PENDING,
  (state, object) => {
    const resources = asRecord(object.spec['resources']) ?? {};
    const requests = asRecord(resources['requests']) ?? {};
    return replaceObject(
      state,
      withSpec(object, { resources: { ...resources, requests: { ...requests, storage: '512Gi' } } }),
    );
  },
  (state, object) => {
    if (object.runtime.kind !== 'pvc' || object.runtime.boundVolume !== null) {
      return false;
    }
    const want = parseMemory(readPath(object.spec, 'resources.requests.storage'));
    if (want === null) {
      return false;
    }
    // Không PV nào đủ lớn — đúng nguyên nhân đã gieo. Sai StorageClass là sự cố
    // khác, và `isActive` của nó mới trả lời trường hợp đó.
    return objectsOfKind(state, 'PersistentVolume').every((pv) => {
      const size = parseMemory(asRecord(pv.spec['capacity'])?.['storage']);
      return size !== null && size < want;
    });
  },
);

const storageClassKhongTonTai = define(
  'storageclass-khong-ton-tai',
  SYMPTOM_PVC_PENDING,
  (state, object) => replaceObject(state, withSpec(object, { storageClassName: 'nhanh-ssd-cu' })),
  (state, object) => {
    const want = asString(object.spec['storageClassName']);
    if (want === null) {
      return false;
    }
    return !objectsOfKind(state, 'StorageClass').some((item) => item.name === want);
  },
);

/**
 * PVC `ReadWriteOnce` mà hai pod ở hai node cùng đòi.
 *
 * Triệu chứng RIÊNG trong nhóm lưu trữ, và đó là lý do nó đáng dạy: một pod chạy
 * hoàn hảo trong khi pod anh em của nó kẹt Pending mãi. Trông y như "hết tài
 * nguyên" cho tới khi `describe node` nói là còn dư.
 */
const pvcReadWriteOnceHaiNode = define(
  'pvc-readwriteonce-hai-node',
  'Một pod của workload chạy bình thường, pod còn lại kẹt Pending mãi không lên.',
  (state, object) => {
    const next = replaceObject(state, withSpec(object, { accessModes: ['ReadWriteOnce'] }));
    // Cần ít nhất hai pod cùng đòi claim thì xung đột mới xảy ra.
    let out = next;
    for (const kind of ['Deployment', 'StatefulSet'] as const) {
      for (const workload of objectsOfKind(out, kind, object.namespace)) {
        if (!mountsClaim(workload, object.name)) {
          continue;
        }
        const replicas = asNumber(workload.spec['replicas']) ?? 1;
        if (replicas < 2) {
          out = replaceObject(out, withSpec(workload, { replicas: 2 }));
        }
      }
    }
    return out;
  },
  (state, object) => {
    if (!asStringArray(object.spec['accessModes']).includes('ReadWriteOnce')) {
      return false;
    }
    const consumers = livePods(state, object.namespace).filter((pod) => mountsClaim(pod, object.name));
    const nodes = new Set(
      consumers.map((pod) => podRuntime(pod)?.nodeName).filter((name): name is string => name != null),
    );
    // Nhiều pod đòi cùng một claim RWO, mà không phải tất cả đều nằm trên một node
    // ⇒ xung đột vẫn còn. Gộp hết về một node cũng là một cách sửa hợp lệ.
    return consumers.length > 1 && nodes.size !== 1;
  },
);

function mountsClaim(object: K8sObject, claimName: string): boolean {
  const template = workloadTemplate(object);
  const volumes = asArray((template ?? object.spec)['volumes']);
  return volumes.some(
    (entry) => asString(asRecord(asRecord(entry)?.['persistentVolumeClaim'])?.['claimName']) === claimName,
  );
}

// ── Nhóm node và xếp lịch ───────────────────────────────────────────────────

/** Node đích: node đang chạy pod của object, hoặc chính object nếu nó là Node. */
function targetNodeName(state: ClusterState, object: K8sObject): string | null {
  if (object.kind === 'Node') {
    return object.name;
  }
  const pods = object.kind === 'Pod' ? [object] : podsOwnedBy(state, object.uid);
  for (const pod of pods) {
    const nodeName = podRuntime(pod)?.nodeName;
    if (nodeName != null) {
      return nodeName;
    }
  }
  return state.nodes[0]?.name ?? null;
}

const nodeNotReady = define(
  'node-notready',
  'Một node chuyển sang NotReady; pod trên đó mất READY ngay nhưng vẫn hiện Running một lúc lâu.',
  (state, object) => {
    const nodeName = targetNodeName(state, object);
    if (nodeName === null) {
      return state;
    }
    return {
      ...state,
      nodes: state.nodes.map((node) => (node.name === nodeName ? { ...node, ready: false } : node)),
    };
  },
  (state, object) => {
    const nodeName = targetNodeName(state, object);
    return nodeName !== null && state.nodes.some((node) => node.name === nodeName && !node.ready);
  },
);

/**
 * Một workload khác ăn hết chỗ trên node.
 *
 * Gieo bằng một pod THẬT xin gần hết tài nguyên còn lại, chứ không phải bằng cách
 * thu nhỏ node: node ở cụm thật không tự bé đi, và người chơi phải tìm ra AI đang
 * giữ chỗ — đó mới là việc thật. Đường sửa hợp lệ gồm xoá pod đó, giảm requests
 * của nó, hoặc thêm node.
 */
function hogPod(kind: 'cpu' | 'memory'): (state: ClusterState, object: K8sObject) => ClusterState {
  return (state, object) => {
    const nodeName = targetNodeName(state, object);
    const node = state.nodes.find((item) => item.name === nodeName);
    if (node === undefined) {
      return state;
    }
    const name = `chiem-${kind}-${node.name}`;
    if (objectsOfKind(state, 'Pod', object.namespace).some((pod) => pod.name === name)) {
      return state;
    }
    const used = namespaceUsage(state, object.namespace, TICK_MS);
    const requests =
      kind === 'cpu'
        ? { cpu: `${Math.max(100, Math.floor((node.cpu - used.cpu) * 0.92))}m` }
        : { memory: `${Math.max(64, Math.floor((node.memory - used.memory) * 0.92))}Mi` };
    const allocated = allocateUid(state);
    return addObject(allocated.state, {
      uid: allocated.uid,
      kind: 'Pod',
      name,
      namespace: object.namespace,
      labels: { app: 'xu-ly-lo', 'quan-ly-boi': 'doi-du-lieu' },
      spec: {
        labels: { app: 'xu-ly-lo', 'quan-ly-boi': 'doi-du-lieu' },
        nodeName: node.name,
        containers: [
          {
            name: 'xu-ly-lo',
            image: 'ghcr.io/dlp/xu-ly-lo:2.1.0',
            ports: [{ containerPort: 9000 }],
            resources: { requests },
          },
        ],
      },
      ownerUid: null,
      createdTick: state.tick,
      runtime: { kind: 'pod', pod: { ...emptyPod(node.name) } },
    });
  };
}

/** Pod mới sinh cho sự cố chiếm chỗ — cùng hình dạng `newPod` của `model.ts`. */
function emptyPod(nodeName: string) {
  return {
    phase: 'Pending' as const,
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

function hogStillThere(kind: 'cpu' | 'memory'): Check {
  return (state, object) => {
    const nodeName = targetNodeName(state, object);
    if (nodeName === null) {
      return false;
    }
    const hog = livePods(state, object.namespace).find(
      (pod) => pod.name === `chiem-${kind}-${nodeName}`,
    );
    if (hog === undefined) {
      return false;
    }
    const node = state.nodes.find((item) => item.name === nodeName);
    if (node === undefined) {
      return false;
    }
    const containers = readContainers(hog.spec, TICK_MS);
    const asked = containers.reduce(
      (sum, container) => sum + (kind === 'cpu' ? (container.requestsCpu ?? 0) : (container.requestsMemory ?? 0)),
      0,
    );
    // Vẫn còn giữ hơn nửa node ⇒ sự cố còn. Giảm requests xuống là một cách sửa
    // hợp lệ, và phép so này công nhận nó.
    return asked * 2 > (kind === 'cpu' ? node.cpu : node.memory);
  };
}

const nodeHetCpu = define('node-het-cpu', SYMPTOM_UNSCHEDULABLE, hogPod('cpu'), hogStillThere('cpu'));
const nodeHetMemory = define(
  'node-het-memory',
  SYMPTOM_UNSCHEDULABLE,
  hogPod('memory'),
  hogStillThere('memory'),
);

const TAINT = 'danh-rieng=du-lieu:NoSchedule';

/** Luật khớp taint — bản sao của `tolerates()` trong `scheduler.ts` (chưa export). */
function toleratesTaint(tolerations: readonly string[], taint: string): boolean {
  const key = taint.split('=')[0]?.split(':')[0] ?? taint;
  return tolerations.some((toleration) => toleration === taint || toleration === key);
}

const taintKhongCoToleration = define(
  'taint-khong-co-toleration',
  SYMPTOM_UNSCHEDULABLE,
  (state, object) => {
    const nodeName = targetNodeName(state, object);
    const withTaint: ClusterState = {
      ...state,
      nodes: state.nodes.map((node) =>
        node.name === nodeName && !node.taints.includes(TAINT)
          ? { ...node, taints: [...node.taints, TAINT] }
          : node,
      ),
    };
    // Gỡ toleration của chính workload đích — nếu không, thêm taint chẳng đổi gì.
    const template = workloadTemplate(object);
    const current = asStringArray((template ?? object.spec)['tolerations']);
    return current.length === 0
      ? withTaint
      : replaceObject(
          withTaint,
          withPodField(
            object,
            'tolerations',
            current.filter((toleration) => !toleratesTaint([toleration], TAINT)),
          ),
        );
  },
  (state, object) => {
    const template = workloadTemplate(object);
    const tolerations = asStringArray((template ?? object.spec)['tolerations']);
    const tainted = state.nodes.filter((node) => node.taints.length > 0);
    return (
      tainted.length > 0 &&
      tainted.every((node) => !node.taints.every((taint) => toleratesTaint(tolerations, taint)))
    );
  },
);

const nodeSelectorKhongKhop = define(
  'nodeselector-khong-khop',
  SYMPTOM_UNSCHEDULABLE,
  (state, object) =>
    replaceObject(state, withPodField(object, 'nodeSelector', { 'dia-cung': 'ssd-nvme' })),
  (state, object) => {
    const template = workloadTemplate(object);
    const selector = asStringMap((template ?? object.spec)['nodeSelector']);
    if (Object.keys(selector).length === 0) {
      return false;
    }
    return !state.nodes.some((node) => matchLabels(node.labels, selector));
  },
);

// ── Nhóm hạn mức ────────────────────────────────────────────────────────────

/**
 * Pod dựng từ template của một workload, CHỈ để hỏi cổng admission.
 *
 * Không bao giờ được thêm vào state — nó tồn tại đúng một lời gọi `admitPod`. Nhờ
 * dùng lại chính `admitPod` của `controllers.ts`, `isActive` đúng bằng định nghĩa
 * với câu "API server có từ chối pod tiếp theo không", thay vì là một bản chép
 * luật quota có thể lệch đi sau này.
 */
function probePod(object: K8sObject): K8sObject {
  const template = workloadTemplate(object);
  return template === null ? object : { ...object, kind: 'Pod', spec: template };
}

function admissionBlockedBy(state: ClusterState, object: K8sObject, marker: string): boolean {
  const result = admitPod(state, probePod(object), TICK_MS);
  return !result.allowed && result.message.includes(marker);
}

const resourceQuotaChan = define(
  'resourcequota-chan',
  SYMPTOM_POD_NEVER_APPEARS,
  (state, object) => {
    const used = namespaceUsage(state, object.namespace, TICK_MS);
    const existing = objectsOfKind(state, 'ResourceQuota', object.namespace)[0];
    const hard = { pods: Math.max(1, used.pods - 1) };
    if (existing !== undefined) {
      return replaceObject(state, withSpec(existing, { hard: { ...asRecord(existing.spec['hard']), ...hard } }));
    }
    const allocated = allocateUid(state);
    return addObject(allocated.state, {
      uid: allocated.uid,
      kind: 'ResourceQuota',
      name: 'han-muc-nhom',
      namespace: object.namespace,
      labels: {},
      spec: { hard },
      ownerUid: null,
      createdTick: state.tick,
      runtime: { kind: 'none' },
    });
  },
  (state, object) => admissionBlockedBy(state, object, 'ResourceQuota'),
);

const limitRangeTuChoi = define(
  'limitrange-tu-choi',
  SYMPTOM_POD_NEVER_APPEARS,
  (state, object) => {
    const containers = parsedContainers(object);
    const asked = containers.reduce((sum, container) => sum + (container.requestsMemory ?? 64), 0);
    const existing = objectsOfKind(state, 'LimitRange', object.namespace)[0];
    // Đòi mức TỐI THIỂU cao hơn thứ workload đang xin ⇒ mọi pod mới bị từ chối,
    // trong khi pod đang chạy vẫn nguyên. Đó là điều làm sự cố này khó thấy.
    const limits = [{ type: 'Container', min: { memory: `${asked * 2}Mi` } }];
    if (existing !== undefined) {
      return replaceObject(state, withSpec(existing, { limits }));
    }
    const allocated = allocateUid(state);
    return addObject(allocated.state, {
      uid: allocated.uid,
      kind: 'LimitRange',
      name: 'muc-toi-thieu',
      namespace: object.namespace,
      labels: {},
      spec: { limits },
      ownerUid: null,
      createdTick: state.tick,
      runtime: { kind: 'none' },
    });
  },
  (state, object) => admissionBlockedBy(state, object, 'LimitRange'),
);

/**
 * Workload đòi nhiều replica hơn quota cho phép.
 *
 * Khác `resourcequota-chan` ở CHỖ SỬA chứ không ở triệu chứng: ở đây quota là
 * đúng và con số replica mới là thứ sai. Người chơi phải đọc `describe
 * resourcequota` rồi so với `spec.replicas` mới thấy — `get pods` không có gì.
 */
const replicaVuotQuota = define(
  'replica-vuot-quota',
  SYMPTOM_POD_NEVER_APPEARS,
  (state, object) => {
    const quota = objectsOfKind(state, 'ResourceQuota', object.namespace)[0];
    const limit =
      quota === undefined ? null : asNumber(asRecord(quota.spec['hard'])?.['pods']);
    const replicas = asNumber(object.spec['replicas']) ?? 1;
    if (limit !== null) {
      return replaceObject(state, withSpec(object, { replicas: limit + 2 }));
    }
    const allocated = allocateUid(state);
    const withQuota = addObject(allocated.state, {
      uid: allocated.uid,
      kind: 'ResourceQuota',
      name: 'han-muc-nhom',
      namespace: object.namespace,
      labels: {},
      spec: { hard: { pods: replicas } },
      ownerUid: null,
      createdTick: state.tick,
      runtime: { kind: 'none' },
    });
    return replaceObject(withQuota, withSpec(object, { replicas: replicas + 2 }));
  },
  (state, object) => {
    const replicas = asNumber(object.spec['replicas']) ?? 1;
    return objectsOfKind(state, 'ResourceQuota', object.namespace).some((quota) => {
      const pods = asNumber(asRecord(quota.spec['hard'])?.['pods']);
      return pods !== null && replicas > pods;
    });
  },
);

// ── Nhóm RBAC ───────────────────────────────────────────────────────────────

/** Tên ServiceAccount mà object dùng. `default` khi không khai, đúng như K8s. */
function serviceAccountOf(object: K8sObject): string {
  const template = workloadTemplate(object);
  return asString((template ?? object.spec)['serviceAccountName']) ?? 'default';
}

const rbacThieuQuyen = define(
  'rbac-thieu-quyen',
  SYMPTOM_FORBIDDEN,
  (state, object) => {
    const account = serviceAccountOf(object);
    let next = state;
    for (const binding of objectsOfKind(state, 'RoleBinding', object.namespace)) {
      const bound = asArray(binding.spec['subjects']).some(
        (entry) => asString(asRecord(entry)?.['name']) === account,
      );
      if (bound) {
        next = removeObjectCascade(next, binding.uid);
      }
    }
    return next;
  },
  (state, object) => {
    const account = serviceAccountOf(object);
    // Không còn RoleBinding nào nhắc tới SA ⇒ nó không có quyền gì cả. Đây là
    // câu mà `kubectl auth can-i --list --as=...` trả lời ở cụm thật.
    return !objectsOfKind(state, 'RoleBinding', object.namespace).some((binding) =>
      asArray(binding.spec['subjects']).some(
        (entry) => asString(asRecord(entry)?.['name']) === account,
      ),
    );
  },
);

/**
 * Pod trỏ tới một ServiceAccount không tồn tại.
 *
 * ⚠ Mô phỏng KHÔNG chặn pod vì lý do này (Kubernetes thật thì kubelet không mount
 * được token và pod hỏng lúc gọi API). Đây là sự cố kiểu "cụm vẫn xanh mà cấu
 * hình vẫn sai" — giống hệt `SecretExposed` trong danh mục nghiên cứu, và nó dạy
 * một điều đúng: mọi thứ đang chạy KHÔNG đồng nghĩa mọi thứ ổn. Nó cũng là nửa
 * kia của cặp với `rbac-thieu-quyen`: cùng một câu 403, hai chỗ sửa khác nhau.
 */
const serviceAccountKhongTonTai = define(
  'serviceaccount-khong-ton-tai',
  SYMPTOM_FORBIDDEN,
  (state, object) => replaceObject(state, withPodField(object, 'serviceAccountName', 'bo-doc-cu')),
  (state, object) => {
    const account = serviceAccountOf(object);
    if (account === 'default') {
      return false;
    }
    return !objectsOfKind(state, 'ServiceAccount', object.namespace).some(
      (item) => item.name === account,
    );
  },
);

// ── Nhóm vận hành ───────────────────────────────────────────────────────────

/**
 * PDB đòi giữ đủ số pod đang có ⇒ ngân sách gián đoạn bằng 0 ⇒ `drain` treo.
 *
 * Ở đây không có gì đỏ cả: mọi pod Ready, mọi probe xanh, và `kubectl drain` chỉ
 * đơn giản là không tiến. Đó chính là thứ làm nó khó — không có triệu chứng nào
 * để mà nhìn ngoài chính lệnh đang đứng im.
 */
const pdbChanDrain = define(
  'pdb-chan-drain',
  'Lệnh `kubectl drain` đứng im không tiến, node mãi không trống, và không pod nào có vẻ ốm.',
  (state, object) => {
    const selector = readSelector(object.spec);
    const running = podsMatching(state, object.namespace, selector).length;
    return replaceObject(state, withSpec(object, { minAvailable: Math.max(1, running) }));
  },
  (state, object) => {
    const minAvailable = asNumber(object.spec['minAvailable']);
    const selector = readSelector(object.spec);
    if (minAvailable === null || Object.keys(selector).length === 0) {
      return false;
    }
    // Số pod hiện có KHÔNG lớn hơn mức tối thiểu ⇒ không được phép gián đoạn pod
    // nào ⇒ drain không bao giờ xong.
    return podsMatching(state, object.namespace, selector).length <= minAvailable;
  },
);

/**
 * HPA mù vì container không khai `requests.cpu`.
 *
 * HPA tính phần trăm sử dụng theo `requests`; không có `requests` thì mẫu số bằng
 * không, `kubectl get hpa` hiện `<unknown>/70%` và không có gì được scale. Dùng
 * lại `hpaHasMetrics` của `controllers.ts` nên vị từ, vòng điều hoà và sự cố
 * không bao giờ bất đồng về cùng một câu hỏi.
 */
const hpaKhongCoMetrics = define(
  'hpa-khong-co-metrics',
  'HPA hiện `<unknown>/70%` và không scale gì cả, kể cả khi số replica rõ ràng đang thiếu.',
  (state, object) => {
    const target = scaleTargetOf(state, object) ?? object;
    return replaceObject(
      state,
      mapContainers(target, (container) => {
        const resources = asRecord(container['resources']) ?? {};
        const requests = { ...(asRecord(resources['requests']) ?? {}) };
        delete requests['cpu'];
        return { ...container, resources: { ...resources, requests } };
      }),
    );
  },
  (state, object) => {
    const target = scaleTargetOf(state, object) ?? object;
    return !hpaHasMetrics(target);
  },
);

/** Đích của một HPA. Trả `null` khi object không phải HPA (sự cố gieo thẳng lên workload). */
function scaleTargetOf(state: ClusterState, object: K8sObject): K8sObject | null {
  if (object.kind !== 'HorizontalPodAutoscaler') {
    return null;
  }
  const name = asString(asRecord(object.spec['scaleTargetRef'])?.['name']);
  if (name === null) {
    return null;
  }
  return (
    state.objects.find(
      (item) =>
        item.name === name &&
        item.namespace === object.namespace &&
        (item.kind === 'Deployment' || item.kind === 'StatefulSet' || item.kind === 'ReplicaSet'),
    ) ?? null
  );
}

// ── Bảng tra ────────────────────────────────────────────────────────────────

export const INCIDENTS: IncidentTable = {
  'image-tag-sai': imageTagSai,
  'image-registry-khong-toi-duoc': imageRegistryKhongToiDuoc,
  'thieu-imagepullsecret': thieuImagePullSecret,
  'memory-limit-qua-thap': memoryLimitQuaThap,
  'lenh-entrypoint-sai': lenhEntrypointSai,
  'thieu-configmap': thieuConfigMap,
  'thieu-secret': thieuSecret,
  'key-configmap-sai': keyConfigMapSai,
  'readiness-probe-sai-cong': readinessProbeSaiCong,
  'liveness-probe-qua-gat': livenessProbeQuaGat,
  'probe-khong-co-initialdelay': probeKhongCoInitialDelay,
  'service-selector-lech-label': serviceSelectorLechLabel,
  'service-sai-targetport': serviceSaiTargetPort,
  'khong-co-endpoint': khongCoEndpoint,
  'dns-khong-phan-giai': dnsKhongPhanGiai,
  'networkpolicy-chan-nham': networkPolicyChanNham,
  'ingress-sai-path': ingressSaiPath,
  'pvc-khong-co-pv-khop': pvcKhongCoPvKhop,
  'storageclass-khong-ton-tai': storageClassKhongTonTai,
  'pvc-readwriteonce-hai-node': pvcReadWriteOnceHaiNode,
  'node-notready': nodeNotReady,
  'node-het-cpu': nodeHetCpu,
  'node-het-memory': nodeHetMemory,
  'taint-khong-co-toleration': taintKhongCoToleration,
  'nodeselector-khong-khop': nodeSelectorKhongKhop,
  'resourcequota-chan': resourceQuotaChan,
  'limitrange-tu-choi': limitRangeTuChoi,
  'rbac-thieu-quyen': rbacThieuQuyen,
  'serviceaccount-khong-ton-tai': serviceAccountKhongTonTai,
  'pdb-chan-drain': pdbChanDrain,
  'hpa-khong-co-metrics': hpaKhongCoMetrics,
  'replica-vuot-quota': replicaVuotQuota,
};

/**
 * Gieo mọi `seededIncident` mà level khai báo.
 *
 * ⚠ Hàm này CHƯA được gọi ở đâu cả — `createCluster` (lane B, `model.ts`) dựng
 * trạng thái từ `ClusterSpec` và bỏ qua trường `seededIncident`. Nó nằm ở đây để
 * lane B nối vào bằng một dòng khi dựng phiên, thay vì phải tự viết lại vòng lặp
 * này. Đã báo lead.
 */
export function seedIncidents(
  state: ClusterState,
  resources: readonly { readonly kind: ResourceKind; readonly name: string; readonly namespace: string; readonly seededIncident?: IncidentKind }[],
): ClusterState {
  let next = state;
  for (const resource of resources) {
    const kind = resource.seededIncident;
    if (kind === undefined) {
      continue;
    }
    const ref: ResourceRef = {
      kind: resource.kind,
      namespace: resource.namespace,
      name: resource.name,
    };
    const object = findObject(next, ref);
    next = INCIDENTS[kind].inject(next, object === null ? ref : objectRef(object));
  }
  return next;
}
