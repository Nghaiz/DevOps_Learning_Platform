/**
 * Manifest mẫu cho từng loại tài nguyên — thứ mà một ô trong bảng bên trái phát
 * ra khi người chơi đặt tên xong.
 *
 * ## Vì sao sinh YAML THẬT chứ không gọi thẳng vào engine
 *
 * `GameAction` chỉ có đúng một cửa để tạo tài nguyên: `{ kind: 'apply', yaml }`.
 * Đó không phải hạn chế phải lách — đó là điều đúng nên làm. Người chơi bấm một
 * ô rồi thấy manifest hiện ra là người chơi ĐỌC được K8s thật; bấm một ô rồi
 * thấy một khối 3D xuất hiện từ hư không là người chơi học được một trò chơi.
 * Bản của k8sgames.com đoán Kind từ TÊN TỆP và không phân tích YAML lần nào, nên
 * người học của họ không bao giờ viết một dòng YAML — đó là chỗ ta cố ý làm khác.
 *
 * Nhóm workload và các mảnh dựng chung nằm ở `palette-manifest-parts.ts`; cổng
 * đủ-26-loại nằm ở đây, trên object đã ghép.
 */

import type { ResourceKind } from '@devops-platform/games';
import { WORKLOAD_BUILDERS, head } from './palette-manifest-parts.ts';

const OTHER_BUILDERS = {
  Service: (name: string) => `${head('v1', 'Service', name, true)}
spec:
  type: ClusterIP
  selector:
    app: ${name}
  ports:
    - port: 80
      targetPort: 80`,

  Ingress: (name: string) => `${head('networking.k8s.io/v1', 'Ingress', name, false)}
spec:
  rules:
    - host: ${name}.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ${name}
                port:
                  number: 80`,

  /* `podSelector: {}` = áp cho MỌI pod trong namespace. Đây là cách viết default-deny. */
  NetworkPolicy: (name: string) => `${head('networking.k8s.io/v1', 'NetworkPolicy', name, false)}
spec:
  podSelector: {}
  policyTypes:
    - Ingress`,

  ConfigMap: (name: string) => `${head('v1', 'ConfigMap', name, false)}
data:
  APP_MODE: production`,

  Secret: (name: string) => `${head('v1', 'Secret', name, false)}
type: Opaque
data:
  APP_TOKEN: doi-gia-tri-nay`,

  ServiceAccount: (name: string) => head('v1', 'ServiceAccount', name, false),

  Role: (name: string) => `${head('rbac.authorization.k8s.io/v1', 'Role', name, false)}
rules:
  - apiGroups:
      - ""
    resources:
      - pods
    verbs:
      - get
      - list`,

  RoleBinding: (name: string) => `${head('rbac.authorization.k8s.io/v1', 'RoleBinding', name, false)}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${name}
subjects:
  - kind: ServiceAccount
    name: default`,

  ClusterRole: (name: string) => `${head('rbac.authorization.k8s.io/v1', 'ClusterRole', name, false)}
rules:
  - apiGroups:
      - ""
    resources:
      - nodes
    verbs:
      - get
      - list`,

  ClusterRoleBinding: (name: string) => `${head('rbac.authorization.k8s.io/v1', 'ClusterRoleBinding', name, false)}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ${name}
subjects:
  - kind: ServiceAccount
    name: default
    namespace: default`,

  PersistentVolumeClaim: (name: string) => `${head('v1', 'PersistentVolumeClaim', name, false)}
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 1Gi`,

  PersistentVolume: (name: string) => `${head('v1', 'PersistentVolume', name, false)}
spec:
  capacity:
    storage: 1Gi
  accessModes:
    - ReadWriteOnce
  storageClassName: standard`,

  StorageClass: (name: string) => `${head('storage.k8s.io/v1', 'StorageClass', name, false)}
provisioner: kubernetes.io/no-provisioner`,

  Namespace: (name: string) => head('v1', 'Namespace', name, false),

  /*
   * ⚠ ĐÂY LÀ MANIFEST DUY NHẤT LỆCH KHỎI HÌNH DẠNG THẬT, và nói ra chỗ lệch thay
   * vì giấu nó: ở K8s thật `capacity` của Node nằm dưới `status`, mà
   * `parseManifests` bỏ nguyên khối `status` (nó thuộc `RESERVED`) nên viết đúng
   * chỗ thật sẽ cho ra một node không có sức chứa. Mô phỏng đọc `capacity` ở
   * `spec`, nên nó ở đây.
   *
   * Chấp nhận được vì ở cụm thật KHÔNG AI tạo node bằng manifest — hạ tầng cấp
   * node, `kubeadm join` gắn nó vào. Người học sẽ không mang hình dạng này đi
   * đâu. Mọi loại khác trong bảng đều là YAML thật, dán sang cụm thật chạy được.
   */
  Node: (name: string) => `${head('v1', 'Node', name, false)}
spec:
  capacity:
    cpu: 2000
    memory: 4096`,

  ResourceQuota: (name: string) => `${head('v1', 'ResourceQuota', name, false)}
spec:
  hard:
    pods: 10
    requests.cpu: 2000
    requests.memory: 4096`,

  LimitRange: (name: string) => `${head('v1', 'LimitRange', name, false)}
spec:
  limits:
    - type: Container
      default:
        cpu: 200
        memory: 256
      defaultRequest:
        cpu: 100
        memory: 128`,
} as const;

/*
 * `satisfies Record<ResourceKind, …>` trên object ĐÃ GHÉP là cổng lúc biên dịch:
 * hợp đồng gọi danh sách loại là ĐÓNG, nên mở loại thứ 27 mà quên bảng này sẽ đỏ
 * ngay thay vì để một ô của bảng bên trái phát ra `undefined` lúc chạy.
 */
const BUILDERS = {
  ...WORKLOAD_BUILDERS,
  ...OTHER_BUILDERS,
} as const satisfies Record<ResourceKind, (name: string) => string>;

/**
 * Manifest mẫu cho `kind`, đã điền tên.
 *
 * Namespace CỐ Ý vắng mặt: `reduce()` nhận namespace hiện hành của phiên và điền
 * vào lúc áp (`reducer.ts:161`). Ghi nó vào YAML ở đây là lưu một giá trị suy ra
 * được từ chỗ khác, và nó sẽ sai ngay khi người chơi đổi namespace.
 */
export function buildManifest(kind: ResourceKind, name: string): string {
  return BUILDERS[kind](name);
}
