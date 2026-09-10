import type { ComponentType, ReactElement } from 'react';
import {
  createLucideIcon,
  AlarmClock,
  BadgeCheck,
  ContactRound,
  Database,
  FileSliders,
  Gauge,
  HardDrive,
  HardDriveDownload,
  KeyRound,
  Layers3,
  LibraryBig,
  Link2,
  LockKeyhole,
  Network,
  Orbit,
  Scaling,
  Scan,
  Server,
  ShieldBan,
  ShieldCheck,
  ShieldUser,
  SlidersHorizontal,
  Waypoints,
} from 'lucide-react';
import { cn } from './cn.ts';

/**
 * Bảng icon cho 26 loại tài nguyên Kubernetes — bản của `packages/ui`, dùng cho
 * mọi bề mặt NGOÀI arena (thẻ danh mục, bảng, chú giải bài học, trạng thái rỗng).
 *
 * ── Vì sao đây là bản THỨ HAI của cùng một bảng, và điều đó có kiểm soát ───
 *
 * Bảng gốc sống ở `apps/web/src/components/k8s-arena/hud/resource-icon.tsx`.
 * Hợp nhất hai bảng là việc đúng, và đường đúng là chuyển bảng XUỐNG đây rồi để
 * arena import lên. Đợt này KHÔNG làm được: `phase-16.md` §1 và §8 đặt
 * `components/k8s-arena/**` ra ngoài phạm vi tuyệt đối ("Không đụng"), và một
 * package thư viện thì không được import ngược từ `apps/web`.
 *
 * Nên thay vì chép rồi hy vọng, hai bảng được buộc vào nhau bằng một cổng:
 * `resource-icon.contract.test.ts` ĐỌC file arena cùng `contract.ts` của
 * `@devops-platform/games` và đòi ba thứ khớp tuyệt đối — tập 26 khoá, tên icon
 * của từng khoá, và dữ liệu `path` của ba icon tự vẽ. Lệch một ký tự ⇒ ĐỎ. Đó
 * là lý do bản chép này là một sự trùng lặp CÓ CỔNG chứ không phải một bản rẽ
 * nhánh đang chờ trôi.
 *
 * ⚠ `packages/ui` KHÔNG khai `@devops-platform/games` làm dependency, và đó
 * cũng là quyết định chứ không phải sót: `ui` là tầng TRÌNH BÀY, kéo cả gói
 * domain của game vào chỉ để mượn một union 26 chuỗi là dựng một cạnh phụ thuộc
 * ngược hướng. Tập khoá vì vậy được khai lại ở đây và được CHỨNG MINH khớp bằng
 * phép đọc file trong test — cùng khuôn `theme/tokens.contract.test.ts` đọc
 * `globals.css`.
 */

// Cùng lưới 24px, cùng độ dày nét và đầu nét bo như Lucide. Ba hình này giải
// thích đúng thứ mà một khối vuông hay một vòng quỹ đạo chung chung không phân
// biệt nổi. Dữ liệu `d` PHẢI khớp từng ký tự với bản arena — cổng đọc cả hai.
const PodContainers = createLucideIcon('PodContainers', [
  ['path', { d: 'M12 2 22 7v10l-10 5L2 17V7Z', key: 'shell' }],
  ['rect', { x: '6', y: '8', width: '5', height: '8', rx: '1', key: 'container-a' }],
  ['rect', { x: '14', y: '8', width: '4', height: '8', rx: '1', key: 'container-b' }],
]);
const DeploymentRollout = createLucideIcon('DeploymentRollout', [
  ['path', { d: 'M4 7h15m-4-4 4 4-4 4', key: 'rollout' }],
  ['rect', { x: '3', y: '14', width: '5', height: '7', rx: '1', key: 'replica-a' }],
  ['rect', { x: '10', y: '14', width: '5', height: '7', rx: '1', key: 'replica-b' }],
  ['rect', { x: '17', y: '14', width: '4', height: '7', rx: '1', key: 'replica-c' }],
]);
const IngressGateway = createLucideIcon('IngressGateway', [
  ['path', { d: 'M8 3h12v18H8M2 12h13m-4-4 4 4-4 4', key: 'incoming-route' }],
]);

/**
 * 26 loại, thứ tự và chính tả lấy từ `packages/games/src/k8s/contract.ts`.
 * Danh sách ĐÓNG — thêm loại thứ 27 là một thay đổi ở `contract.ts` trước, và
 * cổng ở `resource-icon.contract.test.ts` sẽ đỏ cho tới khi bảng này theo kịp.
 */
export const RESOURCE_KINDS = [
  'Pod',
  'ReplicaSet',
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'Job',
  'CronJob',
  'Service',
  'Ingress',
  'ConfigMap',
  'Secret',
  'PersistentVolume',
  'PersistentVolumeClaim',
  'StorageClass',
  'Namespace',
  'Node',
  'ServiceAccount',
  'Role',
  'RoleBinding',
  'ClusterRole',
  'ClusterRoleBinding',
  'NetworkPolicy',
  'HorizontalPodAutoscaler',
  'PodDisruptionBudget',
  'ResourceQuota',
  'LimitRange',
] as const;

export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * Kiểu TỐI THIỂU cho một glyph, cố ý KHÔNG import `LucideIcon`: ta chỉ cần hai
 * prop, và một kiểu cấu trúc tự khai thì không vỡ khi lucide đổi cách export
 * kiểu ở bản sau. Cùng lập luận đã ghi cho `BadgeIcon` ở `badge.tsx`.
 */
type ResourceGlyph = ComponentType<{
  readonly className?: string;
  readonly 'aria-hidden'?: boolean | 'true' | 'false';
}>;

