/**
 * Bộ đếm sống cho thanh trên (§12.5) — hàm THUẦN, test được ở env node.
 *
 * ⚠ KHÔNG lưu các số này ở đâu cả, và đó là một quy ước của repo chứ không phải
 * sở thích: `rules/code-conventions.md` § "No Derived Fields" cấm giữ giá trị
 * tính được từ giá trị khác. Mọi số dưới đây suy ra từ `ClusterView` tại chỗ
 * dùng; một bản sao trong state sẽ nói dối ngay lần đầu ai đó đổi cách đếm.
 */

import type { ClusterView } from '@devops-platform/games';

export interface ClusterSummary {
  readonly nodesReady: number;
  readonly nodesTotal: number;
  readonly podsReady: number;
  readonly podsTotal: number;
  readonly deployments: number;
  readonly services: number;
  /** 0..1, trung bình trên các node. `0` khi chưa có node nào. */
  readonly cpu: number;
  readonly memory: number;
  /** Có ít nhất một pod đang hỏng — thanh trên đổi giọng khi cụm có vấn đề. */
  readonly hasFailure: boolean;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function summarize(view: ClusterView): ClusterSummary {
  const pods = view.objects.filter((o) => o.kind === 'Pod');
  return {
    nodesReady: view.nodes.filter((n) => n.ready).length,
    nodesTotal: view.nodes.length,
    /*
     * ⚠ Đếm pod SẴN SÀNG, không phải pod đang Running. Bản trước đếm `phase ===
     * 'Running'` và thanh trên báo "Pods 2/2" trong khi Deployment ngay bên dưới
     * hiện màu cảnh báo vì mới 1/2 pod Ready — hai con số cùng màn hình nói hai
     * điều trái nhau, và cái sai là cái của thanh trên.
     *
     * `phase: Running` chỉ nói scheduler đã đặt được pod và container đã chạy.
     * READY còn đòi probe xanh. `kubectl get pods` để đúng cột READY ở đó vì
     * chính chỗ đó mới trả lời "dịch vụ có nhận request được chưa".
     *
     * Lấy `statusToken === 'success'` CÙNG `phase === 'Running'`: engine chỉ gán
     * `success` cho pod Running-và-Ready (`view.ts` → `podToken`), còn vế `phase`
     * loại pod `Succeeded` — nó xong việc chứ không phải đang phục vụ.
     */
    podsReady: pods.filter((p) => p.phase === 'Running' && p.statusToken === 'success').length,
    podsTotal: pods.length,
    deployments: view.objects.filter((o) => o.kind === 'Deployment').length,
    services: view.objects.filter((o) => o.kind === 'Service').length,
    cpu: mean(view.nodes.map((n) => n.cpuUsed)),
    memory: mean(view.nodes.map((n) => n.memoryUsed)),
    hasFailure: view.objects.some((o) => o.statusToken === 'destructive'),
  };
}

/** `0.34` → `34`. Làm tròn ở chỗ HIỆN, không ở chỗ tính. */
export function percent(ratio: number): number {
  return Math.round(Math.max(0, Math.min(1, ratio)) * 100);
}
