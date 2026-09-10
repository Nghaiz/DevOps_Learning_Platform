import { KINDS, type ResourceKind } from '@devops-platform/games';
import { describe, expect, it, vi } from 'vitest';
import { arrangeConnections } from './connection-layout';
import { RELATION_KINDS } from './edge-routing';
import type { ObjectPlacement, EdgePlacement } from './scene-layout';
const item = (uid: string, size = 0.6): ObjectPlacement => ({
  uid,
  zone: 'shelf',
  position: { x: 0, y: 0.3, z: 0 },
  size,
});
const edge = (
  fromUid: string,
  toUid: string,
  kind: EdgePlacement['kind'] = 'owns',
): EdgePlacement => ({ fromUid, toUid, kind, healthy: true });
function clear(placed: ObjectPlacement[]): void {
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!,
        b = placed[j]!;
      expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeGreaterThan(
        a.size + b.size + 0.4,
      );
    }
}
describe('layered relationship layout', () => {
  it('wraps large fan-outs into compact rows, never satellites around a hub', () => {
    const objects = [item('node', 0.95), ...Array.from({ length: 40 }, (_, i) => item(`pod-${i}`))];
    const edges = objects.slice(1).map((o) => edge('node', o.uid, 'runs-on'));
    const result = arrangeConnections(objects, edges),
      parent = result[0]!,
      children = result.slice(1);
    expect(children.every((o) => o.position.z > parent.position.z)).toBe(true);
    expect(new Set(children.map((o) => o.position.z)).size).toBeGreaterThan(1);
    expect(new Set(children.map((o) => o.position.x)).size).toBeLessThan(15);
    clear(result);
    expect(arrangeConnections([...objects].reverse(), [...edges].reverse()).reverse()).toEqual(
      result,
    );
  });
  it('keeps CronJob siblings together even when only one Job has a Pod and a node connection', () => {
    const objects = [
      'cron',
      'job-a',
      'job-b',
      'job-c',
      'pod',
      'node',
      'deploy',
      'rs',
      'other-pod',
    ].map((id) => item(id));
    const edges = [
      edge('cron', 'job-a'),
      edge('cron', 'job-b'),
      edge('cron', 'job-c'),
      edge('job-a', 'pod'),
      edge('node', 'pod', 'runs-on'),
      edge('deploy', 'rs'),
      edge('rs', 'other-pod'),
      edge('node', 'other-pod', 'runs-on'),
    ];
    const result = arrangeConnections(objects, edges),
      byId = new Map(result.map((o) => [o.uid, o.position]));
    const jobs = ['job-a', 'job-b', 'job-c'].map((id) => byId.get(id)!);
    expect(new Set(jobs.map((p) => p.z)).size).toBe(1);
    expect(Math.max(...jobs.map((p) => p.x)) - Math.min(...jobs.map((p) => p.x))).toBeLessThan(5);
    expect(jobs[0]!.z).toBeGreaterThan(byId.get('cron')!.z);
    clear(result);
  });
  it('handles cycles, duplicate relationships, disconnected objects and different footprints', () => {
    const objects = Array.from({ length: 80 }, (_, i) =>
      item(`resource-${i}`, i % 9 === 0 ? 1.2 : 0.6),
    );
    const edges = objects.slice(1, 65).map((o, i) => edge(objects[Math.floor(i / 4)]!.uid, o.uid));
    edges.push(
      edge('resource-12', 'resource-0'),
      edges[0]!,
      edge('resource-2', 'resource-1', 'selects'),
    );
    const result = arrangeConnections(objects, edges);
    expect(result).toHaveLength(objects.length);
    expect(result.every((o) => Object.values(o.position).every(Number.isFinite))).toBe(true);
    clear(result);
    expect(arrangeConnections([...objects].reverse(), [...edges].reverse()).reverse()).toEqual(
      result,
    );
  });
  it('reduces crossed parent-child order and keeps chains flowing forward', () => {
    const objects = ['a', 'b', 'c', 'x', 'y', 'z', 'root'].map((id) => item(id));
    const edges = [
      edge('root', 'a'),
      edge('root', 'b'),
      edge('root', 'c'),
      edge('a', 'z'),
      edge('b', 'y'),
      edge('c', 'x'),
    ];
    const result = new Map(arrangeConnections(objects, edges).map((o) => [o.uid, o.position]));
    const parents = ['a', 'b', 'c'].sort((a, b) => result.get(a)!.x - result.get(b)!.x);
    const children = parents.map((id) => result.get(edges.find((e) => e.fromUid === id)!.toUid)!);
    expect(children[0]!.x).toBeLessThan(children[1]!.x);
    expect(children[1]!.x).toBeLessThan(children[2]!.x);
    expect(edges.every((e) => result.get(e.fromUid)!.z < result.get(e.toUid)!.z)).toBe(true);
  });
});

