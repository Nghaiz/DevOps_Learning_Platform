/**
 * Danh mục level của Kubernetes Game — thứ tự trong mảng LÀ thứ tự chơi.
 *
 * ⛔ Lane C sở hữu thư mục này. `contract.ts` và `predicate-names.ts` là của
 * lead; `reducer.ts` / `predicates.ts` là của lane B. Level ở đây chỉ là DỮ LIỆU:
 * không hàm, không closure, không import gì ngoài kiểu.
 *
 * ## Sáu chương
 *
 * | Chương | Dạy gì | Level |
 * |---|---|---|
 * | 1 | Pod, container, image, log, vòng đời | 01–05 |
 * | 2 | Deployment, ReplicaSet, scale, rollout, Job | 06–11 |
 * | 3 | Service, endpoint, DNS, Ingress | 12–17 |
 * | 4 | ConfigMap, Secret, volume, PVC/PV, StatefulSet | 18–22 |
 * | 5 | Xếp lịch: requests/limits, taint, affinity, quota | 23–27 |
 * | 6 | Production: probe, NetworkPolicy, RBAC, PDB, HPA | 28–35 |
 *
 * ## Từ vựng `ResourceSpec.spec` — hợp đồng phụ với lane B
 *
 * `contract.ts` cố ý để `spec` lỏng (`Record<string, unknown>`), và ghi rằng
 * `resources.ts` của lane B giữ bộ field mỗi loại THẬT SỰ đọc. Lane C không thấy
 * file đó lúc viết, nên đã chọn bộ tên bám sát Kubernetes thật và ghi lại đây để
 * lane B đối chiếu. Chỗ nào lệch thì lệch ở MỘT phía và sửa được bằng một lần
 * đổi tên, thay vì phát hiện ra ở runtime.
 *
 * - **Pod** — `labels`, `phase`, `restartPolicy`, `nodeName`, `nodeSelector`,
 *   `tolerations`, `serviceAccountName`, `volumes`, `containers[]`.
 * - **container** — `name`, `image`, `command`, `args`, `ports[{containerPort}]`,
 *   `env[]`, `envFrom[]`, `volumeMounts[{name,mountPath}]`,
 *   `resources.{requests,limits}.{cpu,memory}`, `readinessProbe`,
 *   `livenessProbe`, `startupProbe`.
 * - **Deployment / ReplicaSet / DaemonSet / StatefulSet** — `replicas`,
 *   `selector.matchLabels`, `template.{labels,containers,volumes,...}`. Ở đây
 *   `template` là một pod-spec PHẲNG (`labels` + `containers` cùng cấp), không
 *   lồng `metadata`/`spec` như YAML thật: mô phỏng không cần hai tầng đó, và
 *   level phải đọc được trong một màn hình.
 * - **StatefulSet** thêm `serviceName`, `volumeClaimTemplates[]`,
 *   `podManagementPolicy`.
 * - **Service** — `type`, `selector`, `ports[{port,targetPort,protocol}]`.
 * - **Ingress** — `rules[{host,paths[{path,pathType,serviceName,servicePort}]}]`.
 * - **ConfigMap** — `data`. **Secret** — `type`, `data`.
 * - **PersistentVolume** — `capacity`, `accessModes`, `storageClassName`.
 * - **PersistentVolumeClaim** — `accessModes`, `storageClassName`,
 *   `resources.requests.storage`, `volumeName`.
 * - **NetworkPolicy** — `podSelector.matchLabels`, `policyTypes`, `ingress[]`,
 *   `egress[]`.
 * - **ResourceQuota** — `hard`. **LimitRange** — `limits[]`.
 * - **HorizontalPodAutoscaler** — `scaleTargetRef`, `minReplicas`,
 *   `maxReplicas`, `metrics[]`.
 * - **PodDisruptionBudget** — `minAvailable`, `selector.matchLabels`.
 * - **Role / ClusterRole** — `rules[{apiGroups,resources,verbs}]`.
 * - **RoleBinding / ClusterRoleBinding** — `roleRef`, `subjects[]`.
 *
 * ⚠ `phase` trên Pod là field DUY NHẤT ở đây không có trong pod-spec thật —
 * trong Kubernetes nó thuộc `status`, do control plane ghi. Level dùng nó để
 * gieo sẵn một pod đã kết thúc (`Succeeded` / `Failed`) mà không phải mô phỏng
 * cả một lần chạy. Không level nào đặt `phase: 'Running'` để tránh sự cố —
 * pod hỏng luôn được gieo bằng `seededIncident`.
 */

import type { Level } from '../contract.ts';
import { l01 } from './l01.ts';
import { l02 } from './l02.ts';
import { l03 } from './l03.ts';
import { l04 } from './l04.ts';
import { l05 } from './l05.ts';
import { l06 } from './l06.ts';
import { l07 } from './l07.ts';
import { l08 } from './l08.ts';
import { l09 } from './l09.ts';
import { l10 } from './l10.ts';
import { l11 } from './l11.ts';
import { l12 } from './l12.ts';
import { l13 } from './l13.ts';
import { l14 } from './l14.ts';
import { l15 } from './l15.ts';
import { l16 } from './l16.ts';
import { l17 } from './l17.ts';
import { l18 } from './l18.ts';
import { l19 } from './l19.ts';
import { l20 } from './l20.ts';
import { l21 } from './l21.ts';
import { l22 } from './l22.ts';
import { l23 } from './l23.ts';
import { l24 } from './l24.ts';
import { l25 } from './l25.ts';
import { l26 } from './l26.ts';
import { l27 } from './l27.ts';
import { l28 } from './l28.ts';
import { l29 } from './l29.ts';
import { l30 } from './l30.ts';
import { l31 } from './l31.ts';
import { l32 } from './l32.ts';
import { l33 } from './l33.ts';
import { l34 } from './l34.ts';
import { l35 } from './l35.ts';

export const LEVELS: readonly Level[] = [
  l01, l02, l03, l04, l05, l06, l07, l08,
  l09, l10, l11, l12, l13, l14, l15, l16,
  l17, l18, l19, l20, l21, l22, l23, l24,
  l25, l26, l27, l28, l29, l30, l31, l32,
  l33, l34, l35,
];
