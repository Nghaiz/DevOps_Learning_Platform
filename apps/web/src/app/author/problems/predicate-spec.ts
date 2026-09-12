import { t } from '@devops-platform/copy';
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
  'resource-exists': {
    label: t('problem.predicate-spec-tai-nguyen-ton-tai'),
    args: [kind(), name(), ns(false)],
  },
  'resource-absent': {
    label: t('problem.predicate-spec-tai-nguyen-da-bi-xoa'),
    args: [kind(), name(), ns(false)],
  },

  'pod-running': {
    label: t('problem.predicate-spec-co-pod-khop-dang-running'),
    args: [
      ns(),
      name(false),
      sel('labelSelector', t('problem.predicate-arg-types-bo-chon-nhan'), false),
    ],
    requireOneOf: ['name', 'labelSelector'],
  },
  'pod-count-running': {
    label: t('problem.predicate-spec-du-so-pod-khop-dang-running'),
    args: [ns(), sel(), num('min', t('problem.predicate-spec-so-pod-toi-thieu'))],
  },
  'pod-no-reason': {
    label: t('problem.predicate-spec-khong-pod-khop-nao-mang-reason-loi'),
    args: [ns(), sel()],
  },
  'pod-on-node': {
    label: t('problem.predicate-spec-pod-nam-tren-dung-node'),
    args: [ns(), name(), node()],
  },
  'pod-not-on-node': {
    label: t('problem.predicate-spec-pod-khong-nam-tren-node-do'),
    args: [ns(), name(), node()],
  },
  'all-pods-healthy': {
    label: t('problem.predicate-spec-moi-pod-trong-namespace-deu-khoe'),
    args: [ns()],
  },

  'deployment-ready': {
    label: t('problem.predicate-spec-deployment-du-replica-san-sang'),
    args: [name(), ns(), num('replicas', t('problem.predicate-spec-so-replica-san-sang'))],
  },
  'replicas-at-least': {
    label: t('problem.predicate-spec-workload-co-it-nhat-n-replica'),
    args: [kind(), name(), ns(), num('n', t('problem.predicate-spec-so-replica-toi-thieu'))],
  },
  'container-image-is': {
    label: t('problem.predicate-spec-container-chay-dung-image'),
    args: [
      kind(),
      name(),
      ns(),
      text('image', t('problem.predicate-spec-image-day-du-gom-ca-tag')),
    ],
  },
  'resource-limits-set': {
    label: t('problem.predicate-spec-da-khai-ca-requests-lan-limits'),
    args: [kind(), name(), ns()],
  },
  'probe-configured': {
    label: t('problem.predicate-spec-da-cau-hinh-probe'),
    args: [
      kind(),
      name(),
      ns(),
      {
        key: 'probe',
        label: t('problem.predicate-spec-loai-probe'),
        type: 'probe',
        required: true,
      },
    ],
  },
  'job-succeeded': {
    label: t('problem.predicate-spec-job-ket-thuc-succeeded'),
    args: [name(), ns()],
  },
  'cronjob-schedule-is': {
    label: t('problem.predicate-spec-cronjob-dung-lich'),
    args: [name(), ns(), text('schedule', t('problem.predicate-spec-lich-dang-cron-vi-du-0-3'))],
  },

  'service-has-endpoints': {
    label: t('problem.predicate-spec-service-co-endpoint'),
    args: [
      name(),
      ns(),
      num('min', t('problem.predicate-spec-so-endpoint-toi-thieu-mac-dinh-1'), false),
    ],
  },
  'ingress-routes': {
    label: t('problem.predicate-spec-ingress-dinh-tuyen-dung'),
    args: [
      name(),
      ns(),
      text('path', t('problem.predicate-spec-duong-dan')),
      text('serviceName', t('problem.predicate-spec-service-dich')),
    ],
  },
  'netpol-allows': {
    label: t('problem.predicate-spec-networkpolicy-cho-phep-luong-nay'),
    args: [
      ns(),
      sel('fromLabels', t('problem.predicate-spec-nhan-ben-gui')),
      sel('toLabels', t('problem.predicate-spec-nhan-ben-nhan')),
      num('port', t('problem.predicate-spec-cong'), false),
    ],
  },
  'netpol-denies': {
    label: t('problem.predicate-spec-networkpolicy-chan-luong-nay'),
    args: [
      ns(),
      sel('fromLabels', t('problem.predicate-spec-nhan-ben-gui')),
      sel('toLabels', t('problem.predicate-spec-nhan-ben-nhan')),
      num('port', t('problem.predicate-spec-cong'), false),
    ],
  },
  'dns-resolves': {
    label: t('problem.predicate-spec-phan-giai-duoc-ten-dich-vu'),
    args: [
      ns(),
      text('fromName', t('problem.predicate-spec-pod-nguon')),
      text('toName', t('problem.predicate-spec-ten-dich-vu-can-phan-giai')),
    ],
  },

  'configmap-key-set': {
    label: t('problem.predicate-spec-configmap-co-key'),
    args: [name(), ns(), text('key', t('problem.predicate-spec-ten-key'))],
  },
  'secret-mounted': {
    label: t('problem.predicate-spec-secret-da-duoc-gan-vao-pod'),
    args: [
      ns(),
      text('secretName', t('problem.predicate-spec-ten-secret')),
      text('podName', t('problem.predicate-spec-ten-pod'), false),
      sel('labelSelector', t('problem.predicate-arg-types-bo-chon-nhan'), false),
    ],
    requireOneOf: ['podName', 'labelSelector'],
  },
  'pvc-bound': { label: t('problem.predicate-spec-pvc-o-trang-thai-bound'), args: [name(), ns()] },
  'volume-mounted': {
    label: t('problem.predicate-spec-volume-da-gan-vao-dung-duong-dan'),
    args: [
      ns(),
      text('mountPath', t('problem.predicate-spec-duong-dan-mount')),
      text('podName', t('problem.predicate-spec-ten-pod'), false),
      sel('labelSelector', t('problem.predicate-arg-types-bo-chon-nhan'), false),
    ],
    requireOneOf: ['podName', 'labelSelector'],
  },

  'node-ready': { label: t('problem.node-fields-node-o-trang-thai-ready'), args: [node()] },
  'toleration-matches': {
    label: t('problem.predicate-spec-pod-chiu-duoc-taint-cua-node-dich'),
    args: [ns(), kind(), name()],
  },
  'quota-within-limit': {
    label: t('problem.predicate-spec-khong-tai-nguyen-nao-vuot-resourcequota'),
    args: [ns()],
  },
  'hpa-has-metrics': {
    label: t('problem.predicate-spec-hpa-co-nguon-metric-hop-le'),
    args: [name(), ns()],
  },
  'pdb-satisfied': {
    label: t('problem.predicate-spec-poddisruptionbudget-duoc-thoa'),
    args: [
      name(),
      ns(),
      num('minAvailable', t('problem.predicate-spec-minavailable-mac-dinh-lay-tu-spec'), false),
    ],
  },

  'rbac-allows': {
    label: t('problem.predicate-spec-rbac-cho-phep-thao-tac'),
    args: [
      text('serviceAccount', t('problem.resource-service-account')),
      ns(),
      text('verb', t('problem.predicate-spec-dong-tu-vi-du-get')),
      text('resource', t('problem.predicate-spec-tai-nguyen-vi-du-pods')),
    ],
  },
  'rbac-denies': {
    label: t('problem.predicate-spec-rbac-tu-choi-thao-tac'),
    args: [
      text('serviceAccount', t('problem.resource-service-account')),
      ns(),
      text('verb', t('problem.predicate-spec-dong-tu-vi-du-get')),
      text('resource', t('problem.predicate-spec-tai-nguyen-vi-du-pods')),
    ],
  },

  'no-incident-active': {
    label: t('problem.predicate-spec-khong-con-su-co-nao-hoat-dong'),
    args: [
      ns(),
      {
        key: 'kind',
        label: t('problem.predicate-spec-chi-xet-mot-loai-su-co'),
        type: 'incident-kind',
        required: false,
      },
    ],
  },
};

/** Vị từ có nằm trong bảng tra không. Người soạn KHÔNG gõ tay được, đây là lớp chặn cuối. */
export function isPredicateName(value: string): value is PredicateName {
  return (PREDICATE_NAMES as readonly string[]).includes(value);
}

export const PROBE_VALUES = ['readiness', 'liveness'] as const;