it('reuses topology positions while preserving current height and placement metadata', () => {
  const objects = [item('cache-parent'), item('cache-child')],
    edges = [edge('cache-parent', 'cache-child')];
  const first = arrangeConnections(objects, edges);
  const next = arrangeConnections(
    objects.map((o) => ({ ...o, zone: 'pending' as const, position: { ...o.position, y: 0.9 } })),
    edges.map((e) => ({ ...e, healthy: false })),
  );
  expect(next.map((o) => [o.position.x, o.position.z])).toEqual(
    first.map((o) => [o.position.x, o.position.z]),
  );
  expect(next.every((o) => o.position.y === 0.9 && o.zone === 'pending')).toBe(true);
});

describe('resource kind grouping', () => {
  it('orders kind bands from hosts through workloads to owners, network and mounted resources', async () => {
    const groups = [
      ['Node', 20],
      ['Pod', 8],
      ['ReplicaSet', 2],
      ['Deployment', 2],
      ['Service', 2],
      ['Ingress', 1],
      ['ConfigMap', 2],
      ['Secret', 2],
      ['PersistentVolumeClaim', 2],
      ['Job', 2],
      ['CronJob', 1],
      ['DaemonSet', 1],
      ['StatefulSet', 1],
    ] as const;
    const entries = groups.flatMap(([kind, count]) =>
      Array.from({ length: count }, (_, index) => ({
        kind,
        object: item(`tier-${kind}-${index}`, kind === 'Node' ? 0.95 : 0.6),
      })),
    );
    const objects = entries.map(({ object }) => object);
    const kinds = new Map(entries.map(({ object, kind }) => [object.uid, kind]));
    const edges = [
      edge('tier-Deployment-0', 'tier-ReplicaSet-0'),
      edge('tier-Deployment-1', 'tier-ReplicaSet-1'),
      edge('tier-ReplicaSet-0', 'tier-Pod-0'),
      edge('tier-ReplicaSet-1', 'tier-Pod-1'),
      edge('tier-CronJob-0', 'tier-Job-0'),
      edge('tier-CronJob-0', 'tier-Job-1'),
      edge('tier-Job-0', 'tier-Pod-2'),
      edge('tier-Job-1', 'tier-Pod-3'),
      edge('tier-DaemonSet-0', 'tier-Pod-4'),
      edge('tier-StatefulSet-0', 'tier-Pod-5'),
      edge('tier-Ingress-0', 'tier-Service-0', 'routes'),
      edge('tier-Ingress-0', 'tier-Service-1', 'routes'),
    ];
    for (let index = 0; index < 8; index++)
      edges.push(
        edge(`tier-Node-${index % 4}`, `tier-Pod-${index}`, 'runs-on'),
        edge(`tier-Service-${index % 2}`, `tier-Pod-${index}`, 'selects'),
        edge(`tier-Pod-${index}`, `tier-ConfigMap-${index % 2}`, 'mounts'),
        edge(`tier-Pod-${index}`, `tier-Secret-${index % 2}`, 'mounts'),
        edge(`tier-Pod-${index}`, `tier-PersistentVolumeClaim-${index % 2}`, 'mounts'),
      );
    const originalEdges = structuredClone(edges);
    const result = arrangeConnections(objects, edges, new Map(), kinds);
    const ranges = new Map(
      groups.map(([kind]) => {
        const members = result.filter((object) => kinds.get(object.uid) === kind);
        return [
          kind,
          {
            min: Math.min(...members.map((object) => object.position.z - object.size)),
            max: Math.max(...members.map((object) => object.position.z + object.size)),
          },
        ] as const;
      }),
    );
    const orderedPairs = [
      ['Node', 'Pod'],
      ['Pod', 'ReplicaSet'],
      ['ReplicaSet', 'Deployment'],
      ['Pod', 'Service'],
      ['Service', 'Ingress'],
      ['Pod', 'ConfigMap'],
      ['Pod', 'Secret'],
      ['Pod', 'PersistentVolumeClaim'],
      ['Pod', 'Job'],
      ['Job', 'CronJob'],
      ['Pod', 'DaemonSet'],
      ['Pod', 'StatefulSet'],
    ] as const;
    for (const [before, after] of orderedPairs)
      expect(
        ranges.get(before)!.max,
        `${before} must precede the whole ${after} band`,
      ).toBeLessThan(ranges.get(after)!.min);
    expect(edges).toEqual(originalEdges);
    clear(result);
    vi.resetModules();
    const { arrangeConnections: uncached } = await import('./connection-layout');
    expect(
      uncached(
        [...objects].reverse(),
        [...edges].reverse(),
        new Map(),
        new Map([...kinds].reverse()),
      ).reverse(),
    ).toEqual(result);
  });

  it('handles cycles between unknown kinds and partially missing kind metadata deterministically', async () => {
    const objects = ['widget-a', 'widget-b', 'gadget-a', 'gadget-b', 'device', 'untyped'].map(
      (uid) => item(`cycle-${uid}`, uid === 'untyped' ? 1.2 : 0.6),
    );
    const kinds = new Map([
      ['cycle-widget-a', 'CustomWidget'],
      ['cycle-widget-b', 'CustomWidget'],
      ['cycle-gadget-a', 'CustomGadget'],
      ['cycle-gadget-b', 'CustomGadget'],
      ['cycle-device', 'FutureDevice'],
    ]);
    // The first two edges are acyclic at object level but cyclic when each
    // resource kind becomes one vertex. The remaining edges add an object
    // cycle, a missing endpoint, a self edge and a duplicate relationship.
    const edges = [
      edge('cycle-widget-a', 'cycle-gadget-a'),
      edge('cycle-gadget-b', 'cycle-widget-b'),
      edge('cycle-gadget-a', 'cycle-device', 'mounts'),
      edge('cycle-device', 'cycle-widget-a', 'selects'),
      edge('cycle-untyped', 'cycle-device', 'routes'),
      edge('cycle-device', 'missing-resource', 'mounts'),
      edge('cycle-widget-a', 'cycle-widget-a'),
      edge('cycle-widget-a', 'cycle-gadget-a'),
    ];
    const originalEdges = structuredClone(edges);
    const result = arrangeConnections(objects, edges, new Map(), kinds);
    expect(result.map((object) => object.uid)).toEqual(objects.map((object) => object.uid));
    expect(result.every((object) => Object.values(object.position).every(Number.isFinite))).toBe(
      true,
    );
    expect(edges).toEqual(originalEdges);
    clear(result);
    vi.resetModules();
    const { arrangeConnections: uncached } = await import('./connection-layout');
    expect(
      uncached(
        [...objects].reverse(),
        [...edges].reverse(),
        new Map(),
        new Map([...kinds].reverse()),
      ).reverse(),
    ).toEqual(result);
  });

  it.each(
    (Object.keys(KINDS) as ResourceKind[]).map((kind, index) => ({
      kind,
      relation: RELATION_KINDS[index % RELATION_KINDS.length]!,
    })),
  )('optimizes $kind groups for incoming and outgoing $relation edges', ({ kind, relation }) => {
    // Layout accepts all resource kinds and relation types. Exercise each kind
    // at both ends of an edge, independently of domain relationship discovery.
    for (const incoming of [false, true]) {
      const prefix = `generic-${kind}-${incoming}`;
      const members = Array.from({ length: 10 }, (_, index) =>
        item(`${prefix}-member-${String(index).padStart(2, '0')}`),
      );
      const peers = Array.from({ length: 3 }, (_, index) => item(`${prefix}-peer-${index}`));
      const peerKind: ResourceKind = kind === 'Pod' ? 'ConfigMap' : 'Pod';
      const kinds = new Map([
        ...members.map((object) => [object.uid, kind] as const),
        ...peers.map((object) => [object.uid, peerKind] as const),
      ]);
      const connections = [
        [0, 0],
        [0, 1],
        [1, 2],
      ] as const;
      const edges = connections.map(([member, peer]) =>
        incoming
          ? edge(peers[peer]!.uid, members[member]!.uid, relation)
          : edge(members[member]!.uid, peers[peer]!.uid, relation),
      );
      const originalEdges = structuredClone(edges);
      const placed = arrangeConnections([...members, ...peers], edges, new Map(), kinds);
      const byId = new Map(placed.map((object) => [object.uid, object]));
      for (const [memberIndex, member] of members.slice(0, 2).entries()) {
        const targets = connections
          .filter(([index]) => index === memberIndex)
          .map(([, peerIndex]) => byId.get(peers[peerIndex]!.uid)!.position);
        const distance = (id: string): number => {
          const position = byId.get(id)!.position;
          return targets.reduce(
            (sum, target) => sum + Math.hypot(position.x - target.x, position.z - target.z),
            0,
          );
        };
        for (const idle of members.slice(2))
          expect(
            distance(member.uid),
            `${kind} ${incoming ? 'incoming' : 'outgoing'} member must prefer a closer idle slot`,
          ).toBeLessThanOrEqual(distance(idle.uid) + 1e-8);
      }
      const group = members.map((member) => byId.get(member.uid)!);
      const minX = Math.min(...group.map((object) => object.position.x - object.size));
      const maxX = Math.max(...group.map((object) => object.position.x + object.size));
      const minZ = Math.min(...group.map((object) => object.position.z - object.size));
      const maxZ = Math.max(...group.map((object) => object.position.z + object.size));
      for (const peer of peers.map((object) => byId.get(object.uid)!))
        expect(
          peer.position.x + peer.size < minX ||
            peer.position.x - peer.size > maxX ||
            peer.position.z + peer.size < minZ ||
            peer.position.z - peer.size > maxZ,
        ).toBe(true);
      expect(new Set(group.map((object) => object.position.z)).size).toBeGreaterThan(1);
      expect(Math.max(maxX - minX, maxZ - minZ)).toBeLessThan(10 * Math.sqrt(group.length));
      expect(edges).toEqual(originalEdges);
      clear(placed);
    }
  });

  it.each([10, 20, 50])(
    'places the connected members of %i Nodes nearer their Pods than idle slots',
    (nodeCount) => {
      const nodes = Array.from({ length: nodeCount }, (_, index) =>
        item(`sparse-${nodeCount}-node-${String(index).padStart(2, '0')}`, 0.95),
      );
      const pods = Array.from({ length: 3 }, (_, index) =>
        item(`sparse-${nodeCount}-pod-${index}`),
      );
      const objects = [...nodes, ...pods];
      const kinds = new Map([
        ...nodes.map((object) => [object.uid, 'Node'] as const),
        ...pods.map((object) => [object.uid, 'Pod'] as const),
      ]);
      const edges = [
        edge(nodes[0]!.uid, pods[0]!.uid, 'runs-on'),
        edge(nodes[0]!.uid, pods[1]!.uid, 'runs-on'),
        edge(nodes[1]!.uid, pods[2]!.uid, 'runs-on'),
      ];
      const result = new Map(
        arrangeConnections(objects, edges, new Map(), kinds).map((object) => [object.uid, object]),
      );
      for (const node of nodes.slice(0, 2)) {
        const targets = edges
          .filter((relationship) => relationship.fromUid === node.uid)
          .map((relationship) => result.get(relationship.toUid)!.position);
        const distance = (slot: ObjectPlacement): number =>
          targets.reduce(
            (sum, target) =>
              sum + Math.hypot(slot.position.x - target.x, slot.position.z - target.z),
            0,
          );
        const actual = distance(result.get(node.uid)!);
        for (const idleNode of nodes.slice(2))
          expect(
            actual,
            `${node.uid} should not be farther from its Pods than idle slot ${idleNode.uid}`,
          ).toBeLessThanOrEqual(distance(result.get(idleNode.uid)!) + 1e-8);
      }
    },
  );

  it.each([1, 3, 10, 20, 50])(
    'keeps %i Nodes in one compact region across mixed workloads and isolated nodes',
    async (nodeCount) => {
      const prefix = `node-count-${nodeCount}`;
      const nodes = Array.from({ length: nodeCount }, (_, index) =>
        item(`${prefix}-node-${index}`, 0.95),
      );
      const pods = Array.from({ length: nodeCount * 2 }, (_, index) =>
        item(`${prefix}-pod-${index}`),
      );
      const deployments = [item(`${prefix}-deployment-a`), item(`${prefix}-deployment-b`)];
      const replicas = [item(`${prefix}-replica-a`), item(`${prefix}-replica-b`)];
      const service = item(`${prefix}-service`);
      const objects = [...nodes, ...pods, ...deployments, ...replicas, service];
      const kinds = new Map([
        ...nodes.map((object) => [object.uid, 'Node'] as const),
        ...pods.map((object) => [object.uid, 'Pod'] as const),
        ...deployments.map((object) => [object.uid, 'Deployment'] as const),
        ...replicas.map((object) => [object.uid, 'ReplicaSet'] as const),
        [service.uid, 'Service'],
      ]);
      // Leave the last Node idle whenever several Nodes are available. Hosted
      // Pods still span distinct ownership chains and standalone workloads.
      const hostedCount = Math.max(1, nodeCount - 1);
      const edges = deployments.map((object, index) => edge(object.uid, replicas[index]!.uid));
      pods.forEach((pod, index) => {
        edges.push(
          edge(nodes[index % hostedCount]!.uid, pod.uid, 'runs-on'),
          edge(service.uid, pod.uid, 'selects'),
        );
        if (index % 3 !== 0) edges.push(edge(replicas[index % 2]!.uid, pod.uid));
      });
      const originalEdges = structuredClone(edges);
      const result = arrangeConnections(objects, edges, new Map(), kinds);
      const placedNodes = result.filter((object) => kinds.get(object.uid) === 'Node');
      expect(placedNodes).toHaveLength(nodeCount);
      const minX = Math.min(...placedNodes.map((object) => object.position.x - object.size));
      const maxX = Math.max(...placedNodes.map((object) => object.position.x + object.size));
      const minZ = Math.min(...placedNodes.map((object) => object.position.z - object.size));
      const maxZ = Math.max(...placedNodes.map((object) => object.position.z + object.size));
      for (const other of result.filter((object) => kinds.get(object.uid) !== 'Node')) {
        expect(
          other.position.x + other.size < minX ||
            other.position.x - other.size > maxX ||
            other.position.z + other.size < minZ ||
            other.position.z - other.size > maxZ,
          `${other.uid} must stay outside the complete Node region`,
        ).toBe(true);
      }
      if (nodeCount >= 10)
        expect(new Set(placedNodes.map((object) => object.position.z)).size).toBeGreaterThan(1);
      expect(Math.max(maxX - minX, maxZ - minZ)).toBeLessThan(10 * Math.sqrt(nodeCount));
      clear(result);
      expect(edges).toEqual(originalEdges);
      vi.resetModules();
      const { arrangeConnections: uncached } = await import('./connection-layout');
      expect(
        uncached(
          [...objects].reverse(),
          [...edges].reverse(),
          new Map(),
          new Map([...kinds].reverse()),
        ).reverse(),
      ).toEqual(result);
    },
  );

  it('reserves separate kind rectangles in dense mixed ownership and hosting graphs', () => {
    const groups = [
      ['Node', 3, 0.95],
      ['Pod', 24, 0.6],
      ['Deployment', 3, 0.7],
      ['ReplicaSet', 4, 0.65],
      ['CronJob', 2, 0.7],
      ['Job', 5, 0.65],
      ['Service', 4, 0.7],
      ['ConfigMap', 3, 0.6],
    ] as const;
    const objects = groups.flatMap(([kind, count, size]) =>
      Array.from({ length: count }, (_, index) => item(`${kind}-${index}`, size)),
    );
    const kinds = new Map(objects.map((object) => [object.uid, object.uid.split('-')[0]!]));
    const edges: EdgePlacement[] = [];
    for (let index = 0; index < 24; index++) {
      edges.push(
        edge(`Node-${index % 2}`, `Pod-${index}`, 'runs-on'),
        edge(`Service-${index % 4}`, `Pod-${index}`, 'selects'),
        edge(`Pod-${index}`, `ConfigMap-${index % 3}`, 'mounts'),
      );
      if (index < 12) edges.push(edge(`ReplicaSet-${index % 4}`, `Pod-${index}`));
      else if (index < 22) edges.push(edge(`Job-${index % 5}`, `Pod-${index}`));
    }
    for (let index = 0; index < 4; index++)
      edges.push(edge(`Deployment-${index % 3}`, `ReplicaSet-${index}`));
    for (let index = 0; index < 5; index++)
      edges.push(edge(`CronJob-${index % 2}`, `Job-${index}`));
    const originalObjects = structuredClone(objects);
    const originalEdges = structuredClone(edges);
    const result = arrangeConnections(objects, edges, new Map(), kinds);
    const rectangles = groups.map(([kind]) => {
      const members = result.filter((object) => kinds.get(object.uid) === kind);
      return {
        kind,
        minX: Math.min(...members.map((object) => object.position.x - object.size)),
        maxX: Math.max(...members.map((object) => object.position.x + object.size)),
        minZ: Math.min(...members.map((object) => object.position.z - object.size)),
        maxZ: Math.max(...members.map((object) => object.position.z + object.size)),
      };
    });
    for (let index = 0; index < rectangles.length; index++)
      for (const other of rectangles.slice(index + 1)) {
        const current = rectangles[index]!;
        expect(
          current.maxX < other.minX ||
            other.maxX < current.minX ||
            current.maxZ < other.minZ ||
            other.maxZ < current.minZ,
          `${current.kind} and ${other.kind} must occupy separate regions`,
        ).toBe(true);
      }
    const nodes = result.filter((object) => kinds.get(object.uid) === 'Node');
    expect(new Set(nodes.map((object) => object.position.z)).size).toBe(1);
    expect(
      Math.max(...nodes.map((object) => object.position.x)) -
        Math.min(...nodes.map((object) => object.position.x)),
    ).toBeLessThan(7);
    expect(result.map((object) => object.uid)).toEqual(objects.map((object) => object.uid));
    expect(result.every((object) => Object.values(object.position).every(Number.isFinite))).toBe(
      true,
    );
    expect(objects).toEqual(originalObjects);
    expect(edges).toEqual(originalEdges);
    clear(result);
  });

  it('preserves the prearranged layout when there are no relationships', () => {
    const objects = ['no-edge-node-a', 'no-edge-node-b'].map((uid, index) => ({
      ...item(uid),
      position: { x: index * 3, y: 0.3, z: -2 },
    }));
    const kinds = new Map(objects.map((object) => [object.uid, 'Node']));
    expect(arrangeConnections(objects, [], new Map(), kinds)).toEqual(objects);
    expect(arrangeConnections([], [edge('missing-a', 'missing-b')])).toEqual([]);
  });

  it('invalidates cached positions when resource kinds change', async () => {
    const objects = ['kind-cache-root', 'kind-cache-a', 'kind-cache-b'].map((uid) => item(uid));
    const edges = [
      edge('kind-cache-root', 'kind-cache-a'),
      edge('kind-cache-root', 'kind-cache-b'),
    ];
    const kinds = new Map([
      ['kind-cache-root', 'Node'],
      ['kind-cache-a', 'Pod'],
      ['kind-cache-b', 'Service'],
    ]);
    const separated = arrangeConnections(objects, edges, new Map(), kinds);
    kinds.set('kind-cache-b', 'Pod');
    const grouped = arrangeConnections(objects, edges, new Map(), kinds);
    expect(grouped).not.toEqual(separated);
    vi.resetModules();
    const { arrangeConnections: uncached } = await import('./connection-layout');
    expect(uncached(objects, edges, new Map(), kinds)).toEqual(grouped);
  });

  it('is deterministic for shuffled objects, relationships and kind entries on a cold cache', async () => {
    const objects = ['stable-node-a', 'stable-node-b', 'stable-pod-a', 'stable-pod-b'].map((uid) =>
      item(uid),
    );
    const edges = [edge('stable-node-a', 'stable-pod-b'), edge('stable-node-b', 'stable-pod-a')];
    const kinds = new Map(objects.map((object) => [object.uid, object.uid.split('-')[1]!]));
    const first = arrangeConnections(objects, edges, new Map(), kinds);
    vi.resetModules();
    const { arrangeConnections: uncached } = await import('./connection-layout');
    expect(
      uncached(
        [...objects].reverse(),
        [...edges].reverse(),
        new Map(),
        new Map([...kinds].reverse()),
      ).reverse(),
    ).toEqual(first);
  });
});
