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
import {
  EDGE_SEGMENTS,
  fanOffset,
  pairKey,
  relationIndex,
  writeCurve,
} from '../shared/edge-routing';
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
  const edges: EdgeBuffers = {
    solid: [],
    dashed: [],
    solidKinds: [],
    dashedKinds: [],
    solidLinks: [],
    dashedLinks: [],
  };
  const links: EdgeLink[] = [];
  const overrides = new Map<string, PlacementOverride>();
  let signature: string | null = null;
  let resetting = false;
  let dragRoutesPending = false;
  let plannedRoutes: number[][] = [];
  let plannedPositions = new Map<string, { x: number; z: number }>();
  const transitions = new Map<
    string,
    { x: number; z: number; targetX: number; targetZ: number; time: number }
  >();

  const runtime: SceneRuntime = {
    draggingUid: null,
    entries,
    order,
    visible,
    nodes,
    edges,
    links,
    overrides,
    radius: 1,
    structureVersion: 0,

    moveTo(uid: string, x: number, z: number): void {
      const entry = entries.get(uid);
      if (entry === undefined) {
        return;
      }
      transitions.delete(uid);
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
      dragRoutesPending = runtime.draggingUid !== null;
      rebuildEdges(!dragRoutesPending);
      runtime.structureVersion += 1;
    },

    resetLayout(): boolean {
      if (overrides.size === 0) {
        return false;
      }
      const starts = new Map([...entries].map(([uid, entry]) => [uid, { x: entry.x, z: entry.z }]));
      transitions.clear();
      overrides.clear();
      /*
       * Ép `sync` tính lại từ đầu: chữ ký hiện tại vẫn khớp với cụm (cụm chưa
       * đổi), nên không xoá nó thì `sync` trả về sớm và các entry giữ nguyên toạ
       * độ kéo tay — nút "Sắp xếp lại" bấm vào không làm gì cả.
       */
      signature = null;
      resetting = true;
      runtime.sync();
      resetting = false;
      for (const [uid, start] of starts) {
        const entry = entries.get(uid);
        if (!entry || Math.hypot(entry.x - start.x, entry.z - start.z) < 0.001) continue;
        transitions.set(uid, { ...start, targetX: entry.x, targetZ: entry.z, time: 0 });
        entry.x = start.x;
        entry.z = start.z;
      }
      rebuildEdges(false);
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
      const reserved = [...overrides].map(([uid, position]) => ({
        uid,
        ...position,
        size: entries.get(uid)?.size ?? 0.95,
      }));
      for (const original of layout.objects) {
        let placement = original;
        if (overrides.size && !overrides.has(original.uid)) {
          let x = original.position.x,
            z = original.position.z;
          let attempt = 0;
          while (
            reserved.some(
              (point) =>
                Math.hypot(point.x - x, point.z - z) < (point.size + original.size) / 2 + 0.7,
            )
          ) {
            attempt++;
            const ring = Math.ceil(attempt / 12);
            const angle = (attempt * Math.PI) / 6;
            x = original.position.x + Math.cos(angle) * ring * 2.2;
            z = original.position.z + Math.sin(angle) * ring * 2.2;
          }
          placement = { ...original, position: { ...original.position, x, z } };
          reserved.push({ uid: original.uid, x, z, size: original.size });
        }
        const object = byUid.get(placement.uid);
        if (object === undefined) {
          continue;
        }
        seen.add(placement.uid);
        let entry = entries.get(placement.uid);
        const existing = entry !== undefined;
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
        if (
          existing &&
          !resetting &&
          !override &&
          !transitions.has(placement.uid) &&
          Math.hypot(entry.x - placement.position.x, entry.z - placement.position.z) > 0.01
        ) {
          transitions.set(placement.uid, {
            x: entry.x,
            z: entry.z,
            targetX: placement.position.x,
            targetZ: placement.position.z,
            time: 0,
          });
        }
        const transition = transitions.get(placement.uid);
        if (transition) {
          transition.targetX = placement.position.x;
          transition.targetZ = placement.position.z;
        }
        entry.x = transition ? entry.x : (override?.x ?? placement.position.x);
        entry.y = placement.position.y;
        entry.z = transition ? entry.z : (override?.z ?? placement.position.z);
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
          z: node.position.z,
          ready: node.ready,
          load: Math.max(node.cpuUsed, node.memoryUsed),
        });
      }

      links.length = 0;
      /*
       * Bậc xoè tính MỘT LẦN ở đây. Nhiều quan hệ giữa cùng hai vật (một pod vừa
       * `runs-on` node vừa được `selects` bởi service ở cạnh nó) sẽ vẽ chồng khít
       * lên nhau nếu không đánh số — người chơi đếm ra một dây ở chỗ có ba.
       */
      const pairCount = new Map<string, number>();
      for (const edge of [...layout.edges].sort((a, b) =>
        `${a.fromUid}/${a.toUid}/${a.kind}`.localeCompare(`${b.fromUid}/${b.toUid}/${b.kind}`),
      )) {
        const key = pairKey(edge.fromUid, edge.toUid);
        const index = pairCount.get(key) ?? 0;
        pairCount.set(key, index + 1);
        links.push({
          fromUid: edge.fromUid,
          toUid: edge.toUid,
          kind: edge.kind,
          healthy: edge.healthy,
          fan: fanOffset(index),
        });
      }
      rebuildEdges();

      runtime.radius = Math.max(
        layout.radius,
        ...[...entries.values()].map((entry) => Math.hypot(entry.x, entry.z) + entry.size),
      );
      runtime.structureVersion += 1;
      rebuildOrder();
      return true;
    },

    advanceFrame(elapsedS: number, dt: number, options: FrameOptions): boolean {
      const moving = transitions.size > 0;
      for (const [uid, transition] of transitions) {
        const entry = entries.get(uid);
        if (!entry || entry.doomed) {
          transitions.delete(uid);
          continue;
        }
        transition.time += Math.max(0, Math.min(dt, 0.1));
        const t = options.reducedMotion ? 1 : Math.min(1, transition.time / 0.6);
        const ease = t * t * t * (t * (t * 6 - 15) + 10);
        entry.x = transition.x + (transition.targetX - transition.x) * ease;
        entry.z = transition.z + (transition.targetZ - transition.z) * ease;
        if (t === 1) transitions.delete(uid);
      }
      const dragEnded = dragRoutesPending && runtime.draggingUid === null;
      if (moving || dragEnded) {
        // Plan once on settling. During motion, deform the existing routes in
        // O(edges × segments), keeping sockets attached without graph searches.
        rebuildEdges((moving && transitions.size === 0) || dragEnded);
        if (dragEnded) dragRoutesPending = false;
        runtime.structureVersion += 1;
      }
      const result = advanceEntries(entries, order, visible, elapsedS, dt, options);
      if (result.buried) {
        rebuildOrder();
        runtime.structureVersion += 1;
      }
      return result.animating || transitions.size > 0;
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
  function rebuildEdges(replan = true): void {
    edges.solid.length = 0;
    edges.dashed.length = 0;
    edges.solidKinds.length = 0;
    edges.dashedKinds.length = 0;
    edges.solidLinks.length = 0;
    edges.dashedLinks.length = 0;
    if (replan || plannedRoutes.length !== links.length) {
      plannedRoutes = links.map((link) => {
        const a = entries.get(link.fromUid),
          b = entries.get(link.toUid);
        const points: number[] = [];
        if (a && b) {
          writeCurve(
            points,
            { ...a, y: a.y + a.size * 0.3 },
            { ...b, y: b.y + b.size * 0.3 },
            link.fan,
          );
        }
        return points;
      });
      plannedPositions = new Map(
        [...entries].map(([uid, entry]) => [uid, { x: entry.x, z: entry.z }]),
      );
    }
    for (let linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
      const link = links[linkIndex];
      if (link === undefined) {
        continue;
      }
      const a = entries.get(link.fromUid);
      const b = entries.get(link.toUid);
      if (a === undefined || b === undefined) {
        continue;
      }
      const target = link.healthy ? edges.solid : edges.dashed;
      const kinds = link.healthy ? edges.solidKinds : edges.dashedKinds;
      const owners = link.healthy ? edges.solidLinks : edges.dashedLinks;
      const route = plannedRoutes[linkIndex]!;
      const originA = plannedPositions.get(a.uid)!,
        originB = plannedPositions.get(b.uid)!;
      for (let i = 0; i < route.length; i += 3) {
        const vertex = Math.floor(i / 6) + (i % 6 === 3 ? 1 : 0);
        const t = vertex / EDGE_SEGMENTS;
        // Flat weights near endpoints keep the first segments attached during dragging.
        const blend = Math.max(0, Math.min(1, (t - 0.15) / 0.7));
        const weight = blend * blend * (3 - 2 * blend);
        target.push(
          route[i]! + (a.x - originA.x) * (1 - weight) + (b.x - originB.x) * weight,
          route[i + 1]!,
          route[i + 2]! + (a.z - originA.z) * (1 - weight) + (b.z - originB.z) * weight,
        );
      }
      const index = relationIndex(link.kind);
      for (let segment = 0; segment < EDGE_SEGMENTS; segment += 1) {
        kinds.push(index);
        owners.push(linkIndex);
      }
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
