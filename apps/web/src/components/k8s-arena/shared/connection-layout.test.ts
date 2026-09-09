import { describe, expect, it } from 'vitest';
import { arrangeConnections } from './connection-layout';
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
