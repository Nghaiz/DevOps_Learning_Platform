import { describe, expect, it } from 'vitest';
import { EDGE_SEGMENTS, EDGE_TRIM } from '../shared/edge-routing';
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

    /*
     * Dây được CẮT BỚT hai đầu (`EDGE_TRIM`), nên đỉnh cuối KHÔNG trùng tâm vật
     * — cố ý, để dây không đâm xuyên vào khối. Vì vậy ô này khẳng định đúng thứ
     * đáng khẳng định: đầu dây ĐI THEO vật, và dừng lại cách tâm đúng một quãng
     * cắt. Bản trước so bằng `toEqual([9, y, 7])`, tức là ghim luôn cả việc
     * KHÔNG cắt — một chi tiết vẽ, không phải một hành vi.
     */
    runtime.moveTo('p', 9, 7);
    const pod = runtime.entries.get('p')!;
    const service = runtime.entries.get('s')!;
    const tailX = points[points.length - 3]!;
    const tailZ = points[points.length - 1]!;
    const span = Math.hypot(pod.x - service.x, pod.z - service.z);
    const gap = Math.hypot(pod.x - tailX, pod.z - tailZ);
    expect(gap).toBeLessThan(span * EDGE_TRIM * 2);
    expect(gap).toBeGreaterThan(0);
    expect(points.every(Number.isFinite)).toBe(true);
  });
});
