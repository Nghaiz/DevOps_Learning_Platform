/**
 * Bảng tham số của 32 vị từ K8s, ở hình dạng chung của hợp đồng plugin — P20.
 *
 * ## Đây là một BẢN SAO có chủ ý, và nó có cổng gác
 *
 * Bản giàu hơn sống ở tầng web: `app/author/problems/predicate-spec.ts` mang
 * thêm KHOÁ CHỮ i18n và những kiểu ô riêng của K8s (`namespace`, `node`,
 * `resource-kind`, `selector`, `probe`) để dựng ô chọn có gợi ý thay vì một ô
 * text trần. Kéo nguyên nó xuống đây sẽ lôi cả tầng trình bày vào một package
 * cấm React và đi thẳng vào bundle trình duyệt.
 *
 * Nhưng hợp đồng `GameProblemPlugin.predicateArgs` đòi MỌI game khai bảng của
 * mình, nếu không trang soạn bài lại quay về chỗ chỉ-K8s. Nên bảng dưới đây giữ
 * đúng phần chung — tên tham số, kiểu, bắt buộc hay không — và ô gác
 * `predicate-spec.test.ts` (ở `apps/web`) ĐỐI CHIẾU hai bên từng vị từ. Bản sao
 * vẫn là bản sao, nhưng nó không trôi được trong im lặng.
 *
 * ## `optional: true` ở đây nghĩa là gì
 *
 * Đúng `required: false` của bản web. Phần lớn rơi vào `requireOneOf` — ví dụ
 * `pod-running` nhận `name` HOẶC `labelSelector`, nên không cái nào một mình là
 * bắt buộc. Ràng buộc "một trong hai" KHÔNG diễn đạt được ở bảng chung này và ở
 * lại bản web; đó là giới hạn đã biết, không phải một chỗ quên.
 *
 * ⛔ SINH CƠ HỌC từ `predicate-spec.ts`, đừng sửa tay. Sửa thì sửa bản web rồi
 * để ô đối chiếu chỉ ra chỗ lệch.
 *
 * ⚠ Lượt sinh đầu tiên BỎ SÓT hai tham số, và ô đối chiếu bắt được ngay:
 * `probe-configured.probe` và `no-incident-active.kind` khai bằng object literal
 * thẳng trong mảng `args`, không qua hàm dựng (`kind()`, `ns()`, …), nên bộ trích
 * — vốn chỉ bắt lời gọi hàm — không thấy chúng. Hai dòng đó điền tay.
 *
 * Bài học nếu sinh lại: một bộ trích đọc mã nguồn chỉ thấy ĐÚNG hình dạng nó
 * được dạy; ô đối chiếu mới là thứ nói ra phần nó không thấy.
 */

import type { ProblemPredicateArgs } from '../core/problem-plugin.ts';

export const K8S_PREDICATE_ARGS: ProblemPredicateArgs = {
  'resource-exists': [
    { name: 'kind', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: true },
  ],
  'resource-absent': [
    { name: 'kind', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: true },
  ],
  'pod-running': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: true },
    { name: 'labelSelector', kind: 'string', optional: true },
  ],
  'pod-count-running': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'labelSelector', kind: 'string', optional: false },
    { name: 'min', kind: 'number', optional: false },
  ],
  'pod-no-reason': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'labelSelector', kind: 'string', optional: false },
  ],
  'pod-on-node': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'nodeName', kind: 'string', optional: false },
  ],
  'pod-not-on-node': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'nodeName', kind: 'string', optional: false },
  ],
  'all-pods-healthy': [
    { name: 'namespace', kind: 'string', optional: false },
  ],
  'deployment-ready': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'replicas', kind: 'number', optional: false },
  ],
  'replicas-at-least': [
    { name: 'kind', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'n', kind: 'number', optional: false },
  ],
  'container-image-is': [
    { name: 'kind', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'image', kind: 'string', optional: false },
  ],
  'resource-limits-set': [
    { name: 'kind', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
  ],
  'probe-configured': [
    { name: 'kind', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'probe', kind: 'string', optional: false },
  ],
  'job-succeeded': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
  ],
  'cronjob-schedule-is': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'schedule', kind: 'string', optional: false },
  ],
  'service-has-endpoints': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'min', kind: 'number', optional: true },
  ],
  'ingress-routes': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'path', kind: 'string', optional: false },
    { name: 'serviceName', kind: 'string', optional: false },
  ],
  'netpol-allows': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'fromLabels', kind: 'string', optional: false },
    { name: 'toLabels', kind: 'string', optional: false },
    { name: 'port', kind: 'number', optional: true },
  ],
  'netpol-denies': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'fromLabels', kind: 'string', optional: false },
    { name: 'toLabels', kind: 'string', optional: false },
    { name: 'port', kind: 'number', optional: true },
  ],
  'dns-resolves': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'fromName', kind: 'string', optional: false },
    { name: 'toName', kind: 'string', optional: false },
  ],
  'configmap-key-set': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'key', kind: 'string', optional: false },
  ],
  'secret-mounted': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'secretName', kind: 'string', optional: false },
    { name: 'podName', kind: 'string', optional: true },
    { name: 'labelSelector', kind: 'string', optional: true },
  ],
  'pvc-bound': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
  ],
  'volume-mounted': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'mountPath', kind: 'string', optional: false },
    { name: 'podName', kind: 'string', optional: true },
    { name: 'labelSelector', kind: 'string', optional: true },
  ],
  'node-ready': [
    { name: 'nodeName', kind: 'string', optional: false },
  ],
  'toleration-matches': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'kind', kind: 'string', optional: false },
    { name: 'name', kind: 'string', optional: false },
  ],
  'quota-within-limit': [
    { name: 'namespace', kind: 'string', optional: false },
  ],
  'hpa-has-metrics': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
  ],
  'pdb-satisfied': [
    { name: 'name', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'minAvailable', kind: 'number', optional: true },
  ],
  'rbac-allows': [
    { name: 'serviceAccount', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'verb', kind: 'string', optional: false },
    { name: 'resource', kind: 'string', optional: false },
  ],
  'rbac-denies': [
    { name: 'serviceAccount', kind: 'string', optional: false },
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'verb', kind: 'string', optional: false },
    { name: 'resource', kind: 'string', optional: false },
  ],
  'no-incident-active': [
    { name: 'namespace', kind: 'string', optional: false },
    { name: 'kind', kind: 'string', optional: true },
  ],
};
