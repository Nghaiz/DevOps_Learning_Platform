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
  'image-tag-sai': 'Phiên bản image không hợp lệ',
  'image-registry-khong-toi-duoc': 'Không kết nối được kho image (registry)',
  'thieu-imagepullsecret': 'Thiếu thông tin đăng nhập kho image',
  'memory-limit-qua-thap': 'Giới hạn bộ nhớ quá thấp',
  'lenh-entrypoint-sai': 'Lệnh khởi động container không hợp lệ',
  'thieu-configmap': 'Thiếu ConfigMap',
  'thieu-secret': 'Thiếu Secret',
  'key-configmap-sai': 'Khoá cấu hình không khớp ConfigMap',
  'readiness-probe-sai-cong': 'Kiểm tra sẵn sàng (readiness) dùng sai cổng',
  'liveness-probe-qua-gat': 'Kiểm tra sức khoẻ (liveness) quá nghiêm ngặt',
  'probe-khong-co-initialdelay': 'Kiểm tra sức khoẻ bắt đầu quá sớm',
  'service-selector-lech-label': 'Service chọn sai nhãn của Pod',
  'service-sai-targetport': 'Service chuyển tiếp tới sai cổng (targetPort)',
  'khong-co-endpoint': 'Service chưa có Pod nhận lưu lượng',
  'dns-khong-phan-giai': 'DNS không phân giải được',
  'networkpolicy-chan-nham': 'NetworkPolicy chặn nhầm',
  'ingress-sai-path': 'Ingress định tuyến sai đường dẫn',
  'pvc-khong-co-pv-khop': 'Yêu cầu lưu trữ chưa tìm được ổ đĩa phù hợp',
  'storageclass-khong-ton-tai': 'StorageClass không tồn tại',
  'pvc-readwriteonce-hai-node': 'Hai Node cùng yêu cầu ổ đĩa chỉ cho phép một Node',
  'node-notready': 'Node chưa sẵn sàng (NotReady)',
  'node-het-cpu': 'Node không còn đủ CPU',
  'node-het-memory': 'Node không còn đủ bộ nhớ',
  'taint-khong-co-toleration': 'Pod chưa được phép chạy trên Node có taint',
  'nodeselector-khong-khop': 'Không có Node phù hợp với bộ chọn của Pod',
  'resourcequota-chan': 'Yêu cầu vượt hạn mức tài nguyên (ResourceQuota)',
  'limitrange-tu-choi': 'Cấu hình tài nguyên nằm ngoài LimitRange',
  'rbac-thieu-quyen': 'Tài khoản thiếu quyền thực hiện thao tác (RBAC)',
  'serviceaccount-khong-ton-tai': 'ServiceAccount không tồn tại',
  'pdb-chan-drain': 'Chưa đủ Pod dự phòng để rút Node khỏi cụm',
  'hpa-khong-co-metrics': 'HPA thiếu số liệu để tự điều chỉnh số Pod',
  'replica-vuot-quota': 'Số bản sao vượt hạn mức cho phép',
};
