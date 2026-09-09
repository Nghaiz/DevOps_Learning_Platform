import { parseManifests } from '@devops-platform/games';

/**
 * Rút vài chi tiết của `spec` ra khỏi manifest, cho bảng Tổng quan.
 *
 * ## Vì sao đọc từ manifest chứ không thêm trường vào `ObjectView`
 *
 * Hợp đồng giữ `ObjectView` MỎNG có chủ ý: nó mang đúng những gì `kubectl get`
 * in ra. Nhét `containers` vào đó sẽ kéo cả cây `spec` qua ranh giới engine ↔
 * giao diện, và mọi loại tài nguyên lại phải khai một hình dạng riêng.
 *
 * ## Vì sao KHÔNG tự viết bộ đọc YAML ở đây
 *
 * Dùng đúng `parseManifests` mà engine dùng khi áp manifest. Một bộ đọc thứ hai
 * ở tầng giao diện sẽ trôi khỏi bộ thứ nhất, và triệu chứng của nó là bảng hiện
 * một image mà engine không hề thấy — thứ tệ hơn hẳn việc không hiện gì.
 *
 * Mọi hàm ở đây TRẢ VỀ RỖNG khi không đọc được, không ném: manifest hỏng là
 * chuyện bình thường (người chơi đang gõ dở trong ô YAML), và bảng Tổng quan
 * không phải chỗ báo lỗi cú pháp — ô YAML mới là.
 */

export interface ContainerSummary {
  readonly name: string;
  readonly image: string | null;
  /** Cổng container, đã bỏ trùng và giữ thứ tự khai. */
  readonly ports: readonly number[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * `spec.containers`, kể cả khi nó nằm dưới `spec.template.spec` (Deployment,
 * StatefulSet, DaemonSet, Job, CronJob đều lồng như vậy).
 *
 * ⚠ CronJob lồng SÂU HƠN một tầng nữa (`spec.jobTemplate.spec.template.spec`).
 * Không đi qua tầng đó thì CronJob là loại DUY NHẤT hiện ra không có container
 * nào, và trông y hệt một lỗi dữ liệu.
 */
function containersIn(spec: Readonly<Record<string, unknown>>): readonly unknown[] {
  const direct = asArray(spec['containers']);
  if (direct.length > 0) {
    return direct;
  }
  const template = asRecord(spec['template']);
  if (template !== null) {
    const inner = asRecord(template['spec']);
    if (inner !== null) {
      return asArray(inner['containers']);
    }
  }
  const jobTemplate = asRecord(spec['jobTemplate']);
  const jobSpec = jobTemplate === null ? null : asRecord(jobTemplate['spec']);
  if (jobSpec !== null) {
    const inner = asRecord(jobSpec['template']);
    const innerSpec = inner === null ? null : asRecord(inner['spec']);
    if (innerSpec !== null) {
      return asArray(innerSpec['containers']);
    }
  }
  return [];
}

/** Danh sách container của một manifest. Rỗng nếu manifest hỏng hoặc không có container. */
export function containersOf(manifestYaml: string | null): readonly ContainerSummary[] {
  if (manifestYaml === null || manifestYaml.trim() === '') {
    return [];
  }
  const parsed = parseManifests(manifestYaml);
  if (!parsed.ok) {
    return [];
  }
  const manifest = parsed.manifests[0];
  if (manifest === undefined) {
    return [];
  }

  const out: ContainerSummary[] = [];
  for (const raw of containersIn(manifest.spec)) {
    const container = asRecord(raw);
    if (container === null) {
      continue;
    }
    const name = typeof container['name'] === 'string' ? container['name'] : '';
    if (name === '') {
      continue;
    }
    const ports: number[] = [];
    for (const rawPort of asArray(container['ports'])) {
      const port = asRecord(rawPort);
      const value = port === null ? rawPort : port['containerPort'];
      const numeric = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(numeric) && !ports.includes(numeric)) {
        ports.push(numeric);
      }
    }
    out.push({
      name,
      // Image có thể là SỐ khi tag để trần (`nginx:1.27` → `1.27`), nên ép chuỗi
      // thay vì lọc theo `typeof === 'string'` — lọc sẽ làm image biến mất đúng
      // ở những manifest mà người học hay gõ tay.
      image:
        container['image'] === undefined || container['image'] === null
          ? null
          : String(container['image']),
      ports,
    });
  }
  return out;
}

/** Số bản chạy mong muốn, khi loại tài nguyên có khái niệm đó. */
export function replicasOf(manifestYaml: string | null): number | null {
  if (manifestYaml === null || manifestYaml.trim() === '') {
    return null;
  }
  const parsed = parseManifests(manifestYaml);
  if (!parsed.ok) {
    return null;
  }
  const value = parsed.manifests[0]?.spec['replicas'];
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
