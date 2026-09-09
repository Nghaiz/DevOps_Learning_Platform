import type { ObjectPlacement, EdgePlacement } from './scene-layout';

const GUTTER = 1.5;
// Status and clock updates do not alter topology. Keep only a few small position
// maps, never engine objects, to avoid rerunning graph optimization every tick.
const layoutCache = new Map<string, ReadonlyMap<string, { x: number; z: number }>>();
interface Block {
  ids: string[];
  x: number;
  z: number;
  width: number;
  depth: number;
  cols: number;
  pitch: number;
}
interface Group {
  placements: ObjectPlacement[];
  width: number;
  depth: number;
}

/** Layered graph layout. Ownership families are indivisible rectangular blocks;
 * alternating barycenter sweeps shorten secondary connections without splitting
 * siblings. Dense families wrap into rows instead of orbiting a central hub. */
export function arrangeConnections(
  objects: readonly ObjectPlacement[],
  edges: readonly EdgePlacement[],
  labels: ReadonlyMap<string, string> = new Map(),
): ObjectPlacement[] {
  if (!edges.length || !objects.length) return [...objects];
  const key = JSON.stringify([
    objects
      .map((o) => [o.uid, o.size, labels.get(o.uid) ?? ''])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    edges.map((e) => `${e.fromUid}:${e.toUid}:${e.kind}`).sort(),
  ]);
  const cached = layoutCache.get(key);
  if (cached)
    return objects.map((o) => ({ ...o, position: { ...o.position, ...cached.get(o.uid)! } }));
  const byId = new Map(objects.map((o) => [o.uid, o]));
  const valid = edges
    .filter((e) => byId.has(e.fromUid) && byId.has(e.toUid) && e.fromUid !== e.toUid)
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        a.fromUid.localeCompare(b.fromUid) ||
        a.toUid.localeCompare(b.toUid),
    );
  const neighbors = new Map(objects.map((o) => [o.uid, new Set<string>()]));
  const incoming = new Map(objects.map((o) => [o.uid, [] as string[]]));
  const outgoing = new Map(objects.map((o) => [o.uid, [] as string[]]));
  const owner = new Map<string, string>();
  const host = new Map(
    valid.filter((edge) => edge.kind === 'runs-on').map((edge) => [edge.toUid, edge.fromUid]),
  );
  // Accept stronger semantic edges first. Reject only rank constraints that
  // would close a cycle; every original relationship is still rendered.
  const reaches = (start: string, goal: string): boolean => {
    const stack = [start],
      seen = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (id === goal) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...outgoing.get(id)!);
    }
    return false;
  };
  for (const edge of valid) {
    neighbors.get(edge.fromUid)!.add(edge.toUid);
    neighbors.get(edge.toUid)!.add(edge.fromUid);
    if (edge.kind === 'owns' && !owner.has(edge.toUid)) owner.set(edge.toUid, edge.fromUid);
    if (!outgoing.get(edge.fromUid)!.includes(edge.toUid) && !reaches(edge.toUid, edge.fromUid)) {
      outgoing.get(edge.fromUid)!.push(edge.toUid);
      incoming.get(edge.toUid)!.push(edge.fromUid);
    }
  }
  const pending = new Set([...byId.keys()].sort());
  const components: string[][] = [],
    isolated: string[] = [];
  while (pending.size) {
    const first = pending.values().next().value!;
    const component: string[] = [],
      stack = [first];
    while (stack.length) {
      const id = stack.pop()!;
      if (!pending.delete(id)) continue;
      component.push(id);
      stack.push(...neighbors.get(id)!);
    }
    if (component.length === 1) isolated.push(first);
    else components.push(component.sort());
  }
  const groups = components.map((ids) => {
    const rank = new Map<string, number>();
    const remaining = new Set(ids);
    while (remaining.size) {
      for (const id of remaining) {
        if (incoming.get(id)!.some((parent) => !rank.has(parent))) continue;
        rank.set(id, Math.max(0, ...incoming.get(id)!.map((parent) => rank.get(parent)! + 1)));
        remaining.delete(id);
      }
    }
    // Infrastructure belongs immediately behind its hosted workload band,
    // rather than alongside unrelated top-level controllers several rows away.
    for (const id of ids) {
      const hosted = valid
        .filter((edge) => edge.kind === 'runs-on' && edge.fromUid === id)
        .map((edge) => edge.toUid);
      if (hosted.length && !incoming.get(id)!.length)
        rank.set(id, Math.max(0, Math.min(...hosted.map((child) => rank.get(child)!)) - 1));
    }
    const layers: Block[][] = [];
    const maxCols = Math.max(3, Math.ceil(Math.sqrt(ids.length) * 1.35));
    for (let level = 0; level <= Math.max(...rank.values()); level++) {
      const families = new Map<string, string[]>();
      for (const id of ids.filter((id) => rank.get(id) === level)) {
        const family =
          owner.get(id) ?? (incoming.get(id)!.length === 1 ? incoming.get(id)![0]! : `self:${id}`);
        const blockKey = host.has(id) ? `${family}:host:${host.get(id)}` : family;
        const bucket = families.get(blockKey) ?? [];
        bucket.push(id);
        families.set(blockKey, bucket);
      }
      layers.push([...families.values()].map((family) => makeBlock(family, maxCols, byId)));
    }
    const locations = new Map<string, number>();
    const place = (layer: Block[]): void => {
      const cap = Math.max(
        ...layer.map((block) => block.width),
        maxCols * Math.max(...layer.map((block) => block.pitch)) * 1.6,
      );
      const rows: Block[][] = [[]];
      let used = 0;
      for (const block of layer) {
        if (used && used + block.width > cap) {
          rows.push([]);
          used = 0;
        }
        rows[rows.length - 1]!.push(block);
        used += block.width + GUTTER;
      }
      let z = 0;
      for (const row of rows) {
        const width =
          row.reduce((sum, block) => sum + block.width, 0) + Math.max(0, row.length - 1) * GUTTER;
        let x = -width / 2;
        for (const block of row) {
          block.x = x + block.width / 2;
          block.z = z;
          block.ids.forEach((id, index) =>
            locations.set(
              id,
              block.x +
                ((index % block.cols) -
                  (Math.min(
                    block.cols,
                    block.ids.length - Math.floor(index / block.cols) * block.cols,
                  ) -
                    1) /
                    2) *
                  block.pitch,
            ),
          );
          x += block.width + GUTTER;
        }
        z += Math.max(...row.map((block) => block.depth)) + GUTTER;
      }
    };
    layers.forEach(place);
    const barycenter = (block: Block, links: Map<string, string[]>): number => {
      const targets = block.ids.flatMap((id) => links.get(id)!).map((id) => locations.get(id)!);
      return targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : block.x;
    };
    // Reorder whole families, never individual siblings. Ties use stable IDs.
    // Keep the best sweep so oscillating graphs cannot undo an improvement.
    const componentEdges = valid.filter(
      (edge) => locations.has(edge.fromUid) && locations.has(edge.toUid),
    );
    const score = (): number => {
      let cost = componentEdges.reduce(
        (sum, edge) =>
          sum +
          Math.abs(locations.get(edge.fromUid)! - locations.get(edge.toUid)!) *
            (edge.kind === 'owns' ? 3 : 1),
        0,
      );
      for (let i = 0; i < componentEdges.length; i++)
        for (let j = i + 1; j < componentEdges.length; j++) {
          const a = componentEdges[i]!,
            b = componentEdges[j]!;
          if (
            rank.get(a.fromUid) !== rank.get(b.fromUid) ||
            rank.get(a.toUid) !== rank.get(b.toUid)
          )
            continue;
          const sourceOrder = locations.get(a.fromUid)! - locations.get(b.fromUid)!;
          const targetOrder = locations.get(a.toUid)! - locations.get(b.toUid)!;
          if (sourceOrder * targetOrder < 0) cost += GUTTER * 8;
        }
      return cost;
    };
    let bestScore = score(),
      best = layers.map((layer) => [...layer]);
    for (let sweep = 0; sweep < 8; sweep++) {
      const reverse = sweep % 2 === 1;
      for (const layer of reverse ? [...layers].reverse() : layers) {
        const links = reverse ? outgoing : incoming;
        layer.sort(
          (a, b) =>
            barycenter(a, links) - barycenter(b, links) || a.ids[0]!.localeCompare(b.ids[0]!),
        );
        place(layer);
      }
      const cost = score();
      if (cost < bestScore) {
        bestScore = cost;
        best = layers.map((layer) => [...layer]);
      }
    }
    best.forEach(place);
    // Align parents over the actual extent of their descendants. Preserve
    // family order and project desired centers onto non-overlap constraints.
    for (const layer of [...best].reverse()) {
      const rows = new Map<number, Block[]>();
      for (const block of layer) {
        const row = rows.get(block.z) ?? [];
        row.push(block);
        rows.set(block.z, row);
      }
      for (const row of rows.values()) {
        const desired = row.map((block) => {
          const targets = block.ids
            .flatMap((id) => outgoing.get(id)!)
            .map((id) => locations.get(id)!);
          return targets.length ? targets.reduce((a, b) => a + b, 0) / targets.length : block.x;
        });
        const centers = [...desired];
        for (let i = 1; i < row.length; i++)
          centers[i] = Math.max(
            centers[i]!,
            centers[i - 1]! + row[i - 1]!.width / 2 + row[i]!.width / 2 + GUTTER,
          );
        const bias =
          centers.reduce((sum, x, i) => sum + x - desired[i]!, 0) / Math.max(1, row.length);
        row.forEach((block, i) => {
          const x = centers[i]! - bias,
            delta = x - block.x;
          block.x = x;
          block.ids.forEach((id) => locations.set(id, locations.get(id)! + delta));
        });
      }
    }
    let z = 0;
    const placements: ObjectPlacement[] = [];
    for (const layer of best) {
      for (const block of layer) {
        block.ids.forEach((id, i) =>
          placements.push({
            ...byId.get(id)!,
            position: {
              ...byId.get(id)!.position,
              x: locations.get(id)!,
              z: z + block.z + Math.floor(i / block.cols) * block.pitch,
            },
          }),
        );
      }
      // More connections reserve wider routing corridors between layers.
      const connections = layer.reduce(
        (sum, block) => sum + block.ids.reduce((n, id) => n + outgoing.get(id)!.length, 0),
        0,
      );
      z +=
        Math.max(...layer.map((block) => block.z + block.depth)) +
        GUTTER +
        Math.min(1.2, Math.sqrt(connections) * 0.13);
    }
    return measure(placements);
  });
  if (isolated.length) {
    const block = makeBlock(
      isolated.sort((a, b) => (labels.get(a) ?? a).localeCompare(labels.get(b) ?? b)),
      Math.ceil(Math.sqrt(isolated.length)),
      byId,
    );
    groups.push(
      measure(
        block.ids.map((id, i) => ({
          ...byId.get(id)!,
          position: {
            ...byId.get(id)!.position,
            x: (i % block.cols) * block.pitch,
            z: Math.floor(i / block.cols) * block.pitch,
          },
        })),
      ),
    );
  }
  // Rectangle packing keeps disconnected groups nearby without interleaving them.
  groups.sort(
    (a, b) =>
      b.depth - a.depth ||
      b.width - a.width ||
      a.placements[0]!.uid.localeCompare(b.placements[0]!.uid),
  );
  const targetWidth = Math.max(
    ...groups.map((g) => g.width),
    Math.sqrt(groups.reduce((s, g) => s + (g.width + GUTTER) * (g.depth + GUTTER), 0)) * 1.3,
  );
  let x = 0,
    z = 0,
    rowDepth = 0;
  const result: ObjectPlacement[] = [];
  for (const group of groups) {
    if (x && x + group.width > targetWidth) {
      x = 0;
      z += rowDepth + GUTTER;
      rowDepth = 0;
    }
    group.placements.forEach((o) =>
      result.push({ ...o, position: { ...o.position, x: o.position.x + x, z: o.position.z + z } }),
    );
    x += group.width + GUTTER;
    rowDepth = Math.max(rowDepth, group.depth);
  }
  const centerX =
    (Math.min(...result.map((o) => o.position.x)) + Math.max(...result.map((o) => o.position.x))) /
    2;
  const centerZ =
    (Math.min(...result.map((o) => o.position.z)) + Math.max(...result.map((o) => o.position.z))) /
    2;
  const final = new Map(
    result.map((o) => [
      o.uid,
      { ...o, position: { ...o.position, x: o.position.x - centerX, z: o.position.z - centerZ } },
    ]),
  );
  if (layoutCache.size >= 4) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(
    key,
    new Map([...final].map(([uid, o]) => [uid, { x: o.position.x, z: o.position.z }])),
  );
  return objects.map((o) => final.get(o.uid)!);
}

