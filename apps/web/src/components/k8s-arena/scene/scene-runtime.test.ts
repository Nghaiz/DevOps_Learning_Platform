import { describe, expect, it } from 'vitest';
import { clusterView, podView, serviceView } from '../shared/test-fixtures';
import { createSceneRuntime } from './scene-runtime';

describe('resource placement and curved relations', () => {
  it('preserves a dragged resource across simulation updates and resets explicitly', () => {
    let view = clusterView();
    const runtime = createSceneRuntime(() => view);
    runtime.sync();
    const object = runtime.order[0]!;
    runtime.moveTo(object.uid, 12, 8);
    view = { ...view, tick: view.tick + 1 };
    runtime.sync();
    expect(runtime.entries.get(object.uid)).toMatchObject({ x: 12, z: 8 });
    expect(runtime.radius).toBeGreaterThan(Math.hypot(12, 8));
    runtime.resetLayout();
    expect(runtime.overrides.size).toBe(0);
    expect(runtime.entries.get(object.uid)?.x).not.toBe(12);
  });
  it('arches above both endpoints and follows a moved endpoint', () => {
    const view = clusterView({ objects: [podView('p', 'pod'), serviceView('s', 'service')], edges: [{ fromUid: 's', toUid: 'p', kind: 'selects', healthy: true }] });
    const runtime = createSceneRuntime(() => view);
    runtime.sync();
    const points = runtime.edges.solid;
    expect(points).toHaveLength(144);
    expect(Math.max(...points.filter((_v, i) => i % 3 === 1))).toBeGreaterThan(Math.max(points[1]!, points[142]!));
    runtime.moveTo('p', 9, 7);
    expect(points.slice(-3)).toEqual([9, runtime.entries.get('p')!.y, 7]);
    expect(points.every(Number.isFinite)).toBe(true);
  });
});
