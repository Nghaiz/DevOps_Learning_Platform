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
import type {
  EdgeBuffers,
  EdgeLink,
  FrameOptions,
  NodeEntry,
  PlacementOverride,
  SceneEntry,
  SceneRuntime,
} from './scene-entry';
import { advanceEntries } from './scene-frame';
import { visualSignature } from './scene-signature';

export function createSceneRuntime(getView: () => ClusterView): SceneRuntime {
  const entries = new Map<string, SceneEntry>();
  const order: SceneEntry[] = [];
  const visible: SceneEntry[] = [];
  const nodes: NodeEntry[] = [];
  const edges: EdgeBuffers = { solid: [], dashed: [] };
  const links: EdgeLink[] = [];
  const overrides = new Map<string, PlacementOverride>();
  let signature: string | null = null;

  const runtime: SceneRuntime = {
    draggingUid: null,
    entries,
    order,
    visible,
    nodes,
    edges,
    overrides,
    radius: 1,
    structureVersion: 0,

    moveTo(uid: string, x: number, z: number): void {
      const entry = entries.get(uid);
      if (entry === undefined) {
        return;
      }
      overrides.set(uid, { x, z });
      entry.x = x;
      entry.z = z;
      runtime.radius = Math.max(runtime.radius, Math.hypot(x, z) + entry.size);
      /*
       * Dựng lại cạnh NGAY, không đợi lần `sync` sau. Chữ ký hình ảnh được tính
       * từ `computeLayout` — nó không biết gì về vị trí kéo tay — nên `sync` kết
       * luận "không có gì đổi" và trả về sớm; đợi nó là đợi mãi mãi, và sợi dây
       * nối sẽ đứng yên trong khi vật ở đầu nó đã bị kéo đi.
       */
      rebuildEdges();
      runtime.structureVersion += 1;
    },

    resetLayout(): boolean {
      if (overrides.size === 0) {
        return false;
      }
      overrides.clear();
      /*
       * Ép `sync` tính lại từ đầu: chữ ký hiện tại vẫn khớp với cụm (cụm chưa
       * đổi), nên không xoá nó thì `sync` trả về sớm và các entry giữ nguyên toạ
       * độ kéo tay — nút "Sắp xếp lại" bấm vào không làm gì cả.
       */
      signature = null;
      runtime.sync();
      return true;
    },

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
        /*
         * Vị trí kéo tay THẮNG bố cục tự động, và phải áp lại ở MỌI lần `sync`.
         * Bỏ qua bước này thì mỗi lần cụm đổi cấu trúc (một pod sinh ra ở đâu
         * đó) mọi vật người chơi vừa sắp xếp sẽ búng về chỗ cũ.
         *
         * Chỉ hai trục mặt sàn: `y` vẫn do bố cục quyết, nên pod vẫn đứng đúng
         * độ cao mặt bệ và vật trên kệ vẫn ở tầm kệ.
         */
        const override = overrides.get(placement.uid);
        entry.x = override?.x ?? placement.position.x;
        entry.y = placement.position.y;
        entry.z = override?.z ?? placement.position.z;
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

      links.length = 0;
      for (const edge of layout.edges) {
        links.push({ fromUid: edge.fromUid, toUid: edge.toUid, healthy: edge.healthy });
      }
      rebuildEdges();

      runtime.radius = Math.max(layout.radius, ...[...entries.values()].map(entry => Math.hypot(entry.x, entry.z) + entry.size));
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

  /**
   * Toạ độ hai đầu mỗi cạnh, đọc từ `entries` — tức từ vị trí THẬT SỰ đang vẽ,
   * đã tính cả chỗ người chơi kéo tới.
   *
   * Bản trước đọc thẳng `layout.objects`, và đó là lý do một sợi dây vẫn nối
   * vào chỗ trống sau khi vật ở đầu nó bị kéo đi: `computeLayout` không bao giờ
   * biết tới vị trí kéo tay.
   */
  function rebuildEdges(): void {
    edges.solid.length = 0;
    edges.dashed.length = 0;
    for (const link of links) {
      const a = entries.get(link.fromUid);
      const b = entries.get(link.toUid);
      if (a === undefined || b === undefined) {
        continue;
      }
      const target = link.healthy ? edges.solid : edges.dashed;
      const distance = Math.hypot(b.x - a.x, b.z - a.z);
      const height = Math.min(2, 0.4 + distance * 0.22);
      const bend = Math.min(0.65, distance * 0.12);
      const point = (t: number): number[] => {
        const arc = 4 * t * (1 - t);
        return [a.x + (b.x-a.x)*t - (b.z-a.z)/Math.max(distance,0.01)*bend*arc,
          a.y + (b.y-a.y)*t + height*arc,
          a.z + (b.z-a.z)*t + (b.x-a.x)/Math.max(distance,0.01)*bend*arc];
      };
      for (let segment = 0; segment < 24; segment++) target.push(...point(segment/24), ...point((segment+1)/24));
    }
  }

  function rebuildOrder(): void {
    order.length = 0;
    for (const entry of entries.values()) {
      order.push(entry);
    }
    order.sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  }

  return runtime;
}
