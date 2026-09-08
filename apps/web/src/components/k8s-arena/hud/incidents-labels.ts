/**
 * Tên hiển thị của 32 loại sự cố.
 *
 * ## Vì sao cần bảng này chứ không dùng thẳng chuỗi `IncidentKind`
 *
 * `IncidentKind` là slug định danh (`service-selector-lech-label`) — không dấu,
 * nối bằng gạch, viết cho máy. Hiện thẳng ra danh sách thì người đọc phải tự
 * ghép lại thành câu tiếng Việt, và biến đổi máy móc (`-` → khoảng trắng) chỉ
 * cho ra "service selector lech label": mất dấu, sai chính tả tiếng Việt.
 *
 * ## Và vì sao nó KHÔNG trùng lặp với `INCIDENTS[kind].symptom`
 *
 * `symptom` của engine là một CÂU mô tả triệu chứng quan sát được ("pod chạy
 * nhưng traffic không tới"), cố ý không nói nguyên nhân — vì nói ra là xoá mất
 * phần chẩn đoán. Bảng này là TÊN gọi của sự cố để liệt kê và lọc. Hai vai khác
 * nhau, không phải hai bản của cùng một dữ liệu.
 *
 * ⚠ Kiểu `Readonly<Record<IncidentKind, string>>` là chốt gác: engine thêm một
 * loại sự cố mà quên bổ sung ở đây thì typecheck đỏ ngay, thay vì danh sách
 * lặng lẽ hiện một ô trống.
 */

import type { IncidentKind } from '@devops-platform/games';

export const INCIDENT_LABEL: Readonly<Record<IncidentKind, string>> = {
  'image-tag-sai': 'Sai tag image',
  'image-registry-khong-toi-duoc': 'Không tới được registry',
  'thieu-imagepullsecret': 'Thiếu imagePullSecret',
  'memory-limit-qua-thap': 'Giới hạn bộ nhớ quá thấp',
  'lenh-entrypoint-sai': 'Sai lệnh entrypoint',
  'thieu-configmap': 'Thiếu ConfigMap',
  'thieu-secret': 'Thiếu Secret',
  'key-configmap-sai': 'Sai key trong ConfigMap',
  'readiness-probe-sai-cong': 'Readiness probe sai cổng',
  'liveness-probe-qua-gat': 'Liveness probe quá gắt',
  'probe-khong-co-initialdelay': 'Probe thiếu initialDelaySeconds',
  'service-selector-lech-label': 'Selector của Service lệch label',
  'service-sai-targetport': 'Service sai targetPort',
  'khong-co-endpoint': 'Service không có endpoint',
  'dns-khong-phan-giai': 'DNS không phân giải được',
  'networkpolicy-chan-nham': 'NetworkPolicy chặn nhầm',
  'ingress-sai-path': 'Ingress sai path',
  'pvc-khong-co-pv-khop': 'PVC không có PV khớp',
  'storageclass-khong-ton-tai': 'StorageClass không tồn tại',
  'pvc-readwriteonce-hai-node': 'PVC ReadWriteOnce bị đòi ở hai node',
  'node-notready': 'Node NotReady',
  'node-het-cpu': 'Node hết CPU',
  'node-het-memory': 'Node hết bộ nhớ',
  'taint-khong-co-toleration': 'Taint không có toleration',
  'nodeselector-khong-khop': 'nodeSelector không khớp node nào',
  'resourcequota-chan': 'ResourceQuota chặn',
  'limitrange-tu-choi': 'LimitRange từ chối',
  'rbac-thieu-quyen': 'RBAC thiếu quyền',
  'serviceaccount-khong-ton-tai': 'ServiceAccount không tồn tại',
  'pdb-chan-drain': 'PodDisruptionBudget chặn drain',
  'hpa-khong-co-metrics': 'HPA không đọc được metrics',
  'replica-vuot-quota': 'Số replica vượt quota',
};
