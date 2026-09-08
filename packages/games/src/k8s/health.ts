/**
 * Vì sao một container KHÔNG chạy được — tầng luật mà cả `tick.ts` (sinh triệu
 * chứng) lẫn `incidents.ts` (gieo nguyên nhân) cùng đọc.
 *
 * ## Mô phỏng không có registry thật, nên "image này có tồn tại không" phải là một LUẬT
 *
 * Ba cách trả lời câu hỏi đó, và vì sao chọn cách thứ ba:
 *
 * 1. *Mọi image đều kéo được* — thì `image-tag-sai` không có triệu chứng, và ba
 *    level của chương 1 mất chỗ dựa.
 * 2. *Chỉ image trong một danh mục cứng mới kéo được* — người chơi gõ một image
 *    hợp lệ mà ta chưa liệt kê sẽ thấy `ErrImagePull` không có lý do nào, và sẽ
 *    học rằng Kubernetes hỏng vô cớ. Đó là dạy sai.
 * 3. **Image kéo được TRỪ KHI khớp một dấu hiệu hỏng công khai** — chọn cách này.
 *    Ba dấu hiệu dưới đây được export, level và gợi ý gọi thẳng tên chúng, nên
 *    luật này là thứ người chơi ĐỌC ĐƯỢC chứ không phải một hộp đen.
 *
 * Đánh đổi đã biết: một người chơi "sửa" tag hỏng bằng cách gõ một tag bịa vẫn
 * qua được. Ở cụm thật thì không. Chấp nhận, vì cái giá của chiều ngược lại —
 * chặn mọi image không nằm trong danh mục — đắt hơn nhiều.
 */

import type { ClusterState, K8sObject } from './model.ts';
import type { PodReason } from './contract.ts';
import { objectsOfKind } from './query.ts';
import type { ContainerSpec } from './resources.ts';
import { asRecord, asStringArray, readContainers } from './resources.ts';

/** Tag mang chuỗi này = không tồn tại trên registry. `image-tag-sai` gieo nó. */
export const MISSING_TAG_MARKER = 'khong-ton-tai';

/** Registry không phân giải được. `image-registry-khong-toi-duoc` gieo nó. */
export const UNREACHABLE_REGISTRIES: readonly string[] = ['registry.noi-bo.local'];

/** Repo riêng tư — cần `imagePullSecrets`. `thieu-imagepullsecret` gieo nó. */
export const PRIVATE_REPO_MARKER = '/rieng-tu';

/** Binary không có trong image. `lenh-entrypoint-sai` gieo nó. */
export const MISSING_BINARY_MARKER = 'khong-co';

/** Mức RAM một container dùng khi không khai `requests` — đủ để nginx sống. */
export const DEFAULT_MEMORY_USAGE_MI = 64;

export interface ImageRef {
  readonly registry: string;
  readonly repository: string;
  readonly tag: string;
}

/**
 * Tách `nginx:1.27-alpine` / `ghcr.io/dlp/api:1.4.2` / `nginx`.
 *
 * ⚠ Dấu `:` KHÔNG đủ để nhận ra tag: `localhost:5000/nginx` có `:` ở phần host.
 * Luật thật của Docker là tag nằm sau dấu `:` CUỐI CÙNG và sau dấu `/` cuối cùng.
 * Nhầm chỗ này cho ra một "tag" tên `5000/nginx` và mọi phép kiểm image sau đó
 * đều vô nghĩa.
 */
export function parseImage(image: string): ImageRef {
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  const hasTag = lastColon > lastSlash;
  const withoutTag = hasTag ? image.slice(0, lastColon) : image;
  const tag = hasTag ? image.slice(lastColon + 1) : 'latest';
  const firstSlash = withoutTag.indexOf('/');
  const head = firstSlash === -1 ? '' : withoutTag.slice(0, firstSlash);
  // Host phải có dấu chấm hoặc cổng, nếu không `dlp/api` sẽ bị đọc thành host
  // `dlp` — đúng luật phân biệt của Docker.
  const isHost = head !== '' && (head.includes('.') || head.includes(':') || head === 'localhost');
  return {
    registry: isHost ? head : 'docker.io',
    repository: isHost ? withoutTag.slice(firstSlash + 1) : withoutTag,
    tag,
  };
}

