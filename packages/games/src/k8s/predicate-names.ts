/**
 * Từ vựng vị từ dùng chung cho `Objective.check`.
 *
 * ⛔ Lead sở hữu. Đây là chỗ lane B (hiện thực) và lane C (gọi tên) gặp nhau, và
 * là thứ duy nhất giữ hai lane đó chạy song song mà không phải đợi nhau. Cần thêm
 * một vị từ ⇒ BÁO LEAD, đừng tự thêm dòng: lane C thêm một tên mà lane B chưa
 * hiện thực sẽ cho ra một level không bao giờ qua được, và test bắt lỗi đó chỉ
 * chạy ở cuối.
 *
 * Lane B giữ `PREDICATES: Record<PredicateName, Predicate>` ở `predicates.ts` và
 * một test khẳng định HAI CHIỀU: mọi tên ở đây có hiện thực, và mọi hiện thực có
 * tên ở đây. Một chiều thôi thì vị từ chết sẽ sống mãi.
 *
 * `args` ghi trong comment mỗi dòng là hợp đồng tham số — lane C truyền đúng bộ
 * đó, lane B đọc đúng bộ đó.
 */

export const PREDICATE_NAMES = [
  // ── Tồn tại ───────────────────────────────────────────────────────────────
  /** args: { kind, name, namespace } */
  'resource-exists',
  /** args: { kind, name, namespace } — dùng cho level dạy xoá/dọn */
  'resource-absent',

  // ── Pod ───────────────────────────────────────────────────────────────────
  /** args: { namespace, name? , labelSelector? } — ít nhất một pod khớp đang Running */
  'pod-running',
  /** args: { namespace, labelSelector, min } */
  'pod-count-running',
  /** args: { namespace, labelSelector } — không pod nào khớp mang `reason` */
  'pod-no-reason',
  /** args: { namespace, name, nodeName } */
  'pod-on-node',
  /** args: { namespace, name, nodeName } */
  'pod-not-on-node',
  /** args: { namespace } — mọi pod trong namespace Running và không có reason */
  'all-pods-healthy',

  // ── Workload ──────────────────────────────────────────────────────────────
  /** args: { name, namespace, replicas } — đủ replica SẴN SÀNG, không phải chỉ mong muốn */
  'deployment-ready',
  /** args: { kind, name, namespace, n } */
  'replicas-at-least',
  /** args: { kind, name, namespace, image } */
  'container-image-is',
  /** args: { kind, name, namespace } — có cả requests lẫn limits */
  'resource-limits-set',
  /** args: { kind, name, namespace, probe: 'readiness' | 'liveness' } */
  'probe-configured',
  /** args: { name, namespace } — Job kết thúc Succeeded */
  'job-succeeded',

  // ── Mạng ──────────────────────────────────────────────────────────────────
  /** args: { name, namespace, min } */
  'service-has-endpoints',
  /** args: { name, namespace, path, serviceName } */
  'ingress-routes',
  /** args: { namespace, fromLabels, toLabels, port } */
  'netpol-allows',
  /** args: { namespace, fromLabels, toLabels, port } — PHẢI bị chặn */
  'netpol-denies',
  /** args: { namespace, fromName, toName } — phân giải DNS được */
  'dns-resolves',

  // ── Cấu hình và lưu trữ ───────────────────────────────────────────────────
  /** args: { name, namespace, key } */
  'configmap-key-set',
  /** args: { podName, namespace, secretName } */
  'secret-mounted',
  /** args: { name, namespace } — PVC ở trạng thái Bound */
  'pvc-bound',
  /** args: { podName, namespace, mountPath } */
  'volume-mounted',

  // ── Xếp lịch và quota ─────────────────────────────────────────────────────
  /** args: { nodeName } */
  'node-ready',
  /** args: { namespace, kind, name } — pod chịu được taint của node đích */
  'toleration-matches',
  /** args: { namespace } — không tài nguyên nào vượt ResourceQuota */
  'quota-within-limit',
  /** args: { name, namespace } — HPA có metric nguồn hợp lệ */
  'hpa-has-metrics',
  /** args: { name, namespace, minAvailable } */
  'pdb-satisfied',

  // ── RBAC ──────────────────────────────────────────────────────────────────
  /** args: { serviceAccount, namespace, verb, resource } */
  'rbac-allows',
  /** args: { serviceAccount, namespace, verb, resource } — PHẢI bị từ chối */
  'rbac-denies',

  // ── Tổng thể ──────────────────────────────────────────────────────────────
  /** args: { namespace, kind? } — không sự cố nào còn hoạt động */
  'no-incident-active',
] as const;

export type PredicateName = (typeof PREDICATE_NAMES)[number];
