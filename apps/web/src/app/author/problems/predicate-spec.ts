import { PREDICATE_NAMES, type PredicateName } from '@devops-platform/games';
import { kind, name, node, num, ns, sel, text, type PredicateSpec } from './predicate-arg-types';

/**
 * Hình dạng tham số của 32 vị từ — thứ biến "chọn vị từ" thành một biểu mẫu điền
 * được thay vì một ô JSON tự do.
 *
 * ## Vì sao bảng này tồn tại ở đây
 *
 * `predicate-names.ts` ghi hợp đồng tham số trong BÌNH LUẬN (`args: { kind, name,
 * namespace }`). Bình luận thì người đọc được, `<Select>` thì không. Không có
 * bảng này, ô tham số phải là một textarea JSON — và lúc đó người soạn gõ sai
 * tên field sẽ tạo ra một mục tiêu KHÔNG BAO GIỜ tích xanh, mà lỗi chỉ lộ khi đã
 * có người học ngồi làm bài. Đúng cái hỏng mà brief yêu cầu chặn ở khâu soạn.
 *
 * ## Bảng này đối chiếu với HIỆN THỰC, không phải với bình luận
 *
 * Mọi tên khoá dưới đây đã đọc thẳng từ `k8s/predicates.ts` (`argString(args,
 * 'nodeName')`…), vì bình luận và hiện thực đã lệch nhau ở ba chỗ:
 *
 * - `netpol-allows`/`netpol-denies` — bình luận ghi `port` như bắt buộc, nhưng
 *   `netpolArgs` truyền thẳng `argNumber(args, 'port')` cho phép `null`. Ở đây
 *   `port` là TUỲ CHỌN.
 * - `service-has-endpoints` — `min` có mặc định `?? 1` trong hiện thực.
 * - `pdb-satisfied` — `minAvailable` rơi về `pdb.spec.minAvailable` khi vắng.
 *
 * `resource-exists`/`resource-absent` cũng nhận `namespace` vắng (`?? ''`), đúng
 * cho loại tài nguyên phạm vi cluster.
 *
 * ⚠ Bản sao này gác được TÊN vị từ ở tầng biên dịch (`Record<PredicateName, …>`
 * đỏ hai chiều), nhưng KHÔNG gác được tên THAM SỐ — chúng chỉ sống trong bình
 * luận và trong thân hàm. Đã báo lead xin một bảng `PREDICATE_ARGS` chạy được ở
 * chính `predicate-names.ts`; tới lúc đó, sửa một tên tham số ở lane B mà quên
 * file này là một lỗi im lặng.
 */