export type ImageProblem = 'tag-khong-ton-tai' | 'registry-khong-toi-duoc' | 'thieu-credential';

/**
 * `null` = kéo được.
 *
 * Thứ tự kiểm là CÓ CHỦ Ý và khớp thứ tự kubelet gặp lỗi: không tới được registry
 * thì chưa bao giờ biết tag có tồn tại hay không. Đảo thứ tự sẽ báo "tag sai" cho
 * một sự cố mạng, và người chơi sẽ đi sửa đúng thứ không hỏng.
 */
export function imageProblem(
  image: string,
  pullSecretsAvailable: boolean,
): ImageProblem | null {
  const ref = parseImage(image);
  if (UNREACHABLE_REGISTRIES.includes(ref.registry)) {
    return 'registry-khong-toi-duoc';
  }
  if (ref.repository.includes(PRIVATE_REPO_MARKER) && !pullSecretsAvailable) {
    return 'thieu-credential';
  }
  if (ref.tag.includes(MISSING_TAG_MARKER)) {
    return 'tag-khong-ton-tai';
  }
  return null;
}

/** Mọi `imagePullSecrets` của pod đều trỏ tới Secret CÓ THẬT. */
export function hasPullSecrets(state: ClusterState, pod: K8sObject): boolean {
  const names = asStringArray(pod.spec['imagePullSecrets']).concat(
    (Array.isArray(pod.spec['imagePullSecrets']) ? pod.spec['imagePullSecrets'] : [])
      .map((entry) => asRecord(entry)?.['name'])
      .filter((name): name is string => typeof name === 'string'),
  );
  if (names.length === 0) {
    return false;
  }
  const secrets = new Set(
    objectsOfKind(state, 'Secret', pod.namespace).map((secret) => secret.name),
  );
  return names.some((name) => secrets.has(name));
}

// ── Vì sao container không khởi động được ───────────────────────────────────

export interface StartupProblem {
  readonly reason: PodReason;
  /** Exit code container để lại. `describe` đọc nó ở **Last State**. */
  readonly exitCode: number;
  /** Tiếng Việt, một dòng — đi vào `kubectl logs`. */
  readonly log: string;
  /** Tiếng Việt — đi vào Events của `describe`. */
  readonly event: string;
  /** Reason kiểu K8s, giữ tiếng Anh (chuỗi thật của API). */
  readonly eventReason: string;
}

/** RAM container thật sự cần. Không khai `requests` thì lấy mức nền. */
export function memoryUsageOf(container: ContainerSpec): number {
  return container.requestsMemory ?? DEFAULT_MEMORY_USAGE_MI;
}

/**
 * Ba sự cố dễ nhầm nhất hội tụ ở hàm này, và chúng phải cho ra CÙNG triệu chứng ở
 * `kubectl get` (restart tăng, không Ready) nhưng KHÁC nhau ở `describe` và
 * `logs --previous`:
 *
 * | Nguyên nhân | `reason` | exit | Bằng chứng phân biệt |
 * |---|---|---|---|
 * | entrypoint sai | `CrashLoopBackOff` | 127 | `logs --previous` — "không tìm thấy" |
 * | thiếu RAM | `OOMKilled` | 137 | `describe` → Last State: OOMKilled |
 * | liveness quá gắt | `LivenessProbeFailed` | 137 | `describe` → Events: Liveness probe failed |
 *
 * 127 là mã shell trả về khi không tìm thấy lệnh; 137 = 128 + 9 (SIGKILL). Cả hai
 * là số THẬT, và người học sẽ gặp lại đúng chúng ở cụm thật.
 */
