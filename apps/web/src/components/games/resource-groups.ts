/**
 * Nhóm tài nguyên cho rail trái (§12.5) — bảng tra THUẦN, test được ở env node.
 *
 * Bốn nhóm là bốn câu hỏi người vận hành thật hay hỏi: *cái gì đang chạy*
 * (workloads), *lưu lượng vào ra kiểu gì* (network), *nó đọc cấu hình ở đâu*
 * (config), *dữ liệu nằm đâu* (storage). Đây không phải cách phân loại của
 * Kubernetes — K8s phân theo API group — mà là cách phân loại theo việc người ta
 * đang làm, và một rail sắp theo API group sẽ đặt `Secret` cạnh `ClusterRole`
 * trong khi người chơi đang tìm cả hai vì hai lý do khác nhau.
 */

import type { ResourceKind } from '@devops-platform/games';

export type ResourceGroup = 'workloads' | 'network' | 'config' | 'storage';

/** Thứ tự hiện trên rail. Cố định, không sắp theo dữ liệu — rail phải đứng yên. */
export const RESOURCE_GROUP_ORDER: readonly ResourceGroup[] = ['workloads', 'network', 'config', 'storage'];

export const RESOURCE_GROUP_LABEL: Readonly<Record<ResourceGroup, string>> = {
  workloads: 'WORKLOADS',
  network: 'NETWORK',
  config: 'CONFIG',
  storage: 'STORAGE',
};

/**
 * `satisfies Record<ResourceKind, …>` là cổng lúc BIÊN DỊCH.
 *
 * Hợp đồng khai 26 loại và gọi danh sách đó là ĐÓNG. Nếu lead mở thêm loại thứ
 * 27 mà quên bảng này, `satisfies` đỏ ngay — thay vì loại mới lặng lẽ biến mất
 * khỏi rail, thứ đọc ra như "engine không tạo được tài nguyên đó".
 */
const GROUP_OF = {
  Pod: 'workloads',
  ReplicaSet: 'workloads',
  Deployment: 'workloads',
  StatefulSet: 'workloads',
  DaemonSet: 'workloads',
  Job: 'workloads',
  CronJob: 'workloads',
  HorizontalPodAutoscaler: 'workloads',
  PodDisruptionBudget: 'workloads',

  Service: 'network',
  Ingress: 'network',
  NetworkPolicy: 'network',

  ConfigMap: 'config',
  Secret: 'config',
  Namespace: 'config',
  ServiceAccount: 'config',
  Role: 'config',
  RoleBinding: 'config',
  ClusterRole: 'config',
  ClusterRoleBinding: 'config',
  ResourceQuota: 'config',
  LimitRange: 'config',

  PersistentVolume: 'storage',
  PersistentVolumeClaim: 'storage',
  StorageClass: 'storage',

  /*
   * `Node` nằm ở `workloads` chỉ để bảng này ĐỦ theo kiểu. Trên thực tế rail
   * không bao giờ nhận Node: `ClusterView` để node ở `nodes[]`, không ở
   * `objects[]`, và trong cảnh 3D node là cái BỆ chứ không phải vật đứng trên
   * bệ. Xoá dòng này thì `satisfies` đỏ; đổi nó thành một nhóm thứ năm thì rail
   * có một mục trống vĩnh viễn.
   */
  Node: 'workloads',
} as const satisfies Record<ResourceKind, ResourceGroup>;

export function groupOf(kind: ResourceKind): ResourceGroup {
  return GROUP_OF[kind];
}

/**
 * Chia danh sách theo nhóm, GIỮ NGUYÊN thứ tự đầu vào trong mỗi nhóm.
 *
 * Không tự sắp xếp: `ClusterView.objects` do lane B quyết định thứ tự, và một
 * lần sắp lại ở đây sẽ làm hai mục đổi chỗ cho nhau mỗi tick nếu lane B đổi
 * cách sinh — đúng kiểu nhiễu thị giác mà người chơi đọc ra là lỗi.
 */
export function groupObjects<T extends { readonly kind: ResourceKind }>(
  objects: readonly T[],
): ReadonlyMap<ResourceGroup, readonly T[]> {
  const result = new Map<ResourceGroup, T[]>();
  for (const group of RESOURCE_GROUP_ORDER) {
    result.set(group, []);
  }
  for (const object of objects) {
    result.get(groupOf(object.kind))?.push(object);
  }
  return result;
}
