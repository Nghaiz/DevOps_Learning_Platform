/**
 * Hình dạng dữ liệu mà các bảng của lane C nhận vào.
 *
 * ## Vì sao có file này thay vì đọc thẳng `ClusterView`
 *
 * `ClusterView` (hợp đồng engine) mang đủ dữ liệu cho scene 3D nhưng THIẾU ba
 * thứ mà một bảng thông số bắt buộc phải có, và cả ba đều tồn tại sẵn ở tầng
 * trong (`model.ts`) rồi bị bỏ lại khi chiếu ra view:
 *
 * | Cần | `ClusterView` có? | Nguồn thật |
 * |---|---|---|
 * | Nhãn, spec, thời điểm tạo của object | không | `K8sObject.labels` / `.spec` / `.createdTick` |
 * | Sự kiện thuộc về MỘT object | không — `EventView` bỏ `involvedUid` | `ClusterEvent.involvedUid` |
 * | Danh sách sự cố | không — `ClusterView` không có trường nào | `ClusterState.incidents` |
 *
 * Lane C KHÔNG được sửa `contract.ts` (README §3: "Không ai"), nên chỗ lệch này
 * được khai báo ra đây thành props để cha bơm vào. Đó là lựa chọn cố ý giữa hai
 * đường: bịa dữ liệu tại chỗ (ví dụ lọc sự kiện theo việc tên object có xuất
 * hiện trong câu chữ hay không) sẽ cho ra một bảng LÚC NÀO CŨNG có nội dung và
 * thỉnh thoảng sai — kiểu hỏng tệ nhất, vì không ai nhìn ra. Khai thành props
 * thì chỗ chưa nối được lộ ngay ở typecheck của lead.
 */

import type { EventView, IncidentKind, ObjectView, ResourceKind } from '@devops-platform/games';

/** Một cặp cpu/memory như `resources.requests` / `resources.limits` của K8s. */
export interface ResourceAmount {
  /** Dạng chuỗi K8s thật (`250m`, `1`). `null` = manifest không khai. */
  readonly cpu: string | null;
  /** `128Mi`, `1Gi`. `null` = không khai. */
  readonly memory: string | null;
}

/**
 * Phần chi tiết của một object mà `ObjectView` không mang.
 *
 * Mọi trường đều cho phép rỗng/`null` vì một tài nguyên hợp lệ có thể thật sự
 * không có nhãn hay không khai resources — và một Pod chưa qua `apply` cũng
 * chưa có `createdTick`. Bảng bỏ hẳn dòng tương ứng thay vì in `—`: một dấu gạch
 * đọc ra là "đã kiểm và không có", còn vắng mặt đọc ra là "chưa biết", và hai
 * chuyện đó khác nhau khi người học đang chẩn đoán.
 */
export interface ObjectDetail {
  readonly labels: Readonly<Record<string, string>>;
  readonly requests: ResourceAmount | null;
  readonly limits: ResourceAmount | null;
  /** Tick lúc tạo. Tuổi được TÍNH tại chỗ dùng từ `tick` hiện tại, không lưu. */
  readonly createdTick: number | null;
}

/**
 * Một sự cố trong danh sách.
 *
 * Trùng hình dạng với `ActiveIncident` của `model.ts` là CỐ Ý — đây chính là nó,
 * chỉ khác là `model.ts` không xuất ra khỏi package nên lane C không import
 * được. Giữ đúng tên trường để ngày lead nối được thì phép gán là thẳng, không
 * cần lớp dịch.
 *
 * ⚠ Không có trường `active`. Còn hoạt động hay không SUY RA được từ
 * `resolvedTick === null`, và repo cấm lưu trường suy ra được (README §5).
 */
export interface IncidentView {
  readonly kind: IncidentKind;
  readonly targetUid: string;
  readonly startedTick: number;
  /** `null` = còn đang xảy ra. Đã xử lý thì GIỮ bản ghi kèm tick, không xoá. */
  readonly resolvedTick: number | null;
}

/** Sự kiện kèm object liên quan — thứ `EventView` thiếu để lọc theo object. */
export interface ScopedEventView extends EventView {
  readonly involvedUid: string | null;
}

/**
 * Loại đổi được số replica.
 *
 * Danh sách ĐÓNG và cố ý ngắn, giữ nguyên từ bản cũ (`inspector-panel.tsx` của
 * `components/games`): `kubectl scale` chỉ nhận loại có `spec.replicas`. Hiện ô
 * scale trên một Pod là dạy sai — Pod không có replica, và người học sẽ mang
 * hiểu lầm đó sang cluster thật.
 */
export const SCALABLE_KINDS: readonly ResourceKind[] = ['Deployment', 'ReplicaSet', 'StatefulSet'];

/** Loại có vòng đời rollout — `restart` và `undo` chỉ có nghĩa ở đây. */
export const ROLLOUT_KINDS: readonly ResourceKind[] = ['Deployment', 'StatefulSet', 'DaemonSet'];

/** Nhãn tiếng Việt của ba mức sự kiện. Dùng chung cho nhật ký và tab sự kiện. */
export const EVENT_LEVEL_LABEL: Readonly<Record<EventView['level'], string>> = {
  info: 'Thông tin',
  warning: 'Cảnh báo',
  error: 'Lỗi',
};

export const EVENT_LEVEL_CLASS: Readonly<Record<EventView['level'], string>> = {
  info: 'text-muted-foreground',
  warning: 'text-warning',
  error: 'text-destructive',
};

/** Nhãn ngắn của một object, dạng `kubectl` tự viết. */
export function objectLabel(object: ObjectView): string {
  return `${object.kind.toLowerCase()}/${object.name}`;
}
