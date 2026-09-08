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
  readonly podsRunning: number;
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
     * "Running" đọc từ `phase`, KHÔNG từ `statusToken`. Hai trục khác nhau: một
     * pod có thể `phase: 'Running'` mà `reason: 'CrashLoopBackOff'` — nó ĐANG
     * chạy theo nghĩa của scheduler và vẫn hỏng theo nghĩa của người dùng. Đếm
     * bằng `statusToken` sẽ trộn hai câu hỏi đó vào một con số không trả lời
     * được câu nào.
     */
    podsRunning: pods.filter((p) => p.phase === 'Running').length,
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