export function containerStartupProblem(
  state: ClusterState,
  pod: K8sObject,
  container: ContainerSpec,
): StartupProblem | null {
  const image = imageProblem(container.image, hasPullSecrets(state, pod));
  if (image !== null) {
    return imageStartupProblem(image, container.image);
  }
  if (container.command.some((part) => part.includes(MISSING_BINARY_MARKER))) {
    return {
      reason: 'CrashLoopBackOff',
      exitCode: 127,
      log: `exec ${container.command[0] ?? ''}: không tìm thấy tệp hoặc thư mục`,
      event: `Container ${container.name} thoát với mã 127 — lệnh khởi động không tồn tại trong image.`,
      eventReason: 'BackOff',
    };
  }
  const limit = container.limitsMemory;
  if (limit !== null && limit < memoryUsageOf(container)) {
    return {
      reason: 'OOMKilled',
      exitCode: 137,
      // Log RỖNG là chi tiết đúng: kernel giết tiến trình, ứng dụng không kịp
      // ghi gì. Đó chính là lý do phải đọc `describe` chứ không phải `logs`.
      log: '',
      event: `Container ${container.name} bị kernel giết vì vượt memory limit (${limit}Mi).`,
      eventReason: 'OOMKilling',
    };
  }
  return null;
}

function imageStartupProblem(problem: ImageProblem, image: string): StartupProblem {
  if (problem === 'registry-khong-toi-duoc') {
    return {
      reason: 'ErrImagePull',
      exitCode: 0,
      log: '',
      event: `Không kéo được image "${image}": không phân giải được địa chỉ registry.`,
      eventReason: 'Failed',
    };
  }
  if (problem === 'thieu-credential') {
    return {
      reason: 'ImagePullBackOff',
      exitCode: 0,
      log: '',
      event: `Không kéo được image "${image}": registry từ chối, pod chưa có imagePullSecrets hợp lệ.`,
      eventReason: 'Failed',
    };
  }
  return {
    reason: 'ErrImagePull',
    exitCode: 0,
    log: '',
    event: `Không kéo được image "${image}": không tìm thấy tag trên registry.`,
    eventReason: 'Failed',
  };
}

/**
 * ConfigMap/Secret mà pod tham chiếu nhưng không tồn tại (hoặc thiếu key).
 *
 * Triệu chứng là `CreateContainerConfigError`, và pod kẹt ở `Pending` chứ KHÔNG
 * phải `Running`-rồi-crash — container chưa bao giờ được tạo. Nhầm hai cái này là
 * dạy sai: người chơi sẽ đi đọc `logs` (rỗng, vì không có container) thay vì
 * `describe`.
 */
export function configProblem(state: ClusterState, pod: K8sObject, tickMs: number): string | null {
  const configMaps = new Map(
    objectsOfKind(state, 'ConfigMap', pod.namespace).map((item) => [item.name, item]),
  );
  const secrets = new Map(
    objectsOfKind(state, 'Secret', pod.namespace).map((item) => [item.name, item]),
  );
  for (const container of readContainers(pod.spec, tickMs)) {
    for (const ref of container.configMapRefs) {
      const source = configMaps.get(ref.name);
      if (source === undefined) {
        return `ConfigMap "${ref.name}" không tồn tại trong namespace ${pod.namespace}.`;
      }
      if (ref.key !== null && asRecord(source.spec['data'])?.[ref.key] === undefined) {
        return `ConfigMap "${ref.name}" không có key "${ref.key}".`;
      }
    }
    for (const ref of container.secretRefs) {
      const source = secrets.get(ref.name);
      if (source === undefined) {
        return `Secret "${ref.name}" không tồn tại trong namespace ${pod.namespace}.`;
      }
      if (ref.key !== null && asRecord(source.spec['data'])?.[ref.key] === undefined) {
        return `Secret "${ref.name}" không có key "${ref.key}".`;
      }
    }
  }
  return null;
}

/**
 * Probe fail khi cổng nó gõ không nằm trong cổng container mở.
 *
 * ⚠ Probe KHÔNG khai cổng (`port === null`) coi là ĐẠT, không phải trượt. Một
 * probe thiếu cổng là cấu hình vô nghĩa mà API server sẽ từ chối; mô phỏng cho nó
 * trượt sẽ dựng ra một triệu chứng không tồn tại ngoài đời.
 */
export function probeFails(container: ContainerSpec, probe: { readonly port: number | null }): boolean {
  return probe.port !== null && !container.ports.includes(probe.port);
}
