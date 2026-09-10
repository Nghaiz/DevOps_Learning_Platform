import { describe, expect, it } from 'vitest';
import { fanOffset, pairKey, relationIndex, RELATION_KINDS } from './edge-routing';
describe('relationship identity', () => {
  it('keeps alternating duplicate lanes stable', () => {
    expect([0, 1, 2, 3, 4, 5].map(fanOffset)).toEqual([0, 1, -1, 2, -2, 3]);
    expect(fanOffset(-3)).toBe(0);
  });
  it('groups reversed endpoints without merging different pairs', () => {
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
    expect(pairKey('a', 'b')).not.toBe(pairKey('a', 'c'));
  });
  it('assigns every relationship its own buffer index', () => {
    expect(RELATION_KINDS.map(relationIndex)).toEqual([0, 1, 2, 3, 4]);
  });
});
import { EDGE_SEGMENTS, writeCurve } from './edge-routing';
it('draws a raised smooth arc with attached endpoints, including coincident positions', () => {
  for (const distance of [0, 1, 10, 100]) {
    const points: number[] = [];
    writeCurve(points, { x: 0, y: 0.4, z: 0 }, { x: distance, y: 0.4, z: 0 }, 0);
    expect(points).toHaveLength(EDGE_SEGMENTS * 6);
    expect(points.every(Number.isFinite)).toBe(true);
    const ys = points.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(ys[0]!);
    expect(Math.max(...ys)).toBeLessThanOrEqual(2.6);
    expect(points[0]).toBeLessThanOrEqual(0.28);
  }
});
it('separates duplicate arcs without moving their resources', () => {
  const a = { x: 0, y: 0.4, z: 0 },
    b = { x: 8, y: 0.4, z: 0 },
    left: number[] = [],
    right: number[] = [];
  writeCurve(left, a, b, -1);
  writeCurve(right, a, b, 1);
  const middle = Math.floor(EDGE_SEGMENTS / 2) * 6 + 2;
  expect(left[middle]).toBeLessThan(0);
  expect(right[middle]).toBeGreaterThan(0);
});