/** Một bóng dáng riêng cho từng loại, đọc được KHÔNG cần tới màu (WCAG 1.4.1). */
export const RESOURCE_ICON = {
  Pod: PodContainers,
  Deployment: DeploymentRollout,
  ReplicaSet: Layers3,
  StatefulSet: LibraryBig,
  DaemonSet: Orbit,
  Job: BadgeCheck,
  CronJob: AlarmClock,
  HorizontalPodAutoscaler: Scaling,
  PodDisruptionBudget: ShieldCheck,
  Service: Network,
  Ingress: IngressGateway,
  NetworkPolicy: ShieldBan,
  ConfigMap: FileSliders,
  Secret: LockKeyhole,
  ServiceAccount: ContactRound,
  Role: KeyRound,
  RoleBinding: Link2,
  ClusterRole: ShieldUser,
  ClusterRoleBinding: Waypoints,
  PersistentVolumeClaim: HardDriveDownload,
  PersistentVolume: Database,
  StorageClass: HardDrive,
  Namespace: Scan,
  ResourceQuota: Gauge,
  LimitRange: SlidersHorizontal,
  Node: Server,
} as const satisfies Record<ResourceKind, ResourceGlyph>;

/**
 * Màu nhấn theo loại — TÁM nhóm vai trò, không phải 26 màu.
 *
 * Mắt phân biệt tin cậy khoảng 8–12 màu trong một giao diện; 26 màu khác nhau
 * chắc chắn có vài cặp gần trùng, và lúc đó màu không phân biệt được gì mà chỉ
 * làm rối. Tám nhóm này khớp ĐÚNG tám token `--kind-*` của `globals.css`, và
 * `phase-16.md` 16.A.9 đòi hai thứ khớp nhau về tập khoá — cổng đối chiếu kiểm
 * cả hai chiều.
 *
 * Giá trị màu nằm ở `globals.css`; ở đây chỉ có TÊN token, nên đổi bảng màu là
 * đổi đúng một chỗ.
 */
export const RESOURCE_KIND_ACCENT = {
  Pod: 'kind-pod',
  ReplicaSet: 'kind-controller',
  Deployment: 'kind-controller',
  StatefulSet: 'kind-controller',
  DaemonSet: 'kind-controller',
  Job: 'kind-batch',
  CronJob: 'kind-batch',
  Service: 'kind-network',
  Ingress: 'kind-network',
  NetworkPolicy: 'kind-network',
  ConfigMap: 'kind-config',
  Secret: 'kind-config',
  PersistentVolume: 'kind-storage',
  PersistentVolumeClaim: 'kind-storage',
  StorageClass: 'kind-storage',
  ServiceAccount: 'kind-security',
  Role: 'kind-security',
  RoleBinding: 'kind-security',
  ClusterRole: 'kind-security',
  ClusterRoleBinding: 'kind-security',
  Namespace: 'kind-cluster',
  Node: 'kind-cluster',
  HorizontalPodAutoscaler: 'kind-cluster',
  PodDisruptionBudget: 'kind-cluster',
  ResourceQuota: 'kind-cluster',
  LimitRange: 'kind-cluster',
} as const satisfies Record<ResourceKind, string>;

/**
 * Class màu chữ theo nhóm, viết ĐẦY ĐỦ chứ không ghép chuỗi.
 *
 * `` `text-${RESOURCE_KIND_ACCENT[kind]}` `` sẽ chạy đúng ở runtime và HỎNG IM
 * LẶNG lúc build: Tailwind v4 quét source bằng văn bản, nó không thực thi mã,
 * nên một class ghép động KHÔNG BAO GIỜ vào bundle — icon vẫn render, chỉ là
 * không luật CSS nào khớp. Đây đúng là hình dạng lỗi mà đầu `globals.css` mô tả.
 */
const ACCENT_CLASS = {
  'kind-pod': 'text-kind-pod',
  'kind-controller': 'text-kind-controller',
  'kind-batch': 'text-kind-batch',
  'kind-network': 'text-kind-network',
  'kind-config': 'text-kind-config',
  'kind-storage': 'text-kind-storage',
  'kind-security': 'text-kind-security',
  'kind-cluster': 'text-kind-cluster',
} as const satisfies Record<(typeof RESOURCE_KIND_ACCENT)[ResourceKind], string>;

export interface ResourceIconProps {
  readonly kind: ResourceKind;
  /**
   * Tên đọc lên cho trình đọc màn hình. Bỏ trống ⇒ icon là TRANG TRÍ
   * (`aria-hidden`), đúng khi nó đứng cạnh nhãn chữ đã nói đủ. Truyền chuỗi ⇒
   * icon trở thành `role="img"` mang tên đó, dùng khi nó đứng MỘT MÌNH.
   */
  readonly label?: string;
  /** `true` ⇒ tô theo `--kind-*` của nhóm; mặc định thừa kế `currentColor`. */
  readonly accent?: boolean;
  readonly className?: string;
}

export function ResourceIcon({ kind, label, accent = false, className }: ResourceIconProps): ReactElement {
  const Glyph: ResourceGlyph = RESOURCE_ICON[kind];
  const tone = accent ? ACCENT_CLASS[RESOURCE_KIND_ACCENT[kind]] : undefined;
  const glyph = <Glyph aria-hidden="true" className={cn('size-4 shrink-0', tone, className)} />;

  // Bọc trong `<span role="img">` thay vì đặt `role`/`aria-label` thẳng lên
  // `<svg>`: một số trình đọc màn hình bỏ qua tên hỗ trợ tiếp cận đặt trên
  // `<svg>` trần, còn `<span role="img" aria-label>` thì được hỗ trợ đồng đều.
  if (label === undefined) return glyph;
  return (
    <span role="img" aria-label={label} className="inline-flex">
      {glyph}
    </span>
  );
}
