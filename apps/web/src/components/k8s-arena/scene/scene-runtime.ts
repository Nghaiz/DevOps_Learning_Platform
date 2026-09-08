/**
 * Cầu nối engine → cảnh 3D. TOÁN THUẦN: không `three`, không DOM, không React.
 *
 * Vì sao là một kho có thể sửa tại chỗ chứ không phải state của React: hợp đồng
 * (`arena-contract.ts`) nói thẳng rằng `view` KHÔNG đi qua props — engine đập
 * nhịp nhiều lần mỗi giây, và để React dựng lại cây scene ở mỗi nhịp là làm sập
 * khung hình với vài trăm pod. Nên trạng thái vẽ sống ở đây, được ĐỌC trong vòng
 * lặp vẽ, và React chỉ chạm vào nó lúc mount.
 *
 * Ba giá trị `draw*` được tính MỘT LẦN mỗi khung hình (`scene-frame.ts`) rồi
 * mọi thành phần khác chỉ đọc. Lý do không để mỗi thành phần tự tính: bộ ghi
 * instance và bộ đặt nhãn phải nhìn thấy CÙNG một vị trí, nếu không nhãn trôi
 * lệch khỏi vật nó gọi tên — một lỗi trông như bug bố cục, không như bug đồng bộ.
 *
 * ⛔ KHÔNG `import 'three'` (giữ file ngoài chunk lazy).
 */

import type { ClusterView } from '@devops-platform/games';
import { KIND_ACCENT } from '../arena-contract';
import { computeLayout } from '../shared/scene-layout';
import { phaseFromId } from '../shared/scene-motion';
import type { EdgeBuffers, FrameOptions, NodeEntry, SceneEntry, SceneRuntime } from './scene-entry';
import { advanceEntries } from './scene-frame';
import { visualSignature } from './scene-signature';

export function createSceneRuntime(getView: () => ClusterView): SceneRuntime {
  const entries = new Map<string, SceneEntry>();
  const order: SceneEntry[] = [];
  const visible: SceneEntry[] = [];
  const nodes: NodeEntry[] = [];
  const edges: EdgeBuffers = { solid: [], dashed: [] };
  let signature: string | null = null;

  const runtime: SceneRuntime = {
    entries,
    order,
    visible,
    nodes,
    edges,
    radius: 1,
    structureVersion: 0,

    sync(): boolean {
      const view = getView();
      const layout = computeLayout(view);
      const next = visualSignature(layout, view);
      if (next === signature) {
        return false;
      }
      signature = next;

      const byUid = new Map(view.objects.map((o) => [o.uid, o]));
      const seen = new Set<string>();
      for (const placement of layout.objects) {
        const object = byUid.get(placement.uid);
        if (object === undefined) {
          continue;
        }
        seen.add(placement.uid);
        let entry = entries.get(placement.uid);
        if (entry === undefined) {
          entry = {
            uid: placement.uid,
            kind: object.kind,
            accent: KIND_ACCENT[object.kind],
            label: '',
            x: 0,
            y: 0,
            z: 0,
            size: placement.size,
            phase: phaseFromId(placement.uid),
            token: object.statusToken,
            terminating: false,
            failing: false,
            appear: 0,
            dying: 0,
            doomed: false,
            drawY: placement.position.y,
            drawScale: 0,
            drawGlow: 0,
          };
          entries.set(placement.uid, entry);
        }
        entry.x = placement.position.x;
        entry.y = placement.position.y;
        entry.z = placement.position.z;
        entry.size = placement.size;
        entry.token = object.statusToken;
        /*
         * `phase` và `reason` là HAI TRỤC của hợp đồng engine, và cảnh phải tôn
         * trọng điều đó: `Terminating` là một PHASE (chìm xuống), còn
         * `CrashLoopBackOff` là một REASON (nhấp nháy). Gộp hai trục lại ở đây
         * là vẽ ra một mô hình Kubernetes sai.
         */
        entry.terminating = object.phase === 'Terminating';
        entry.failing = object.statusToken === 'destructive' || object.statusToken === 'warning';
        entry.label = `${object.kind.toLowerCase()}/${object.name}`;
        entry.doomed = false;
        entry.dying = 0;
      }
      for (const entry of entries.values()) {
        if (!seen.has(entry.uid)) {
          entry.doomed = true;
        }
      }

      nodes.length = 0;
      for (const node of layout.nodes) {
        nodes.push({
          name: node.name,
          x: node.position.x,
          ready: node.ready,
          load: Math.max(node.cpuUsed, node.memoryUsed),
        });
      }

      const positionOf = new Map(layout.objects.map((o) => [o.uid, o.position]));
      edges.solid.length = 0;
      edges.dashed.length = 0;
      for (const edge of layout.edges) {
        const a = positionOf.get(edge.fromUid);
        const b = positionOf.get(edge.toUid);
        if (a === undefined || b === undefined) {
          continue;
        }
        const target = edge.healthy ? edges.solid : edges.dashed;
        target.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }

      runtime.radius = layout.radius;
      runtime.structureVersion += 1;
      rebuildOrder();
      return true;
    },

    advanceFrame(elapsedS: number, dt: number, options: FrameOptions): boolean {
      const result = advanceEntries(entries, order, visible, elapsedS, dt, options);
      if (result.buried) {
        rebuildOrder();
        runtime.structureVersion += 1;
      }
      return result.animating;
    },
  };

  function rebuildOrder(): void {
    order.length = 0;
    for (const entry of entries.values()) {
      order.push(entry);
    }
    order.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  }

  return runtime;
}
