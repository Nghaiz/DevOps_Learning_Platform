/**
 * Kiểu và hằng dùng chung cho các bảng của lane C.
 *
 * ## Lịch sử: file này từng chứa ba kiểu TẠM, giờ không còn
 *
 * Bản đầu (2026-09-08) khai `ObjectDetail`, `IncidentView`, `ScopedEventView`
 * làm props vì `ClusterView` khi đó thiếu nhãn/tài nguyên/thời điểm tạo của
 * object, thiếu `involvedUid` trên sự kiện, và không có danh sách sự cố nào.
 * Lane engine đã bổ sung đủ cả ba, nên kiểu tạm bị xoá và mọi bảng đọc thẳng
 * kiểu chính thức. Ghi lại ở đây vì đây là lý do prop `detail` biến mất khỏi
 * `InspectorPanel`.
 *
 * `IncidentView` chưa có trong barrel `@devops-platform/games`, nên lấy nó ra
 * bằng cách bóc từ `ClusterView` — đó KHÔNG phải một bản sao: `ClusterView`
 * mới là nguồn, và kiểu ở đây tự trôi theo nếu engine đổi hình dạng.
 */

import type { ClusterView, EventView, ObjectView, ResourceKind } from '@devops-platform/games';

/** Một sự cố. Bóc từ hợp đồng — xem lý do ở đầu file. */
export type IncidentView = ClusterView['incidents'][number];

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
