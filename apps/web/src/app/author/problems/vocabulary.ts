import { ALL_KINDS, type IncidentKind, type ResourceKind } from '@devops-platform/games';

/**
 * Hai danh mục ĐÓNG mà trình soạn bài phải liệt kê ra được thành ô chọn.
 *
 * `ResourceKind` giờ có `ALL_KINDS` chạy được ở barrel nên nó lấy thẳng. Còn
 * `IncidentKind` thì mới chỉ có ở dạng KIỂU — union type không `map` được thành
 * `<SelectItem>`, và bảng `INCIDENTS` trong `incidents.ts` không tới được vì
 * package chỉ mở đúng một subpath.
 *
 * ⚠ `INCIDENT_LABELS` bên dưới vì thế là một BẢN SAO, nhưng nó được gác ở tầng
 * biên dịch chứ không bằng lời hứa: `Readonly<Record<IncidentKind, string>>` đỏ
 * theo CẢ HAI CHIỀU — thiếu một loại mới thêm ở hợp đồng là lỗi "thiếu khoá",
 * giữ lại một loại đã xoá là lỗi "khoá lạ". Một `readonly IncidentKind[]` viết
 * tay KHÔNG có tính chất đó: nó chỉ kiểm từng phần tử thuộc union, nên bỏ sót cả
 * chục loại vẫn xanh.
 *
 * Phần nhãn tiếng Việt thì đằng nào cũng thuộc về đây — nó là chuyện trình bày,
 * không phải chuyện engine.
 */

/**
 * 26 loại tài nguyên — lấy THẲNG từ package, không còn bản sao.
 *
 * Trước 2026-09-08 file này giữ một mảng viết tay vì barrel chỉ xuất `ResourceKind`
 * dạng KIỂU. Lead đã mở `ALL_KINDS`, nên bản sao bị xoá: một bản sao được gác
 * bằng `satisfies` vẫn phải sửa tay mỗi lần hợp đồng đổi, còn cái này thì không.
 */
export const RESOURCE_KINDS: readonly ResourceKind[] = ALL_KINDS;

/** Loại tài nguyên phạm vi cluster — ô Namespace của chúng phải để trống. */
const CLUSTER_SCOPED = new Set<ResourceKind>([
  'Node',
  'Namespace',
  'PersistentVolume',
  'StorageClass',
  'ClusterRole',
  'ClusterRoleBinding',
]);

export function isClusterScoped(kind: ResourceKind): boolean {
  return CLUSTER_SCOPED.has(kind);
}

/**
 * Nhãn sự cố. Chuỗi khoá (`image-tag-sai`) đã là tiếng Việt không dấu nên đọc
 * tạm được, nhưng nó là ĐỊNH DANH: nó phải ngắn và ổn định, còn ô chọn thì cần
 * một câu nói rõ người chơi sẽ THẤY triệu chứng gì. Hai yêu cầu khác nhau, nên
 * hai chuỗi khác nhau.
 */
export const INCIDENT_LABELS: Readonly<Record<IncidentKind, string>> = {
  'image-tag-sai': 'Tag image sai — pod kẹt ImagePullBackOff',
  'image-registry-khong-toi-duoc': 'Không tới được registry',
  'thieu-imagepullsecret': 'Thiếu imagePullSecret cho registry riêng',
  'memory-limit-qua-thap': 'Memory limit quá thấp — container bị OOMKilled',
  'lenh-entrypoint-sai': 'Entrypoint sai — container thoát ngay',
  'thieu-configmap': 'ConfigMap được tham chiếu không tồn tại',
  'thieu-secret': 'Secret được tham chiếu không tồn tại',
  'key-configmap-sai': 'Sai key trong ConfigMap',
  'readiness-probe-sai-cong': 'Readiness probe trỏ sai cổng',
  'liveness-probe-qua-gat': 'Liveness probe quá gắt — pod bị giết vòng lặp',
  'probe-khong-co-initialdelay': 'Probe không có initialDelay',
  'service-selector-lech-label': 'Selector của Service lệch label của pod',
  'service-sai-targetport': 'Service sai targetPort',
  'khong-co-endpoint': 'Service không có endpoint nào',
  'dns-khong-phan-giai': 'DNS không phân giải được tên dịch vụ',
  'networkpolicy-chan-nham': 'NetworkPolicy chặn nhầm lưu lượng hợp lệ',
  'ingress-sai-path': 'Ingress khai sai path',
  'pvc-khong-co-pv-khop': 'PVC không có PV nào khớp',
  'storageclass-khong-ton-tai': 'StorageClass không tồn tại',
  'pvc-readwriteonce-hai-node': 'PVC ReadWriteOnce bị đòi từ hai node',
  'node-notready': 'Node ở trạng thái NotReady',
  'node-het-cpu': 'Node hết CPU',
  'node-het-memory': 'Node hết bộ nhớ',
  'taint-khong-co-toleration': 'Node có taint mà pod không có toleration',
  'nodeselector-khong-khop': 'nodeSelector không khớp node nào',
  'resourcequota-chan': 'ResourceQuota chặn việc tạo tài nguyên',
  'limitrange-tu-choi': 'LimitRange từ chối tài nguyên khai sai',
  'rbac-thieu-quyen': 'ServiceAccount thiếu quyền RBAC',
  'serviceaccount-khong-ton-tai': 'ServiceAccount không tồn tại',
  'pdb-chan-drain': 'PodDisruptionBudget chặn lượt drain',
  'hpa-khong-co-metrics': 'HPA không có nguồn metric',
  'replica-vuot-quota': 'Số replica vượt quota',
};

export const INCIDENT_KINDS = Object.keys(INCIDENT_LABELS) as readonly IncidentKind[];
