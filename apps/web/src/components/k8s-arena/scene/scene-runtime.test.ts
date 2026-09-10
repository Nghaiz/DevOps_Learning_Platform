import { describe, expect, it, vi } from 'vitest';
import * as routing from '../shared/edge-routing';
import { EDGE_SEGMENTS } from '../shared/edge-routing';
import { clusterView, podView, serviceView } from '../shared/test-fixtures';
import { createSceneRuntime } from './scene-runtime';

describe('resource placement and curved relations', () => {
  it('reuses routes while dragging and replans once on release', () => {
    const planner = vi.spyOn(routing, 'writeCurve');
    try {
      const runtime = createSceneRuntime(() =>
        clusterView({
          objects: [podView('p', 'pod'), serviceView('s', 'service')],
          edges: [{ fromUid: 's', toUid: 'p', kind: 'selects', healthy: true }],
        }),
      );
      runtime.sync();
      expect(planner).toHaveBeenCalledTimes(1);
      runtime.draggingUid = 'p';
      runtime.moveTo('p', 8, 4);
      const firstTail = runtime.edges.solid.slice(-3);
      runtime.moveTo('p', 10, 6);
      expect(planner).toHaveBeenCalledTimes(1);
      expect(runtime.edges.solid.at(-3)! - firstTail[0]!).toBeCloseTo(2);
      expect(runtime.edges.solid.at(-1)! - firstTail[2]!).toBeCloseTo(2);
      runtime.draggingUid = null;
      runtime.advanceFrame(1, 0.016, { bobActive: false, reducedMotion: false });
      expect(planner).toHaveBeenCalledTimes(2);
    } finally {
      planner.mockRestore();
    }
  });
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
    expect(runtime.entries.get(object.uid)?.x).toBe(12);
    const options = { bobActive: false, reducedMotion: false };
    runtime.advanceFrame(0.1, 0.1, options);
    expect(runtime.entries.get(object.uid)!.x).toBeLessThan(12);
    expect(runtime.entries.get(object.uid)!.x).toBeGreaterThan(0);
    for (let i = 0; i < 8; i++) runtime.advanceFrame(0.2 + i * 0.1, 0.1, options);
    expect(runtime.entries.get(object.uid)?.x).not.toBe(12);
    expect(runtime.resetLayout()).toBe(false);
  });
  it('draws raised arcs and follows a moved endpoint', () => {
    const view = clusterView({
      objects: [podView('p', 'pod'), serviceView('s', 'service')],
      edges: [{ fromUid: 's', toUid: 'p', kind: 'selects', healthy: true }],
    });
    const runtime = createSceneRuntime(() => view);
    runtime.sync();
    const points = runtime.edges.solid;
    expect(points).toHaveLength(EDGE_SEGMENTS * 6);

    const ys = points.filter((_v, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(Math.max(ys[0]!, ys[ys.length - 1]!));
    expect(Math.min(...ys)).toBeGreaterThan(0.2);

    // Endpoint trimming follows the resource footprint after a manual move.
    runtime.moveTo('p', 9, 7);
    const pod = runtime.entries.get('p')!;
    const tailX = points[points.length - 3]!;
    const tailZ = points[points.length - 1]!;
    const gap = Math.hypot(pod.x - tailX, pod.z - tailZ);
    expect(gap).toBeLessThan(pod.size);
    expect(gap).toBeGreaterThan(0);
    expect(points.every(Number.isFinite)).toBe(true);
  });
});