function priority(edge: EdgePlacement): number {
  return { owns: 0, routes: 1, selects: 2, 'runs-on': 3, mounts: 4 }[edge.kind];
}
function makeBlock(ids: string[], maxCols: number, byId: Map<string, ObjectPlacement>): Block {
  const size = Math.max(...ids.map((id) => byId.get(id)!.size));
  const pitch = Math.max(2.4, size * 2 + 1.2);
  const cols = Math.min(maxCols, ids.length, Math.ceil(Math.sqrt(ids.length) * 1.5));
  return {
    ids,
    x: 0,
    z: 0,
    cols,
    pitch,
    width: (cols - 1) * pitch + size * 2,
    depth: (Math.ceil(ids.length / cols) - 1) * pitch + size * 2,
  };
}
function measure(placements: ObjectPlacement[]): Group {
  const minX = Math.min(...placements.map((o) => o.position.x - o.size));
  const minZ = Math.min(...placements.map((o) => o.position.z - o.size));
  return {
    width: Math.max(...placements.map((o) => o.position.x + o.size)) - minX,
    depth: Math.max(...placements.map((o) => o.position.z + o.size)) - minZ,
    placements: placements.map((o) => ({
      ...o,
      position: { ...o.position, x: o.position.x - minX, z: o.position.z - minZ },
    })),
  };
}