export const PREDICATE_SPECS: Readonly<Record<PredicateName, PredicateSpec>> = {
  'resource-exists': { label: 'Tài nguyên tồn tại', args: [kind(), name(), ns(false)] },
  'resource-absent': { label: 'Tài nguyên đã bị xoá', args: [kind(), name(), ns(false)] },

  'pod-running': {
    label: 'Có pod khớp đang Running',
    args: [ns(), name(false), sel('labelSelector', 'Bộ chọn nhãn', false)],
    requireOneOf: ['name', 'labelSelector'],
  },
  'pod-count-running': {
    label: 'Đủ số pod khớp đang Running',
    args: [ns(), sel(), num('min', 'Số pod tối thiểu')],
  },
  'pod-no-reason': { label: 'Không pod khớp nào mang reason lỗi', args: [ns(), sel()] },
  'pod-on-node': { label: 'Pod nằm trên đúng node', args: [ns(), name(), node()] },
  'pod-not-on-node': { label: 'Pod KHÔNG nằm trên node đó', args: [ns(), name(), node()] },
  'all-pods-healthy': { label: 'Mọi pod trong namespace đều khoẻ', args: [ns()] },

  'deployment-ready': {
    label: 'Deployment đủ replica SẴN SÀNG',
    args: [name(), ns(), num('replicas', 'Số replica sẵn sàng')],
  },
  'replicas-at-least': {
    label: 'Workload có ít nhất N replica',
    args: [kind(), name(), ns(), num('n', 'Số replica tối thiểu')],
  },
  'container-image-is': {
    label: 'Container chạy đúng image',
    args: [kind(), name(), ns(), text('image', 'Image đầy đủ, gồm cả tag')],
  },
  'resource-limits-set': { label: 'Đã khai cả requests lẫn limits', args: [kind(), name(), ns()] },
  'probe-configured': {
    label: 'Đã cấu hình probe',
    args: [kind(), name(), ns(), { key: 'probe', label: 'Loại probe', type: 'probe', required: true }],
  },
  'job-succeeded': { label: 'Job kết thúc Succeeded', args: [name(), ns()] },
  'cronjob-schedule-is': {
    label: 'CronJob đúng lịch',
    args: [name(), ns(), text('schedule', 'Lịch dạng cron, ví dụ 0 3 * * *')],
  },

  'service-has-endpoints': {
    label: 'Service có endpoint',
    args: [name(), ns(), num('min', 'Số endpoint tối thiểu (mặc định 1)', false)],
  },
  'ingress-routes': {
    label: 'Ingress định tuyến đúng',
    args: [name(), ns(), text('path', 'Đường dẫn'), text('serviceName', 'Service đích')],
  },
  'netpol-allows': {
    label: 'NetworkPolicy CHO PHÉP luồng này',
    args: [ns(), sel('fromLabels', 'Nhãn bên gửi'), sel('toLabels', 'Nhãn bên nhận'), num('port', 'Cổng', false)],
  },
  'netpol-denies': {
    label: 'NetworkPolicy CHẶN luồng này',
    args: [ns(), sel('fromLabels', 'Nhãn bên gửi'), sel('toLabels', 'Nhãn bên nhận'), num('port', 'Cổng', false)],
  },
  'dns-resolves': {
    label: 'Phân giải được tên dịch vụ',
    args: [ns(), text('fromName', 'Pod nguồn'), text('toName', 'Tên dịch vụ cần phân giải')],
  },

  'configmap-key-set': { label: 'ConfigMap có key', args: [name(), ns(), text('key', 'Tên key')] },
  'secret-mounted': {
    label: 'Secret đã được gắn vào pod',
    args: [
      ns(),
      text('secretName', 'Tên Secret'),
      text('podName', 'Tên pod', false),
      sel('labelSelector', 'Bộ chọn nhãn', false),
    ],
    requireOneOf: ['podName', 'labelSelector'],
  },
  'pvc-bound': { label: 'PVC ở trạng thái Bound', args: [name(), ns()] },
  'volume-mounted': {
    label: 'Volume đã gắn vào đúng đường dẫn',
    args: [
      ns(),
      text('mountPath', 'Đường dẫn mount'),
      text('podName', 'Tên pod', false),
      sel('labelSelector', 'Bộ chọn nhãn', false),
    ],
    requireOneOf: ['podName', 'labelSelector'],
  },

  'node-ready': { label: 'Node ở trạng thái Ready', args: [node()] },
  'toleration-matches': { label: 'Pod chịu được taint của node đích', args: [ns(), kind(), name()] },
  'quota-within-limit': { label: 'Không tài nguyên nào vượt ResourceQuota', args: [ns()] },
  'hpa-has-metrics': { label: 'HPA có nguồn metric hợp lệ', args: [name(), ns()] },
  'pdb-satisfied': {
    label: 'PodDisruptionBudget được thoả',
    args: [name(), ns(), num('minAvailable', 'minAvailable (mặc định lấy từ spec)', false)],
  },

  'rbac-allows': {
    label: 'RBAC CHO PHÉP thao tác',
    args: [text('serviceAccount', 'ServiceAccount'), ns(), text('verb', 'Động từ, ví dụ get'), text('resource', 'Tài nguyên, ví dụ pods')],
  },
  'rbac-denies': {
    label: 'RBAC TỪ CHỐI thao tác',
    args: [text('serviceAccount', 'ServiceAccount'), ns(), text('verb', 'Động từ, ví dụ get'), text('resource', 'Tài nguyên, ví dụ pods')],
  },

  'no-incident-active': {
    label: 'Không còn sự cố nào hoạt động',
    args: [ns(), { key: 'kind', label: 'Chỉ xét một loại sự cố', type: 'incident-kind', required: false }],
  },
};

/** Vị từ có nằm trong bảng tra không. Người soạn KHÔNG gõ tay được, đây là lớp chặn cuối. */
export function isPredicateName(value: string): value is PredicateName {
  return (PREDICATE_NAMES as readonly string[]).includes(value);
}

export const PROBE_VALUES = ['readiness', 'liveness'] as const;
