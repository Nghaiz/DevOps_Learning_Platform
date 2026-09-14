import { t } from '@devops-platform/copy';
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
  'image-tag-sai': t('problem.vocabulary-tag-image-sai-pod-ket-imagepullbackoff'),
  'image-registry-khong-toi-duoc': t('problem.vocabulary-khong-toi-duoc-registry'),
  'thieu-imagepullsecret': t('problem.vocabulary-thieu-imagepullsecret-cho-registry-rieng'),
  'memory-limit-qua-thap': t('problem.vocabulary-memory-limit-qua-thap-container-bi-oomkilled'),
  'lenh-entrypoint-sai': t('problem.vocabulary-entrypoint-sai-container-thoat-ngay'),
  'thieu-configmap': t('problem.vocabulary-configmap-duoc-tham-chieu-khong-ton-tai'),
  'thieu-secret': t('problem.vocabulary-secret-duoc-tham-chieu-khong-ton-tai'),
  'key-configmap-sai': 'Sai key trong ConfigMap',
  'readiness-probe-sai-cong': t('problem.vocabulary-readiness-probe-tro-sai-cong'),
  'liveness-probe-qua-gat': t('problem.vocabulary-liveness-probe-qua-gat-pod-bi-giet-vong-lap'),
  'probe-khong-co-initialdelay': t('problem.vocabulary-probe-khong-co-initialdelay'),
  'service-selector-lech-label': t('problem.vocabulary-selector-cua-service-lech-label-cua-pod'),
  'service-sai-targetport': 'Service sai targetPort',
  'khong-co-endpoint': t('problem.vocabulary-service-khong-co-endpoint-nao'),
  'dns-khong-phan-giai': t('problem.vocabulary-dns-khong-phan-giai-duoc-ten-dich-vu'),
  'networkpolicy-chan-nham': t('problem.vocabulary-networkpolicy-chan-nham-luu-luong-hop-le'),
  'ingress-sai-path': 'Ingress khai sai path',
  'pvc-khong-co-pv-khop': t('problem.vocabulary-pvc-khong-co-pv-nao-khop'),
  'storageclass-khong-ton-tai': t('problem.vocabulary-storageclass-khong-ton-tai'),
  'pvc-readwriteonce-hai-node': t('problem.vocabulary-pvc-readwriteonce-bi-doi-tu-hai-node'),
  'node-notready': t('problem.vocabulary-node-o-trang-thai-notready'),
  'node-het-cpu': t('problem.vocabulary-node-het-cpu'),
  'node-het-memory': t('problem.vocabulary-node-het-bo-nho'),
  'taint-khong-co-toleration': t('problem.vocabulary-node-co-taint-ma-pod-khong-co-toleration'),
  'nodeselector-khong-khop': t('problem.vocabulary-nodeselector-khong-khop-node-nao'),
  'resourcequota-chan': t('problem.vocabulary-resourcequota-chan-viec-tao-tai-nguyen'),
  'limitrange-tu-choi': t('problem.vocabulary-limitrange-tu-choi-tai-nguyen-khai-sai'),
  'rbac-thieu-quyen': t('problem.vocabulary-serviceaccount-thieu-quyen-rbac'),
  'serviceaccount-khong-ton-tai': t('problem.vocabulary-serviceaccount-khong-ton-tai'),
  'pdb-chan-drain': t('problem.vocabulary-poddisruptionbudget-chan-luot-drain'),
  'hpa-khong-co-metrics': t('problem.vocabulary-hpa-khong-co-nguon-metric'),
  'replica-vuot-quota': t('problem.vocabulary-so-replica-vuot-quota'),
};

export const INCIDENT_KINDS = Object.keys(INCIDENT_LABELS) as readonly IncidentKind[];
